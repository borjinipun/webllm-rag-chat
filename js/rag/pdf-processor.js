/**
 * PDF Processor — Extracts and chunks text from PDF files.
 * Uses a semantic chunking strategy that reconstructs lines and paragraphs
 * using spatial data to maintain context of tables and paragraphs.
 */

const PDFJS_WORKER_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

const CHUNK_SIZE = 800    // characters per chunk (increased for paragraph context)
const CHUNK_OVERLAP = 150 // overlap between consecutive chunks

let workerBlobUrl = null

/**
 * Get the pdfjsLib global and ensure the worker is initialized.
 */
const getPdfJs = async () => {
  const lib = window.pdfjsLib
  if (!lib) {
    throw new Error('PDF.js has not loaded yet.')
  }

  if (!lib.GlobalWorkerOptions.workerSrc) {
    try {
      const response = await fetch(PDFJS_WORKER_CDN)
      const blob = await response.blob()
      workerBlobUrl = URL.createObjectURL(blob)
      lib.GlobalWorkerOptions.workerSrc = workerBlobUrl
    } catch (err) {
      console.error('Failed to create PDF.js worker blob:', err)
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN
    }
  }
  return lib
}

/**
 * Extract full text from a PDF, rebuilding lines and paragraphs using spatial coordinates.
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
    
    // Group items by their Y-coordinate (transform[5])
    // Allow a small tolerance for Y to group slightly misaligned text on the same line
    const Y_TOLERANCE = 3.0
    const lines = []

    textContent.items.forEach(item => {
      if (!item.str.trim()) return;
      
      const y = item.transform[5]
      const x = item.transform[4]

      // Find an existing line that matches this Y coordinate within tolerance
      let line = lines.find(l => Math.abs(l.y - y) <= Y_TOLERANCE)
      if (!line) {
        line = { y: y, items: [] }
        lines.push(line)
      }
      line.items.push({ text: item.str, x: x })
    })

    // Sort lines from top to bottom (PDF coordinates usually have Y=0 at the bottom)
    lines.sort((a, b) => b.y - a.y)

    let pageText = ''
    let prevY = null

    for (let j = 0; j < lines.length; j++) {
      const line = lines[j]
      // Sort items within the line from left to right
      line.items.sort((a, b) => a.x - b.x)
      
      // Combine line items with spaces (to preserve table columns roughly)
      const lineString = line.items.map(item => item.text).join('   ').replace(/\s{4,}/g, '   ')

      // Detect paragraph breaks based on large vertical gaps
      if (prevY !== null) {
        const gap = prevY - line.y
        if (gap > 18) { // Arbitrary threshold for a paragraph break
          pageText += '\n\n'
        } else {
          pageText += '\n'
        }
      }
      
      pageText += lineString
      prevY = line.y
    }

    pageTexts.push(pageText)
    onProgress(Math.floor((i / totalPages) * 50))
  }

  const text = pageTexts.join('\n\n')
  return { text, pageTexts, totalPages }
}

/**
 * Split page texts into semantic chunks, favoring paragraph boundaries.
 */
export const chunkText = (
  pageTexts,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
) => {
  const chunks = []

  pageTexts.forEach((pageText, pageIndex) => {
    // Split text by double newlines to isolate paragraphs
    const paragraphs = pageText.split('\n\n').filter(p => p.trim())
    
    let currentChunk = ''
    let currentChunkPage = pageIndex + 1

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i]

      // If a single paragraph is too large, split it aggressively by sentences or fall back to chars
      if (paragraph.length > chunkSize) {
        // Push whatever we have currently
        if (currentChunk.trim().length > 30) {
          chunks.push({ text: currentChunk.trim(), pageNumber: currentChunkPage })
          currentChunk = ''
        }

        let start = 0
        while (start < paragraph.length) {
          const end = Math.min(start + chunkSize, paragraph.length)
          chunks.push({
            text: paragraph.slice(start, end).trim(),
            pageNumber: currentChunkPage
          })
          start += chunkSize - overlap
        }
        continue
      }

      // Can we add this paragraph to the current chunk?
      if (currentChunk.length + paragraph.length <= chunkSize) {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph
      } else {
        // Save current chunk
        if (currentChunk.trim().length > 30) {
          chunks.push({ text: currentChunk.trim(), pageNumber: currentChunkPage })
        }
        // Start a new chunk with an overlap from the previous text if possible
        // For semantic chunking, overlapping full paragraphs is tricky, 
        // so we just start fresh with the new paragraph
        currentChunk = paragraph
      }
    }

    // Push the final chunk of the page
    if (currentChunk.trim().length > 30) {
      chunks.push({ text: currentChunk.trim(), pageNumber: currentChunkPage })
    }
  })

  return chunks
}
