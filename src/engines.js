/*
 * Deterministic engines for persona matching, RICE scoring, and JPD summary.
 * No LLM required. Used as the default path; LLM takes over when AI assist is
 * toggled on in the admin panel and a provider is configured on the server.
 *
 * Exposed globals (classic script):
 *   window.Engines.matchPersonas(form, personasMd) -> { matches:[], accessibility_flag: "" }
 *   window.Engines.computeRice(form, riceMd)       -> { reach, impact, confidence, effort, total, summary }
 *   window.Engines.buildJpdSummary(form, personaData, riceData, jpdTemplateMd) -> markdown string
 */
(function(global){
'use strict';

// ---------------------------------------------------------------------------
// Shared text helpers
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a','an','and','or','but','the','of','to','in','on','at','for','with','without','by','from','as','is','are','was','were','be','been','being','it','its','this','that','these','those','their','they','them','there','here','has','have','had','not','no','yes','if','than','then','so','too','very','can','could','should','would','may','might','will','shall','do','does','did','done','doing','about','into','over','under','above','below','between','among','also','any','all','both','each','every','few','more','most','other','some','such','only','own','same','who','whom','whose','what','which','when','where','why','how','you','your','yours','he','she','we','our','ours','us','i','me','my','mine','any','per','via','across','within','against','e','g','ie','eg','etc','ref'
]);

