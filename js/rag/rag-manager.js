/**
 * RAG Manager — Orchestrates the full Retrieval-Augmented Generation pipeline:
 *   PDF → text extraction → chunking → embedding → vector store → retrieval
 */

import { extractTextFromPDF, chunkText } from './pdf-processor.js'
import { initEmbedder, embedTexts, embedQuery } from './embedder.js'
import {
  addDocuments,
  search,
  clearDocuments,
  getDocumentCount,
} from './vector-store.js'
import { logDebug, logStatus } from '../utils/logger.js'

export default class RAGManager {
  constructor() {
    /** @type {boolean} Whether the vector store is populated and ready */
    this.isReady = false
    /** @type {boolean} Whether a file is currently being processed */
    this.isProcessing = false
    /** @type {File|null} */
    this.currentFile = null
    /** @type {Function|null} */
    this._onProgress = null
  }

  /**
   * Register a callback that receives progress updates.
   * The callback receives: { stage: string, percent: number, message: string }
   * @param {Function} cb
   */
  setProgressCallback(cb) {
    this._onProgress = cb
  }

  /** @private */
  _progress(stage, percent, message) {
    if (this._onProgress) this._onProgress({ stage, percent, message })
    logStatus(message)
    logDebug(`[RAG] ${stage} ${percent}% — ${message}`)
  }

  /**
   * Process a PDF file end-to-end:
   *   extract text → chunk → load embedder → embed chunks → store
   *
   * @param {File} file
   * @returns {Promise<{chunkCount: number, pageCount: number}>}
   */
  async processFile(file) {
    if (this.isProcessing) {
      throw new Error('Already processing a file. Please wait.')
    }

    this.isProcessing = true
    this.isReady = false
    this.currentFile = file
    clearDocuments()

    try {
      // ── Stage 1: Extract text (0 → 45%) ─────────────────────────────────
      this._progress('extract', 0, `Reading "${file.name}"…`)

      const { pageTexts, totalPages } = await extractTextFromPDF(
        file,
        (pct) => {
          this._progress(
            'extract',
            Math.floor(pct * 0.45),
            `Extracting text… ${pct}%`,
          )
        },
      )

      // ── Stage 2: Chunk (45%) ─────────────────────────────────────────────
      this._progress('chunk', 46, 'Splitting text into chunks…')
      const chunks = chunkText(pageTexts)
      logDebug(
        `[RAG] ${chunks.length} chunks created from ${totalPages} pages`,
      )

      if (chunks.length === 0) {
        throw new Error(
          'No text could be extracted from this PDF. It may be image-based or encrypted.',
        )
      }

      // ── Stage 3: Load embedding model (46 → 65%) ─────────────────────────
      this._progress(
        'embed_init',
        47,
        'Loading embedding model (first-time ~23 MB, cached after)…',
      )
      await initEmbedder((pct) => {
        const mapped = 47 + Math.floor(pct * 0.18)
        this._progress(
          'embed_init',
          mapped,
          `Loading embedding model… ${pct}%`,
        )
      })

      // ── Stage 4: Embed chunks (65 → 98%) ─────────────────────────────────
      this._progress('embed', 65, `Embedding ${chunks.length} chunks…`)
      const embeddings = await embedTexts(
        chunks.map((c) => c.text),
        (pct) => {
          const mapped = 65 + Math.floor(pct * 0.33)
          this._progress(
            'embed',
            mapped,
            `Embedding chunks… ${pct}% (${Math.floor((pct / 100) * chunks.length)}/${chunks.length})`,
          )
        },
      )

      // ── Stage 5: Store ───────────────────────────────────────────────────
      addDocuments(chunks, embeddings)
      this.isReady = true

      this._progress(
        'done',
        100,
        `✓ Ready — ${getDocumentCount()} chunks indexed from "${file.name}"`,
      )

      return { chunkCount: chunks.length, pageCount: totalPages }
    } catch (error) {
      this.isReady = false
      this.currentFile = null
      logDebug(`[RAG] processFile error: ${error.message}`)
      throw error
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Retrieve the most relevant context for a query.
   *
   * @param {string} query
   * @param {number} topK - Number of chunks to retrieve
   * @returns {Promise<string>} Formatted context string ready to inject into the LLM prompt
   */
  async retrieve(query, topK = 3) {
    if (!this.isReady) {
      throw new Error('RAG not ready. Please upload and process a PDF first.')
    }

    const qEmbedding = await embedQuery(query)
    const results = search(qEmbedding, topK)

    logDebug(
      `[RAG] Retrieved ${results.length} chunks for: "${query.slice(0, 60)}…"`,
    )

    if (results.length === 0) return ''

    const parts = results.map(
      (r, i) =>
        `[Excerpt ${i + 1} — Page ${r.pageNumber}]\n${r.text}`,
    )
    return parts.join('\n\n---\n\n')
  }

  /**
   * Remove the current PDF and clear the vector store.
   */
  reset() {
    clearDocuments()
    this.isReady = false
    this.isProcessing = false
    this.currentFile = null
    logDebug('[RAG] Reset: vector store cleared')
  }
}
