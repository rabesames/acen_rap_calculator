# Build spec: ACEN RAP household calculator

## 1. Purpose and users

Neighbors in one subdivision, mostly on phones, not energy professionals. Each person
enters figures from their own Meralco bills and gets an estimate of what ACEN's offer
would save or cost them, as a summary they can copy, print or save as PDF.

The app replaces a chat-based process where Claude read each household's PDF bills.
In the app the bills never leave the phone or computer: the household either picks its
bill PDFs, which are read inside the browser to pre-fill the form, or types the numbers in.
Either way the household confirms every figure before it is used.

## 2. The offer (the only fixed numbers)

From ACEN's presentation on 10 October 2026, not a written contract. Keep these in one
constants file with the presentation date so they are easy to update.

| Item | Detail |
|---|---|
| Option A | 20% off Meralco's generation charge, always |
| Option B | Fixed P6.25 per kWh for 2 years, all in for generation |
| Participation | Each household opts in or out, and picks its own option |
| Pricing | Same rates for every household, regardless of how many join |
| Group threshold | 100 kW total across participating households |
| Term | 2 years, then up for renewal, possibly at updated rates |
| Exit | Households can return to Meralco at the end of the 2 years |
| Net metering | Goes away for a household that joins |
| Exported solar | ACEN does not pay for it |
| Billing and payment | ACEN bills the household and is paid directly; listed as a biller in payment apps |
| Bill format | Online only. No paper bills. |
| Offices | No office a subscriber can visit to pay or get support |
| Online portal | None currently for past bills or support requests |

Open questions, shown in the app as "not yet answered by ACEN":

1. Is VAT included in the P6.25, or added on top?
2. How will the renewal rate be set after 2 years?
3. If a solar household returns to Meralco, is net metering restored automatically or by fresh application?
4. Are there exit fees for leaving before the 2 years end?
5. Does ACEN's bill also cover Meralco's delivery charges, or does Meralco still bill those separately?
6. With no office and no portal, how does a subscriber raise a billing dispute or get copies of past bills?

Do not state an answer to any of these as fact anywhere in the UI.

## 3. Fixed explainer wording

Shown first on the page and first in every summary. Use this wording exactly. It must
not contain Meralco rates or the household's figures.

> **How the ACEN program works**
> - The Retail Aggregation Program lets households pool their electricity demand so they can buy power from a supplier other than Meralco. ACEN made this offer to our subdivision.
> - Only the generation charge changes. Meralco still delivers the power, and its delivery charges still apply.
> - There are two options: 20% off Meralco's generation charge, or a fixed P6.25 per kWh for 2 years.
> - Each household decides for itself whether to join and which option to take. Rates are the same for everyone.
> - The contract runs 2 years. After that you can renew, possibly at new rates, or return to Meralco.
> - If you have solar, joining ends net metering and exported power is not paid for.
> - ACEN will bill you, and you pay ACEN. It is listed as a biller in payment apps and platforms.
> - Bills and payments are online only. There are no paper bills.
> - ACEN has no office you can visit to pay or get customer support.
> - ACEN currently has no online portal for reviewing past bills or support requests.
>
> These terms are from the 10 October 2026 presentation. ACEN's written contract governs.

## 4. What changes on the bill (background for help text)

- Only the generation charge is replaced by ACEN's rate.
- Working assumption, to be confirmed with ACEN: Meralco still delivers the power, and
  transmission, system loss, distribution, metering, supply, taxes, universal charges,
  FiT-All and other lines still apply at Meralco's rates.
- Import kWh does not change, so Meralco's distribution bracket is unaffected.
- For a solar household that joins, solar used inside the home still reduces what is
  bought from the grid. Only the credit for exported surplus is lost.
- A household that relies on paper bills or paying in person should weigh the
  online-only service.

## 5. Inputs

One entry per billing month. Each field has a short "where to find it" hint.

