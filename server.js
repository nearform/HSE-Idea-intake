const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;

// ---- AI-call guardrails (PII scrub, cost logging, response cache) ----
//   LLM_PII_SCRUB controls how aggressive the request scrubbing is before
//   forwarding to the provider:
//     'off'         — no scrubbing
//     'standard'    — PPS-shaped IDs and Irish/phone-shaped digit strings (default)
//     'aggressive'  — standard + email addresses
const LLM_PII_SCRUB = (process.env.LLM_PII_SCRUB || 'standard').toLowerCase();
const LLM_CACHE_ENABLED = process.env.LLM_CACHE !== '0';
const LLM_CACHE_TTL_MS = parseInt(process.env.LLM_CACHE_TTL_MS || (24 * 60 * 60 * 1000), 10);
const LLM_CACHE_MAX_ENTRIES = parseInt(process.env.LLM_CACHE_MAX_ENTRIES || 256, 10);
const LLM_LOG_FILE = process.env.LLM_LOG_FILE || path.join(__dirname, 'data', 'llm-calls.jsonl');
const LLM_LOG_TO_FILE = process.env.LLM_LOG_FILE_DISABLE !== '1';
const INTAKES_FILE = process.env.INTAKES_FILE || path.join(__dirname, 'data', 'intakes.jsonl');

// ---- LLM provider config (all optional; tool works fully without any of these) ----
// Auto-detect provider from which key is present unless LLM_PROVIDER is set explicitly.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL   = process.env.ANTHROPIC_MODEL   || 'claude-sonnet-4-20250514';
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION || '2023-06-01';
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY    || '';
const OPENAI_MODEL      = process.env.OPENAI_MODEL      || 'gpt-4o-mini';
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY    || process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL      = process.env.GEMINI_MODEL      || 'gemini-1.5-flash';
const GEMINI_EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'text-embedding-004';
const OLLAMA_URL        = process.env.OLLAMA_URL        || 'http://localhost:11434';
const OLLAMA_MODEL      = process.env.OLLAMA_MODEL      || 'llama3.1';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const OLLAMA_ENABLED    = process.env.OLLAMA_ENABLED === '1' || process.env.OLLAMA_ENABLED === 'true';

function autoProvider() {
  const forced = (process.env.LLM_PROVIDER || '').toLowerCase();
  if (forced) return forced;
  if (ANTHROPIC_API_KEY) return 'anthropic';
  if (OPENAI_API_KEY) return 'openai';
  if (GEMINI_API_KEY) return 'gemini';
  if (OLLAMA_ENABLED) return 'ollama';
  return '';
}
const LLM_PROVIDER = autoProvider();

// Embeddings need their own provider — Anthropic doesn't currently expose an
// embedding endpoint, so an Anthropic-based deployment also needs OPENAI_API_KEY,
// GEMINI_API_KEY, or Ollama for the similar-ideas feature to work.
function autoEmbedProvider() {
  const forced = (process.env.EMBED_PROVIDER || '').toLowerCase();
  if (forced) return forced;
  if (OPENAI_API_KEY) return 'openai';
  if (GEMINI_API_KEY) return 'gemini';
  if (OLLAMA_ENABLED) return 'ollama';
  return '';
}
const EMBED_PROVIDER = autoEmbedProvider();

function providerConfigured(name) {
  switch (name) {
    case 'anthropic': return !!ANTHROPIC_API_KEY;
    case 'openai':    return !!OPENAI_API_KEY;
    case 'gemini':    return !!GEMINI_API_KEY;
    case 'ollama':    return OLLAMA_ENABLED;
    default:          return false;
  }
}

function providerModel(name) {
  switch (name) {
    case 'anthropic': return ANTHROPIC_MODEL;
    case 'openai':    return OPENAI_MODEL;
    case 'gemini':    return GEMINI_MODEL;
    case 'ollama':    return OLLAMA_MODEL;
    default:          return '';
  }
}

