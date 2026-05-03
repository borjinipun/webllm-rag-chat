# 📟 RAG Chat Terminal v1.0

A browser-based LLM chat application with **built-in RAG (Retrieval-Augmented Generation)**. Run AI models and query your PDFs directly in your browser using WebGPU technology, all within a **retro CRT terminal interface**.

All processing happens locally on your device. No server required. No data leaves your machine. 💯% Offline.

## 🌟 Live URL

🔗 Use the app at [https://borjinipun.github.io/webllm-rag-chat/](https://borjinipun.github.io/webllm-rag-chat/)

## ✅ Features

- 📂 **Local PDF RAG**: Upload a PDF and ask questions about its content. The app extracts text, generates embeddings (using Transformers.js), and retrieves context locally to ground the AI's answers.
- 📟 **Retro Terminal UI**: A nostalgic 90s-style desktop environment with CRT scanlines, flicker effects, and a classic 3D-border aesthetic.
- 🤖 **Offline LLMs**: Run large language models directly in your browser via WebGPU.
- 🔄 **Model Choice**: Select from various models with different performance/memory profiles.
- 📊 **Progress Tracking**: Real-time feedback for model downloads and PDF embedding.
- 💾 **Local Persistence**: Conversation history and model metadata are saved to your browser's IndexedDB.

## 🔧 Requirements

- **Browser Support**: Chrome 113+, Edge 113+, or Firefox 118+ with WebGPU enabled.
- **Hardware**: Best performance with a dedicated GPU.
  - 🟢 Small models: ~1GB VRAM
  - 🟠 Medium models: ~6GB VRAM
  - 🟣 Large models: 10GB+ VRAM

## ⚙️ How It Works

This application is built on top of [web-llm](https://github.com/mlc-ai/web-llm), which compiles LLMs to WebGPU for browser execution. 

The RAG pipeline uses:
- **PDF.js**: For client-side text extraction.
- **Transformers.js**: For running the `Xenova/all-MiniLM-L6-v2` embedding model locally.
- **Custom Vector Store**: A simple, in-memory cosine-similarity search for retrieving document excerpts.

## 🚀 Local Development

1. Clone this repository.
2. Serve the directory using a local HTTP server (required for ES modules):
   ```bash
   python3 -m http.server 8080
   ```
3. Open `http://localhost:8080` in a WebGPU-enabled browser.

## 🙏 Credits

- **Core Engine**: Based on [web-llm](https://github.com/mlc-ai/web-llm) by the MLC AI team.
- **Inspiration**: This project was inspired by the initial work of [Ebenezer Don](https://github.com/ebenezerdon) on the WebLLM desktop interface.

## 📝 License

GNU GPL v3
