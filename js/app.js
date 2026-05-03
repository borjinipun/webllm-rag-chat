/**
 * Main Application
 */
import { prebuiltAppConfig } from 'https://esm.run/@mlc-ai/web-llm@0.2.79'
import { MODEL_DATA, MODEL_SIZES, ELEMENT_IDS } from './config.js'
import {
  initLogger,
  logDebug,
  logBrowserInfo,
  logStatus,
} from './utils/logger.js'
import { populateModelSelect } from './utils/ui.js'
import LLMModel from './models/llm-model.js'
import RAGManager from './rag/rag-manager.js'
import {
  getLastUsedModel,
  saveLastUsedModel,
  clearConversations,
  getLastConversation,
} from './utils/db.js'

class App {
  constructor() {
    this.elements = {}
    this.model = new LLMModel()
    this.isModelLoading = false
    this.warningDismissed = false
    // RAG
    this.ragManager = new RAGManager()
    this.ragMode = false // false = normal chat, true = PDF Q&A mode
  }

  /**
   * Initialize the application
   */
  async init() {
    this.initDomElements()
    this.attachEventListeners()
    this.initLogger()
    this.setupModelUI()
    this.setupRAGUI()
    this.logSystemInfo()

    // Load conversation history immediately
    await this.loadConversationWithoutModel()

    // Try to auto-load the last used model
    this.tryLoadLastUsedModel()
  }

  /**
   * Try to set the last used model from database (without loading it)
   */
  async tryLoadLastUsedModel() {
    try {
      const lastModel = await getLastUsedModel()
      const modelSelect = this.elements.modelSelect

      if (lastModel && lastModel.modelId) {
        logDebug(`Pre-selecting previous model: ${lastModel.modelId}`)

        // Set the model dropdown to the last used model
        for (let i = 0; i < modelSelect.options.length; i++) {
          if (modelSelect.options[i].value === lastModel.modelId) {
            modelSelect.selectedIndex = i
            this.updateResourceWarning()
            break
          }
        }
      } else {
        logDebug('No previous model found in database, setting default model')

        // Set Qwen 2.5 1.5B as the default model
        const defaultModelId = 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC'

        // Find and select the default model in dropdown
        for (let i = 0; i < modelSelect.options.length; i++) {
          if (modelSelect.options[i].value === defaultModelId) {
            modelSelect.selectedIndex = i
            this.updateResourceWarning()
            break
          }
        }
      }
    } catch (error) {
      logDebug(`Error selecting model: ${error.message}`)
    }
  }

  /**
   * Load conversation history without requiring a model to be loaded
   */
  async loadConversationWithoutModel() {
    try {
      const conversationHistory = await getLastConversation()

      if (conversationHistory && conversationHistory.length > 0) {
        // Set the conversation in the model
        this.model.conversation = conversationHistory

        // Display conversation without model
        this.model.displayConversation()

        logDebug(
          `Loaded conversation with ${conversationHistory.length} messages`,
        )
        return true
      }
      return false
    } catch (error) {
      logDebug(`Error loading conversation: ${error.message}`)
      return false
    }
  }

  /**
   * Load the last conversation from the database
   */
  async loadLastConversation() {
    if (!this.model.isReady()) {
      logDebug('Cannot load conversation: model not ready')
      return
    }

    try {
      const loaded = await this.model.loadLastConversation()
      if (loaded) {
        // No need to show redundant status message
      }
    } catch (error) {
      logDebug(`Error loading conversation: ${error.message}`)
    }
  }

  /**
   * Handle clear chat button click
   */
  async handleClearChatClick() {
    try {
      // Clear conversation in the model
      this.model.conversation = []
      this.model.displayConversation('Conversation cleared')

      // Clear from database
      await clearConversations()
      logStatus('Conversation history cleared')
      logDebug('All conversations removed from database')
    } catch (error) {
      logDebug(`Error clearing conversations: ${error.message}`)
    }
  }

  /**
   * Initialize DOM elements
   */
  initDomElements() {
    // Get references to all DOM elements
    Object.keys(ELEMENT_IDS).forEach((key) => {
      this.elements[key] = document.getElementById(ELEMENT_IDS[key])
    })

    // Add reference to load and dismiss buttons
    this.elements.loadModelButton = document.getElementById('load-model-button')
    this.elements.dismissWarningButton =
      document.getElementById('dismiss-warning')

    // Simple validation
    if (!this.elements.form || !this.elements.modelSelect) {
      console.error('Required DOM elements not found')
      return
    }

    // Pass elements to model manager
    this.model.setElements(this.elements)
  }

  /**
   * Initialize logger
   */
  initLogger() {
    initLogger({
      debug: this.elements.debug,
      status: this.elements.status,
      output: this.elements.output,
      topStatus: this.elements.topStatus,
    })
  }

  /**
   * Set up model selection UI
   */
  setupModelUI() {
    // Populate model dropdown
    populateModelSelect(this.elements.modelSelect, MODEL_DATA)

    // Log available models for debugging
    this.logModelAvailability()
  }