function tokens(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

function uniqueTokens(text) {
  return new Set(tokens(text));
}

function stem(word) {
  // Very simple English stemmer: drop -s/-es/-ing/-ed endings.
  return word
    .replace(/ies$/, 'y')
    .replace(/(sses|ches|shes|xes|zes)$/, m => m.slice(0, -2))
    .replace(/([^s])s$/, '$1')
    .replace(/(ing|ed)$/, '');
}

function stemmedSet(text) {
  const s = new Set();
  for (const t of tokens(text)) s.add(stem(t));
  return s;
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---------------------------------------------------------------------------
// Persona parsing
// ---------------------------------------------------------------------------

function parsePersonas(md) {
  if (!md) return [];
  // Strip top-level H1 and intro
  const text = md.replace(/\r/g, '');
  const lines = text.split('\n');
  const personas = [];
  let current = null;
  let pendingSection = null;

  function flushPersona() {
    if (current) personas.push(current);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m2 = /^##\s+(.+?)\s*$/.exec(line);
    if (m2) {
      flushPersona();
      current = {
        name: m2[1].trim(),
        subtitle: '',
        demographics: {},
        sections: {}, // { "Jobs to be done": [...], "Key challenges": [...], ... }
        body: ''
      };
      pendingSection = null;
      continue;
    }
    if (!current) continue;
    current.body += line + '\n';

    // Bold subtitle on the line right after H2
    if (!current.subtitle) {
      const mb = /^\*\*(.+?)\*\*\s*$/.exec(line.trim());
      if (mb) { current.subtitle = mb[1].trim(); continue; }
    }

    const m3 = /^###\s+(.+?)\s*$/.exec(line);
    if (m3) { pendingSection = m3[1].trim(); current.sections[pendingSection] = []; continue; }

    // Demographics key-value bullets: "- Age: 55"
    if (!pendingSection) {
      const mKv = /^-\s*([A-Za-z][A-Za-z0-9 /]*?)\s*:\s*(.+?)\s*$/.exec(line);
      if (mKv) { current.demographics[mKv[1].trim()] = mKv[2].trim(); continue; }
    } else {
      const mLi = /^-\s*(.+?)\s*$/.exec(line);
      if (mLi) { current.sections[pendingSection].push(mLi[1].trim()); continue; }
    }
  }
  flushPersona();
  return personas;
}

// ---------------------------------------------------------------------------
// Persona matching
// ---------------------------------------------------------------------------

const ACCESSIBILITY_TERMS = [
  'accessibility','accessible','assistive','disability','disabilities','disabled',
  'screen reader','literacy','language','languages','translation','multilingual',
  'plain english','plain-english','wheelchair','deaf','blind','hearing','visual impairment',
  'impairment','motor','cognitive','dementia','dexterity','low vision','non-english'
];

function detectAccessibilityNeeds(text) {
  const lc = (text || '').toLowerCase();
  return ACCESSIBILITY_TERMS.filter(t => lc.includes(t));
}

function submissionRole(form) {
  const a = (form.audience || '').toLowerCase();
  if (a.includes('patient') || a.includes('app user')) return 'patient';
  if (a.includes('carer')) return 'carer';
  if (a.includes('clinical')) return 'clinical';
  if (a.includes('administrative')) return 'admin';
  if (a.includes('hse service') || a.includes('programme')) return 'service';
  return 'any';
}

function personaRole(p) {
  const sub = (p.subtitle || '').toLowerCase();
  const emp = (p.demographics['Employment'] || '').toLowerCase();
  if (/clinical|companion|clinician|nurse|gp\b|psw|doctor|practitioner/.test(sub)) return 'clinical';
  if (/clinical|nurse|pharmacist|hospital/.test(emp)) return 'clinical';
  if (/parent|carer|proxy/.test(sub)) return 'carer';
  if (/newcomer|migrant|refugee/.test(sub)) return 'newcomer';
  return 'patient';
}

// Multiplier applied to a persona's raw score to reflect role compatibility
// with the submission's primary audience.
const ROLE_COMPATIBILITY = {
  patient:  { patient: 1.0, carer: 0.8, newcomer: 0.9, clinical: 0.25, admin: 0.25, any: 1.0, service: 0.6 },
  carer:    { patient: 0.8, carer: 1.5, newcomer: 0.8, clinical: 0.3,  admin: 0.3,  any: 1.0, service: 0.6 },
  clinical: { patient: 0.35,carer: 0.5, newcomer: 0.5, clinical: 1.8,  admin: 0.7,  any: 1.0, service: 0.8 },
  admin:    { patient: 0.5, carer: 0.5, newcomer: 0.5, clinical: 0.9,  admin: 1.2,  any: 1.0, service: 0.9 },
  service:  { patient: 0.8, carer: 0.7, newcomer: 0.7, clinical: 0.9,  admin: 0.8,  any: 1.0, service: 1.0 },
  any:      { patient: 1.0, carer: 1.0, newcomer: 1.0, clinical: 1.0,  admin: 1.0,  any: 1.0, service: 1.0 }
};

const SECTION_WEIGHTS = {
  'jobs to be done':      2.0,
  'key challenges':       2.0,
  'relevant app features':1.5,
  'research references':  0.3
};

function sectionWeight(name) {
  const key = (name || '').toLowerCase().trim();
  return SECTION_WEIGHTS[key] != null ? SECTION_WEIGHTS[key] : 1.0;
}

function matchPersonas(form, personasMd) {
  const personas = parsePersonas(personasMd);
  if (!personas.length) {
    return { matches: [], accessibility_flag: 'Personas file could not be parsed. Please check config/personas.md.' };
  }

  const submissionText = [
    form.title, form.overview, form.problem, form.audience, form.alsoAffects,
    form.identified, form.evidenceDetail, form.data, form.compliance
  ].filter(Boolean).join(' ');

  const subTokens = stemmedSet(submissionText);
  const subLc = submissionText.toLowerCase();
  const subRole = submissionRole(form);

  const scored = personas.map(p => {
    const role = personaRole(p);
    const weight = (ROLE_COMPATIBILITY[subRole] || ROLE_COMPATIBILITY.any)[role] || 1.0;

    // Base: shared content tokens across core sections (excludes research references)
    const coreText = [
      p.subtitle,
      ...Object.entries(p.sections)
        .filter(([s]) => !/research references/i.test(s))
        .map(([, bullets]) => bullets.join(' '))
    ].join(' ');
    const pTokens = stemmedSet(coreText);

    let score = 0;
    const shared = [];
    for (const t of subTokens) {
      if (pTokens.has(t) && t.length >= 4) { score += 0.5; shared.push(t); }
    }

    // Bullet-level matches, weighted by which section they come from.
    const bulletMatches = [];
    for (const [section, bullets] of Object.entries(p.sections)) {
      const sw = sectionWeight(section);
      for (const b of bullets) {
        const bStems = stemmedSet(b);
        let overlap = 0;
        for (const s of bStems) if (subTokens.has(s) && s.length >= 4) overlap++;
        if (overlap >= 2) {
          score += overlap * 1.5 * sw;
          bulletMatches.push({ section, bullet: b, overlap, weight: sw });
        } else if (overlap === 1) {
          score += 0.5 * sw;
        }
      }
    }

    // If the persona's name actually appears in submission text (rare but decisive)
    if (p.name && new RegExp('\\b' + p.name.toLowerCase() + '\\b').test(subLc)) score += 4;

    score *= weight;

    return { persona: p, score, shared, bulletMatches, role, weight };
  });

  scored.sort((a, b) => b.score - a.score);

  // Keep only positive scores; if nothing scored, fall back to top 1.
  const positive = scored.filter(s => s.score > 0);
  const picked = (positive.length ? positive : scored.slice(0, 1)).slice(0, 4);

  const matches = picked.map((s, i) => ({
    name: s.persona.name,
    rank: i === 0 ? 'primary' : 'secondary',
    reason: buildPersonaReason(s)
  }));

  // Accessibility flag
  const accHits = detectAccessibilityNeeds(submissionText);
  const accessibility_flag = accHits.length
    ? `The submission references accessibility-related considerations (${accHits.slice(0, 4).join(', ')}). Validate against Shane and any persona with lower digital literacy or language support needs. Confirm plain-English content, screen reader support, large tap targets, and language options.`
    : 'No specific accessibility concerns were detected in the submission. Standard HSE accessibility requirements still apply: WCAG 2.2 AA, plain English, keyboard and screen-reader support, and sufficient colour contrast.';

  return { matches, accessibility_flag };
}

function buildPersonaReason(s) {
  const p = s.persona;
  const sub = p.subtitle ? ` (${p.subtitle.toLowerCase()})` : '';
  if (s.bulletMatches.length) {
    // Cite up to two strongest bullet matches
    const topBullets = s.bulletMatches
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 2)
      .map(b => `"${b.bullet}" under ${b.section.toLowerCase()}`);
    return `Aligns with ${p.name}${sub}. The submission overlaps with ${topBullets.join(' and ')}.`;
  }
  if (s.shared.length) {
    const terms = s.shared.slice(0, 4).join(', ');
    return `Relevant to ${p.name}${sub}. Shared language around ${terms} suggests this feature touches their context.`;
  }
  return `Included as a secondary persona for ${p.name}${sub} because no stronger match was found — review whether this feature genuinely affects them.`;
}

// ---------------------------------------------------------------------------
// RICE config parsing
// ---------------------------------------------------------------------------

function parseRiceConfig(md) {
  const out = { reachRanges: [], interpretation: [], totalUsers: null };
  if (!md) return out;

  const tu = /Total registered users:\s*\*\*([\d,]+)\*\*/i.exec(md);
  if (tu) out.totalUsers = parseInt(tu[1].replace(/,/g, ''), 10);

  // Reach reference ranges table
  const reachSect = /###\s*Reach reference ranges[\s\S]*?(?=\n---|\n##\s)/i.exec(md);
  if (reachSect) {
    const rows = reachSect[0].match(/^\|\s*[^|]+\|\s*[\d,]+\s*(?:to|–|-)\s*[\d,]+\s*\|/gm) || [];
    for (const row of rows) {
      const m = /\|\s*([^|]+?)\s*\|\s*([\d,]+)\s*(?:to|–|-)\s*([\d,]+)\s*\|/.exec(row);
      if (m) out.reachRanges.push({
        audience: m[1].trim(),
        low:  parseInt(m[2].replace(/,/g, ''), 10),
        high: parseInt(m[3].replace(/,/g, ''), 10)
      });
    }
  }

  // Interpretation guidance table
  const interpSect = /##\s*Interpretation guidance[\s\S]*$/i.exec(md);
  if (interpSect) {
    const rows = interpSect[0].match(/^\|\s*[^|]+\|\s*[^|]+\|/gm) || [];
    for (const row of rows) {
      const m = /\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/.exec(row);
      if (!m) continue;
      const score = m[1].trim();
      const text  = m[2].trim();
      if (/score/i.test(score) && /interpret/i.test(text)) continue; // header row
      if (/^---+$/.test(score)) continue;
      out.interpretation.push({ scoreRange: score, note: text });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// RICE scoring
// ---------------------------------------------------------------------------

// Used only for patient-facing audiences — which specific patient cohort?
const PATIENT_COHORT_PATTERNS = [
  { match: /cancer/i,     re: /(cancer|oncolog|chemother|radiother|tumou?r)/i },
  { match: /maternit/i,   re: /(maternit|pregnan|antenatal|postnatal|midwif|\bbaby\b|newborn)/i },
  { match: /newcomers/i,  re: /(newcomer|migrant|refugee|non[-\s]?english|multilingual|translat)/i },
  { match: /chronic/i,    re: /(chronic|\bcdm\b|diabet|cardiovascular|copd|asthma|hypertens|long[-\s]?term\s+condition)/i }
];

function pickReachRange(ranges, form) {
  if (!ranges.length) return null;
  const role = submissionRole(form);

  // Clinical / admin audiences → clinical staff range, regardless of text.
  if (role === 'clinical' || role === 'admin') {
    return ranges.find(r => /clinical/i.test(r.audience)) || ranges[0];
  }
  if (role === 'carer') {
    return ranges.find(r => /carer|proxy/i.test(r.audience))
        || ranges.find(r => /all app users/i.test(r.audience))
        || ranges[0];
  }

  // Patient / service / multiple / unspecified — try to narrow to a cohort from problem text.
  const text = [form.title, form.overview, form.problem, form.alsoAffects, form.data, form.compliance]
    .filter(Boolean).join(' ');
  for (const p of PATIENT_COHORT_PATTERNS) {
    const row = ranges.find(r => p.match.test(r.audience));
    if (row && p.re.test(text)) return row;
  }
  return ranges.find(r => /all app users/i.test(r.audience)) || ranges[0];
}

const OUTCOME_IMPACT = {
  'Improved patient safety':      3,
  'Improved health outcomes':     3,
  'Patient privacy & security':   2,
  'EU / regulatory compliance':   2,
  'Improved patient experience':  2,
  'Time saving for patients':     1,
  'Time saving for staff':        1,
  'More efficient health service':1,
  'Cost saving':                  1,
  'Increase app registrations':   0.5
};

function computeImpact(outcomes) {
  if (!outcomes || !outcomes.length) {
    return { score: 0.5, note: 'No outcomes selected — defaulted to low (0.5). Select one or more expected outcomes on the RICE step to refine this score.' };
  }
  let best = 0.25;
  const rationale = [];
  for (const o of outcomes) {
    const w = OUTCOME_IMPACT[o];
    if (w == null) continue;
    rationale.push(`${o} (${w})`);
    if (w > best) best = w;
  }
  // Small multi-outcome bump: if three or more distinct moderate+ outcomes, round up one step
  const impactLadder = [0.25, 0.5, 1, 2, 3];
  const moderatePlus = outcomes.filter(o => (OUTCOME_IMPACT[o] || 0) >= 1).length;
  if (moderatePlus >= 3) {
    const idx = impactLadder.indexOf(best);
    if (idx >= 0 && idx < impactLadder.length - 1) best = impactLadder[idx + 1];
  }
  const label = best === 3 ? 'massive' : best === 2 ? 'high' : best === 1 ? 'medium' : best === 0.5 ? 'low' : 'minimal';
  const note = `Impact set to ${best} (${label}) based on selected outcomes: ${rationale.join(', ')}${moderatePlus >= 3 ? '. Bumped one step up because three or more moderate-plus outcomes were selected.' : '.'}`;
  return { score: best, note };
}

function computeConfidence(form) {
  const raw = parseFloat(form.evidence);
  if (!raw) return { score: 50, note: 'No evidence confidence selected — defaulted to 50% (informed hypothesis). Select a confidence level on the problem step to refine.' };
  const labels = { 100: 'user research backed', 80: 'mixed evidence', 60: 'clinical or policy need', 50: 'informed hypothesis', 30: 'gut feel' };
  const label = labels[raw] || '';
  const extra = form.evidenceDetail ? ` Evidence detail provided: "${form.evidenceDetail.slice(0, 120)}${form.evidenceDetail.length > 120 ? '…' : ''}"` : '';
  return { score: raw, note: `Confidence set to ${raw}% (${label}) from the submitter's selection.${extra}` };
}

function interpretScore(total, interpretation) {
  if (!interpretation.length) return '';
  for (const row of interpretation) {
    const range = row.scoreRange;
    if (/under\s*(\d+)/i.test(range)) {
      const n = parseInt(RegExp.$1, 10);
      if (total < n) return row.note;
      continue;
    }
    const m = /(\d[\d,]*)\s*(?:to|–|-)\s*(\d[\d,]*)/.exec(range);
    if (m) {
      const lo = parseInt(m[1].replace(/,/g, ''), 10);
      const hi = parseInt(m[2].replace(/,/g, ''), 10);
      if (total >= lo && total <= hi) return row.note;
      continue;
    }
    const plus = /(\d[\d,]*)\+/.exec(range);
    if (plus) {
      const n = parseInt(plus[1].replace(/,/g, ''), 10);
      if (total >= n) return row.note;
    }
  }
  return '';
}

function computeRice(form, riceMd) {
  const cfg = parseRiceConfig(riceMd);
  const range = pickReachRange(cfg.reachRanges, form);
  const reachScore = range ? Math.round((range.low + range.high) / 2) : 25000;
  const reachNote = range
    ? `Estimated quarterly reach based on matching audience scope "${range.audience}" (${range.low.toLocaleString()}–${range.high.toLocaleString()} per quarter). Midpoint used.`
    : 'No reach ranges found in config; defaulted to 25,000. Check config/rice-config.md.';

  const impact = computeImpact(form.outcomes || []);
  const confidence = computeConfidence(form);
  const effort = parseFloat(form.effort) || 2;
  const effortNote = effort <= 2 ? 'Small — notification tweaks, content or minor UI changes.'
    : effort <= 5 ? 'Medium — new screen or flow within an existing feature.'
    : effort <= 10 ? 'Large — new feature area with multiple screens and integrations.'
    : 'Very large — programme integration, major data dependency, or cross-system work.';

  const total = Math.round((reachScore * impact.score * (confidence.score / 100)) / effort * 10) / 10;
  const summary = interpretScore(total, cfg.interpretation) ||
    `RICE score of ${total}. Refer to config/rice-config.md interpretation guidance for context.`;

  return {
    reach:      { score: reachScore, note: reachNote },
    impact:     { score: impact.score, note: impact.note },
    confidence: { score: confidence.score, note: confidence.note },
    effort:     { score: effort, note: effortNote },
    total,
    summary
  };
}

// ---------------------------------------------------------------------------
// JPD summary
// ---------------------------------------------------------------------------

const PILLAR_NAMES = {
  '1': 'Patient as empowered partner',
  '2': 'Digitally connected care',
  '3': 'Digital health ecosystem',
  '4': 'Digitally enabled staff',
  '5': 'Secure foundations',
  '6': 'Data driven services'
};

function na(v, fallback) { return (v && String(v).trim()) ? String(v).trim() : (fallback || 'Not provided'); }

function parseJpdSections(md) {
  // Returns ordered list of H2 headings from the template.
  if (!md) return [];
  const headings = [];
  const re = /^##\s+(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(md)) !== null) headings.push(m[1].trim());
  return headings;
}

function buildJpdSummary(form, personaData, riceData, jpdTemplateMd) {
  const headings = parseJpdSections(jpdTemplateMd);
  const now = new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
  const title = na(form.title, 'Untitled feature');

  const personaList = personaData && personaData.matches && personaData.matches.length
    ? personaData.matches.map(m => `- ${m.name} (${m.rank}) — ${m.reason}`).join('\n')
    : '- Not yet assessed. Complete the persona step to populate this section.';

  const accLine = personaData && personaData.accessibility_flag
    ? personaData.accessibility_flag
    : 'Not yet assessed.';

  const pillarsText = (form.pillars && form.pillars.length)
    ? form.pillars.map(p => `- ${p}. ${PILLAR_NAMES[p] || ''}`.trim()).join('\n')
    : '- None selected';

  const outcomesText = (form.outcomes && form.outcomes.length)
    ? form.outcomes.map(o => `- ${o}`).join('\n')
    : '- None selected';

  const riceText = riceData ? [
    `- Reach: ${Math.round(riceData.reach.score).toLocaleString()} users/quarter — ${riceData.reach.note}`,
    `- Impact: ${riceData.impact.score}x — ${riceData.impact.note}`,
    `- Confidence: ${riceData.confidence.score}% — ${riceData.confidence.note}`,
    `- Effort: ${riceData.effort.score} person-months — ${riceData.effort.note}`,
    `- **Total RICE score: ${riceData.total}**`,
    '',
    riceData.summary
  ].join('\n') : 'RICE score has not been calculated yet. Complete the RICE step to populate.';

  const deadlineText = form.deadline === 'Yes'
    ? `Yes — ${na(form.deadlineDetail, 'detail not provided')}`
    : 'No';

  const confidenceLine = form.evidence
    ? `Evidence confidence: ${form.evidence}%`
    : 'Evidence confidence: not specified';

  const bodyByHeading = {
    'Feature overview': na(form.overview),
    'Who is this for': `- Primary user: ${na(form.audience, 'Not specified')}\n- Also affects: ${na(form.alsoAffects, 'Not specified')}`,
    'What is the problem being solved': na(form.problem),
    'Technical and data considerations': na(form.data, 'No specific technical or data considerations noted.'),
    'How was this need identified': na(form.identified, 'Not specified'),
    'Is there a deadline or dependency driving this': deadlineText,
    'Supporting evidence': `${na(form.evidenceDetail, 'No formal supporting evidence provided.')}\n\n${confidenceLine}`,
    'RICE score': riceText,
    'Strategic alignment': `**Digital for Care 2030 pillars**\n\n${pillarsText}\n\n**Expected outcomes**\n\n${outcomesText}`,
    'Accessibility considerations': accLine + '\n\n**Persona matches**\n\n' + personaList,
    'Requestor and sponsor': `- Requestor: ${na(form.requestor, 'Not provided')}\n- Clinical / service owner sponsor: ${na(form.sponsor, 'Not provided')}`,
    'Regulatory and compliance': na(form.compliance, 'No specific regulatory considerations noted.')
  };

  const out = [`# ${title}`, ''];
  if (headings.length) {
    for (const h of headings) {
      out.push(`## ${h}`, '');
      out.push(bodyByHeading[h] != null ? bodyByHeading[h] : 'Not provided');
      out.push('');
    }
  } else {
    // Fallback structure if the template could not be parsed
    for (const [h, body] of Object.entries(bodyByHeading)) {
      out.push(`## ${h}`, '', body, '');
    }
  }

  // Regulatory/compliance often isn't in the template as its own heading; append if the user provided one and it wasn't emitted.
  if (form.compliance && !headings.some(h => /regulator|complian/i.test(h))) {
    out.push('## Regulatory and compliance', '', form.compliance, '');
  }

  out.push('---', `*Generated: ${now}*`);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

global.Engines = {
  matchPersonas,
  computeRice,
  buildJpdSummary,
  parsePersonas,
  parseRiceConfig,
  escHtml
};

})(typeof window !== 'undefined' ? window : globalThis);
