# Form Fields Configuration

This file defines every field in the intake form. Update labels, placeholders, options, or required status here. The tool reads this to render the form and pass data to the Claude prompts.

Fields are grouped by the step they appear in.

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
  - User research backed (100%)
  - Mixed — some research, some inference (80%)
  - Clinical or policy need, limited user evidence (60%)
  - Informed hypothesis (50%)
  - Gut feel (30%)

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
- Label: Effort estimate (person-months to design, build, test, release)
- Type: number input
- Default: 2
- Min: 0.5
- Max: 24
- Step: 0.5
- Required: yes
