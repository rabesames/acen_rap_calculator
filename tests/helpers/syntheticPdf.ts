// Builds small PDFs with a text layer for tests. Everything here is SYNTHETIC: the
// layout is a guess at a bill's labels and the numbers are invented test inputs, not
// Meralco rates. Never use them as defaults or placeholders in the UI.

export interface PdfText {
  x: number;
  y: number;
  text: string;
}

const escape = (text: string) => text.replace(/([\\()])/g, '\\$1');

/** A minimal PDF: one Helvetica font, one content stream per page. */
export function makePdf(pages: PdfText[][]): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  pages.forEach((items, i) => {
    const stream = items.map((t) => `BT /F1 10 Tf 1 0 0 1 ${t.x} ${t.y} Tm (${escape(t.text)}) Tj ET`).join('\n');
    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}

/**
 * A made-up net-metering bill that copies the two-column layout and label wording of a
 * real Meralco bill, so rows carry items from both columns. The account and reference
 * numbers are fake and are there to prove they are never surfaced.
 */
export const SYNTHETIC_BILL: PdfText[][] = [
  [
    { x: 295, y: 797, text: 'MANILA ELECTRIC COMPANY' },
    { x: 295, y: 789, text: 'SYNTHETIC TEST BILL, NOT A REAL BILL' },
    { x: 198, y: 721, text: 'Customer Account Number (CAN)' },
    { x: 36, y: 707, text: 'Billing Period' },
    { x: 198, y: 707, text: 'Bill Date' },
    { x: 198, y: 702, text: '9990001112' },
    { x: 36, y: 694, text: '12 Mar 2026 to 11 Apr 2026' },
    { x: 198, y: 694, text: '21 Apr 2026' },
    { x: 36, y: 597, text: 'Net Metering' },
    { x: 198, y: 597, text: 'Import Energy' },
    { x: 198, y: 585, text: '210 kWh' },
    { x: 302, y: 580, text: 'Remaining Balance from previous bill' },
    { x: 525, y: 580, text: '1,111.11' },
    { x: 198, y: 572, text: 'Export Energy' },
    { x: 302, y: 572, text: '(see other bills due for payment under What Remains Unpaid;' },
    { x: 198, y: 559, text: '180 kWh' },
    { x: 302, y: 548, text: 'Charges for this billing period' },
    { x: 525, y: 548, text: '2,345.67' },
    { x: 313, y: 426, text: 'Net Metering Export Energy' },
    { x: 519, y: 426, text: '-1,098.00' },
    { x: 302, y: 376, text: 'Total Amount Due' },
    { x: 525, y: 376, text: '3,456.78' },
  ],
  [
    { x: 32, y: 819, text: 'Bill Reference No.: 99900011122' },
    { x: 310, y: 819, text: 'Billing Period: 12 Mar 2026 to 11 Apr 2026' },
    { x: 32, y: 772, text: 'Billing Period' },
    { x: 102, y: 772, text: 'Posting Date' },
    { x: 306, y: 772, text: 'Rate Components' },
    { x: 447, y: 772, text: 'Base' },
    { x: 32, y: 759, text: '12 Feb-11 Mar 2026' },
    { x: 101, y: 759, text: '20 Mar 2026 Meralco Online' },
    { x: 259, y: 759, text: '2,222.22' },
    { x: 36, y: 559, text: 'Meter Number' },
    { x: 221, y: 559, text: 'Registered' },
    { x: 263, y: 559, text: 'Rate/kWh' },
    { x: 36, y: 543, text: '999TEST00001' },
    { x: 114, y: 543, text: '4000' },
    { x: 157, y: 543, text: '4210' },
    { x: 199, y: 543, text: '1' },
    { x: 224, y: 543, text: '210 kWh' },
    { x: 36, y: 527, text: 'Export kWh' },
    { x: 114, y: 527, text: '5000' },
    { x: 157, y: 527, text: '5180' },
    { x: 199, y: 527, text: '1' },
    { x: 224, y: 527, text: '180 kWh' },
    { x: 265, y: 527, text: '-6.1000' },
    { x: 36, y: 494, text: 'Rate Components' },
    { x: 177, y: 494, text: 'Base' },
    { x: 227, y: 494, text: 'Price' },
    { x: 268, y: 494, text: 'Amount' },
    { x: 36, y: 480, text: 'Generation 55.00%' },
    { x: 267, y: 480, text: '1,669.50' },
    { x: 40, y: 467, text: 'Generation Charge (PhP/kWh)' },
    { x: 168, y: 467, text: '210 kWh' },
    { x: 223, y: 467, text: '7.9500' },
    { x: 267, y: 467, text: '1,669.50' },
    { x: 306, y: 467, text: 'Net Metering Export Energy' },
    { x: 528, y: 467, text: '-1,098.00' },
    { x: 310, y: 445, text: 'NM-Export Energy kWh(PhP/kWh)' },
    { x: 438, y: 445, text: '180 kWh' },
    { x: 491, y: 445, text: '-6.1000' },
    { x: 535, y: 445, text: '-1,098.00' },
    { x: 306, y: 396, text: 'Charges for this billing period' },
    { x: 526, y: 396, text: 'P 2,345.67' },
    { x: 36, y: 229, text: 'VALUE ADDED TAX' },
    { x: 304, y: 229, text: 'Energy Amount divided by the Import Energy (in kWh)' },
    { x: 40, y: 221, text: 'Generation Charge' },
    { x: 168, y: 221, text: '1669.50' },
    { x: 213, y: 221, text: '12.0000%' },
    { x: 273, y: 221, text: '200.34' },
  ],
];

/** A page with no text layer, standing in for a scanned or photographed bill. */
export const SCANNED_BILL: PdfText[][] = [[]];

/** A PDF with text that is not a Meralco bill. */
export const OTHER_DOCUMENT: PdfText[][] = [
  [
    { x: 50, y: 760, text: 'Water utility statement - synthetic test document' },
    { x: 50, y: 740, text: 'Billing Period 01 Mar 2026 to 31 Mar 2026' },
    { x: 50, y: 720, text: 'Consumption in cubic metres 18.00' },
  ],
];
