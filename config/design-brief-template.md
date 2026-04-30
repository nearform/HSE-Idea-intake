# Design Brief Template

This is the template structure the tool uses to generate the design brief output. The form-to-design-brief generator translates the JPD summary into a brief the design team can act on, using each section heading below as guidance.

Edit this file to change the design brief structure. The H2 headings drive the output — the guidance text under each heading is shown to the language model (and used by the deterministic engine) to decide what content belongs in that section.

---

## JPD location

Direct link to the corresponding Jira Product Discovery idea, e.g. `https://hsedigital.atlassian.net/jira/polaris/projects/HHA/ideas/view/<id>`. If the JPD ticket has not been created yet, write "To be created — paste link once available".

---

## Project overview

A short paragraph (3 to 5 sentences) describing the feature in plain English. Pull from the feature overview and problem statement on the intake form. Avoid jargon. State what a user will be able to do that they cannot do today.

---

## Why is this work necessary

Connect the problem to user need, supporting evidence, strategic alignment, and any deadline or compliance driver. This is the case for doing the work now rather than later. Reference the persona match and the Digital for Care 2030 pillar(s) where useful.

---

## Stakeholders and team

A simple table of the people involved. Use this format:

| Role | Name |
|---|---|
| Project manager | |
| Requestor | |
| Clinical / service owner sponsor | |
| Team / unit | |

Add additional rows for design lead, content designer, researcher, technical lead, or programme contact when known.

---

## User value

What the user gets from this feature. Be specific — outcomes, time saved, anxiety reduced, decisions enabled. Reference the primary persona by name and tie the value back to one of their jobs to be done or key challenges. If the feature has accessibility implications, summarise the impact for those users here.

---

## Internal HSE value

What HSE gets from this feature. Cover efficiency, cost, safety, regulatory compliance, and strategic alignment with the Digital for Care 2030 pillars. Reference the relevant pillar names, not just numbers.

---

## Problems to solve

A bulleted list of the discrete design problems the team needs to tackle to deliver this feature. These are the concrete things design has to figure out — not a single restatement of the user's problem. Aim for 3 to 5 items. Each item should be specific enough that a designer can sketch against it.

Examples of well-shaped items:
- How do we let a user opt in or out of notifications without burying the control?
- How do we present a result that may be abnormal without causing alarm?
- How do we surface this to a clinician without adding to their inbox load?

---

## Team dependencies and involvement

Which teams need to be involved (clinical, content, research, data, integrations, programme), what they need to provide, and any sequencing. Note any external dependency (third party system, regulatory sign-off, programme readiness) and what would unblock it.

---

## References

Supporting evidence, research links, policy documents, clinical guidelines, and any persona research references. Pull from the supporting evidence field and the persona match. Preserve any URLs as-is.

---

## Timeline

Indicative timing — deadline obligations, programme milestones, suggested discovery start. If RICE confidence is at or below 60%, recommend a lightweight discovery sprint before full evaluation to strengthen the evidence base across data quality, user research, and technical readiness.

---

## Challenges

Risks, constraints, technical or regulatory dependencies, accessibility considerations, things that could slow or block the work. Include any clinical safety, data, or compliance flags from the intake form.

---

## Indicative wireframe

A description of 1 to 3 screens showing the rough shape of the feature — header, navigation, key content, primary CTA, supporting text, and any badges or list items. Reference HSE Design System tokens where relevant (for example `hse-green-500` for the primary CTA, `hse-grey-50` for card backgrounds, `hse-heading-xs` for section labels). Keep this lightweight — it is a sketch to align stakeholders, not a final design.
