# RICE Scoring Configuration

This file controls how the tool calculates and presents RICE scores. Update these values as the product team's scoring methodology evolves.

---

## App user base

Total registered users: **300,000**

Use this figure as the denominator when estimating Reach. Reach is expressed as estimated users per quarter who would directly interact with this feature.

### Reach reference ranges

| Audience scope | Estimated quarterly reach |
|---|---|
| All app users (broad feature) | 50,000 to 150,000 |
| Chronic disease patients | 30,000 to 60,000 |
| Maternity users | 5,000 to 15,000 |
| Cancer pathway users | 3,000 to 8,000 |
| Carers and proxy users | 10,000 to 25,000 |
| Newcomers / minority language users | 2,000 to 8,000 |
| Clinical staff / PSWs | 500 to 3,000 |

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

## Confidence scale

Confidence reflects the strength of evidence behind the feature need.

| Score | Label | What it means |
|---|---|---|
| 100% | User research backed | Direct evidence from usability testing, focus groups, or quantitative data showing the need |
| 80% | Mixed evidence | Some user research combined with reasonable inference or team experience |
| 60% | Clinical or policy need | Driven by a clinical guideline, policy obligation, or programme milestone with limited user evidence |
| 50% | Informed hypothesis | Team believes this is needed based on experience but no formal evidence exists |
| 30% | Gut feel | Idea with no supporting evidence yet |

---

## Effort guidance

Effort is expressed in person-months required to design, build, test, and release the feature. This includes design, development, QA, and any content work.

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

Use these ranges as a rough guide when presenting scores to the product team. They are not absolute thresholds.

| Score | Suggested interpretation |
|---|---|
| 1,000+ | Strong candidate. High reach and impact, well evidenced. Recommend for near-term roadmap. |
| 500 to 999 | Good candidate. Worth including in evaluation. May need more evidence to move forward. |
| 100 to 499 | Moderate. Could be deprioritised in favour of higher-scoring ideas unless strategically important. |
| Under 100 | Low priority based on current evidence. Revisit if evidence improves or effort reduces. |

Note: RICE scores are a starting point for conversation, not a final verdict. Clinical safety features, regulatory obligations, and strategic alignment should always be considered alongside the score.