function embedProviderModel(name) {
  switch (name) {
    case 'openai': return OPENAI_EMBED_MODEL;
    case 'gemini': return GEMINI_EMBED_MODEL;
    case 'ollama': return OLLAMA_EMBED_MODEL;
    default:       return '';
  }
}

const ROOT = __dirname;
const CONFIG_DIR = path.join(ROOT, 'config');
const BACKUP_DIR = path.join(CONFIG_DIR, 'backups');
const SRC_DIR = path.join(ROOT, 'src');
const INDEX_FILE = path.join(SRC_DIR, 'hse-feature-intake.html');
const ADMIN_FILE = path.join(SRC_DIR, 'admin.html');
const SUBMISSIONS_FILE = path.join(SRC_DIR, 'submissions.html');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'admin-settings.json');
const MAX_BACKUPS_PER_FILE = 20;

// AI assist is the default. Deterministic mode is the offline fallback when no
// LLM provider is configured on the server, or when an admin explicitly turns AI off.
const DEFAULT_SETTINGS = { aiAssist: true };

const ALLOWED_CONFIG = new Set([
  'personas.md',
  'rice-config.md',
  'jpd-template.md',
  'form-fields.md',
  'hse-design-tokens.md',
  'design-brief-template.md'
]);

const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8'
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, status, body, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType || 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { sendText(res, 404, 'Not found'); return; }
    res.writeHead(200, {
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Length': data.length
    });
    res.end(data);
  });
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { reject(new Error('Request body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---- Config file backups ----

function ensureBackupDir(cb) { fs.mkdir(BACKUP_DIR, { recursive: true }, err => cb(err)); }

function pruneBackups(filename, cb) {
  fs.readdir(BACKUP_DIR, (err, entries) => {
    if (err) { cb(err); return; }
    const prefix = filename + '.';
    const matching = entries.filter(n => n.startsWith(prefix) && n.endsWith('.md')).sort();
    const excess = matching.length - MAX_BACKUPS_PER_FILE;
    if (excess <= 0) { cb(null); return; }
    let remaining = excess;
    let firstErr = null;
    for (let i = 0; i < excess; i++) {
      fs.unlink(path.join(BACKUP_DIR, matching[i]), e => {
        if (e && !firstErr) firstErr = e;
        if (--remaining === 0) cb(firstErr);
      });
    }
  });
}

function backupFile(filename, cb) {
  const src = path.join(CONFIG_DIR, filename);
  fs.readFile(src, (err, data) => {
    if (err) { if (err.code === 'ENOENT') { cb(null); return; } cb(err); return; }
    ensureBackupDir(mkErr => {
      if (mkErr) { cb(mkErr); return; }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = path.join(BACKUP_DIR, `${filename}.${stamp}.md`);
      fs.writeFile(dest, data, wErr => {
        if (wErr) { cb(wErr); return; }
        pruneBackups(filename, () => cb(null));
      });
    });
  });
}

// ---- Admin settings (toggle for AI assist) ----

function readSettings(cb) {
  fs.readFile(SETTINGS_FILE, 'utf8', (err, data) => {
    if (err) { cb(null, { ...DEFAULT_SETTINGS }); return; }
    try { cb(null, { ...DEFAULT_SETTINGS, ...JSON.parse(data) }); }
    catch { cb(null, { ...DEFAULT_SETTINGS }); }
  });
}

function writeSettings(settings, cb) {
  fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8', cb);
}

function handleAdminSettings(req, res) {
  if (req.method === 'GET') {
    readSettings((_e, s) => sendJson(res, 200, s));
    return;
  }
  if (req.method === 'POST' || req.method === 'PUT') {
    readBody(req).then(body => {
      let parsed;
      try { parsed = JSON.parse(body); }
      catch { sendJson(res, 400, { error: 'Invalid JSON body' }); return; }
      readSettings((_e, existing) => {
        const next = { ...existing };
        if (typeof parsed.aiAssist === 'boolean') next.aiAssist = parsed.aiAssist;
        writeSettings(next, err => {
          if (err) { sendJson(res, 500, { error: 'Failed to save: ' + err.message }); return; }
          sendJson(res, 200, next);
        });
      });
    }).catch(e => sendJson(res, 400, { error: e.message }));
    return;
  }
  res.writeHead(405, { 'Allow': 'GET, POST' }); res.end();
}

// ---- LLM proxy: provider-agnostic ----

// Frontend sends: { prompt: string, max_tokens?: number, temperature?: number, system?: string }
// Server returns: { text: string, provider: string, model: string }

async function callAnthropic({ prompt, system, max_tokens, temperature }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: max_tokens || 1400,
      ...(temperature != null ? { temperature } : {}),
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${body.slice(0, 300)}`);
  const d = JSON.parse(body);
  const text = (d.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
  const usage = d.usage ? { prompt_tokens: d.usage.input_tokens, completion_tokens: d.usage.output_tokens } : null;
  return { text, usage };
}

async function callOpenAI({ prompt, system, max_tokens, temperature }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: max_tokens || 1400,
      ...(temperature != null ? { temperature } : {}),
      messages
    })
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  const d = JSON.parse(body);
  const text = d.choices?.[0]?.message?.content || '';
  const usage = d.usage ? { prompt_tokens: d.usage.prompt_tokens, completion_tokens: d.usage.completion_tokens } : null;
  return { text, usage };
}

async function callGemini({ prompt, system, max_tokens, temperature }) {
  const combined = system ? `${system}\n\n${prompt}` : prompt;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: combined }] }],
      generationConfig: {
        maxOutputTokens: max_tokens || 1400,
        ...(temperature != null ? { temperature } : {})
      }
    })
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  const d = JSON.parse(body);
  const parts = d.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text || '').join('');
  const usage = d.usageMetadata ? { prompt_tokens: d.usageMetadata.promptTokenCount, completion_tokens: d.usageMetadata.candidatesTokenCount } : null;
  return { text, usage };
}

async function callOllama({ prompt, system, max_tokens, temperature }) {
  const res = await fetch(`${OLLAMA_URL.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt }
      ],
      options: {
        num_predict: max_tokens || 1400,
        ...(temperature != null ? { temperature } : {})
      }
    })
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${body.slice(0, 300)}`);
  const d = JSON.parse(body);
  const text = d.message?.content || '';
  const usage = (d.prompt_eval_count != null || d.eval_count != null)
    ? { prompt_tokens: d.prompt_eval_count, completion_tokens: d.eval_count }
    : null;
  return { text, usage };
}

// ---- Request scrubbing, response cache, observability ----

function scrubPII(text) {
  if (!text || LLM_PII_SCRUB === 'off') return text;
  let out = String(text);
  // PPS number: 7 digits + 1 or 2 letters (Irish format)
  out = out.replace(/\b\d{7}[A-Za-z]{1,2}\b/g, '[REDACTED-PPS]');
  // Irish mobile / landline shapes (08x..., 01..., +353...)
  out = out.replace(/(?:\+?353[\s.-]?)?(?:0[1-9])[\s.-]?\d{2,4}[\s.-]?\d{3,4}/g, '[REDACTED-PHONE]');
  // Generic 10+ digit runs that look like phone numbers (not RICE numbers — those are < 8 digits or contain commas)
  out = out.replace(/\b(?<![\d,])\d{10,15}(?!\d)\b/g, '[REDACTED-NUMERIC-ID]');
  if (LLM_PII_SCRUB === 'aggressive') {
    out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED-EMAIL]');
  }
  return out;
}

const llmCache = new Map(); // hash -> { text, usage, provider, model, ts }

function cacheKey({ provider, model, system, prompt, max_tokens, temperature }) {
  const seed = JSON.stringify({
    provider: provider || '',
    model: model || '',
    system: system || '',
    prompt: prompt || '',
    max_tokens: max_tokens || null,
    temperature: temperature == null ? null : temperature
  });
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 40);
}

function cacheGet(hash) {
  const entry = llmCache.get(hash);
  if (!entry) return null;
  if (Date.now() - entry.ts > LLM_CACHE_TTL_MS) { llmCache.delete(hash); return null; }
  return entry;
}

function cacheSet(hash, value) {
  if (llmCache.size >= LLM_CACHE_MAX_ENTRIES) {
    const ents = [...llmCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, Math.max(1, Math.floor(LLM_CACHE_MAX_ENTRIES / 10)));
    for (const [k] of ents) llmCache.delete(k);
  }
  llmCache.set(hash, { ...value, ts: Date.now() });
}

let _logDirEnsured = false;
function logLlmCall(record) {
  const line = JSON.stringify(record);
  console.log('[llm]', line);
  if (!LLM_LOG_TO_FILE) return;
  try {
    if (!_logDirEnsured) {
      fs.mkdirSync(path.dirname(LLM_LOG_FILE), { recursive: true });
      _logDirEnsured = true;
    }
    fs.appendFile(LLM_LOG_FILE, line + '\n', () => { /* best-effort */ });
  } catch (_) { /* swallow — observability is best-effort */ }
}

async function handleLlmProxy(req, res) {
  if (!LLM_PROVIDER || !providerConfigured(LLM_PROVIDER)) {
    sendJson(res, 503, {
      error: 'No LLM provider configured on the server. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or OLLAMA_ENABLED=1 and restart. The tool will continue to work in offline deterministic mode in the meantime.'
    });
    return;
  }
  let bodyText;
  try { bodyText = await readBody(req, 4 * 1024 * 1024); }
  catch (e) { sendJson(res, 400, { error: e.message }); return; }

  let payload;
  try { payload = JSON.parse(bodyText); }
  catch { sendJson(res, 400, { error: 'Invalid JSON body' }); return; }

  if (!payload.prompt) { sendJson(res, 400, { error: 'Missing "prompt" field' }); return; }

  // Scrub before forwarding: this is a defence-in-depth, not a substitute for
  // submitters writing clean intakes. Numbers in prose like "300,000 users" or
  // RICE values are preserved (they're under the redaction thresholds).
  const args = {
    prompt: scrubPII(payload.prompt),
    system: payload.system ? scrubPII(payload.system) : undefined,
    max_tokens: payload.max_tokens,
    temperature: payload.temperature
  };
  const model = providerModel(LLM_PROVIDER);
  const hash = LLM_CACHE_ENABLED ? cacheKey({ provider: LLM_PROVIDER, model, ...args }) : null;

  if (hash) {
    const hit = cacheGet(hash);
    if (hit) {
      logLlmCall({
        ts: new Date().toISOString(),
        provider: LLM_PROVIDER,
        model,
        cache: 'hit',
        prompt_chars: args.prompt.length,
        system_chars: args.system ? args.system.length : 0,
        max_tokens: args.max_tokens || null,
        latency_ms: 0,
        ok: true
      });
      sendJson(res, 200, { text: hit.text, provider: LLM_PROVIDER, model, cached: true });
      return;
    }
  }

  const startedAt = Date.now();
  try {
    let result;
    switch (LLM_PROVIDER) {
      case 'anthropic': result = await callAnthropic(args); break;
      case 'openai':    result = await callOpenAI(args); break;
      case 'gemini':    result = await callGemini(args); break;
      case 'ollama':    result = await callOllama(args); break;
      default: throw new Error(`Unknown provider: ${LLM_PROVIDER}`);
    }
    const latency = Date.now() - startedAt;
    if (hash) cacheSet(hash, { text: result.text, provider: LLM_PROVIDER, model });
    logLlmCall({
      ts: new Date().toISOString(),
      provider: LLM_PROVIDER,
      model,
      cache: hash ? 'miss' : 'disabled',
      prompt_chars: args.prompt.length,
      system_chars: args.system ? args.system.length : 0,
      max_tokens: args.max_tokens || null,
      latency_ms: latency,
      usage: result.usage || null,
      ok: true
    });
    sendJson(res, 200, { text: result.text, provider: LLM_PROVIDER, model });
  } catch (e) {
    logLlmCall({
      ts: new Date().toISOString(),
      provider: LLM_PROVIDER,
      model,
      cache: hash ? 'miss' : 'disabled',
      prompt_chars: args.prompt.length,
      system_chars: args.system ? args.system.length : 0,
      max_tokens: args.max_tokens || null,
      latency_ms: Date.now() - startedAt,
      ok: false,
      error: String(e.message || e).slice(0, 300)
    });
    sendJson(res, 502, { error: e.message });
  }
}

// ---- Embeddings (similar-ideas feature) ----

async function embedOpenAI(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: OPENAI_EMBED_MODEL, input: text })
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`OpenAI embed ${res.status}: ${body.slice(0, 300)}`);
  const d = JSON.parse(body);
  return { embedding: d.data?.[0]?.embedding || [], model: OPENAI_EMBED_MODEL, usage: d.usage || null };
}

async function embedGemini(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text }] } })
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Gemini embed ${res.status}: ${body.slice(0, 300)}`);
  const d = JSON.parse(body);
  return { embedding: d.embedding?.values || [], model: GEMINI_EMBED_MODEL, usage: null };
}

