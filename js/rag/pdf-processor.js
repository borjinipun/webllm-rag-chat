/**
 * PDF Processor — Extracts and chunks text from PDF files.
 *
 * PDF.js is loaded as a UMD <script> tag in index.html, which sets
 * window.pdfjsLib. We use that global directly to avoid dynamic-import
 * CORS/CDN issues with .mjs files.
 */

const PDFJS_WORKER_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

const CHUNK_SIZE = 500   // characters per chunk
const CHUNK_OVERLAP = 100 // overlap between consecutive chunks

/**
 * Get the pdfjsLib global set by the UMD script tag.
 * Throws a clear error if the script hasn't loaded yet.
 * @returns {Object} pdfjsLib
 */
const getPdfJs = () => {
  const lib = window.pdfjsLib
  if (!lib) {
    throw new Error(
      'PDF.js has not loaded yet. Make sure the <script src="pdf.min.js"> ' +
        'tag is present in index.html before the main module.',
    )
  }
  // Set the worker source once
  if (!lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN
  }
  return lib
}

/**
 * Extract full text from a PDF File object, page by page.
 *
 * @param {File} file - The PDF file
 * @param {Function} onProgress - Called with 0-50 during extraction
 * @returns {Promise<{text: string, pageTexts: string[], totalPages: number}>}
 */
export const extractTextFromPDF = async (file, onProgress = () => {}) => {
  const pdfjs = getPdfJs()

  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  const totalPages = pdf.numPages

  const pageTexts = []

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => item.str)
      .filter(Boolean)
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    pageTexts.push(pageText)
    onProgress(Math.floor((i / totalPages) * 50))
  }

  const text = pageTexts.join('\n\n')
  return { text, pageTexts, totalPages }
}

/**
 * Split page texts into overlapping fixed-size chunks.
 * Each chunk records the originating page number (1-indexed).
 *
 * @param {string[]} pageTexts
 * @param {number} chunkSize
 * @param {number} overlap
 * @returns {{text: string, pageNumber: number}[]}
 */
export const chunkText = (
  pageTexts,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
) => {
  const chunks = []

  pageTexts.forEach((pageText, pageIndex) => {
    const trimmed = pageText.trim()
    if (!trimmed) return

    let start = 0
    while (start < trimmed.length) {
      const end = Math.min(start + chunkSize, trimmed.length)
      const chunk = trimmed.slice(start, end).trim()

      if (chunk.length > 30) {
        chunks.push({
          text: chunk,
          pageNumber: pageIndex + 1,
        })
      }

      if (end >= trimmed.length) break
      start += chunkSize - overlap
    }
  })

  return chunks
}
