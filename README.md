# ACEN RAP household calculator: handoff pack

Starting point for a Claude Code project. Nothing is built yet.

| File | What it is |
|---|---|
| `CLAUDE.md` | Project rules Claude Code loads automatically |
| `docs/SPEC.md` | Build spec: offer terms, fixed wording, fields, formulas, UI, privacy, milestones |
| `fixtures/calc-vectors.json` | Expected results for 5 synthetic households, generated in code |
| `tools/gen_vectors.py` | The independent reference that produced the fixtures |
| `fixtures/bills/` | Where real bill PDFs go for local parser work. Git-ignored. |
| `fixtures/bill-text/` | Redacted text fixtures for the PDF reader. Empty until sample bills are supplied. |

First prompt to use in Claude Code:

> Read CLAUDE.md and docs/SPEC.md. Scaffold the project and complete milestone 1
> (calc module passing every case in fixtures/calc-vectors.json). Stop and show me
> the test output before starting the UI.

The fixture inputs are invented numbers for testing. They are not Meralco rates.

For the PDF reader, put at least three real bills in `fixtures/bills/` before
milestone 6: one without solar, one with net metering, and two from different parts of
the year. They stay on your machine; only the redacted text fixtures are committed,
and only after you have checked each one for identifiers.