async function embedOllama(text) {
  const res = await fetch(`${OLLAMA_URL.replace(/\/$/, '')}/api/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text })
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Ollama embed ${res.status}: ${body.slice(0, 300)}`);
  const d = JSON.parse(body);
  return { embedding: d.embedding || [], model: OLLAMA_EMBED_MODEL, usage: null };
}

async function handleEmbed(req, res) {
  if (!EMBED_PROVIDER) {
    sendJson(res, 503, { error: 'No embedding provider configured. Set OPENAI_API_KEY, GEMINI_API_KEY, or OLLAMA_ENABLED=1 to enable similar-ideas detection.' });
    return;
  }
  let bodyText;
  try { bodyText = await readBody(req, 1024 * 1024); }
  catch (e) { sendJson(res, 400, { error: e.message }); return; }
  let payload;
  try { payload = JSON.parse(bodyText); }
  catch { sendJson(res, 400, { error: 'Invalid JSON body' }); return; }

  const text = scrubPII(String(payload.text || '').slice(0, 8000));
  if (!text) { sendJson(res, 400, { error: 'Missing "text" field' }); return; }

  const startedAt = Date.now();
  try {
    let result;
    switch (EMBED_PROVIDER) {
      case 'openai': result = await embedOpenAI(text); break;
      case 'gemini': result = await embedGemini(text); break;
      case 'ollama': result = await embedOllama(text); break;
      default: throw new Error(`Unknown embed provider: ${EMBED_PROVIDER}`);
    }
    logLlmCall({
      ts: new Date().toISOString(),
      kind: 'embed',
      provider: EMBED_PROVIDER,
      model: result.model,
      input_chars: text.length,
      dim: result.embedding.length,
      latency_ms: Date.now() - startedAt,
      ok: true
    });
    sendJson(res, 200, { embedding: result.embedding, dim: result.embedding.length, provider: EMBED_PROVIDER, model: result.model });
  } catch (e) {
    logLlmCall({
      ts: new Date().toISOString(),
      kind: 'embed',
      provider: EMBED_PROVIDER,
      model: embedProviderModel(EMBED_PROVIDER),
      input_chars: text.length,
      latency_ms: Date.now() - startedAt,
      ok: false,
      error: String(e.message || e).slice(0, 300)
    });
    sendJson(res, 502, { error: e.message });
  }
}