| Field | Key | Where on the bill | Required |
|---|---|---|---|
| Billing period | `period` (YYYY-MM) | Page 1, top left | yes |
| Import energy, kWh | `importKwh` | Page 1 "Import Energy", or "Registered" kWh in Metering Information. Without solar this is the kWh consumed. | yes |
| Generation charge rate, PhP/kWh | `genRate` | Page 2, Rate Components, "Generation Charge (PhP/kWh)", Price column | yes |
| Generation amount, PhP | `genAmount` | Same line, Amount column | yes (for the check) |
| VAT rate on generation | `vatRate` | Page 2, under VALUE ADDED TAX, "Generation Charge" line | yes, never assume 12% |
| VAT amount on generation, PhP | `vatAmount` | Same line | optional |
| Charges for this billing period, PhP | `chargesThisPeriod` | Page 1, Bill Computation Summary | optional |

Shown only when the household ticks "We have solar with net metering":

| Field | Key | Where on the bill |
|---|---|---|
| Export energy, kWh | `exportKwh` | Page 1 "Export Energy", or "Export kWh" row in Metering Information |
| Export rate, PhP/kWh | `exportRate` | "Rate/kWh" on the Export row, or "NM-Export Energy kWh" Price |
| Export credit, PhP | `exportCredit` | "Net Metering Export Energy", shown as a negative amount. Accept either sign, store positive. |

Input guidance to show:

- Use "Charges for this billing period", not "Total Amount Due". A "Remaining Balance
  from previous bill" is an earlier unpaid bill.
- "Other Charges" such as bill deposit instalments are not energy charges.
- Line names can differ slightly between months because bill layouts change.
- Let the user flag a month as "estimated reading" or "meter changed"; flagged months
  are listed in the assumptions.

Validation: numbers only, non-negative, rates to 4 decimals. VAT entered as a
percentage (for example 12) and stored as a fraction. Duplicate periods are rejected.
A month with a required field missing is excluded from totals and listed as missing.

## 5A. Reading bill PDFs in the browser

Purpose: save typing. It is a pre-fill, never the final word. Manual entry must work
on its own, and is the fallback whenever reading fails.

**Flow**

1. "Add bills from PDF" opens a file picker (`accept="application/pdf"`, multiple) and
   also accepts drag and drop on desktop.
2. Each file is read with the File API into memory and parsed on the device.
3. Each bill becomes a month card in a "Please check" state. Every pre-filled field is
   marked as read from the PDF, with the text line it came from shown on tap so the
   user can compare it with the bill. Fields that could not be read are left empty and
   highlighted. Nothing counts toward the results until the user confirms the card.
4. The section 6 checks (generation amount, export credit) run on the pre-filled values and are shown on the card. A
   failed check is the main signal that a field was misread.
5. A bill for a period already entered asks whether to replace or skip.

**Library**

- `pdfjs-dist`, pinned to an exact version, bundled into the single HTML file. No CDN.
- Text extraction only (`getTextContent`). No page rendering, so no cMaps or standard
  font files are fetched. Do not set `cMapUrl` or `standardFontDataUrl`.
