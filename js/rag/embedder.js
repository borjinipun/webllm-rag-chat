/**
 * Embedder — Generates sentence embeddings in the browser using
 * Xenova/transformers (ONNX runtime). Lazy-loads the model on first use.
 *
 * Model: Xenova/all-MiniLM-L6-v2 (~23 MB, cached by the browser after first load)
 */

const TRANSFORMERS_CDN =
  'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'

let featurePipeline = null
let loadingPromise = null

/**
 * Initialize (or return cached) the feature-extraction pipeline.
 * Safe to call multiple times — only loads once.
 *
 * @param {Function} onProgress - Called with 0-100 during model download
 * @returns {Promise<Function>} The pipeline function
 */
export const initEmbedder = async (onProgress = () => {}) => {
  // Return immediately if already loaded
  if (featurePipeline) {
    onProgress(100)
    return featurePipeline
  }

  // Deduplicate concurrent calls
  if (loadingPromise) {
    await loadingPromise
    onProgress(100)
    return featurePipeline
  }

  loadingPromise = (async () => {
    onProgress(5)
    const { pipeline, env } = await import(TRANSFORMERS_CDN)

    // Prevent Xenova from trying to load local models
    env.allowLocalModels = false
    env.useBrowserCache = true

    onProgress(10)

    featurePipeline = await pipeline(
      'feature-extraction',
      EMBEDDING_MODEL,
      {
        progress_callback: (info) => {
          if (info.status === 'downloading' && info.total > 0) {
            const pct =
              10 + Math.floor((info.loaded / info.total) * 85)
            onProgress(Math.min(pct, 95))
          } else if (info.status === 'ready') {
            onProgress(100)
          }
        },
      },
    )

    onProgress(100)
    return featurePipeline
  })()

  await loadingPromise
  return featurePipeline
}

/**
 * Embed a single text string.
 * @param {string} text
 * @returns {Promise<Float32Array>} normalised embedding vector
 */
export const embedQuery = async (text) => {
  const pipe = await initEmbedder()
  const output = await pipe(text, { pooling: 'mean', normalize: true })
  // output.data is a Float32Array
  return output.data
}

/**
 * Embed an array of strings (document chunks).
 * Reports progress from 0-100 as chunks are processed.
 *
 * @param {string[]} texts
 * @param {Function} onProgress - Called with 0-100
 * @returns {Promise<Float32Array[]>}
 */
export const embedTexts = async (texts, onProgress = () => {}) => {
  const pipe = await initEmbedder()
  const embeddings = []

  for (let i = 0; i < texts.length; i++) {
    const output = await pipe(texts[i], { pooling: 'mean', normalize: true })
    embeddings.push(output.data)
    onProgress(Math.floor(((i + 1) / texts.length) * 100))
  }

  return embeddings
}