// ---- Intake persistence (for similar-ideas feature) ----

function readIntakes(cb) {
  fs.readFile(INTAKES_FILE, 'utf8', (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') return cb(null, []);
      return cb(err);
    }
    const out = [];
    for (const line of data.split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch (_) { /* skip malformed */ }
    }
    cb(null, out);
  });
}

function appendIntake(record, cb) {
  fs.mkdir(path.dirname(INTAKES_FILE), { recursive: true }, err => {
    if (err) return cb(err);
    fs.appendFile(INTAKES_FILE, JSON.stringify(record) + '\n', cb);
  });
}

// Markdown bodies (JPD summary, design brief) are capped per record so a single
// pathological intake can't bloat the JSONL file. 32 KB is well above the size
// of a real JPD summary or design brief.
const MAX_MARKDOWN_BYTES = 32 * 1024;

// When the same intake id POSTs again (e.g. the brief was regenerated) the
// latest record wins — the table reads the most recent entry per id.
function pickLatestById(records) {
  const byId = new Map();
  for (const r of records) {
    if (!r || !r.id) continue;
    const prev = byId.get(r.id);
    if (!prev) { byId.set(r.id, r); continue; }
    const a = Date.parse(r.ts || '') || 0;
    const b = Date.parse(prev.ts || '') || 0;
    if (a >= b) byId.set(r.id, r);
  }
  return [...byId.values()];
}

