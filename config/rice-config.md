# RICE Scoring Configuration

This file controls how the tool calculates and presents RICE scores. Update these values as the product team's scoring methodology evolves.

---

## App user base

Current registered users: **170,000**

End of year 2026 target: **300,000**

Practical population ceiling for reach calculations: **3.8 million** (adults over 16 with MyGovID eligibility in Ireland)

## Reach methodology

Reach is calculated by taking the relevant Irish population figure from a reputable source and dividing by 12 to get a monthly figure. This reflects the RICE convention of measuring reach at a point in time (one month) rather than total lifetime population.

### Example calculations from the product team

- Polish-speaking population in Ireland: 93,000 / 12 = 7,750 per month
- Type 1 diabetes patients: 30,000 / 12 = 2,500 per month
- Proxy care (parents and children MVP): 1,230,000 / 12 = 102,500 per month
- Dispensed medicines: 2,500,000 / 12 = 208,000 per month

Reputable sources for reach figures: CSO (Central Statistics Office), HSE programme data, Health Research Board, NHS or international app adoption data.

Note: Reach represents the total potential population, not a conversion estimate. Confidence is where realistic adoption uncertainty is absorbed. John Gilmartin's point about the Polish language example - that realistic uptake may be lower than total population - is valid but is handled in the confidence score, not reach.

### Reach reference ranges

| Audience scope | Monthly reach estimate |
|---|---|
| Broad general health feature | 150,000 to 400,000 |
| Chronic disease patients (diabetes, cardiovascular) | 6,000 to 15,000 |
| Maternity users | 4,000 to 6,000 |
| Cancer pathway users | 600 to 1,200 |
| Carers and proxy users (parents and children) | 80,000 to 120,000 |
| Newcomers / minority language users | 5,000 to 10,000 |
| Clinical staff / PSWs | 500 to 2,000 |
| Prescribed medicines users | 150,000 to 210,000 |

---

## Impact scale

Impact measures how much the feature improves the experience for each user who encounters it.

| Score | Label | Definition |
|---|---|---|
| 3 | Massive | Significantly changes the user's ability to manage their health. Safety, outcomes, or access are meaningfully affected. |
| 2 | High | Noticeably improves the experience. Reduces friction, anxiety, or wasted time. |
| 1 | Medium | Moderate improvement. Useful but not critical. |
| 0.5 | Low | Minor improvement. Nice to have. |
| 0.25 | Minimal | Negligible impact on most users. |

---

## Impact calculation logic

The 10 outcome categories are equally weighted. Impact score is determined by how many outcomes a feature covers:

- 8 to 10 outcomes: score 3 (massive)
- 5 to 7 outcomes: score 2 (high)
- 3 to 4 outcomes: score 1 (medium)
- 2 outcomes: score 0.5 (low)
- 1 outcome: score 0.25 (minimal)

Important note: Jean has observed that most features score 6 to 10 on this scale, suggesting the 10 outcome categories overlap significantly. The team is reviewing whether to reduce to 4 to 5 headline outcomes or split into direct and secondary impacts. Use the transparency approach for now: show exactly which outcomes are claimed and why in the JPD output rather than just the score.

---

## Confidence scale

Confidence is based on three pillars of equal weight:

### Pillar 1 — Data quality

Solid, verifiable figures for reach and impact from CSO, HSE programme statistics, published clinical research, or equivalent. Shane and Alex's analytics reports are an acceptable internal source.

### Pillar 2 — User validation

User research has been conducted by Context Studio, usability testing, focus groups, patient feedback analysis, or equivalent. Prior in-app testing of similar features (e.g. German language testing before Polish) counts toward this pillar.

### Pillar 3 — Technical readiness

The architecture or delivery team has assessed the effort. Includes a POC, tech spike, or equivalent architectural review. T-shirt sizing from the delivery team is sufficient.

### Confidence scores

- 100%: All three pillars are satisfied
- 80%: Two pillars are satisfied
- 60%: One pillar satisfied, or a strong clinical or policy obligation provides justification (GDPR, HIQA, EHDS, programme milestone)
- 50%: Informed hypothesis — no formal evidence but team experience supports the case
- 30%: Gut feel — no supporting evidence yet

Confidence can be increased over time. Features arriving at 50% can be moved to 80% or 100% after a discovery sprint with Dee's research team. This is an intentional part of the process - confidence scores are not fixed at submission.

---

## Effort guidance

Effort is expressed in person-months required to design, build, test, and release. This covers ALL disciplines: design, content, UX research, product management, and delivery. Not delivery only. Cross-team complexity (features spanning multiple delivery teams) typically inflates effort - factor this in when estimating. Post-launch costs such as translation maintenance or marketing campaigns are not included in effort.

| Size | Person-months | Examples |
|---|---|---|
| Small | 1 to 2 | Notification tweak, content update, minor UI change |
| Medium | 3 to 5 | New screen or flow within an existing feature |
| Large | 6 to 10 | New feature area with multiple screens and integrations |
| Very large | 11+ | New programme integration, major data dependency, or cross-system work |

---

## RICE formula

```
RICE score = (Reach x Impact x Confidence%) / Effort
```

Round the final score to one decimal place.

---

## Interpretation guidance

RICE scores are a starting point for conversation, not a final verdict. External dependencies, political factors, strategic alignment, and patient safety considerations may all override a RICE score. Features that do not even pass a basic feasibility check will not reach RICE evaluation. The score helps the conversation; it does not make the decision.

| Score | Suggested interpretation |
|---|---|
| 1,000+ | Strong candidate. High reach and impact, well evidenced. Recommend for near-term roadmap. |
| 500 to 999 | Good candidate. Worth including in evaluation. May need more evidence to move forward. |
| 100 to 499 | Moderate. Could be deprioritised in favour of higher-scoring ideas unless strategically important. |
| Under 100 | Low priority based on current evidence. Revisit if evidence improves or effort reduces. |