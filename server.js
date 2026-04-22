const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// ---- LLM provider config (all optional; tool works fully without any of these) ----
// Auto-detect provider from which key is present unless LLM_PROVIDER is set explicitly.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL   = process.env.ANTHROPIC_MODEL   || 'claude-sonnet-4-20250514';
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION || '2023-06-01';
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY    || '';
const OPENAI_MODEL      = process.env.OPENAI_MODEL      || 'gpt-4o-mini';
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY    || process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL      = process.env.GEMINI_MODEL      || 'gemini-1.5-flash';
const OLLAMA_URL        = process.env.OLLAMA_URL        || 'http://localhost:11434';
const OLLAMA_MODEL      = process.env.OLLAMA_MODEL      || 'llama3.1';
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

const ROOT = __dirname;
const CONFIG_DIR = path.join(ROOT, 'config');
const BACKUP_DIR = path.join(CONFIG_DIR, 'backups');
const SRC_DIR = path.join(ROOT, 'src');
const INDEX_FILE = path.join(SRC_DIR, 'hse-feature-intake.html');
const ADMIN_FILE = path.join(SRC_DIR, 'admin.html');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'admin-settings.json');
const MAX_BACKUPS_PER_FILE = 20;

const DEFAULT_SETTINGS = { aiAssist: false };

const ALLOWED_CONFIG = new Set([
  'personas.md',
  'rice-config.md',
  'jpd-template.md',
  'form-fields.md',
  'hse-design-tokens.md'
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
  return text;
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
  return d.choices?.[0]?.message?.content || '';
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
  return parts.map(p => p.text || '').join('');
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
  return d.message?.content || '';
}

async function handleLlmProxy(req, res) {
  if (!LLM_PROVIDER || !providerConfigured(LLM_PROVIDER)) {
    sendJson(res, 503, {
      error: 'No LLM provider configured on the server. Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or OLLAMA_ENABLED=1. Or disable AI assist in the admin panel to use deterministic mode.'
    });
    return;
  }
  let bodyText;
  try { bodyText = await readBody(req, 4 * 1024 * 1024); }
  catch (e) { sendJson(res, 400, { error: e.message }); return; }

  let payload;
  try { payload = JSON.parse(bodyText); }
  catch { sendJson(res, 400, { error: 'Invalid JSON body' }); return; }

  const args = {
    prompt: payload.prompt || '',
    system: payload.system,
    max_tokens: payload.max_tokens,
    temperature: payload.temperature
  };
  if (!args.prompt) { sendJson(res, 400, { error: 'Missing "prompt" field' }); return; }

  try {
    let text = '';
    switch (LLM_PROVIDER) {
      case 'anthropic': text = await callAnthropic(args); break;
      case 'openai':    text = await callOpenAI(args); break;
      case 'gemini':    text = await callGemini(args); break;
      case 'ollama':    text = await callOllama(args); break;
      default: throw new Error(`Unknown provider: ${LLM_PROVIDER}`);
    }
    sendJson(res, 200, { text, provider: LLM_PROVIDER, model: providerModel(LLM_PROVIDER) });
  } catch (e) {
    sendJson(res, 502, { error: e.message });
  }
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

  if (pathname === '/' || pathname === '/index.html' || pathname === '/hse-feature-intake.html') {
    if (req.method !== 'GET') { res.writeHead(405, { 'Allow': 'GET' }); res.end(); return; }
    sendFile(res, INDEX_FILE, STATIC_MIME['.html']); return;
  }

  if (pathname === '/admin' || pathname === '/admin.html') {
    if (req.method !== 'GET') { res.writeHead(405, { 'Allow': 'GET' }); res.end(); return; }
    sendFile(res, ADMIN_FILE, STATIC_MIME['.html']); return;
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

  if (pathname === '/api/status') {
    if (req.method !== 'GET') { res.writeHead(405, { 'Allow': 'GET' }); res.end(); return; }
    readSettings((_e, settings) => {
      sendJson(res, 200, {
        provider: LLM_PROVIDER || null,
        providerConfigured: LLM_PROVIDER ? providerConfigured(LLM_PROVIDER) : false,
        model: LLM_PROVIDER ? providerModel(LLM_PROVIDER) : null,
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
    console.log(`  LLM:      ${LLM_PROVIDER} (${providerModel(LLM_PROVIDER)}) — available if AI assist is enabled in admin`);
  } else {
    console.log(`  LLM:      none configured — tool runs in deterministic mode (this is fine)`);
    console.log(`             Optional: set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or OLLAMA_ENABLED=1`);
  }
});