async function handleIntakes(req, res) {
  if (req.method === 'GET') {
    readIntakes((err, intakes) => {
      if (err) return sendJson(res, 500, { error: err.message });
      const latest = pickLatestById(intakes);
      sendJson(res, 200, {
        intakes: latest.map(i => ({
          id: i.id,
          ts: i.ts,
          title: i.title || '',
          problem_excerpt: i.problem_excerpt || '',
          embedding: Array.isArray(i.embedding) ? i.embedding : [],
          embed_model: i.embed_model || null,
          persona_primary: i.persona_primary || null,
          rice_total: typeof i.rice_total === 'number' ? i.rice_total : null,
          has_jpd: !!(i.jpd_markdown && i.jpd_markdown.length),
          has_brief: !!(i.brief_markdown && i.brief_markdown.length)
        }))
      });
    });
    return;
  }
  if (req.method === 'POST') {
    let bodyText;
    try { bodyText = await readBody(req, 4 * 1024 * 1024); }
    catch (e) { return sendJson(res, 400, { error: e.message }); }
    let p;
    try { p = JSON.parse(bodyText); }
    catch { return sendJson(res, 400, { error: 'Invalid JSON body' }); }
    if (!p.id || !p.title) {
      return sendJson(res, 400, { error: 'Missing required fields: id, title' });
    }
    const embedding = Array.isArray(p.embedding) ? p.embedding : [];
    const jpdRaw = typeof p.jpd_markdown === 'string' ? p.jpd_markdown : '';
    const briefRaw = typeof p.brief_markdown === 'string' ? p.brief_markdown : '';
    const record = {
      id: String(p.id).slice(0, 64),
      ts: p.ts || new Date().toISOString(),
      title: scrubPII(String(p.title || '').slice(0, 500)),
      problem_excerpt: scrubPII(String(p.problem || '').slice(0, 600)),
      embedding,
      embed_model: p.embed_model ? String(p.embed_model).slice(0, 80) : null,
      persona_primary: p.persona_primary ? String(p.persona_primary).slice(0, 200) : null,
      rice_total: typeof p.rice_total === 'number' && Number.isFinite(p.rice_total) ? p.rice_total : null,
      jpd_markdown: jpdRaw ? scrubPII(jpdRaw.slice(0, MAX_MARKDOWN_BYTES)) : '',
      brief_markdown: briefRaw ? scrubPII(briefRaw.slice(0, MAX_MARKDOWN_BYTES)) : ''
    };
    appendIntake(record, err => {
      if (err) return sendJson(res, 500, { error: err.message });
      sendJson(res, 200, { ok: true, id: record.id });
    });
    return;
  }
  res.writeHead(405, { 'Allow': 'GET, POST' });
  res.end();
}

