# HSE Feature Intake Tool

A form-to-design-brief tool for the HSE Health App 2027 roadmap and Innovation Week. It guides anyone with a feature idea through a structured process and produces two outputs: a JPD-ready markdown summary (intermediate) and a working **design brief** the design team can act on. Persona match, RICE score, and an indicative wireframe are folded into the brief.

Built with plain HTML/CSS/JS. Uses the Anthropic Claude API (or any configured LLM provider) for persona matching, RICE scoring, JPD summary, and design brief generation. A deterministic engine is used when no LLM is configured.

---

## Project structure

```
hse-intake/
├── config/
│   ├── personas.md                HSE Health App personas (from HSE Digital research)
│   ├── rice-config.md             RICE scoring rubric, reach reference ranges, effort guidance
│   ├── jpd-template.md            JPD ticket template structure (intermediate output)
│   ├── design-brief-template.md   Design brief structure (final output, generated from sidebar)
│   ├── form-fields.md             All intake form fields, types, options, and validation rules
│   └── hse-design-tokens.md       HSE Design System colour, typography, and spacing tokens
├── src/
│   └── hse-feature-intake.html   Working prototype (single-file HTML/CSS/JS)
└── README.md
```

---

## How it works

The tool is a 4-step stepper built as a single HTML file. Each step calls the Claude API with prompts constructed from the config files and form data.

### Step 1: Understanding the problem
The user fills in the intake form covering the feature title, overview, problem, audience, evidence, compliance, data needs, deadline, and requestor details. All fields map to the JPD template.

### Step 2: Who it's for
On navigation to this step, the tool sends the form data plus the full personas list to Claude and returns 2 to 4 matched personas ranked primary or secondary, with reasoning for each match. An accessibility flag is also returned.

### Step 3: RICE score
The user selects expected outcomes, Digital for Care 2030 pillars, and sets an effort estimate. On clicking Calculate RICE, the tool sends all form data and the RICE rubric to Claude and returns scores for Reach, Impact, Confidence, and Effort with per-dimension rationale and a final score.

### Step 4: JPD summary and design brief
On navigation to this step the JPD summary is generated automatically, pulling everything from steps 1 to 3 and following the exact JPD template structure. The output is copyable markdown ready to paste into Jira Product Discovery.

The right-hand sidebar then offers a **Generate design brief** action as the final step. It uses the JPD summary as source of truth and produces a markdown design brief following `design-brief-template.md`, with an indicative wireframe section that references HSE design tokens. Both outputs are copyable.

---

## CSV import

Angela Knight manages external idea intake through Microsoft Forms. This intake tool is for the internal design team workflow, and Step 1 supports direct CSV import so incoming submissions can be reviewed and refined quickly.

- CSV exports from Angela's Microsoft Form can be imported via **Import from CSV** in Step 1.
- Manual field entry remains available for ideas that originate internally.

### Column mapping

| CSV column | Form field |
|---|---|
| Feature title / Title / Name | `f-title` |
| Feature overview / Overview / Description | `f-overview` |
| Problem / Problem being solved | `f-problem` |
| Primary user / Who is this for / Audience | `f-audience` |
| Also affects / Secondary user | `f-also-affects` |
| How identified / Evidence source | `f-identified` |
| Supporting evidence / Evidence | `f-evidence-detail` |
| Compliance / Regulatory | `f-compliance` |
| Data needs / Integration / Technical | `f-data` |
| External dependency / Dependency | `f-external-dependency` |
| Requestor / Submitted by / Name | `f-requestor` |
| Sponsor / Clinical sponsor | `f-sponsor` |

---

## Running locally

The Claude API calls require HTTP context. Opening the file directly as `file://` will be blocked by the browser.

Quickest option:

```bash
cd hse-intake/src
python3 -m http.server 8080
```

Then open: `http://localhost:8080/hse-feature-intake.html`

---

## Next build: refactor plan

The current prototype has all config data hardcoded as strings inside the HTML. The next phase is to:

1. Load the config `.md` files at runtime rather than hardcoding their content
2. Build an admin panel that allows each config file to be viewed and edited in the browser without touching code
3. Serve the tool via a simple Node.js server that reads the config files from disk

### Suggested Cursor starting prompt

```
I have a working single-file HTML prototype for an HSE Health App feature intake tool. 
It currently has all its config data (personas, RICE rubric, JPD template, form fields, 
design tokens) hardcoded as strings in the JavaScript.

The project is in /hse-intake. The config files are in /hse-intake/config/ as markdown 
files. The prototype is at /hse-intake/src/hse-feature-intake.html.

Please do the following:

1. Create a simple Node.js server (server.js) that serves the HTML file and exposes a 
   /config/:filename endpoint that reads and returns the markdown files from /config/.

2. Refactor hse-feature-intake.html to fetch each config file from the server on startup 
   rather than using hardcoded strings. The five files to load are: personas.md, 
   rice-config.md, jpd-template.md, form-fields.md, hse-design-tokens.md.

3. Add an admin panel accessible via a settings icon (gear icon, top right of the header). 
   The admin panel should show each config file as an editable textarea. Changes should 
   POST back to the server and be saved to disk. Include a save button per file and a 
   close button for the panel.

4. Add a package.json with a start script: node server.js

Keep all existing tool functionality intact. Do not change the Claude API prompts yet — 
just wire up the config loading and admin panel.
```

---

## Config file update guide

Each config file can be edited directly in a text editor or via the admin panel once built.

### personas.md
Update when the HSE Digital research team revises the personas deck. Each persona has a name, demographic profile, jobs to be done, key challenges, relevant app features, and research references. The tool passes all personas to Claude for matching — keep descriptions concise and factual.

### rice-config.md
Update if the product team changes how they score features. Key values to keep current: total user base (currently 300,000), reach reference ranges per audience type, impact scale definitions, confidence mapping, and effort size guidance.

### jpd-template.md
Update if the JPD template in Jira Product Discovery changes. The section headings in this file are used to structure the generated output. Keep headings and guidance text in sync with the live JPD form.

### design-brief-template.md
Update to change the structure of the design brief produced from the right-hand sidebar on Step 4. Each H2 heading becomes a section in the brief, and the guidance text under each heading is fed to the language model (and the deterministic engine) to decide what content belongs there.

### form-fields.md
Update to add, remove, or relabel fields in the intake form. Each field has a type, label, placeholder, and required flag. The admin panel will eventually allow this to be done without editing the file directly.

### hse-design-tokens.md
Update when the HSE Design System is revised. This file is passed to Claude during wireframe generation to ensure colour, typography, and spacing references are accurate.

---

## Known limitations of current prototype

- Config is hardcoded — changes require editing the HTML directly (fixed in next build)
- No persistence — completed intakes are not saved anywhere
- No authentication — admin panel will be open to anyone with access to the URL
- Wireframe is a visual approximation only, not a Figma-ready output
- RICE scores are AI-generated estimates and should be treated as a starting point, not a final assessment

---

## Intended audience

- Tara Nolan and Jean Higgins (product) — running the 2027 intake process and Innovation Week
- Kevin Devine, Steve Mead, Kevin Bennett (design) — supporting intake and producing wireframes
- Anyone at HSE Digital submitting a feature idea for the 2027 roadmap

---

## Built

April 2026. Kevin Devine, Nearform design lead on the HSE Health App.