  /**
   * Attach event listeners to UI elements
   */
  attachEventListeners() {
    // Form submission
    this.elements.form.addEventListener(
      'submit',
      this.handleFormSubmit.bind(this),
    )

    // Model select change (only updates UI, doesn't load)
    this.elements.modelSelect.addEventListener(
      'change',
      this.handleModelSelectChange.bind(this),
    )

    // Load model button
    if (this.elements.loadModelButton) {
      this.elements.loadModelButton.addEventListener(
        'click',
        this.loadSelectedModel.bind(this),
      )
    }

    // Clear chat button
    if (this.elements.clearChatButton) {
      this.elements.clearChatButton.addEventListener(
        'click',
        this.handleClearChatClick.bind(this),
      )
    }

    // Dismiss warning button
    if (this.elements.dismissWarningButton) {
      this.elements.dismissWarningButton.addEventListener(
        'click',
        this.handleDismissWarning.bind(this),
      )
    }
  }

  /**
   * Handle form submission
   * @param {Event} e - Form submit event
   */
  async handleFormSubmit(e) {
    e.preventDefault()

    if (!this.model.isReady()) {
      logDebug('No model loaded. Please select a model first.')
      return
    }

    const prompt = this.elements.prompt.value.trim()
    if (!prompt) return

    // Clear the input field
    this.elements.prompt.value = ''

    // Disable inputs during generation
    this.setInputsState(false)

    try {
      // Retrieve RAG context if PDF Q&A mode is active
      let ragContext = null
      if (this.ragMode && this.ragManager.isReady) {
        try {
          ragContext = await this.ragManager.retrieve(prompt)
          logDebug(`[RAG] Context retrieved (${ragContext.length} chars)`)
        } catch (err) {
          logDebug(`[RAG] Retrieval failed: ${err.message}`)
        }
      }

      // Let the model handle adding the message to chat history and UI updates
      await this.model.generateResponse(prompt, ragContext)
    } catch (error) {
      logDebug(`Error in handleFormSubmit: ${error.message}`)
    } finally {
      // Re-enable inputs
      this.setInputsState(true)
    }
  }

  /**
   * Handle model selection change (updates warning only)
   */
  async handleModelSelectChange() {
    // Update resource warning
    this.updateResourceWarning()
  }

  /**
   * Load the currently selected model
   */
  async loadSelectedModel() {
    if (this.isModelLoading) {
      logDebug('Model is already loading')
      return
    }

    const selectedModel = this.elements.modelSelect.value
    if (!selectedModel) {
      logDebug('No model selected')
      return
    }

    this.setLoadingState(true)

    try {
      await this.model.loadModel(selectedModel)

      // Save as last used model
      const selectedOption =
        this.elements.modelSelect.options[
          this.elements.modelSelect.selectedIndex
        ]
      await saveLastUsedModel(selectedModel, {
        name: selectedOption.textContent,
        size: selectedOption.dataset.size,
      })

      // Enable the chat interface
      this.setInputsState(true)
    } catch (error) {
      logDebug(`Error loading model: ${error.message}`)
      this.setInputsState(false)
    } finally {
      this.setLoadingState(false)
    }
  }

  /**
   * Update resource warning based on selected model
   */
  updateResourceWarning() {
    const selectedModel = this.elements.modelSelect.value
    const modelSize = MODEL_SIZES[selectedModel]

    // Check if warning has been dismissed for this session
    if (this.warningDismissed) {
      return
    }

    if (modelSize === 'large') {
      this.elements.resourceWarning.style.display = 'block'
    } else {
      this.elements.resourceWarning.style.display = 'none'
    }
  }

  /**
   * Handle dismiss warning button click
   */
  handleDismissWarning() {
    this.elements.resourceWarning.style.display = 'none'
    this.warningDismissed = true
    logDebug('Resource warning dismissed')
  }

  /**
   * Set enabled state of input elements
   * @param {boolean} enabled - Whether inputs should be enabled
   */
  setInputsState(enabled) {
    this.elements.prompt.disabled = !enabled
    this.elements.submitButton.disabled = !enabled
  }

  /**
   * Set loading state of the interface
   * @param {boolean} isLoading - Whether the interface is in a loading state
   */
  setLoadingState(isLoading) {
    this.isModelLoading = isLoading
    this.elements.modelSelect.disabled = isLoading
  }

  /**
   * Log available models for debugging
   */
  logModelAvailability() {
    const dropdownModels = Array.from(this.elements.modelSelect.options).map(
      (opt) => opt.value,
    )
    logDebug(
      `Available models in dropdown: ${dropdownModels
        .filter(Boolean)
        .join(', ')}`,
    )
  }

  /**
   * Log system information
   */
  logSystemInfo() {
    logBrowserInfo()
  }

  // ─────────────────────────────────────────────────────────────
  // RAG UI setup
  // ─────────────────────────────────────────────────────────────

