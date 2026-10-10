# ACEN RAP household calculator

A single-page browser app that lets a household in our subdivision work out, from its own
Meralco bills, whether joining ACEN's Retail Aggregation Program (RAP) would save money.
It will be published as a Claude artifact and shared with neighbors by link.

Read `docs/SPEC.md` before writing code. It is the source of truth for offer terms,
wording, fields, formulas and output format.

## Hard rules (do not relax without asking the owner)

1. **No network at runtime.** The built page makes zero outside requests: no fetch/XHR/
   WebSocket/beacon, no CDN scripts, no web fonts, no analytics, no remote images.
   Everything is inlined into one HTML file. No "ask Claude" or shared-storage
   artifact capabilities.
2. **All data stays in the browser.** Entries live in memory, with localStorage only as a
   convenience (wrapped in try/catch; the page must work when storage is empty or throws).
3. **No Meralco rates in the code.** No defaults, placeholders, examples or "typical"
   rates anywhere in the UI. Every rate comes from the household's own bill, read from its PDF or typed in, and
   confirmed by the household.
   The only fixed numbers are the ACEN offer terms in `src/offer` (SPEC section 2).
4. **No identifiers.** Never add fields for name, address, account number, meter number
   or service ID. The summary says "this household". The PDF reader extracts only the
   fields in SPEC section 5 and never reads, shows, logs or stores identifiers.
5. **Missing data is never filled in.** A month with a missing or unreadable field is
   left out of the totals and named as missing.
6. **Estimates, not advice.** Verdict wording follows SPEC section 8. Always state that
   ACEN's written contract governs.
7. **The explainer text in SPEC section 3 is fixed wording.** Do not paraphrase it.
8. **PDF reading is a pre-fill, not an answer.** Bills are parsed in the browser with a
   bundled pdf.js (SPEC section 5A). Every value must be confirmed by the user, an
   ambiguous field is left empty, and the PDF and its text are discarded after
   extraction. Real bills are never committed; only redacted text fixtures are.
9. **Arithmetic lives in one pure module** with no DOM access, tested against
   `fixtures/calc-vectors.json`. Calculate at full precision; round only for display.

## Suggested stack (owner may change)

- TypeScript + Vite, `vite-plugin-singlefile` so `dist/index.html` is fully self-contained
- `pdfjs-dist` pinned to an exact version, inlined with its worker
- Vitest for the calc module, the PDF field parser and the static no-network check
- Playwright (Chromium is usually preinstalled) for the runtime no-network check
- No UI framework needed; vanilla TS or Preact are both fine. Keep the bundle small.

## Commands (once scaffolded)

- `npm run dev` / `npm test` / `npm run build`
- `python3 tools/gen_vectors.py` regenerates the fixtures. Run from the repo root. Only
  change it if the offer terms or formulas in the spec change.

## Definition of done

- All fixture cases pass within the stated tolerance
- Static test: `dist/index.html` has no `<script src`, no `<link ... href` to another
  file, and no `http(s)://` URL in the app's own code. The bundled pdf.js contains inert
  URL strings (XML namespaces, documentation links) and its own fetch code paths, so
  scan app code strictly and hold pdf.js to an explicit allowlist of known strings.
- Runtime test: load `dist/index.html` in a headless browser with every request
  intercepted, add a PDF, enter a month, print the summary. Zero requests beyond the
  page itself. This is the test that proves the no-network rule.
- PDF reader: every fixture in `fixtures/bill-text/` extracts correctly; a scanned PDF
  and a non-Meralco PDF each produce the manual-entry message, not wrong numbers
- Works at 360px width with no horizontal scroll, in light and dark mode
- Works with localStorage unavailable (private window)
- Print view produces a clean one-to-two page summary (used for "Save as PDF")
