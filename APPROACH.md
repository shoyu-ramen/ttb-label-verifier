# Approach, tools, and assumptions

## Reading the assignment

The technical requirements in the brief are deliberately thin ("use any languages, frameworks, or libraries you prefer"); the real requirements live in the stakeholder interview notes. I treated those interviews as the requirements document and traced every build decision back to one:

| Stakeholder ask | Where it's addressed |
|---|---|
| Sarah: results in ~5 seconds or agents won't use it | Claude **Haiku 4.5** (the fast model tier) with a single vision call; images downscaled client-side before upload; per-label timing displayed in the UI so the budget is visible. Typical check: 3–5 s. |
| Sarah: "something my mother could figure out" | Three plain-language tabs, one big verify button, numbered steps, green/yellow/red verdicts, no jargon, large base font. No settings, no configuration. |
| Sarah/Janet: importers dump 200–300 applications at once | Batch tab: multi-file upload + optional CSV of application data keyed by filename, client-side queue with bounded concurrency, streaming results table, CSV export. |
| Marcus: standalone prototype, no COLA integration | Self-contained SPA + one Worker endpoint. No database, nothing stored. |
| Marcus: federal network blocks many outbound domains | All AI calls go through **one** first-party endpoint (the Worker) rather than the browser calling a vendor API directly — in production the same UI could point at an Azure Government/FedRAMP-hosted model endpoint by changing a single build-time URL. Documented as a deployment consideration, not solved in the prototype (see Trade-offs). |
| Dave: "STONE'S THROW" vs "Stone's Throw" needs judgment, not pattern-matching | Comparison tiers: case/punctuation/whitespace differences report as **Match\*** with a note ("same wording — only capitalization differs"), never as a mismatch. A bundled sample demonstrates it. |
| Jenny: the warning must be word-for-word, "GOVERNMENT WARNING:" in caps and bold | The warning check is deterministic code, not AI judgment: character-exact comparison against the 27 CFR Part 16 text, an explicit all-caps prefix check, and a plain-language report of the first divergence. Title-case prefix → rejected, with the exact reason. |
| Jenny: handle imperfect photos | The extraction prompt reports per-field confidence and image-quality issues. Low confidence never becomes a confident verdict: fields degrade to "check by eye," and a punctuation-level warning deviation on a hard-to-read image becomes **needs review** ("request a clearer image") instead of a false rejection. A blurred, rotated, dim sample exercises this. |
| Dave: "don't make my life harder" | Zero required fields beyond brand name; labels without CSV data still get a warning check; errors are recoverable and in plain English. |

## The core design decision

**The AI reads; deterministic code decides.** The vision model does exactly one job: transcribe what is physically printed on the label (verbatim, including case) into structured JSON, with per-field confidence. All compliance logic — matching tiers, ABV/proof cross-checks, unit conversion, the character-exact warning comparison — is pure TypeScript that runs in the browser and is unit-tested (27 tests).

This split matters for a compliance tool:

- The strictest requirement (word-for-word warning) is the one you'd least want an LLM to eyeball — a model will helpfully "read" the standard warning it expects rather than the deviant one that's printed. The prompt forbids normalization, and the comparison itself is code.
- Verdicts are explainable and reproducible: the same extraction always yields the same verdict, and every rejection cites the specific divergence.
- The engine is testable without an API key, and the model can be swapped (or replaced with OCR) without touching compliance logic.

## Tools used

| Tool | Why |
|---|---|
| React + Vite + TypeScript + Tailwind | Fast static SPA; strict types shared between the engine and UI. |
| Claude Haiku 4.5 (vision, forced tool-use) | Fastest model tier that reads labels reliably — the 5-second budget rules out larger models; forced tool-use guarantees parseable structured output. |
| Cloudflare Worker | Smallest possible server surface to keep the API key out of client code. Purpose-built endpoint with a pinned prompt/model, CORS locked to the app origin, and input validation. |
| GitHub Pages + Actions | Free, reviewable, auto-deploying static hosting for a prototype. |
| Vitest | Unit tests for the comparison engine. |
| sharp (dev-time only) | Renders the sample labels (SVG → PNG), including the deliberately blurred/rotated "bad photo" variant. |
| Claude Code | AI pair — used to draft code and docs under human direction; all requirements analysis, design decisions, and verification are documented here. |

## Assumptions

- **This prototype checks label ↔ application consistency**, not full TTB regulatory review (type size, contrast, placement rules, standards of fill, appellation rules are out of scope). The agent stays the decision-maker; the tool clears the routine matching Sarah described.
- The statutory warning text used for comparison is the 27 CFR Part 16 wording. **Boldness** of the prefix can't be reliably judged from arbitrary photos, so it isn't asserted; the all-caps requirement (Jenny's actual rejection example) is enforced exactly.
- Application data arrives by hand-entry (single check) or CSV keyed by filename (batch) — stand-ins for what a COLA integration would provide.
- Reviewers testing the deployed app: it uses my Anthropic API key via the Worker; there is no login for the prototype. Basic abuse controls: origin-locked CORS, size caps, one fixed prompt.
- "About 5 seconds" is per-label as experienced by an agent; batch throughput is bounded by concurrency (4 at a time), so 300 labels ≈ 5–6 minutes of unattended processing versus a day of manual checks.

## Trade-offs and limitations

- **A dedicated OCR pass could beat a general vision model on tiny warning text** in low-quality photos. The confidence system compensates honestly (degrade to "needs review," never guess), and the extraction endpoint is the single seam where OCR could be added.
- **CORS + size caps are not real auth.** A production deployment would sit behind agency SSO, with rate limiting, audit logging, and a records-retention decision — deliberately out of scope for a no-login prototype (per Marcus: "for a prototype, don't do anything crazy").
- **The firewall constraint is documented, not solved.** The prototype calls the public Anthropic API from the Worker (allowed here since the reviewer tests over the public internet). Marcus's environment would require an approved egress route or an Azure Government-hosted model; the single-endpoint architecture makes that a one-line change for the client.
- **Batch is client-driven**: closing the tab stops processing. Fine for a prototype; a production version would queue server-side.
- Class/type matching uses normalized/containment matching rather than a beverage-taxonomy; genuinely ambiguous cases surface as mismatches for human eyes rather than being silently accepted.