function handleIntakeById(req, res, id) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Allow': 'GET' });
    res.end();
    return;
  }
  readIntakes((err, intakes) => {
    if (err) return sendJson(res, 500, { error: err.message });
    const matches = intakes.filter(i => i && i.id === id);
    if (!matches.length) return sendJson(res, 404, { error: 'Not found' });
    const latest = pickLatestById(matches)[0];
    sendJson(res, 200, {
      id: latest.id,
      ts: latest.ts,
      title: latest.title || '',
      problem_excerpt: latest.problem_excerpt || '',
      persona_primary: latest.persona_primary || null,
      rice_total: typeof latest.rice_total === 'number' ? latest.rice_total : null,
      jpd_markdown: latest.jpd_markdown || '',
      brief_markdown: latest.brief_markdown || ''
    });
  });
}

// ---- Config file read/write ----

function handleConfig(req, res, filename) {
  if (!ALLOWED_CONFIG.has(filename)) {
    sendJson(res, 400, { error: 'Unknown config file' });
    return;
  }
  const filePath = path.join(CONFIG_DIR, filename);

  if (req.method === 'GET') {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) { sendJson(res, 404, { error: 'File not found' }); return; }
      sendText(res, 200, data, 'text/markdown; charset=utf-8');
    });
    return;
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    readBody(req).then(body => {
      let content = body;
      const ctype = (req.headers['content-type'] || '').toLowerCase();
      if (ctype.includes('application/json')) {
        try {
          const parsed = JSON.parse(body);
          if (typeof parsed.content === 'string') content = parsed.content;
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' }); return;
        }
      }
      backupFile(filename, bErr => {
        if (bErr) { sendJson(res, 500, { error: 'Failed to create backup: ' + bErr.message }); return; }
        fs.writeFile(filePath, content, 'utf8', err => {
          if (err) { sendJson(res, 500, { error: 'Failed to write file' }); return; }
          sendJson(res, 200, { ok: true, filename, bytes: Buffer.byteLength(content) });
        });
      });
    }).catch(err => sendJson(res, 400, { error: err.message }));
    return;
  }

  res.writeHead(405, { 'Allow': 'GET, POST' });
  res.end();
}