- Worker: inline it (for example Vite's `?worker&inline`) so it starts from a blob URL.
  If the hosting page's content security policy refuses blob workers, fall back to
  running pdf.js on the main thread. Test both paths; the published artifact decides
  which one is used in practice.
- Open the document from in-memory `data` with `disableRange`, `disableStream` and
  `disableAutoFetch` set to true and `isEvalSupported` set to false.
- Size budget: keep the built file under about 3 MB. The artifact limit is 16 MB.
- Password-protected PDFs: use pdf.js's password callback to ask for the password in
  the page. Never store it.

**Extraction method**

- Collect text items with page number and x, y position. Group into lines by y within a
  small tolerance, order by x.
- Find each field by its label, then take the number on the same line in the expected
  column. Match labels case-insensitively and tolerate extra spaces, because layouts
  change during the year.
- Parse numbers with thousands separators, trailing minus, leading minus and
  parentheses for negatives.

Starting label list. These come from the analysis brief, not from an inspected PDF
text layer, so treat them as hypotheses and correct them against real bills:

| Field | Page | Label to anchor on |
|---|---|---|
| `period` | 1 | Billing period, top left |
| `importKwh` | 1 | "Import Energy", else "Registered" kWh in the Metering Information table |
| `genRate`, `genAmount` | 2 | "Generation Charge (PhP/kWh)" under Rate Components: Price and Amount columns |
| `vatRate`, `vatAmount` | 2 | The "Generation Charge" line under the "VALUE ADDED TAX" heading (not the Rate Components line of the same name) |
| `chargesThisPeriod` | 1 | "Charges for this billing period" in Bill Computation Summary |
| `exportKwh` | 1 | "Export Energy", else "Export kWh" row in Metering Information |
| `exportRate` | 1 or 2 | "Rate/kWh" on the Export row, else "NM-Export Energy kWh" Price |
| `exportCredit` | 1 or 2 | "Net Metering Export Energy" (negative amount; store positive) |

If any export field is found, turn on the solar toggle and tell the user why.

VAT rate: read it from the bill. If the bill prints only the VAT amount on the
generation line, derive the rate as that amount divided by the generation amount and
mark the field "worked out from the bill" so the user sees it was not printed.

**Rules**

- Extract only the fields above. Never read, display, log or store the name, address,
  account number, meter number or service ID. The source-line preview (step 3) shows
  only lines that matched a field label.
- Do not keep the PDF, its bytes or its full text after extraction. Nothing from the
  PDF goes to localStorage except the confirmed field values. No console logging of
  bill text in the production build.
- Never guess. A field that is ambiguous (label found twice, no number in the column,
  two candidate numbers) is left empty for the user to type.
- Do not use "Total Amount Due" or "Remaining Balance from previous bill" for anything.
- Not supported, with a clear message pointing to manual entry: scanned or photographed
  bills (no text layer), bills that are not Meralco's, and files that are not PDFs.
  Detect "no text layer" by an empty or near-empty text extraction.

**Testing**

- The parser is a pure function from text items to fields plus per-field status, tested
  on the redacted fixtures in `fixtures/bill-text/` (see the README there).
- Add `tools/dump-bill-text` to produce those fixtures from PDFs in `fixtures/bills/`
  (git-ignored). It must replace identifiers with `REDACTED`; a person checks each
  fixture before it is committed.
- Needed from the owner before the parser can be trusted: at least three real bills,
  including one from a net-metering home and two from different parts of the year.
- Until those exist, build the pipeline (file pick, pdf.js, line grouping, check state)
  and the label matcher against the hypotheses above, and mark the feature "beta" in
  the UI.

## 6. Calculations

Per month, with `kWh` = import energy, `G` = generation rate, `V` = VAT rate as a
fraction, `E` = export rate, `x` = export kWh.

Checks (flag, do not block):

- `genAmount` should equal `kWh x G`
- `exportCredit` should equal `x x E`
- Suggested tolerance: the larger of P1.00 or 0.5%. Tune after trying real bills.

Option A (can never cost more than Meralco):

- `aBeforeVat = 0.20 x G x kWh`
- `aInclVat = 0.20 x G x kWh x (1 + V)`

Option B:

- `bConservative = (G - 6.25) x kWh` (main figure, ignores VAT)
- `bVatOnTop = (G - 6.25) x kWh x (1 + V)`
- `bVatInside = G x kWh x (1 + V) - 6.25 x kWh`
- A month with G below 6.25 is negative. Keep it in the total.
- Report `bConservative` as the main number and the two VAT cases as a range.

A versus B:

- Crossover rate = 6.25 / 0.80 = 7.8125, displayed as P7.81. B beats A in a month only
  when G is strictly above it. This number comes from the offer, not from Meralco.
- Count months above and at-or-below the crossover; show totals under each option.

Net metering:

- `creditsLost = x x E` per month
- Net effect = saving under A or B minus credits lost. Negative means better off
  staying with Meralco.
- Break-even export share (export kWh / import kWh), from the household's own rates:
  Option A loses money above `0.20 x G / E`; Option B above `(G - 6.25) / E`.

Annualising and sensitivity:

- Sum the months entered. With fewer than 12, multiply by 12 / months and say that this
  ignores seasonal swings. With more than 12, use the most recent 12.
- "At latest rates": apply the most recent month's G, V and E to every month's kWh and
  export kWh, then annualise the same way.
- Note that savings scale with consumption, in case the household expects usage to change.

Fixtures: `fixtures/calc-vectors.json` holds inputs and expected outputs for five
cases. Month values are rounded to the centavo; totals are sums of those rounded month
values, so compare month values within 0.01 and totals within 0.01 x months.
Annualised figures are totals x 12 / months.

## 7. Screens (one page, top to bottom)

1. **Explainer** (section 3), collapsible after first view.
2. **Your bills**: "Add bills from PDF" and "Type it in" side by side, solar toggle,
   month cards with add/edit/remove, "please check" state for PDF pre-fills, check
   warnings inline.
3. **Results**: verdict, summary table, monthly table, assumptions, caveats.
4. **Share**: copy summary as plain text, print / save as PDF, clear all data.
5. **Privacy note**: plain statement that entries stay in this browser and nothing is
   sent anywhere, plus the open questions list.

Design: phone first, 16px side gutters, no horizontal page scroll (wide tables scroll
inside their own container), large tap targets, numeric keypad on number fields
(`inputmode="decimal"`), light and dark themes via CSS variables on `:root`, explicit
body background, system fonts only. Page `<title>`: "ACEN RAP Calculator".

## 8. Output format

In this order, short enough to read on a phone, no identifiers:

1. **How the ACEN program works**: section 3 wording.
2. **Verdict**: one or two sentences.
3. **Summary table**: months covered, total import kWh, saving under A, saving under B
   (conservative, with VAT range), credits lost if solar, net effect per year.
4. **Monthly table**: month, import kWh, generation rate from the bill, saving under A,
   saving under B, export credit if solar.
5. **Assumptions**: VAT treatment, months annualised, months missing or flagged.
6. **Caveats**: renewal rate unknown after 2 years; for solar homes, whether net
   metering is restored on return; ACEN's written contract governs.
7. **Attribution line**: "Calculated with a tool a neighbor built with Claude, from
   figures this household entered from its own bills."

Display rounding: peso amounts to the nearest 10 under P1,000 and nearest 100 above;
rates as entered; kWh as whole numbers.

Verdict rules (deterministic, worded as estimates):

- No complete months: no verdict; ask for bills.
- Solar, net effect negative under both options: "On these bills, this household looks
  better off staying with Meralco."
- Otherwise name the option with the higher net annual figure, using A before VAT
  against B conservative. If B leads, add that it depends on Meralco's generation rate
  staying above P7.81 and on the open VAT question; if A leads, add that A can never
  cost more than Meralco.
- If the two are within 10% of each other, say they are close and state the trade-off:
  B is a known price for 2 years, A is a smaller saving that cannot turn negative.
- Always end with "This is an estimate to help you decide, not advice."

## 9. Privacy and storage

- No runtime network access of any kind (see CLAUDE.md rule 1 and the build tests).
- Bill PDFs are opened locally with the File API and parsed in the page. They are not
  uploaded, and are discarded after the fields are read (section 5A).
- State: in-memory first. Mirror to localStorage under one versioned key
  (`acen-rap:v1`), every access in try/catch. Never store identifiers; there are no
  fields for them.
- "Clear all data" removes the key and resets the page.
- Neighbors never see each other's entries; there is no shared state and no export
  beyond the copy/print actions the user triggers.
- State that saved entries can disappear if the browser clears site data, so copy or
  print the summary to keep it.

## 10. Publishing

`npm run build` produces `dist/index.html`. Publish that single file as a Claude
artifact with no runtime capabilities declared. Before sharing widely, open the link
on one neighbor's phone to confirm they can view it without trouble.

## 11. Out of scope for version 1

- Reading scanned or photographed bills (OCR).
- Any AI call from the page.
- Comparing or aggregating across households.

## 12. Milestones

1. Calc module and types; all fixtures passing.
2. Input form with validation, checks and localStorage.
3. Results, verdict and summary text; copy and print.
4. PDF pipeline: file pick, bundled pdf.js with worker fallback, line grouping, label
   matcher, "please check" cards. Marked beta.
5. Single-file build, both no-network tests, phone and dark-mode pass.
6. Owner supplies sample bills; build redacted fixtures, correct the labels, remove the
   beta mark once every fixture extracts correctly.
7. Owner review, then publish and re-test PDF reading on the published link.
