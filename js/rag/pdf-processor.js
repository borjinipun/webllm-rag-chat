/**
 * PDF Processor — Extracts and chunks text from PDF files.
 *
 * PDF.js is loaded as a UMD <script> tag in index.html, which sets
 * window.pdfjsLib. We use that global directly.
 */

const PDFJS_WORKER_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

const CHUNK_SIZE = 500   // characters per chunk
const CHUNK_OVERLAP = 100 // overlap between consecutive chunks

let workerBlobUrl = null

/**
 * Get the pdfjsLib global and ensure the worker is initialized.
 * Uses a Blob URL to avoid cross-origin worker loading issues on GitHub Pages.
 */
const getPdfJs = async () => {
  const lib = window.pdfjsLib
  if (!lib) {
    throw new Error(
      'PDF.js has not loaded yet. Make sure the <script> tag is in index.html.',
    )
  }

  if (!lib.GlobalWorkerOptions.workerSrc) {
    try {
      // Fetch the worker script and create a Blob URL to bypass cross-origin restrictions
      const response = await fetch(PDFJS_WORKER_CDN)
      const blob = await response.blob()
      workerBlobUrl = URL.createObjectURL(blob)
      lib.GlobalWorkerOptions.workerSrc = workerBlobUrl
    } catch (err) {
      console.error('Failed to create PDF.js worker blob:', err)
      // Fallback to the CDN URL directly (might fail on some browsers due to CORS)
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN
    }
  }
  return lib
}

/**
 * Extract full text from a PDF File object.
 */
export const extractTextFromPDF = async (file, onProgress = () => {}) => {
  const pdfjs = await getPdfJs()

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