function safeStaticPath(relPath) {
  const resolved = path.resolve(SRC_DIR, '.' + relPath.replace(/^\/src/, ''));
  if (!resolved.startsWith(SRC_DIR + path.sep) && resolved !== SRC_DIR) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  // Serve the tool only under /src/hse-feature-intake.html so relative URLs (../config/, engines.js) match GitHub Pages.
  if (pathname === '/' || pathname === '/index.html') {
    if (req.method !== 'GET') { res.writeHead(405, { 'Allow': 'GET' }); res.end(); return; }
    res.writeHead(302, { Location: '/src/hse-feature-intake.html' });
    res.end();
    return;
  }

  if (pathname === '/hse-feature-intake.html') {
    if (req.method !== 'GET') { res.writeHead(405, { 'Allow': 'GET' }); res.end(); return; }
    res.writeHead(301, { Location: '/src/hse-feature-intake.html' });
    res.end();
    return;
  }

  if (pathname === '/admin' || pathname === '/admin.html') {
    if (req.method !== 'GET') { res.writeHead(405, { 'Allow': 'GET' }); res.end(); return; }
    sendFile(res, ADMIN_FILE, STATIC_MIME['.html']); return;
  }

  if (pathname === '/submissions' || pathname === '/submissions.html') {
    if (req.method !== 'GET') { res.writeHead(405, { 'Allow': 'GET' }); res.end(); return; }
    sendFile(res, SUBMISSIONS_FILE, STATIC_MIME['.html']); return;
  }

  if (pathname === '/api/llm') {
    if (req.method !== 'POST') { res.writeHead(405, { 'Allow': 'POST' }); res.end(); return; }
    handleLlmProxy(req, res); return;
  }

  // Back-compat alias for any lingering clients
  if (pathname === '/api/claude') {
    if (req.method !== 'POST') { res.writeHead(405, { 'Allow': 'POST' }); res.end(); return; }
    handleLlmProxy(req, res); return;
  }

  if (pathname === '/api/embed') {
    if (req.method !== 'POST') { res.writeHead(405, { 'Allow': 'POST' }); res.end(); return; }
    handleEmbed(req, res); return;
  }

  if (pathname === '/api/intakes') {
    handleIntakes(req, res); return;
  }

  if (pathname.startsWith('/api/intakes/')) {
    const id = pathname.slice('/api/intakes/'.length);
    if (!id || id.includes('/') || id.includes('\\')) {
      sendJson(res, 400, { error: 'Invalid intake id' }); return;
    }
    handleIntakeById(req, res, decodeURIComponent(id)); return;
  }

  if (pathname === '/api/status') {
    if (req.method !== 'GET') { res.writeHead(405, { 'Allow': 'GET' }); res.end(); return; }
    readSettings((_e, settings) => {
      sendJson(res, 200, {
        provider: LLM_PROVIDER || null,
        providerConfigured: LLM_PROVIDER ? providerConfigured(LLM_PROVIDER) : false,
        model: LLM_PROVIDER ? providerModel(LLM_PROVIDER) : null,
        embedProvider: EMBED_PROVIDER || null,
        embedModel: EMBED_PROVIDER ? embedProviderModel(EMBED_PROVIDER) : null,
        aiAssist: !!settings.aiAssist,
        // Backward compat for old frontend
        claudeConfigured: !!ANTHROPIC_API_KEY
      });
    });
    return;
  }

  if (pathname === '/api/admin-settings') {
    handleAdminSettings(req, res); return;
  }

  if (pathname.startsWith('/config/')) {
    const filename = pathname.slice('/config/'.length);
    if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      sendJson(res, 400, { error: 'Invalid filename' }); return;
    }
    handleConfig(req, res, filename); return;
  }

  if (pathname.startsWith('/src/')) {
    if (req.method !== 'GET') { res.writeHead(405, { 'Allow': 'GET' }); res.end(); return; }
    const resolved = safeStaticPath(pathname);
    if (!resolved) { sendText(res, 403, 'Forbidden'); return; }
    const ext = path.extname(resolved).toLowerCase();
    sendFile(res, resolved, STATIC_MIME[ext] || 'application/octet-stream'); return;
  }

  sendText(res, 404, 'Not found');
});

