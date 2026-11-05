import { itemsToLines } from './pdfReferences';

/** Larger files are refused: the PDF is read in the browser, in memory. */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_PAGES = 300;

/** The text of each page as lines. The PDF never leaves the browser. */
export async function readPdfPages(data: ArrayBuffer): Promise<string[][]> {
  // Loaded on demand: pdf.js is large and only this tab needs it.
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const pages: string[][] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(itemsToLines(content.items.filter((it) => 'str' in it)));
    }
    return pages;
  } finally {
    void doc.destroy();
  }
}
