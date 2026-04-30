/* HSE Feature Intake — Admin UI
 * Loads the five config markdown files, parses each into a structured model,
 * renders friendly editors, and serialises back to markdown on save.
 */

(function () {
  'use strict';

  function configFileUrl(filename) {
    return new URL('../config/' + filename, window.location.href).href;
  }

  /* =========================================================================
   * Config file descriptors
   * ========================================================================= */

  const CONFIG_FILES = [
    {
      key: 'rice',
      file: 'rice-config.md',
      label: 'RICE scoring',
      desc: 'User base, reach ranges, scales',
      icon: '#',
      render: renderRiceEditor,
      parse: parseBlocks,
      serialise: serialiseBlocks
    },
    {
      key: 'personas',
      file: 'personas.md',
      label: 'Personas',
      desc: 'Who the tool matches against',
      icon: '◉',
      render: renderPersonasEditor,
      parse: parsePersonas,
      serialise: serialisePersonas
    },
    {
      key: 'jpd',
      file: 'jpd-template.md',
      label: 'JPD template',
      desc: 'Intermediate ticket structure',
      icon: '§',
      render: renderJpdEditor,
      parse: parseJpd,
      serialise: serialiseJpd,
      helpText: 'Each section here maps to a heading in the JPD summary generated on Step 4. The design brief is built on top of this output, so changes here flow through to both. Keep headings and guidance in sync with the Jira Product Discovery form.'
    },
    {
      key: 'designBrief',
      file: 'design-brief-template.md',
      label: 'Design brief template',
      desc: 'Final brief structure',
      icon: '✎',
      render: renderJpdEditor,
      parse: parseJpd,
      serialise: serialiseJpd,
      helpText: 'Each section here becomes a heading in the design brief generated from the right-hand sidebar on Step 4. Edit guidance text to steer what the tool puts in each section.'
    },
    {
      key: 'formFields',
      file: 'form-fields.md',
      label: 'Form fields',
      desc: 'Reference document only',
      icon: '▤',
      render: renderFormFieldsEditor,
      parse: parseFormFields,
      serialise: serialiseFormFields
    },
    {
      key: 'tokens',
      file: 'hse-design-tokens.md',
      label: 'Design tokens',
      desc: 'Colours, type, spacing',
      icon: '◐',
      render: renderTokensEditor,
      parse: parseBlocks,
      serialise: serialiseBlocks
    }
  ];

  /* =========================================================================
   * App state
   * ========================================================================= */

  const AI_KEY = '_aiAssist';

  const state = {
    active: 'rice',
    files: {},
    // AI assist settings (fetched from /api/status and /api/admin-settings)
    ai: {
      loaded: false,
      aiAssist: false,
      providerConfigured: false,
      provider: null,
      model: null,
      saving: false,
      statusMsg: '',
      statusType: ''
    }
  };

  /* =========================================================================
   * Utilities
   * ========================================================================= */

  function el(tag, props, children) {
    const e = document.createElement(tag);
    if (props) {
      for (const k in props) {
        if (k === 'class') e.className = props[k];
        else if (k === 'style' && typeof props[k] === 'object') Object.assign(e.style, props[k]);
        else if (k.startsWith('on') && typeof props[k] === 'function') e.addEventListener(k.slice(2), props[k]);
        else if (k === 'html') e.innerHTML = props[k];
        else if (props[k] === true) e.setAttribute(k, '');
        else if (props[k] === false || props[k] == null) { /* skip */ }
        else e.setAttribute(k, props[k]);
      }
    }
    if (children != null) {
      if (!Array.isArray(children)) children = [children];
      for (const c of children) {
        if (c == null || c === false) continue;
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else e.appendChild(c);
      }
    }
    return e;
  }

  function icon(ch) {
    return el('span', { class: 'nav-icon' }, ch);
  }

  /* =========================================================================
   * Generic markdown block parser / serialiser
   * Used by rice + tokens; also by persona/jpd/form-fields as a starting point.
   * ========================================================================= */

  function parseBlocks(md) {
    const lines = (md || '').replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // ATX headings (# to ######)
      const hm = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (hm) {
        blocks.push({ type: 'heading', level: hm[1].length, text: hm[2].trim() });
        i++;
        continue;
      }

      // Horizontal rule (---, ***, ___)
      if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        blocks.push({ type: 'hr' });
        i++;
        continue;
      }

      // Code fence
      if (/^```/.test(line)) {
        const fenceInfo = line.slice(3);
        const bodyStart = i + 1;
        let j = bodyStart;
        while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
        const body = lines.slice(bodyStart, j).join('\n');
        blocks.push({ type: 'code', info: fenceInfo, body });
        i = j < lines.length ? j + 1 : j;
        continue;
      }

      // Blank line
      if (line.trim() === '') {
        blocks.push({ type: 'blank' });
        i++;
        continue;
      }

      // Table: header row followed by separator
      if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const header = parseTableRow(line);
        const sep = lines[i + 1];
        const rows = [];
        i += 2;
        while (i < lines.length && isTableRow(lines[i])) {
          rows.push(parseTableRow(lines[i]));
          i++;
        }
        blocks.push({ type: 'table', header, sep: sep.trim(), rows });
        continue;
      }

      // Unordered list
      if (/^[-*]\s/.test(line)) {
        const items = [];
        while (i < lines.length) {
          const m = /^([-*])\s(.*)$/.exec(lines[i]);
          if (!m) break;
          items.push(m[2]);
          i++;
          // Preserve indented continuation lines (including indented sub-bullets) by attaching them to the previous item
          while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
            items[items.length - 1] += '\n' + lines[i];
            i++;
          }
        }
        blocks.push({ type: 'list', items });
        continue;
      }

      // Paragraph: one or more contiguous non-special lines
      const start = i;
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === '') break;
        if (/^(#{1,6})\s+/.test(l)) break;
        if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l)) break;
        if (/^```/.test(l)) break;
        if (/^[-*]\s/.test(l)) break;
        if (isTableRow(l) && isTableSep(lines[i + 1] || '')) break;
        i++;
      }
      blocks.push({ type: 'paragraph', text: lines.slice(start, i).join('\n') });
    }
    return blocks;
  }

  function isTableRow(line) {
    if (!line) return false;
    return /^\s*\|.*\|\s*$/.test(line);
  }
  function isTableSep(line) {
    if (!line) return false;
    return /^\s*\|[-:|\s]+\|\s*$/.test(line);
  }
  function parseTableRow(line) {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|\s*$/, '');
    return trimmed.split('|').map(s => s.trim());
  }

  function serialiseBlocks(blocks) {
    const out = [];
    for (const b of blocks) {
      if (b.type === 'heading') {
        out.push('#'.repeat(b.level) + ' ' + b.text);
      } else if (b.type === 'hr') {
        out.push('---');
      } else if (b.type === 'code') {
        out.push('```' + (b.info || ''));
        if (b.body !== '') out.push(b.body);
        out.push('```');
      } else if (b.type === 'table') {
        out.push('| ' + b.header.join(' | ') + ' |');
        out.push(b.sep || serialiseTableSep(b.header.length));
        for (const row of b.rows) {
          // ensure row has correct column count
          const r = row.slice(0, b.header.length);
          while (r.length < b.header.length) r.push('');
          out.push('| ' + r.join(' | ') + ' |');
        }
      } else if (b.type === 'list') {
        for (const item of b.items) {
          const lines = item.split('\n');
          out.push('- ' + lines[0]);
          for (let k = 1; k < lines.length; k++) out.push(lines[k]);
        }
      } else if (b.type === 'paragraph') {
        out.push(b.text);
      } else if (b.type === 'blank') {
        out.push('');
      } else if (b.type === 'raw') {
        out.push(b.text);
      }
    }
    return out.join('\n');
  }
  function serialiseTableSep(n) {
    return '|' + Array(n).fill('---').join('|') + '|';
  }

  /* =========================================================================
   * Boot
   * ========================================================================= */

  async function boot() {
    const boot = document.getElementById('bootStatus');
    try {
      const results = await Promise.all(CONFIG_FILES.map(async c => {
        const r = await fetch(configFileUrl(c.file), { cache: 'no-store' });
        if (!r.ok) throw new Error(c.file + ' (' + r.status + ')');
        const text = await r.text();
        return { key: c.key, text };
      }));
      for (const r of results) {
        const cfg = CONFIG_FILES.find(c => c.key === r.key);
        let model = null;
        let parseErr = null;
        try { model = cfg.parse(r.text); } catch (e) { parseErr = e; }
        state.files[r.key] = {
          key: r.key,
          helpText: cfg.helpText || '',
          md: r.text,
          currentMd: r.text,
          model,
          parseErr,
          dirty: false,
          saving: false,
          statusMsg: '',
          statusType: ''
        };
      }
    } catch (e) {
      boot.className = 'boot-status err';
      boot.innerHTML = '<h2>Could not load config</h2><p>' + escapeHtml(e.message) + '<br><br>Make sure the Node server is running (<code>npm start</code>) and try again.</p>';
      return;
    }
    // Fetch AI assist status (non-fatal — defaults are safe)
    try {
      const r = await fetch('/api/status', { cache: 'no-store' });
      if (r.ok) {
        const s = await r.json();
        state.ai.aiAssist = !!s.aiAssist;
        state.ai.providerConfigured = !!s.providerConfigured;
        state.ai.provider = s.provider || null;
        state.ai.model = s.model || null;
        state.ai.loaded = true;
      }
    } catch (_) { /* stays in default (off) */ }

    boot.style.display = 'none';
    document.getElementById('mainLayout').style.display = 'grid';
    renderNav();
    renderActive();
    window.addEventListener('beforeunload', e => {
      const anyDirty = Object.values(state.files).some(f => f.dirty);
      if (anyDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  function renderNav() {
    const nav = document.getElementById('navList');
    nav.innerHTML = '';
    for (const c of CONFIG_FILES) {
      const f = state.files[c.key];
      const btn = el('button', {
        class: 'nav-item' + (state.active === c.key ? ' active' : '') + (f && f.dirty ? ' dirty' : ''),
        'data-key': c.key,
        onclick: () => selectNav(c.key)
      }, [
        icon(c.icon),
        el('div', { class: 'nav-main' }, [
          el('div', null, c.label),
          el('div', { class: 'nav-desc' }, c.desc)
        ]),
        el('div', { class: 'dirty-dot', title: 'Unsaved changes' })
      ]);
      nav.appendChild(btn);
    }

    // Separator + AI assist entry
    const sep = el('div', {
      style: { height: '1px', background: 'var(--c-border)', margin: '10px 8px' }
    });
    nav.appendChild(sep);
    const aiBtn = el('button', {
      class: 'nav-item' + (state.active === AI_KEY ? ' active' : ''),
      'data-key': AI_KEY,
      onclick: () => selectNav(AI_KEY)
    }, [
      icon('✦'),
      el('div', { class: 'nav-main' }, [
        el('div', null, 'AI assist'),
        el('div', { class: 'nav-desc' }, state.ai.aiAssist ? 'On · optional' : 'Off · optional')
      ])
    ]);
    nav.appendChild(aiBtn);
  }

  function selectNav(key) {
    if (key === state.active) return;
    state.active = key;
    renderNav();
    renderActive();
  }

  function updateNavDirty(key) {
    const item = document.querySelector('.nav-item[data-key="' + key + '"]');
    if (!item) return;
    item.classList.toggle('dirty', !!state.files[key].dirty);
  }

  function renderActive() {
    const content = document.getElementById('content');
    content.innerHTML = '';
    if (state.active === AI_KEY) { renderAiSettings(content); return; }
    const cfg = CONFIG_FILES.find(c => c.key === state.active);
    const f = state.files[cfg.key];

    // Header
    const head = el('div', { class: 'content-head' }, [
      el('div', null, [
        el('h1', null, cfg.label),
        el('p', { class: 'subtitle' }, describe(cfg.key))
      ]),
      el('div', { class: 'spacer' })
    ]);
    content.appendChild(head);

    // Parse error warning
    if (f.parseErr) {
      content.appendChild(el('div', { class: 'banner err' }, [
        el('strong', null, 'Could not parse this file.'),
        ' ' + f.parseErr.message + ' — please use the raw markdown editor at the bottom of the page to fix it.'
      ]));
    }

    // Editor body
    const editorHost = el('div', { id: 'editorHost' });
    try {
      cfg.render(editorHost, f);
    } catch (e) {
      editorHost.appendChild(el('div', { class: 'banner err' }, [
        el('strong', null, 'Editor failed to render.'),
        ' ' + e.message + ' — use the raw markdown editor below to edit this file directly.'
      ]));
    }
    content.appendChild(editorHost);

    // Advanced raw markdown fallback
    const advTa = el('textarea', { spellcheck: 'false' });
    advTa.value = f.currentMd;
    advTa.addEventListener('input', () => {
      f.currentMd = advTa.value;
      try {
        f.model = cfg.parse(advTa.value);
        f.parseErr = null;
      } catch (e) {
        f.parseErr = e;
      }
      markDirty(cfg.key);
    });
    const adv = el('details', { class: 'advanced' }, [
      el('summary', null, 'Advanced: edit raw markdown'),
      el('div', { class: 'advanced-body' }, [
        el('p', { class: 'hint', style: { marginBottom: '8px' } }, 'Direct markdown editor. Use this for anything the structured editor above doesn\'t cover. Changes here will be reflected in the structured editor when you click Save.'),
        advTa,
        el('div', { class: 'advanced-foot' }, [
          el('button', {
            class: 'btn btn-ghost btn-sm',
            onclick: () => {
              if (f.dirty && !confirm('Discard unsaved changes and reload from the current structured editor?')) return;
              f.currentMd = cfg.serialise(f.model);
              advTa.value = f.currentMd;
            }
          }, 'Re-sync from editor above'),
          el('span', { class: 'hint', style: { marginLeft: '8px' } }, cfg.file)
        ])
      ])
    ]);
    content.appendChild(adv);

    // Save bar
    const statusSpan = el('span', { id: 'statusLine', class: 'status-line' });
    updateStatusSpan(statusSpan, f);
    const saveBtn = el('button', {
      class: 'btn btn-primary',
      onclick: () => saveActive()
    }, 'Save changes');
    saveBtn.disabled = !f.dirty;
    const revertBtn = el('button', {
      class: 'btn btn-ghost',
      onclick: () => revertActive()
    }, 'Revert');
    revertBtn.disabled = !f.dirty;
    const bar = el('div', { class: 'save-bar' }, [
      saveBtn,
      revertBtn,
      el('div', { style: { flex: '1' } }),
      statusSpan
    ]);
    content.appendChild(bar);
  }

  function describe(key) {
    switch (key) {
      case 'rice': return 'Controls how the tool estimates Reach, Impact, Confidence and Effort. This is the file to edit when the total app user base changes, or when audience reach ranges need updating.';
      case 'personas': return 'The HSE Health App personas used for Step 2 persona matching. Used by both the deterministic matcher and, when AI assist is on, the language model.';
      case 'jpd': return 'Section structure used for the Step 4 JPD markdown summary. Keep section headings in sync with the JPD form in Jira Product Discovery.';
      case 'formFields': return 'Reference document describing every intake form field.';
      case 'tokens': return 'Colour, typography and spacing tokens from the HSE Design System. Used when generating wireframe sketches (AI assist required).';
      default: return '';
    }
  }

  /* =========================================================================
   * AI assist settings
   * ========================================================================= */

  function renderAiSettings(content) {
    content.appendChild(el('div', { class: 'content-head' }, [
      el('div', null, [
        el('h1', null, 'AI assist'),
        el('p', { class: 'subtitle' }, 'Optional. Turn this on to have a language model produce the persona match, RICE score and JPD summary, and to generate the wireframe sketch. When off, the tool uses deterministic rules based on the config files — which is the default and works without any API keys or external calls.')
      ]),
      el('div', { class: 'spacer' })
    ]));

    // Current server-side provider status
    const providerCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', null, 'Server-side LLM provider'),
        el('div', { class: 'spacer' })
      ]),
      el('div', { class: 'card-body', id: 'aiProviderBody' })
    ]);
    content.appendChild(providerCard);
    renderProviderBody();

    // Toggle card
    const toggleRow = el('div', {
      style: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }
    });
    const cb = el('input', { type: 'checkbox', id: 'aiAssistToggle' });
    cb.checked = !!state.ai.aiAssist;
    cb.disabled = state.ai.saving;
    cb.addEventListener('change', () => saveAiAssist(cb.checked));
    toggleRow.appendChild(el('label', {
      style: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }
    }, [
      cb,
      el('span', null, 'Use AI assist for persona matching, RICE scoring and JPD summary')
    ]));
    const statusSpan = el('span', { id: 'aiStatusLine', class: 'status-line' });
    updateAiStatusSpan(statusSpan);
    toggleRow.appendChild(statusSpan);

    const toggleCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [ el('h3', null, 'AI assist') ]),
      el('div', { class: 'card-body' }, [
        toggleRow,
        el('div', { class: 'section-help', style: { marginTop: '12px', marginBottom: '0' } },
          'When on: the tool sends your prompt to the LLM provider configured on the server (shown above) for each step. When off: the tool scores results using the rules in the RICE config, keyword overlap against personas, and a template fill from the JPD template. The wireframe sketch step only runs when AI assist is on.'
        )
      ])
    ]);
    content.appendChild(toggleCard);

    // Test connection
    const testResult = el('pre', {
      id: 'aiTestResult',
      style: {
        fontFamily: '\'Menlo\', \'Consolas\', monospace', fontSize: '12px',
        background: '#FAFCFB', border: '1px solid var(--c-border)', borderRadius: '6px',
        padding: '10px 12px', marginTop: '10px', whiteSpace: 'pre-wrap', minHeight: '0',
        color: 'var(--c-text)', display: 'none'
      }
    });
    const testBtn = el('button', {
      id: 'aiTestBtn',
      class: 'btn btn-primary',
      onclick: () => testAiConnection(testBtn, testResult)
    }, 'Test connection');
    testBtn.disabled = !state.ai.providerConfigured;
    const testCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [ el('h3', null, 'Test connection') ]),
      el('div', { class: 'card-body' }, [
        el('p', { class: 'section-help', style: { marginTop: '0', marginBottom: '10px' } },
          'Sends a short prompt to the provider. Helpful if you want to check your API key, model name, or local Ollama install before relying on it.'
        ),
        el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [testBtn]),
        testResult
      ])
    ]);
    content.appendChild(testCard);

    // Setup help
    content.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [ el('h3', null, 'Configuring a provider (for whoever runs the server)') ]),
      el('div', { class: 'card-body' }, [
        el('p', { class: 'section-help', style: { marginTop: '0', marginBottom: '10px' } },
          'The provider is chosen at server start from an environment variable. Pick whichever you prefer, then restart the server. Anyone using the tool doesn\'t need to know any of this — they just flip the toggle above.'
        ),
        el('div', { html: setupHtml() })
      ])
    ]));
  }

  function renderProviderBody() {
    const host = document.getElementById('aiProviderBody');
    if (!host) return;
    host.innerHTML = '';
    if (!state.ai.provider) {
      host.appendChild(el('div', { class: 'banner warn', style: { marginBottom: '0' } }, [
        el('strong', null, 'No provider configured.'),
        ' The tool works in deterministic mode either way. To add an LLM provider, see "Configuring a provider" below.'
      ]));
      return;
    }
    const ok = !!state.ai.providerConfigured;
    host.appendChild(el('div', {
      class: 'banner ' + (ok ? 'info' : 'warn'),
      style: { marginBottom: '0' }
    }, [
      el('strong', null, ok ? 'Provider ready: ' : 'Provider not ready: '),
      (state.ai.provider || '') + (state.ai.model ? ' (' + state.ai.model + ')' : '')
    ]));
  }

  async function saveAiAssist(enabled) {
    state.ai.saving = true;
    const cb = document.getElementById('aiAssistToggle');
    if (cb) cb.disabled = true;
    const statusSpan = document.getElementById('aiStatusLine');
    state.ai.statusMsg = 'Saving…';
    state.ai.statusType = '';
    if (statusSpan) updateAiStatusSpan(statusSpan);
    try {
      const r = await fetch('/api/admin-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiAssist: !!enabled })
      });
      if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 200));
      const s = await r.json();
      state.ai.aiAssist = !!s.aiAssist;
      state.ai.statusMsg = 'Saved. The intake tool picks this up on next page load.';
      state.ai.statusType = 'ok';
      renderNav();
    } catch (e) {
      state.ai.statusMsg = 'Save failed: ' + e.message;
      state.ai.statusType = 'err';
      if (cb) cb.checked = !enabled;
    } finally {
      state.ai.saving = false;
      if (cb) cb.disabled = false;
      if (statusSpan) updateAiStatusSpan(statusSpan);
    }
  }

  function updateAiStatusSpan(span) {
    span.className = 'status-line' + (state.ai.statusType ? ' ' + state.ai.statusType : '');
    span.textContent = state.ai.statusMsg || '';
  }

  async function testAiConnection(btn, result) {
    if (!result) return;
    result.style.display = 'block';
    result.textContent = 'Sending test prompt…';
    if (btn) btn.disabled = true;
    try {
      const r = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'In one sentence, confirm you are reachable and state your model name.',
          max_tokens: 120
        })
      });
      if (!r.ok) {
        let err = '';
        try { err = (await r.json()).error || ''; } catch { try { err = await r.text(); } catch {} }
        result.textContent = 'HTTP ' + r.status + '\n' + String(err).slice(0, 500);
      } else {
        const data = await r.json();
        result.textContent = 'Provider: ' + (data.provider || '?') +
          '\nModel: ' + (data.model || '?') +
          '\n\n' + (data.text || '(empty)');
      }
    } catch (e) {
      result.textContent = 'Network error: ' + e.message;
    } finally {
      if (btn) btn.disabled = !state.ai.providerConfigured;
    }
  }

  function setupHtml() {
    return [
      '<p style="font-size:13px;color:var(--c-text);line-height:1.6;margin-bottom:8px"><strong>Option A — Local model via Ollama (free, offline, no API key)</strong></p>',
      '<pre style="background:#FAFCFB;border:1px solid var(--c-border);border-radius:6px;padding:10px;font-family:Menlo,Consolas,monospace;font-size:12px;margin-bottom:14px;overflow:auto">',
      '# one-time setup\n',
      'brew install ollama          # or download from https://ollama.com\n',
      'ollama pull llama3.1         # ~4 GB — or qwen2.5:14b for better quality\n\n',
      '# every time you run the intake tool\n',
      'ollama serve &\n',
      'OLLAMA_ENABLED=1 npm start',
      '</pre>',
      '<p style="font-size:13px;color:var(--c-text);line-height:1.6;margin-bottom:8px"><strong>Option B — Hosted provider (one of these)</strong></p>',
      '<pre style="background:#FAFCFB;border:1px solid var(--c-border);border-radius:6px;padding:10px;font-family:Menlo,Consolas,monospace;font-size:12px;margin-bottom:0;overflow:auto">',
      '# Anthropic Claude\n',
      'export ANTHROPIC_API_KEY=sk-ant-...\n',
      'npm start\n\n',
      '# OpenAI\n',
      'export OPENAI_API_KEY=sk-...\n',
      'npm start\n\n',
      '# Google Gemini (free tier available)\n',
      'export GEMINI_API_KEY=...\n',
      'npm start',
      '</pre>'
    ].join('');
  }

  function markDirty(key, dirty) {
    const f = state.files[key];
    if (dirty === undefined) dirty = true;
    if (f.dirty === dirty) return;
    f.dirty = dirty;
    updateNavDirty(key);
    updateSaveBar(key);
  }

  function updateSaveBar(key) {
    if (state.active !== key) return;
    const bar = document.querySelector('.save-bar');
    if (!bar) return;
    const f = state.files[key];
    const saveBtn = bar.querySelector('.btn-primary');
    const revertBtn = bar.querySelector('.btn-ghost');
    if (saveBtn) saveBtn.disabled = !f.dirty || f.saving;
    if (revertBtn) revertBtn.disabled = !f.dirty || f.saving;
    const status = document.getElementById('statusLine');
    if (status) updateStatusSpan(status, f);
  }

  function updateStatusSpan(span, f) {
    span.className = 'status-line' + (f.statusType ? ' ' + f.statusType : '');
    if (f.saving) { span.textContent = 'Saving...'; return; }
    if (f.statusMsg) { span.textContent = f.statusMsg; return; }
    if (f.dirty) { span.textContent = 'Unsaved changes'; return; }
    span.textContent = '';
  }

  async function saveActive() {
    const cfg = CONFIG_FILES.find(c => c.key === state.active);
    const f = state.files[cfg.key];
    // Serialise the model to the canonical markdown (unless the raw editor was used — in which case currentMd is already the source of truth)
    let out;
    try {
      out = cfg.serialise(f.model);
    } catch (e) {
      f.statusMsg = 'Could not serialise: ' + e.message;
      f.statusType = 'err';
      updateSaveBar(cfg.key);
      return;
    }
    // If the advanced textarea has diverged from what we'd produce, prefer the user's raw edit.
    if (f.currentMd !== out) {
      // The user may have made edits directly in the raw textarea that the structured editor didn't cover.
      // Prefer raw when it parses cleanly, otherwise prefer the model-serialised output.
      if (!f.parseErr) {
        out = f.currentMd;
      }
    }
    f.saving = true;
    f.statusMsg = '';
    f.statusType = '';
    updateSaveBar(cfg.key);
    try {
      const res = await fetch(configFileUrl(cfg.file), {
        method: 'POST',
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        body: out
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(res.status + ' ' + err.slice(0, 200));
      }
      f.md = out;
      f.currentMd = out;
      // Re-parse from the saved markdown so the model is definitely in sync
      try {
        f.model = cfg.parse(out);
        f.parseErr = null;
      } catch (e) {
        f.parseErr = e;
      }
      f.dirty = false;
      f.saving = false;
      f.statusMsg = 'Saved to config/' + cfg.file;
      f.statusType = 'ok';
      updateNavDirty(cfg.key);
      renderActive();
      // Clear status after a few seconds
      setTimeout(() => {
        if (f.statusType === 'ok' && !f.dirty) {
          f.statusMsg = '';
          f.statusType = '';
          updateSaveBar(cfg.key);
        }
      }, 4000);
    } catch (e) {
      f.saving = false;
      f.statusMsg = 'Save failed: ' + e.message;
      f.statusType = 'err';
      updateSaveBar(cfg.key);
    }
  }

  function revertActive() {
    const cfg = CONFIG_FILES.find(c => c.key === state.active);
    const f = state.files[cfg.key];
    if (!f.dirty) return;
    if (!confirm('Revert to the last-saved version of ' + cfg.file + '?')) return;
    f.currentMd = f.md;
    try { f.model = cfg.parse(f.md); f.parseErr = null; } catch (e) { f.parseErr = e; }
    f.dirty = false;
    f.statusMsg = '';
    f.statusType = '';
    updateNavDirty(cfg.key);
    renderActive();
  }

  /* =========================================================================
   * RICE editor
   * ========================================================================= */

  function renderRiceEditor(host, f) {
    const blocks = f.model;
    const cfg = CONFIG_FILES.find(c => c.key === 'rice');
    const refresh = () => {
      f.currentMd = cfg.serialise(blocks);
      markDirty('rice');
    };

    host.appendChild(helpBanner('Tip: this is the file to change when the total registered user base grows, or when audience reach ranges change. The other tables set how Impact, Confidence and Effort are scored.'));

    // Total registered users
    const userBlock = findParagraphMatching(blocks, /Total registered users/i);
    if (userBlock) {
      const m = /Total registered users:\s*\*\*([\d,]+)\*\*/.exec(userBlock.text);
      const currentValue = m ? m[1] : '';
      host.appendChild(card('Total registered users', 'Used as the denominator when the tool estimates Reach. Change this if the total app user base grows.', [
        field('App user base', [
          numericStringInput(currentValue, v => {
            userBlock.text = userBlock.text.replace(/Total registered users:\s*\*\*[\d,]*\*\*/, 'Total registered users: **' + v + '**');
            refresh();
          }, 'e.g. 300,000')
        ], 'Comma-separated is fine (e.g. 300,000).')
      ]));
    }

    // Tables under known headings
    const tableSections = [
      { heading: 'Reach reference ranges', desc: 'Estimated quarterly reach for common audience scopes. The tool uses these as a guide when estimating Reach.', kind: 'reach' },
      { heading: 'Impact scale', desc: 'How much a feature improves the experience for each user who encounters it. Higher score = bigger impact.', kind: 'generic' },
      { heading: 'Confidence scale', desc: 'How strong the evidence behind the need is.', kind: 'generic' },
      { heading: 'Effort guidance', desc: 'Person-months by T-shirt size.', kind: 'generic' },
      { heading: 'Interpretation guidance', desc: 'Rough ranges for how to talk about the final RICE score.', kind: 'generic' }
    ];
    for (const sec of tableSections) {
      const h = findHeadingByText(blocks, sec.heading);
      if (!h) continue;
      const table = findNextTable(blocks, h);
      if (!table) continue;
      if (sec.kind === 'reach') {
        host.appendChild(reachRangesEditor(table, sec.heading, sec.desc, refresh));
      } else {
        host.appendChild(genericTableEditor(table, sec.heading, sec.desc, refresh));
      }
    }

    // RICE formula (read-only display)
    const formulaHead = findHeadingByText(blocks, 'RICE formula');
    if (formulaHead) {
      const code = findNextCode(blocks, formulaHead);
      if (code) {
        host.appendChild(card('RICE formula', 'Not configurable — shown here for reference.', [
          el('pre', { style: { background: '#FAFCFB', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--c-border)', fontSize: '12.5px', fontFamily: 'Menlo, Consolas, monospace' } }, code.body)
        ]));
      }
    }
  }

  function numericStringInput(value, onChange, placeholder) {
    const i = el('input', { type: 'text', value: value, placeholder: placeholder || '' });
    i.addEventListener('input', () => onChange(i.value));
    return i;
  }

  function reachRangesEditor(table, heading, desc, refresh) {
    // Table header is typically: "Audience scope | Estimated quarterly reach"
    const rowsHost = el('div');
    const grid = '1fr 110px 110px 34px';

    function rebuild() {
      rowsHost.innerHTML = '';
      rowsHost.appendChild(el('div', { class: 'col-labels', style: { gridTemplateColumns: grid } }, [
        el('div', null, 'Audience scope'),
        el('div', null, 'Low reach'),
        el('div', null, 'High reach'),
        el('div', null, '')
      ]));
      table.rows.forEach((row, idx) => {
        const audience = row[0] || '';
        const rangeCell = row[1] || '';
        const { low, high } = parseRangeCell(rangeCell);
        const audienceInput = el('input', { type: 'text', value: audience, placeholder: 'e.g. Cancer pathway users' });
        const lowInput = el('input', { type: 'text', value: low, placeholder: '3,000' });
        const highInput = el('input', { type: 'text', value: high, placeholder: '8,000' });
        audienceInput.addEventListener('input', () => { row[0] = audienceInput.value; refresh(); });
        lowInput.addEventListener('input', () => { row[1] = combineRangeCell(lowInput.value, highInput.value); refresh(); });
        highInput.addEventListener('input', () => { row[1] = combineRangeCell(lowInput.value, highInput.value); refresh(); });
        const rowEl = el('div', { class: 'row-grid', style: { gridTemplateColumns: grid } }, [
          audienceInput, lowInput, highInput,
          el('div', { class: 'row-controls' }, [
            removeRowBtn(() => { table.rows.splice(idx, 1); rebuild(); refresh(); })
          ])
        ]);
        rowsHost.appendChild(rowEl);
      });
      const addRow = el('div', { class: 'add-btn-row' }, [
        el('button', {
          class: 'add-btn',
          onclick: () => {
            table.rows.push(['', '0 to 0']);
            rebuild();
            refresh();
          }
        }, '+ Add audience')
      ]);
      rowsHost.appendChild(addRow);
    }
    rebuild();
    return card(heading, desc, [rowsHost]);
  }

  function parseRangeCell(text) {
    // Expected shape: "50,000 to 150,000" (or with " - ", "–", etc.)
    const m = /^\s*([\d,\.]+)\s*(?:to|–|—|-)\s*([\d,\.]+)\s*$/i.exec(text);
    if (m) return { low: m[1], high: m[2] };
    return { low: text, high: '' };
  }
  function combineRangeCell(low, high) {
    if (!low && !high) return '';
    if (!high) return low;
    if (!low) return high;
    return low + ' to ' + high;
  }

  function genericTableEditor(table, heading, desc, refresh) {
    const rowsHost = el('div');
    const headerCols = table.header.slice();
    const grid = headerCols.map(() => '1fr').join(' ') + ' 34px';

    function rebuild() {
      rowsHost.innerHTML = '';
      rowsHost.appendChild(el('div', { class: 'col-labels', style: { gridTemplateColumns: grid } }, [
        ...headerCols.map(h => el('div', null, h)),
        el('div', null, '')
      ]));
      table.rows.forEach((row, idx) => {
        const inputs = headerCols.map((h, ci) => {
          const needsTextarea = (row[ci] || '').length > 60 || /definition|interpretation|means/i.test(h);
          const input = needsTextarea
            ? el('textarea', { rows: '2' })
            : el('input', { type: 'text' });
          input.value = row[ci] || '';
          input.addEventListener('input', () => { row[ci] = input.value; refresh(); });
          return input;
        });
        const rowEl = el('div', { class: 'row-grid', style: { gridTemplateColumns: grid } }, [
          ...inputs,
          el('div', { class: 'row-controls' }, [
            removeRowBtn(() => { table.rows.splice(idx, 1); rebuild(); refresh(); })
          ])
        ]);
        rowsHost.appendChild(rowEl);
      });
      const addRow = el('div', { class: 'add-btn-row' }, [
        el('button', {
          class: 'add-btn',
          onclick: () => {
            table.rows.push(headerCols.map(() => ''));
            rebuild();
            refresh();
          }
        }, '+ Add row')
      ]);
      rowsHost.appendChild(addRow);
    }
    rebuild();
    return card(heading, desc, [rowsHost]);
  }

  function findParagraphMatching(blocks, re) {
    return blocks.find(b => b.type === 'paragraph' && re.test(b.text));
  }
  function findHeadingByText(blocks, text) {
    return blocks.find(b => b.type === 'heading' && b.text.trim().toLowerCase() === text.toLowerCase());
  }
  function findNextTable(blocks, afterBlock) {
    const start = blocks.indexOf(afterBlock);
    if (start < 0) return null;
    for (let i = start + 1; i < blocks.length; i++) {
      if (blocks[i].type === 'heading') return null;
      if (blocks[i].type === 'table') return blocks[i];
    }
    return null;
  }
  function findNextCode(blocks, afterBlock) {
    const start = blocks.indexOf(afterBlock);
    if (start < 0) return null;
    for (let i = start + 1; i < blocks.length; i++) {
      if (blocks[i].type === 'heading') return null;
      if (blocks[i].type === 'code') return blocks[i];
    }
    return null;
  }

  /* =========================================================================
   * Personas editor
   * ========================================================================= */

  function parsePersonas(md) {
    const blocks = parseBlocks(md);
    // Find the first H2 — everything before is the intro.
    const firstPersonaIdx = blocks.findIndex(b => b.type === 'heading' && b.level === 2);
    const intro = firstPersonaIdx < 0 ? blocks.slice() : blocks.slice(0, firstPersonaIdx);
    const personas = [];
    if (firstPersonaIdx >= 0) {
      // Split remainder by H2 headings
      let i = firstPersonaIdx;
      while (i < blocks.length) {
        if (blocks[i].type !== 'heading' || blocks[i].level !== 2) { i++; continue; }
        const name = blocks[i].text;
        const start = i + 1;
        let j = start;
        while (j < blocks.length && !(blocks[j].type === 'heading' && blocks[j].level === 2)) j++;
        const personaBlocks = blocks.slice(start, j);
        personas.push(parseSinglePersona(name, personaBlocks));
        i = j;
      }
    }
    return { intro, personas };
  }

  function parseSinglePersona(name, bodyBlocks) {
    // Persona body typically: subtitle paragraph (bold), blank, list of demographics, blank, H3 sections with lists, trailing hr
    let subtitle = '';
    const demographics = []; // [{key, value}]
    const sections = {};     // { heading: [items] }
    const extras = [];       // any unknown blocks we keep as raw
    const knownSectionTitles = ['Jobs to be done', 'Key challenges', 'Relevant app features', 'Research references'];
    let trailingHr = false;

    let i = 0;
    // Subtitle: first paragraph that starts with **
    while (i < bodyBlocks.length) {
      const b = bodyBlocks[i];
      if (b.type === 'blank' || b.type === 'hr') { i++; continue; }
      if (b.type === 'paragraph' && /^\*\*[^*]+\*\*/.test(b.text)) {
        subtitle = b.text.replace(/^\*\*([\s\S]*?)\*\*\s*$/, '$1');
        i++;
        break;
      }
      break;
    }

    // Demographics: first unordered list
    while (i < bodyBlocks.length) {
      const b = bodyBlocks[i];
      if (b.type === 'blank') { i++; continue; }
      if (b.type === 'list') {
        for (const item of b.items) {
          const m = /^([^:]+):\s*(.*)$/.exec(item);
          if (m) demographics.push({ key: m[1].trim(), value: m[2].trim() });
          else demographics.push({ key: '', value: item });
        }
        i++;
        break;
      }
      break;
    }

    // Remaining: H3 subsections each followed by a list
    while (i < bodyBlocks.length) {
      const b = bodyBlocks[i];
      if (b.type === 'blank') { i++; continue; }
      if (b.type === 'hr') { trailingHr = true; i++; continue; }
      if (b.type === 'heading' && b.level === 3) {
        const title = b.text.trim();
        i++;
        // Find the following list (skip blanks)
        let items = [];
        while (i < bodyBlocks.length) {
          const nb = bodyBlocks[i];
          if (nb.type === 'blank') { i++; continue; }
          if (nb.type === 'list') { items = nb.items.slice(); i++; break; }
          break;
        }
        sections[title] = items;
        continue;
      }
      extras.push(b);
      i++;
    }

    return {
      name,
      subtitle,
      demographics,
      jobs: sections['Jobs to be done'] || [],
      challenges: sections['Key challenges'] || [],
      features: sections['Relevant app features'] || [],
      references: sections['Research references'] || [],
      otherSections: Object.keys(sections).filter(k => !['Jobs to be done', 'Key challenges', 'Relevant app features', 'Research references'].includes(k)).map(k => ({ title: k, items: sections[k] })),
      extras,
      trailingHr
    };
  }

  function serialisePersonas(model) {
    const lines = [];
    lines.push(serialiseBlocks(model.intro).replace(/\s+$/, ''));
    model.personas.forEach((p, idx) => {
      lines.push('');
      lines.push('## ' + p.name);
      if (p.subtitle) {
        lines.push('**' + p.subtitle + '**');
      }
      if (p.demographics.length) {
        lines.push('');
        for (const d of p.demographics) {
          if (d.key) lines.push('- ' + d.key + ': ' + d.value);
          else if (d.value) lines.push('- ' + d.value);
        }
      }
      const orderedSections = [
        ['Jobs to be done', p.jobs],
        ['Key challenges', p.challenges],
        ['Relevant app features', p.features],
        ['Research references', p.references]
      ];
      for (const os of p.otherSections) orderedSections.push([os.title, os.items]);
      for (const [title, items] of orderedSections) {
        if (!items || !items.length) continue;
        lines.push('');
        lines.push('### ' + title);
        for (const it of items) lines.push('- ' + it);
      }
      if (idx < model.personas.length - 1) {
        lines.push('');
        lines.push('---');
      }
    });
    let out = lines.join('\n');
    if (!out.endsWith('\n')) out += '\n';
    return out;
  }

  function renderPersonasEditor(host, f) {
    const model = f.model;
    const refresh = () => {
      f.currentMd = serialisePersonas(model);
      markDirty('personas');
    };

    host.appendChild(helpBanner('Add, edit or reorder personas the tool uses for Step 2 matching. The whole list is sent to Claude for every submission, so keep each persona tight and factual.'));

    // Intro editor (textarea for the file header)
    const introText = serialiseBlocks(model.intro).replace(/\s+$/, '');
    host.appendChild(card('File header', 'The intro paragraph and source note that sit above the personas. Usually no need to change this.', [
      field('Header markdown', [
        (() => {
          const ta = el('textarea', { class: 'mono', rows: '4' });
          ta.value = introText;
          ta.addEventListener('input', () => {
            try {
              model.intro = parseBlocks(ta.value);
              refresh();
            } catch (e) {
              // keep raw text if parse fails
            }
          });
          return ta;
        })()
      ])
    ]));

    // Personas list
    const listHost = el('div');
    host.appendChild(card('Personas', 'Click a persona to expand. Use the arrows to reorder.', [listHost]));

    function rebuildList() {
      listHost.innerHTML = '';
      model.personas.forEach((p, idx) => {
        listHost.appendChild(personaAccordion(p, idx, model.personas.length, {
          onToggle: accItem => accItem.classList.toggle('open'),
          onMove: (dir) => {
            const newIdx = idx + dir;
            if (newIdx < 0 || newIdx >= model.personas.length) return;
            const [removed] = model.personas.splice(idx, 1);
            model.personas.splice(newIdx, 0, removed);
            rebuildList();
            refresh();
          },
          onDuplicate: () => {
            const clone = JSON.parse(JSON.stringify(p));
            clone.name = clone.name + ' (copy)';
            model.personas.splice(idx + 1, 0, clone);
            rebuildList();
            refresh();
          },
          onRemove: () => {
            if (!confirm('Remove persona "' + p.name + '"?')) return;
            model.personas.splice(idx, 1);
            rebuildList();
            refresh();
          },
          onChange: refresh
        }));
      });
      const add = el('div', { class: 'add-btn-row' }, [
        el('button', {
          class: 'add-btn',
          onclick: () => {
            model.personas.push({
              name: 'New persona',
              subtitle: 'Short descriptor',
              demographics: [],
              jobs: [], challenges: [], features: [], references: [],
              otherSections: [], extras: [], trailingHr: true
            });
            rebuildList();
            refresh();
          }
        }, '+ Add persona')
      ]);
      listHost.appendChild(add);
    }
    rebuildList();
  }

  function personaAccordion(p, idx, total, cbs) {
    const item = el('div', { class: 'accordion-item' });
    const head = el('button', { class: 'accordion-head', onclick: () => cbs.onToggle(item) }, [
      el('span', { class: 'chev' }, '▸'),
      el('div', null, [
        el('strong', null, p.name || '(unnamed)'),
        el('div', { class: 'sub' }, p.subtitle || '')
      ]),
      el('div', { class: 'accordion-controls' }, [
        moveBtn('↑', idx === 0, (e) => { e.stopPropagation(); cbs.onMove(-1); }),
        moveBtn('↓', idx === total - 1, (e) => { e.stopPropagation(); cbs.onMove(1); }),
        iconBtnSm('⧉', (e) => { e.stopPropagation(); cbs.onDuplicate(); }, 'Duplicate'),
        iconBtnSmDanger('✕', (e) => { e.stopPropagation(); cbs.onRemove(); }, 'Remove')
      ])
    ]);
    item.appendChild(head);
    const body = el('div', { class: 'accordion-body' });

    // Name
    const nameInput = el('input', { type: 'text', value: p.name, placeholder: 'Persona name' });
    nameInput.addEventListener('input', () => { p.name = nameInput.value; head.querySelector('strong').textContent = p.name || '(unnamed)'; cbs.onChange(); });
    body.appendChild(field('Name', [nameInput]));

    // Subtitle
    const subInput = el('input', { type: 'text', value: p.subtitle, placeholder: 'e.g. A young pregnant woman managing gestational diabetes' });
    subInput.addEventListener('input', () => { p.subtitle = subInput.value; head.querySelector('.sub').textContent = p.subtitle || ''; cbs.onChange(); });
    body.appendChild(field('One-line descriptor', [subInput], 'Rendered as bold text under the persona name.'));

    // Demographics
    body.appendChild(keyValueListEditor('Demographics', p.demographics, cbs.onChange, {
      addLabel: '+ Add demographic',
      placeholderKey: 'e.g. Age', placeholderValue: 'e.g. 55'
    }));

    // Bullet lists
    body.appendChild(bulletListEditor('Jobs to be done', p.jobs, cbs.onChange));
    body.appendChild(bulletListEditor('Key challenges', p.challenges, cbs.onChange));
    body.appendChild(bulletListEditor('Relevant app features', p.features, cbs.onChange));
    body.appendChild(bulletListEditor('Research references', p.references, cbs.onChange));

    // Any extra (unknown) sections — rendered read-only note
    if (p.otherSections && p.otherSections.length) {
      for (const os of p.otherSections) {
        body.appendChild(bulletListEditor(os.title + ' (custom section)', os.items, cbs.onChange));
      }
    }

    item.appendChild(body);
    return item;
  }

  function keyValueListEditor(title, arr, onChange, opts) {
    opts = opts || {};
    const wrap = el('div', { class: 'field' });
    wrap.appendChild(el('label', null, title));
    const list = el('div');
    function rebuild() {
      list.innerHTML = '';
      arr.forEach((kv, i) => {
        const keyInput = el('input', { type: 'text', value: kv.key, placeholder: opts.placeholderKey || 'Key' });
        const valInput = el('input', { type: 'text', value: kv.value, placeholder: opts.placeholderValue || 'Value' });
        keyInput.addEventListener('input', () => { kv.key = keyInput.value; onChange(); });
        valInput.addEventListener('input', () => { kv.value = valInput.value; onChange(); });
        list.appendChild(el('div', { class: 'row-grid', style: { gridTemplateColumns: '160px 1fr 34px' } }, [
          keyInput, valInput,
          el('div', { class: 'row-controls' }, [removeRowBtn(() => { arr.splice(i, 1); rebuild(); onChange(); })])
        ]));
      });
      list.appendChild(el('div', { class: 'add-btn-row' }, [
        el('button', { class: 'add-btn', onclick: () => { arr.push({ key: '', value: '' }); rebuild(); onChange(); } }, opts.addLabel || '+ Add')
      ]));
    }
    rebuild();
    wrap.appendChild(list);
    return wrap;
  }

  function bulletListEditor(title, arr, onChange, opts) {
    opts = opts || {};
    const wrap = el('div', { class: 'field' });
    wrap.appendChild(el('label', null, title));
    const list = el('div');
    function rebuild() {
      list.innerHTML = '';
      arr.forEach((item, i) => {
        const input = (item && item.length > 60)
          ? el('textarea', { rows: '2' })
          : el('input', { type: 'text' });
        input.value = item;
        input.placeholder = opts.placeholder || 'Item';
        input.addEventListener('input', () => { arr[i] = input.value; onChange(); });
        list.appendChild(el('div', { class: 'row-grid', style: { gridTemplateColumns: '1fr 34px 34px 34px' } }, [
          input,
          moveRowBtn('↑', i === 0, () => { swap(arr, i, i - 1); rebuild(); onChange(); }),
          moveRowBtn('↓', i === arr.length - 1, () => { swap(arr, i, i + 1); rebuild(); onChange(); }),
          removeRowBtn(() => { arr.splice(i, 1); rebuild(); onChange(); })
        ]));
      });
      list.appendChild(el('div', { class: 'add-btn-row' }, [
        el('button', { class: 'add-btn', onclick: () => { arr.push(''); rebuild(); onChange(); } }, opts.addLabel || '+ Add item')
      ]));
    }
    rebuild();
    wrap.appendChild(list);
    return wrap;
  }

  function swap(arr, a, b) {
    if (a < 0 || b < 0 || a >= arr.length || b >= arr.length) return;
    const tmp = arr[a]; arr[a] = arr[b]; arr[b] = tmp;
  }

  /* =========================================================================
   * JPD editor
   * ========================================================================= */

  function parseJpd(md) {
    const blocks = parseBlocks(md);
    // Everything before the first H2 is intro.
    const firstIdx = blocks.findIndex(b => b.type === 'heading' && b.level === 2);
    const intro = firstIdx < 0 ? blocks.slice() : blocks.slice(0, firstIdx);
    const sections = [];
    if (firstIdx >= 0) {
      let i = firstIdx;
      while (i < blocks.length) {
        if (!(blocks[i].type === 'heading' && blocks[i].level === 2)) { i++; continue; }
        const heading = blocks[i].text;
        const start = i + 1;
        let j = start;
        while (j < blocks.length && !(blocks[j].type === 'heading' && blocks[j].level === 2)) j++;
        const body = blocks.slice(start, j);
        // Strip surrounding blanks and trailing hr for clean editing
        let trailingHr = false;
        while (body.length && body[body.length - 1].type === 'blank') body.pop();
        if (body.length && body[body.length - 1].type === 'hr') { trailingHr = true; body.pop(); }
        while (body.length && body[body.length - 1].type === 'blank') body.pop();
        while (body.length && body[0].type === 'blank') body.shift();
        sections.push({ heading, bodyText: serialiseBlocks(body), trailingHr });
        i = j;
      }
    }
    return { intro, sections };
  }

  function serialiseJpd(model) {
    const out = [];
    out.push(serialiseBlocks(model.intro).replace(/\s+$/, ''));
    for (const s of model.sections) {
      out.push('');
      out.push('## ' + s.heading);
      out.push('');
      out.push(s.bodyText.replace(/\s+$/, ''));
      if (s.trailingHr) {
        out.push('');
        out.push('---');
      }
    }
    let text = out.join('\n');
    if (!text.endsWith('\n')) text += '\n';
    return text;
  }

  function renderJpdEditor(host, f) {
    const model = f.model;
    const editorKey = f.key || 'jpd';
    const refresh = () => {
      f.currentMd = serialiseJpd(model);
      markDirty(editorKey);
    };

    const helpText = f.helpText || 'Each section here maps to a heading in the generated JPD summary (Step 4). Change headings or guidance text to keep the tool in sync with the Jira Product Discovery form.';
    host.appendChild(helpBanner(helpText));

    // Intro textarea
    const introText = serialiseBlocks(model.intro).replace(/\s+$/, '');
    host.appendChild(card('File header', 'The intro paragraph at the top of the template file.', [
      field('Header markdown', [
        (() => {
          const ta = el('textarea', { class: 'mono', rows: '4' });
          ta.value = introText;
          ta.addEventListener('input', () => {
            try { model.intro = parseBlocks(ta.value); refresh(); } catch (e) { /* keep */ }
          });
          return ta;
        })()
      ])
    ]));

    // Sections
    const listHost = el('div');
    const sectionsBlurb = editorKey === 'designBrief'
      ? 'Each section becomes a heading in the generated design brief. Guidance text describes what goes in each section — the tool uses this (and the matching JPD content) when composing the output.'
      : 'Each section becomes a heading in the generated JPD markdown. Guidance text describes what goes in each section — Claude uses this when composing the output.';
    host.appendChild(card('Template sections', sectionsBlurb, [listHost]));

    function rebuild() {
      listHost.innerHTML = '';
      model.sections.forEach((sec, idx) => {
        const headingInput = el('input', { type: 'text', value: sec.heading, placeholder: 'Section heading' });
        headingInput.addEventListener('input', () => { sec.heading = headingInput.value; refresh(); });
        const bodyTa = el('textarea', { rows: '4' });
        bodyTa.value = sec.bodyText;
        bodyTa.addEventListener('input', () => { sec.bodyText = bodyTa.value; refresh(); });
        const row = el('div', { class: 'card', style: { background: '#FBFDFC', marginBottom: '10px' } }, [
          el('div', { class: 'card-head' }, [
            el('strong', { style: { fontSize: '12px', color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '.06em' } }, 'Section ' + (idx + 1)),
            el('div', { class: 'spacer' }),
            moveBtn('↑', idx === 0, () => { swap(model.sections, idx, idx - 1); rebuild(); refresh(); }),
            moveBtn('↓', idx === model.sections.length - 1, () => { swap(model.sections, idx, idx + 1); rebuild(); refresh(); }),
            iconBtnSmDanger('✕', () => {
              if (!confirm('Remove section "' + sec.heading + '"?')) return;
              model.sections.splice(idx, 1); rebuild(); refresh();
            }, 'Remove')
          ]),
          el('div', { class: 'card-body' }, [
            field('Heading', [headingInput]),
            field('Guidance text (markdown)', [bodyTa], 'Bullet lists with "- item" are fine.')
          ])
        ]);
        listHost.appendChild(row);
      });
      listHost.appendChild(el('div', { class: 'add-btn-row' }, [
        el('button', {
          class: 'add-btn',
          onclick: () => {
            model.sections.push({ heading: 'New section', bodyText: 'Guidance text.', trailingHr: true });
            rebuild(); refresh();
          }
        }, '+ Add section')
      ]));
    }
    rebuild();
  }

  /* =========================================================================
   * Form fields editor
   * ========================================================================= */

  function parseFormFields(md) {
    const blocks = parseBlocks(md);
    const firstH2 = blocks.findIndex(b => b.type === 'heading' && b.level === 2);
    const intro = firstH2 < 0 ? blocks.slice() : blocks.slice(0, firstH2);
    const steps = [];
    if (firstH2 >= 0) {
      let i = firstH2;
      while (i < blocks.length) {
        if (!(blocks[i].type === 'heading' && blocks[i].level === 2)) { i++; continue; }
        const stepHeading = blocks[i].text;
        const start = i + 1;
        let j = start;
        while (j < blocks.length && !(blocks[j].type === 'heading' && blocks[j].level === 2)) j++;
        const stepBlocks = blocks.slice(start, j);
        // Pop trailing blank/hr off the step to capture whether this step had a trailing --- separator
        let trailingHr = false;
        while (stepBlocks.length) {
          const last = stepBlocks[stepBlocks.length - 1];
          if (last.type === 'blank') { stepBlocks.pop(); continue; }
          if (last.type === 'hr') { trailingHr = true; stepBlocks.pop(); continue; }
          break;
        }
        // Also strip any field-body trailing hr (in case the last field absorbed one)
        // We detect by removing hr from the tail we already popped above.
        const fields = [];
        let stepIntro = [];
        let k = 0;
        while (k < stepBlocks.length && !(stepBlocks[k].type === 'heading' && stepBlocks[k].level === 3)) {
          stepIntro.push(stepBlocks[k]); k++;
        }
        while (k < stepBlocks.length) {
          if (stepBlocks[k].type === 'heading' && stepBlocks[k].level === 3) {
            const fieldId = stepBlocks[k].text;
            const fStart = k + 1;
            let fEnd = fStart;
            while (fEnd < stepBlocks.length && !(stepBlocks[fEnd].type === 'heading' && stepBlocks[fEnd].level === 3)) fEnd++;
            const fieldBody = stepBlocks.slice(fStart, fEnd);
            fields.push(parseFieldBody(fieldId, fieldBody));
            k = fEnd;
          } else {
            k++;
          }
        }
        while (stepIntro.length && (stepIntro[stepIntro.length - 1].type === 'blank' || stepIntro[stepIntro.length - 1].type === 'hr')) stepIntro.pop();
        steps.push({ heading: stepHeading, intro: stepIntro, fields, trailingHr });
        i = j;
      }
    }
    return { intro, steps };
  }

  function parseFieldBody(id, bodyBlocks) {
    // Field body is typically a single unordered list with "- Key: Value" entries.
    // An "- Options:" entry may be followed by indented sub-items, which our list parser captures as multi-line list items.
    const entries = [];
    let listBlock = null;
    for (const b of bodyBlocks) {
      if (b.type === 'list') { listBlock = b; break; }
    }
    if (!listBlock) return { id, entries: [], options: null, hasOptions: false, unknown: bodyBlocks };
    let options = null;
    let hasOptions = false;
    for (const rawItem of listBlock.items) {
      // rawItem may have embedded \n if it captured indented continuation lines
      const [firstLine, ...rest] = rawItem.split('\n');
      const m = /^([^:]+):\s*(.*)$/.exec(firstLine.trim());
      if (!m) { entries.push({ key: '', value: firstLine }); continue; }
      const key = m[1].trim();
      const value = m[2].trim();
      if (key.toLowerCase() === 'options') {
        hasOptions = true;
        options = [];
        for (const line of rest) {
          const im = /^\s*-\s+(.*)$/.exec(line);
          if (im) options.push(im[1].trim());
        }
        entries.push({ key, value: '', __options: true });
      } else {
        entries.push({ key, value });
      }
    }
    return { id, entries, options, hasOptions, unknown: [] };
  }

  function serialiseFormFields(model) {
    const out = [];
    out.push(serialiseBlocks(model.intro).replace(/\s+$/, ''));
    model.steps.forEach((step, sIdx) => {
      out.push('');
      out.push('## ' + step.heading);
      const introText = serialiseBlocks(step.intro).replace(/\s+$/, '');
      if (introText) { out.push(''); out.push(introText); }
      for (const field of step.fields) {
        out.push('');
        out.push('### ' + field.id);
        for (const e of field.entries) {
          if (e.__options) {
            out.push('- Options:');
            for (const o of (field.options || [])) out.push('  - ' + o);
          } else if (e.key) {
            out.push('- ' + e.key + ': ' + e.value);
          } else {
            out.push('- ' + e.value);
          }
        }
      }
      if (sIdx < model.steps.length - 1) {
        out.push('');
        out.push('---');
      }
    });
    let text = out.join('\n');
    if (!text.endsWith('\n')) text += '\n';
    return text;
  }

  function renderFormFieldsEditor(host, f) {
    const model = f.model;
    const refresh = () => {
      f.currentMd = serialiseFormFields(model);
      markDirty('formFields');
    };

    host.appendChild(el('div', { class: 'banner warn' }, [
      el('strong', null, 'Reference document only. '),
      'Editing this file updates the Claude prompts\' context, but it does ',
      el('strong', null, 'not yet'),
      ' change the Step 1 or Step 3 form fields you see in the intake tool — those are still hardcoded. Ask a developer to wire them up if you need that to take effect.'
    ]));

    // Intro
    const introText = serialiseBlocks(model.intro).replace(/\s+$/, '');
    host.appendChild(card('File header', 'The intro paragraph above the step groups.', [
      field('Header markdown', [
        (() => {
          const ta = el('textarea', { class: 'mono', rows: '3' });
          ta.value = introText;
          ta.addEventListener('input', () => {
            try { model.intro = parseBlocks(ta.value); refresh(); } catch (e) { /* keep */ }
          });
          return ta;
        })()
      ])
    ]));

    // Steps
    const stepsHost = el('div');
    host.appendChild(stepsHost);

    function rebuildSteps() {
      stepsHost.innerHTML = '';
      model.steps.forEach((step, sIdx) => {
        const stepCard = el('div', { class: 'card' });
        const head = el('div', { class: 'card-head' }, [
          el('h3', null, step.heading),
          el('div', { class: 'spacer' }),
          moveBtn('↑', sIdx === 0, () => { swap(model.steps, sIdx, sIdx - 1); rebuildSteps(); refresh(); }),
          moveBtn('↓', sIdx === model.steps.length - 1, () => { swap(model.steps, sIdx, sIdx + 1); rebuildSteps(); refresh(); }),
          iconBtnSmDanger('✕', () => {
            if (!confirm('Remove step "' + step.heading + '" and all its fields?')) return;
            model.steps.splice(sIdx, 1); rebuildSteps(); refresh();
          }, 'Remove step')
        ]);
        stepCard.appendChild(head);

        const body = el('div', { class: 'card-body' });
        const stepHeadingInput = el('input', { type: 'text', value: step.heading, placeholder: 'Step heading' });
        stepHeadingInput.addEventListener('input', () => { step.heading = stepHeadingInput.value; head.querySelector('h3').textContent = step.heading; refresh(); });
        body.appendChild(field('Step heading', [stepHeadingInput]));

        // Fields within the step
        const fieldsHost = el('div');
        body.appendChild(fieldsHost);

        function rebuildFields() {
          fieldsHost.innerHTML = '';
          step.fields.forEach((fld, fIdx) => {
            fieldsHost.appendChild(fieldCard(fld, {
              onChange: refresh,
              onMoveUp: fIdx === 0 ? null : () => { swap(step.fields, fIdx, fIdx - 1); rebuildFields(); refresh(); },
              onMoveDown: fIdx === step.fields.length - 1 ? null : () => { swap(step.fields, fIdx, fIdx + 1); rebuildFields(); refresh(); },
              onRemove: () => {
                if (!confirm('Remove field "' + fld.id + '"?')) return;
                step.fields.splice(fIdx, 1); rebuildFields(); refresh();
              }
            }));
          });
          fieldsHost.appendChild(el('div', { class: 'add-btn-row' }, [
            el('button', {
              class: 'add-btn',
              onclick: () => {
                step.fields.push({
                  id: 'new-field',
                  entries: [
                    { key: 'Label', value: 'New field' },
                    { key: 'Type', value: 'text input' },
                    { key: 'Required', value: 'no' }
                  ],
                  options: null,
                  hasOptions: false,
                  unknown: []
                });
                rebuildFields(); refresh();
              }
            }, '+ Add field')
          ]));
        }
        rebuildFields();

        stepCard.appendChild(body);
        stepsHost.appendChild(stepCard);
      });

      stepsHost.appendChild(el('div', { class: 'add-btn-row' }, [
        el('button', {
          class: 'add-btn',
          onclick: () => {
            model.steps.push({ heading: 'New step', intro: [], fields: [] });
            rebuildSteps(); refresh();
          }
        }, '+ Add step group')
      ]));
    }
    rebuildSteps();
  }

  function fieldCard(fld, cbs) {
    const item = el('div', { class: 'accordion-item' });
    const head = el('button', { class: 'accordion-head', onclick: () => item.classList.toggle('open') }, [
      el('span', { class: 'chev' }, '▸'),
      el('div', null, [
        el('strong', null, fld.id || '(unnamed)'),
        el('div', { class: 'sub' }, summariseField(fld))
      ]),
      el('div', { class: 'accordion-controls' }, [
        moveBtn('↑', !cbs.onMoveUp, (e) => { e.stopPropagation(); cbs.onMoveUp && cbs.onMoveUp(); }),
        moveBtn('↓', !cbs.onMoveDown, (e) => { e.stopPropagation(); cbs.onMoveDown && cbs.onMoveDown(); }),
        iconBtnSmDanger('✕', (e) => { e.stopPropagation(); cbs.onRemove(); }, 'Remove')
      ])
    ]);
    item.appendChild(head);
    const body = el('div', { class: 'accordion-body' });

    // Field id
    const idInput = el('input', { type: 'text', value: fld.id, placeholder: 'field-id' });
    idInput.addEventListener('input', () => { fld.id = idInput.value; head.querySelector('strong').textContent = fld.id || '(unnamed)'; cbs.onChange(); });
    body.appendChild(field('Field ID', [idInput], 'Used as the H3 heading in the markdown file.'));

    // Key/value entries (excluding the placeholder "Options" marker)
    const entriesHost = el('div');
    body.appendChild(entriesHost);
    rebuildEntries();

    function rebuildEntries() {
      entriesHost.innerHTML = '';
      const wrap = el('div', { class: 'field' });
      wrap.appendChild(el('label', null, 'Properties'));
      const list = el('div');
      fld.entries.forEach((ent, i) => {
        if (ent.__options) {
          const row = el('div', { class: 'row-grid', style: { gridTemplateColumns: '160px 1fr 34px' } }, [
            el('div', { style: { fontSize: '13px', color: 'var(--c-muted)', padding: '8px 0' } }, 'Options'),
            el('div', { style: { fontSize: '12px', color: 'var(--c-muted)', padding: '8px 0' } }, '(edited below)'),
            el('div', { class: 'row-controls' }, [
              removeRowBtn(() => {
                fld.entries.splice(i, 1);
                fld.options = null;
                fld.hasOptions = false;
                rebuildEntries(); cbs.onChange();
              })
            ])
          ]);
          list.appendChild(row);
          return;
        }
        const keyInput = el('input', { type: 'text', value: ent.key, placeholder: 'Label' });
        const valInput = el('input', { type: 'text', value: ent.value, placeholder: 'value' });
        keyInput.addEventListener('input', () => { ent.key = keyInput.value; head.querySelector('.sub').textContent = summariseField(fld); cbs.onChange(); });
        valInput.addEventListener('input', () => { ent.value = valInput.value; head.querySelector('.sub').textContent = summariseField(fld); cbs.onChange(); });
        list.appendChild(el('div', { class: 'row-grid', style: { gridTemplateColumns: '160px 1fr 34px' } }, [
          keyInput, valInput,
          el('div', { class: 'row-controls' }, [removeRowBtn(() => { fld.entries.splice(i, 1); rebuildEntries(); cbs.onChange(); })])
        ]));
      });
      list.appendChild(el('div', { class: 'add-btn-row' }, [
        el('button', { class: 'add-btn', onclick: () => { fld.entries.push({ key: '', value: '' }); rebuildEntries(); cbs.onChange(); } }, '+ Add property'),
        !fld.hasOptions ? el('button', {
          class: 'add-btn',
          onclick: () => {
            fld.hasOptions = true;
            fld.options = fld.options || [];
            fld.entries.push({ key: 'Options', value: '', __options: true });
            rebuildEntries();
            rebuildOptions();
            cbs.onChange();
          }
        }, '+ Add options list') : null
      ]));
      wrap.appendChild(list);
      entriesHost.appendChild(wrap);
    }

    // Options list
    const optionsHost = el('div');
    body.appendChild(optionsHost);
    rebuildOptions();

    function rebuildOptions() {
      optionsHost.innerHTML = '';
      if (!fld.hasOptions) return;
      fld.options = fld.options || [];
      optionsHost.appendChild(bulletListEditor('Options', fld.options, () => { cbs.onChange(); }, { addLabel: '+ Add option', placeholder: 'e.g. Patient / App user' }));
    }

    item.appendChild(body);
    return item;
  }

  function summariseField(fld) {
    const e = (k) => {
      const ent = fld.entries.find(x => !x.__options && x.key && x.key.toLowerCase() === k);
      return ent ? ent.value : '';
    };
    const parts = [];
    const label = e('label'); if (label) parts.push(label);
    const type = e('type'); if (type) parts.push(type);
    return parts.join(' • ');
  }

  /* =========================================================================
   * Design tokens editor
   * ========================================================================= */

  function renderTokensEditor(host, f) {
    const blocks = f.model;
    const cfg = CONFIG_FILES.find(c => c.key === 'tokens');
    const refresh = () => {
      f.currentMd = cfg.serialise(blocks);
      markDirty('tokens');
    };

    host.appendChild(helpBanner('Edit the HSE Design System tokens. These are sent to Claude when generating wireframe sketches, so the sketch refers to the right colours, type sizes and spacing.'));

    // Walk blocks. Every time we hit an H2 or H3 that is immediately followed (skipping prose) by a table, render a token group editor.
    const consumed = new Set();
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (consumed.has(b)) continue;
      if (b.type === 'heading' && (b.level === 2 || b.level === 3)) {
        // Find next table before another heading
        let j = i + 1;
        let table = null;
        while (j < blocks.length && blocks[j].type !== 'heading') {
          if (blocks[j].type === 'table') { table = blocks[j]; break; }
          j++;
        }
        if (table) {
          host.appendChild(tokenGroupEditor(b, table, refresh));
          consumed.add(b);
          consumed.add(table);
        }
      }
    }
  }

  function tokenGroupEditor(heading, table, refresh) {
    const rowsHost = el('div');
    const isColour = /^#/.test(stripBackticks(table.rows[0] && table.rows[0][1] || ''));
    const cols = table.header.slice();
    const grid = (isColour ? '28px ' : '') + cols.map(() => '1fr').join(' ') + ' 34px';

    function rebuild() {
      rowsHost.innerHTML = '';
      const labelCells = [];
      if (isColour) labelCells.push(el('div', null, ''));
      labelCells.push(...cols.map(h => el('div', null, h)));
      labelCells.push(el('div', null, ''));
      rowsHost.appendChild(el('div', { class: 'col-labels', style: { gridTemplateColumns: grid } }, labelCells));

      table.rows.forEach((row, idx) => {
        const cells = [];
        if (isColour) {
          const swatch = el('div', { class: 'swatch' });
          const hex = stripBackticks(row[1] || '');
          if (/^#[0-9A-Fa-f]{3,8}$/.test(hex)) swatch.style.background = hex;
          cells.push(swatch);
        }
        cols.forEach((h, ci) => {
          const input = el('input', { type: 'text', value: row[ci] || '' });
          input.addEventListener('input', () => {
            row[ci] = input.value;
            if (isColour && ci === 1) {
              const sw = cells[0];
              const hx = stripBackticks(input.value);
              sw.style.background = /^#[0-9A-Fa-f]{3,8}$/.test(hx) ? hx : '';
            }
            refresh();
          });
          cells.push(input);
        });
        cells.push(el('div', { class: 'row-controls' }, [
          removeRowBtn(() => { table.rows.splice(idx, 1); rebuild(); refresh(); })
        ]));
        rowsHost.appendChild(el('div', { class: 'row-grid', style: { gridTemplateColumns: grid } }, cells));
      });

      rowsHost.appendChild(el('div', { class: 'add-btn-row' }, [
        el('button', {
          class: 'add-btn',
          onclick: () => {
            table.rows.push(cols.map(() => ''));
            rebuild(); refresh();
          }
        }, '+ Add token')
      ]));
    }
    rebuild();

    const title = ('#'.repeat(heading.level) + ' ').slice(0, heading.level) + heading.text;
    return card(heading.text, 'Level ' + heading.level + ' heading in the file.', [rowsHost]);
  }

  function stripBackticks(s) {
    return String(s || '').replace(/^`/, '').replace(/`$/, '').trim();
  }

  /* =========================================================================
   * Small reusable UI pieces
   * ========================================================================= */

  function card(title, desc, children) {
    return el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', null, [
          el('h3', null, title),
          desc ? el('div', { class: 'card-desc' }, desc) : null
        ])
      ]),
      el('div', { class: 'card-body' }, children)
    ]);
  }

  function field(label, children, hint) {
    return el('div', { class: 'field' }, [
      el('label', null, label),
      ...children,
      hint ? el('div', { class: 'hint' }, hint) : null
    ]);
  }

  function helpBanner(text) {
    return el('div', { class: 'banner info' }, text);
  }

  function iconBtnSm(ch, onClick, title) {
    return el('button', { class: 'icon-btn-sm', title: title || '', onclick: onClick, type: 'button' }, ch);
  }
  function iconBtnSmDanger(ch, onClick, title) {
    return el('button', { class: 'icon-btn-sm danger', title: title || '', onclick: onClick, type: 'button' }, ch);
  }
  function moveBtn(ch, disabled, onClick) {
    const b = el('button', { class: 'icon-btn-sm', onclick: onClick, type: 'button', title: 'Move' }, ch);
    if (disabled) b.disabled = true;
    return b;
  }
  function moveRowBtn(ch, disabled, onClick) {
    const b = el('button', { class: 'icon-btn-sm', onclick: onClick, type: 'button', title: 'Move' }, ch);
    if (disabled) b.disabled = true;
    return b;
  }
  function removeRowBtn(onClick) {
    return el('button', { class: 'icon-btn-sm danger', onclick: onClick, type: 'button', title: 'Remove' }, '✕');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* =========================================================================
   * Go
   * ========================================================================= */

  document.addEventListener('DOMContentLoaded', boot);
})();
