# Product

## Register

product

## Users

Internal HSE Digital staff who submit, evaluate, or process feature ideas for the Health App 2027 roadmap and Innovation Week. Three primary roles:

- **Product (Tara Nolan, Jean Higgins)** — running the intake process, reviewing submissions, owning JPD.
- **Design (Kevin Devine, Steve Mead, Kevin Bennett)** — receiving the design brief, producing wireframes.
- **Idea submitters** — anyone at HSE Digital with a feature idea, including those whose ideas arrive via Angela Knight's external Microsoft Form (CSV-imported into Step 1).

Used at a desk on a 13–15" laptop or larger monitor. Often during dedicated working sessions when an idea needs to be moved from "we should do this" to "JPD ticket + actionable design brief". Requires focus; not a glance-and-go tool.

## Product Purpose

Take a feature idea — typed by an HSE Digital staff member or imported from an external form — and walk it through a structured 4-step pipeline that produces two outputs:

1. A JPD-ready markdown summary (intermediate, pasted into Jira Product Discovery).
2. A working design brief the design team can act on (final deliverable, with persona match, RICE score, and indicative wireframe).

Success looks like a steady cadence of well-scoped ideas reaching design with clear evidence, identified personas, and quantified impact — instead of vague Slack threads or half-filled Word docs. The tool's value is in the consistency and quality of what comes out, not in being fun to fill in.

## Brand Personality

**Considered, credible, calm.**

Built by the design team, for the design team and their immediate collaborators. It should feel like a proper internal instrument — closer in spirit to Linear, Notion, or a well-built Stripe internal tool than to a public gov.ie portal or a consumer health app. Restrained, but not invisible. The HSE Design System is the inheritance; this is one of its products.

## Anti-references

- Generic enterprise SaaS (rounded-everywhere, gradient buttons, stock chip badges, hero-metric templates).
- Heavy government portal (dense static forms, navy/grey, civic seals, policy-document gravity).
- Consumer health/wellness (pastel gradients, soft illustrations, friendly mascots).
- AI-tool-coded (purple gradients, sparkle icons, glowing borders, "magic" framing — even though the tool uses an LLM).
- Glassmorphism / Apple-style frosted overlays.
- Side-stripe borders on cards as a colored-accent shortcut.

## Design Principles

1. **Practice what you preach.** A feature-intake tool *for the design team* must itself look like the kind of work that team puts out. The HSE Design System tokens — colours, type scale, spacing units — apply to the chrome, not just the wireframe panel.
2. **Calm density.** Long-form by design: many fields, four steps, AI-generated outputs. Density is unavoidable; anxiety is not. Hierarchy and rhythm carry the weight; surface decoration doesn't.
3. **One green, used deliberately.** The HSE Health App's signature is teal-green. Pick the system tokens, deploy them in fewer, brighter places, and let neutrals do the rest. No background washes "to feel branded".
4. **Show your seams.** RICE math, persona reasoning, JPD structure — show *why* the AI returned what it did. Outputs are starting points the team refines, never verdicts.
5. **The output IS the deliverable.** Step 4 (JPD summary, design brief, indicative wireframe) is what leaves the tool. It must read like something you'd send to a colleague — not a debug dump in a code-font box.

## Accessibility & Inclusion

- WCAG 2.2 AA across the tool. The HSE Health App brand and audience demand it; an internal tool used by HSE Digital staff is no exception.
- Real keyboard support across the stepper, form, and sidebar actions. Focus styles must be visible against the green palette.
- Reduced-motion support for stepper transitions and any animated indicators.
- Colour is never the only signal — RICE letter badges (R/I/C/E) carry meaning beyond their colour.
- The persona-match accessibility flag from Step 2 must surface prominently in the design brief, not in small print.