server.listen(PORT, () => {
  console.log(`HSE intake server running at http://localhost:${PORT}`);
  console.log(`  Serving:  ${INDEX_FILE}`);
  console.log(`  Config:   ${CONFIG_DIR}`);
  if (LLM_PROVIDER && providerConfigured(LLM_PROVIDER)) {
    console.log(`  LLM:      ${LLM_PROVIDER} (${providerModel(LLM_PROVIDER)}) — AI assist is on by default; admin can switch off`);
    console.log(`  Scrub:    ${LLM_PII_SCRUB} (LLM_PII_SCRUB=off|standard|aggressive)`);
    console.log(`  Cache:    ${LLM_CACHE_ENABLED ? `on, ttl=${Math.round(LLM_CACHE_TTL_MS / 60000)}m, max=${LLM_CACHE_MAX_ENTRIES} entries` : 'off (LLM_CACHE=0)'}`);
    if (LLM_LOG_TO_FILE) console.log(`  Logs:     ${LLM_LOG_FILE}`);
  } else {
    console.log(`  LLM:      none configured — running in offline deterministic mode (fallback)`);
    console.log(`             To enable AI assist, set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or OLLAMA_ENABLED=1`);
  }
  if (EMBED_PROVIDER) {
    console.log(`  Embed:    ${EMBED_PROVIDER} (${embedProviderModel(EMBED_PROVIDER)}) — similar-ideas detection enabled`);
    console.log(`  Intakes:  ${INTAKES_FILE}`);
  } else {
    console.log(`  Embed:    none configured — similar-ideas detection unavailable. Add OPENAI_API_KEY, GEMINI_API_KEY, or OLLAMA_ENABLED=1 to enable.`);
  }
});
