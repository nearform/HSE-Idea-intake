# Form Fields Configuration

This file defines every field in the intake form. Update labels, placeholders, options, or required status here. The tool reads this to render the form and pass data to the Claude prompts.

Angela Knight's Microsoft Form and Word doc template are the public-facing intake forms used by external and HSE stakeholders. This tool is the internal design team layer that goes deeper for evaluation purposes.

Fields are grouped by the step they appear in.

---

## CSV import

Step 1 includes an **Import from CSV** action for loading ideas from Angela Knight's Microsoft Form exports (or any spreadsheet CSV with compatible headers).

- Supports one idea at a time.
- If multiple rows are found, a row picker is shown so the user can choose which row to load.
- If a mapped column is missing, the corresponding field remains blank and the UI warns the user to complete it manually.

### Column mapping

Use fuzzy matching (case insensitive, ignore extra spaces) for all headers.

Primary column names to match (exact labels from Angela's template):

| CSV column header | Form field |
|---|---|
| Feature Title & Summary | `f-title` + `f-overview` |
| Who is this for | `f-audience` |
| Primary User | `f-audience` (override if present) |
| Also affects | `f-also-affects` |
| Problem being solved | `f-problem` |
| How was this need identified | `f-identified` |
| Supporting Evidence | `f-evidence-detail` |
| Data/ integration needs | `f-data` |
| Name | `f-requestor` (name portion) |
| Role | `f-requestor` (role portion, append to name) |
| Email address | `f-email` |
| Emal address | `f-email` (fallback for typo in original template) |
| Team/ Unit/ Area/ Group | `f-team-unit` |

Impact outcome columns: MS Form exports may produce either a single combined column (`Expected Impact Outcome`) with comma-separated values, or 10 separate columns (one per outcome). Handle both cases. Match outcome text to the 10 checkboxes using fuzzy matching.

---

## Step 1: Understanding the problem

### feature-title
- Label: Feature title
- Type: text input
- Placeholder: e.g. Test result notifications for CDM patients
- Required: yes

### feature-overview
- Label: Feature overview
- Type: textarea
- Placeholder: What does this feature do? What will a user be able to do that they cannot do today?
- Required: yes

### problem
- Label: Problem being solved
- Type: textarea
- Placeholder: What happens today without this feature? What is the impact of that? Approximately how many people are affected?
- Required: yes

### primary-user
- Label: Primary user
- Type: select
- Required: yes
- Options:
  - Patient / App user
  - Carer / Family member
  - Clinical staff
  - Administrative staff
  - HSE service / programme
  - Multiple

### also-affects
- Label: Also affects
- Type: text input
- Placeholder: e.g. Clinical staff, carers — leave blank if not applicable
- Required: no

### how-identified
- Label: How was this need identified?
- Type: select
- Required: no
- Options:
  - Patient feedback / complaint
  - User research
  - Policy driver
  - Regulatory / compliance obligation
  - Clinical need
  - Programme milestone

### supporting-evidence
- Label: Supporting evidence
- Type: textarea
- Placeholder: Link to research, complaints data, clinical guidelines, volume of patients affected, quotes from users or staff. If no formal evidence, describe where the need came from.
- Required: no

### evidence-confidence
- Label: Evidence confidence
- Type: select
- Required: yes
- Options:
  - All three pillars satisfied — data, user research, technical review (100%)
  - Two pillars satisfied (80%)
  - One pillar satisfied, or strong clinical / policy justification (60%)
  - Informed hypothesis — team experience, no formal evidence (50%)
  - Gut feel — no supporting evidence yet (30%)

### deadline
- Label: Is there a deadline or dependency?
- Type: select
- Required: no
- Options:
  - No
  - Yes

### deadline-detail
- Label: Deadline / dependency detail
- Type: text input
- Placeholder: Obligation type and date or detail e.g. GDPR compliance, Q3 2026
- Required: conditional on deadline = Yes
- Visible: only when deadline is Yes

### data-integration
- Label: Data / integration needs
- Type: textarea
- Placeholder: Does this require new or additional data? Any known technical dependencies? If a clinical programme, is it defined and ready?
- Required: no

### compliance
- Label: Regulatory / compliance considerations
- Type: text input
- Placeholder: e.g. GDPR, HIQA, EHDS...
- Required: no

### external-dependency
- Label: External dependency
- Type: select + conditional text input
- Required: no
- Options:
  - No external dependency
  - Yes — third party system or integration required
  - Yes — clinical programme or service needs to be confirmed
  - Yes — regulatory or government body sign-off required
  - Yes — other
- Conditional field label: Dependency detail
- Conditional field placeholder: Name the dependency and describe what needs to happen before this feature can be built

### requestor
- Label: Requestor name and role
- Type: text input
- Placeholder: e.g. Jane Smith, Product Manager
- Required: no

### sponsor
- Label: Clinical or service owner sponsor
- Type: text input
- Placeholder: Clinical lead or programme owner championing this feature — leave blank if unsure
- Required: no

### email-address
- Label: Email address
- Type: email input
- Placeholder: your.name@organisation.ie
- Required: no

### team-unit
- Label: Team / Unit / Area / Group
- Type: text input
- Placeholder: e.g. Screening Services, Regional Digital Team, Nearform
- Required: no

---

## Step 3: RICE score

### expected-outcomes
- Label: Expected outcomes — select all that apply
- Type: multi-select checkboxes
- Required: yes (at least one)
- Options:
  - Improved patient experience
  - Improved patient safety
  - Patient privacy and security
  - Improved health outcomes
  - Increase app registrations
  - Cost saving
  - Time saving for staff
  - Time saving for patients
  - More efficient health service
  - EU / regulatory compliance

### strategic-pillar
- Label: Digital for Care 2030 pillar
- Type: multi-select toggle buttons
- Required: no
- Options:
  - 1. Patient as empowered partner
  - 2. Digitally connected care
  - 3. Digital health ecosystem
  - 4. Digitally enabled staff
  - 5. Secure foundations
  - 6. Data driven services

### effort
- Label: Effort estimate (person-months across design, content, research, product, and delivery)
- Type: number input
- Default: 2
- Min: 0.5
- Max: 24
- Step: 0.5
- Required: yes

### reach-estimate
- Label: Estimated monthly reach (users)
- Type: number input
- Placeholder: e.g. 7750 — see sources below
- Required: yes (for guide score quality)
- Helper text: Divide total affected population by 12 to get monthly reach. Sources: CSO (cso.ie), HSE programme data, Health Research Board. Examples: Type 1 diabetes 2,500/mo · Proxy care 102,500/mo · Polish speakers 7,750/mo · Prescribed medicines 208,000/mo

### reach-source
- Label: Source or basis for this figure
- Type: text input
- Placeholder: e.g. CSO 2022 health statistics and HSE programme estimates
- Required: no
- Recommended: yes