  /**
   * Wire up all RAG-panel event listeners and configure the RAGManager progress callback.
   */
  setupRAGUI() {
    const dropzone = document.getElementById('pdfDropzone')
    const fileInput = document.getElementById('pdfFileInput')
    const removePdfBtn = document.getElementById('removePdfBtn')
    const chatModeBtn = document.getElementById('chatModeBtn')
    const pdfModeBtn = document.getElementById('pdfModeBtn')

    if (!dropzone || !fileInput) return

    // ── Drag-and-drop ────────────────────────────────────────────
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault()
      dropzone.classList.add('drag-over')
    })
    dropzone.addEventListener('dragleave', () =>
      dropzone.classList.remove('drag-over'),
    )
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault()
      dropzone.classList.remove('drag-over')
      const file = e.dataTransfer.files[0]
      if (file && file.type === 'application/pdf') {
        this.handlePdfUpload(file)
      } else {
        logDebug('[RAG] Dropped file is not a PDF')
      }
    })

    // ── File input (Browse button) ────────────────────────────────
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0]
      if (file) this.handlePdfUpload(file)
      // Reset so the same file can be re-selected after removal
      fileInput.value = ''
    })

    // ── Remove PDF button ─────────────────────────────────────────
    if (removePdfBtn) {
      removePdfBtn.addEventListener('click', () => this.handlePdfRemove())
    }

    // ── Mode toggle buttons ───────────────────────────────────────
    if (chatModeBtn) {
      chatModeBtn.addEventListener('click', () => this.setRagMode(false))
    }
    if (pdfModeBtn) {
      pdfModeBtn.addEventListener('click', () => {
        if (this.ragManager.isReady) this.setRagMode(true)
        else logDebug('[RAG] PDF not yet indexed — upload a PDF first')
      })
    }

    // ── RAGManager progress reporting ─────────────────────────────
    this.ragManager.setProgressCallback(({ stage, percent, message }) => {
      const wrapper = document.getElementById('ragProgressWrapper')
      const label = document.getElementById('ragProgressLabel')
      const fill = document.getElementById('ragProgressFill')

      if (!wrapper || !label || !fill) return

      if (stage === 'done') {
        // Briefly show 100% then hide and reveal the toggle
        fill.style.width = '100%'
        label.textContent = message
        setTimeout(() => {
          wrapper.style.display = 'none'
          const toggle = document.getElementById('ragModeToggle')
          if (toggle) toggle.style.display = 'flex'
          // Auto-switch to PDF Q&A mode
          this.setRagMode(true)
        }, 800)
      } else {
        wrapper.style.display = 'block'
        label.textContent = message
        fill.style.width = `${percent}%`
      }
    })
  }

  /**
   * Process a newly selected PDF file.
   * @param {File} file
   */
  async handlePdfUpload(file) {
    if (this.ragManager.isProcessing) return

    // Show PDF badge, hide drop zone
    document.getElementById('pdfDropzone').style.display = 'none'
    document.getElementById('pdfBadge').style.display = 'flex'
    document.getElementById('pdfFileName').textContent = file.name
    document.getElementById('ragModeToggle').style.display = 'none'

    // Reset to chat mode while processing
    this.setRagMode(false)

    try {
      const { chunkCount, pageCount } = await this.ragManager.processFile(file)
      logDebug(
        `[RAG] Done: ${chunkCount} chunks from ${pageCount} pages of "${file.name}"`,
      )
    } catch (err) {
      logDebug(`[RAG] processFile error: ${err.message}`)
      // Revert UI on error
      this.handlePdfRemove()
    }
  }

  /**
   * Remove the current PDF and reset RAG state.
   */
  handlePdfRemove() {
    this.ragManager.reset()
    this.setRagMode(false)

    document.getElementById('pdfDropzone').style.display = 'flex'
    document.getElementById('pdfBadge').style.display = 'none'
    document.getElementById('pdfFileName').textContent = ''
    document.getElementById('ragProgressWrapper').style.display = 'none'
    document.getElementById('ragModeToggle').style.display = 'none'

    logDebug('[RAG] PDF removed')
  }

  /**
   * Switch between normal chat and PDF Q&A mode.
   * @param {boolean} isPdfMode
   */
  setRagMode(isPdfMode) {
    this.ragMode = isPdfMode

    const chatModeBtn = document.getElementById('chatModeBtn')
    const pdfModeBtn = document.getElementById('pdfModeBtn')
    const indicator = document.getElementById('ragActiveIndicator')
    const promptEl = this.elements.prompt

    if (chatModeBtn) {
      chatModeBtn.classList.toggle('active', !isPdfMode)
    }
    if (pdfModeBtn) {
      pdfModeBtn.classList.toggle('active', isPdfMode)
    }
    if (indicator) {
      indicator.style.display = isPdfMode ? 'flex' : 'none'
    }
    if (promptEl) {
      if (isPdfMode) {
        promptEl.classList.add('pdf-mode')
        promptEl.placeholder = 'Ask a question about your PDF…'
      } else {
        promptEl.classList.remove('pdf-mode')
        promptEl.placeholder = 'Type your message here...'
      }
    }

    logDebug(`[RAG] Mode switched to: ${isPdfMode ? 'PDF Q&A' : 'Chat'}`)
  }
}

// Initialize and export app instance
const app = new App()
document.addEventListener('DOMContentLoaded', () => app.init())

export default app
