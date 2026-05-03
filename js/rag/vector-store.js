/**
 * In-memory vector store with cosine similarity search.
 * No external dependencies — pure JS.
 */

/** @type {{text: string, pageNumber: number, embedding: Float32Array}[]} */
let documents = []

/**
 * Cosine similarity between two equal-length vectors.
 * @param {Float32Array|number[]} a
 * @param {Float32Array|number[]} b
 * @returns {number} similarity in [-1, 1]
 */
const cosineSimilarity = (a, b) => {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Store document chunks with their pre-computed embeddings.
 * Replaces any previously stored documents.
 *
 * @param {{text: string, pageNumber: number}[]} chunks
 * @param {(Float32Array|number[])[]} embeddings — parallel array to chunks
 */
export const addDocuments = (chunks, embeddings) => {
  documents = chunks.map((chunk, i) => ({
    text: chunk.text,
    pageNumber: chunk.pageNumber,
    embedding: embeddings[i],
  }))
}

/**
 * Find the top-K most semantically similar chunks to a query.
 *
 * @param {Float32Array|number[]} queryEmbedding
 * @param {number} topK
 * @returns {{text: string, pageNumber: number, score: number}[]}
 */
export const search = (queryEmbedding, topK = 3) => {
  if (documents.length === 0) return []

  const scored = documents.map((doc) => ({
    text: doc.text,
    pageNumber: doc.pageNumber,
    score: cosineSimilarity(queryEmbedding, doc.embedding),
  }))

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

/**
 * Remove all stored documents from the vector store.
 */
export const clearDocuments = () => {
  documents = []
}

/**
 * Number of chunks currently stored.
 * @returns {number}
 */
export const getDocumentCount = () => documents.length
