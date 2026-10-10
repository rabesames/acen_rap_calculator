// Read the text layer of a bill PDF inside the browser (SPEC section 5A).
// Text extraction only: no page rendering, no cMap or font files, no network. The
// bytes and the text are handed back to the caller and not kept here.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
import workerSource from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?raw';
import type { TextItem } from './lines';

export type ReadFailure = 'not-pdf' | 'unreadable' | 'password-cancelled';

export class BillFileError extends Error {
  constructor(public readonly kind: ReadFailure) {
    super(kind);
  }
}

/** Ask the user for the PDF's password. Resolve null to give up. Never stored. */
export type AskPassword = (wrongPassword: boolean) => Promise<string | null>;

export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = String.fromCharCode(...bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}

const PROBE_TIMEOUT_MS = 2000;

/** Whether this page may start a module worker from a blob URL. */
function probeBlobWorker(): Promise<boolean> {
  if (typeof Worker === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    let url = '';
    let worker: Worker | null = null;
    const finish = (ok: boolean) => {
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve(ok);
    };
    try {
      // "export {}" only parses as a module, so a browser that cannot run module
      // workers fails here instead of later inside pdf.js.
      url = URL.createObjectURL(new Blob(['export {}; postMessage(1);'], { type: 'text/javascript' }));
      worker = new Worker(url, { type: 'module' });
      worker.onmessage = () => finish(true);
      worker.onerror = () => finish(false);
      setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
    } catch {
      finish(false);
    }
  });
}

export type WorkerMode = 'worker' | 'main-thread';

let setup: Promise<{ mode: WorkerMode; worker: pdfjs.PDFWorker | null }> | null = null;

/**
 * Prefer a real worker started from a blob URL. Where the hosting page refuses that,
 * run pdf.js on the main thread using the worker code bundled into this page.
 */
function prepare(forceMainThread: boolean) {
  setup ??= (async () => {
    if (!forceMainThread && (await probeBlobWorker())) {
      try {
        const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
        const port = new Worker(url, { type: 'module' });
        return { mode: 'worker' as const, worker: new pdfjs.PDFWorker({ port: port as unknown as null }) };
      } catch {
        // Fall through to the main thread.
      }
    }
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;
    return { mode: 'main-thread' as const, worker: null };
  })();
  return setup;
}

export interface PdfText {
  items: TextItem[];
  mode: WorkerMode;
}

export async function readPdfText(
  bytes: Uint8Array,
  askPassword: AskPassword,
  opts: { forceMainThread?: boolean } = {},
): Promise<PdfText> {
  if (!looksLikePdf(bytes)) throw new BillFileError('not-pdf');
  const { mode, worker } = await prepare(opts.forceMainThread === true);

  let cancelled = false;
  const task = pdfjs.getDocument({
    data: bytes,
    ...(worker ? { worker } : {}),
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    // This pdf.js version has no isEvalSupported option: it no longer evaluates code.
    useWorkerFetch: false,
    useWasm: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  task.onPassword = (update: (password: string) => void, reason: number) => {
    void askPassword(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD).then((password) => {
      if (password === null) {
        cancelled = true;
        void task.destroy();
      } else {
        update(password);
      }
    });
  };

  try {
    const doc = await task.promise;
    const items: TextItem[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item)) continue;
        items.push({ str: item.str, page: n, x: item.transform[4], y: item.transform[5] });
      }
    }
    return { items, mode };
  } catch {
    throw new BillFileError(cancelled ? 'password-cancelled' : 'unreadable');
  } finally {
    await task.destroy().catch(() => {});
  }
}
