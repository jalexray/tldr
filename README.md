# TLDR

Chrome extension that uses LLMs to condense web pages so you can consume information faster.

## What it does

Click the extension icon on any page and hit **Condense this page**. The extension extracts the main content, sends it to an LLM, and gives you a condensed version.

Two display modes:
- **Full page overlay** — structured summary with headlines and bullets
- **Replace in page** — each paragraph condensed individually, keeping the original page layout

Density control ranges from **Smart** (density-aware, preserves fact-heavy content) to a manual 5-point slider from light editing (~20% reduction) to exec summary (~80% reduction).

## Setup

1. Go to `chrome://extensions`, enable Developer Mode
2. Click **Load unpacked**, select this folder
3. Click the TLDR icon, open Settings
4. Choose a provider (OpenAI or Anthropic), enter your API key, pick a model
5. Click **Condense this page** on any article

Keyboard shortcut: **Alt+T**

Optional: enable **Auto-condense on page load** to run automatically on every page (grants additional permissions).

## Supported providers

- **OpenAI** — gpt-4o-mini (default), gpt-4o, gpt-4.1-mini, gpt-4.1-nano
- **Anthropic** — Claude Haiku 4.5 (default), Claude Sonnet 4.5, Claude Sonnet 4.6
- **Custom** — any OpenAI-compatible endpoint (Ollama, Together, etc.)

## Risks and caveats

**This is a personal tool. Use at your own risk.**

- **Your page content is sent to a third-party API.** Every time you condense a page (manually or via auto-run), the extracted text is sent to OpenAI, Anthropic, or whatever endpoint you configured. Do not use on pages with sensitive information (banking, medical records, internal company tools, email) unless you understand and accept this.
- **Auto-run sends every page you visit.** If you enable auto-condense on page load, every http/https page you navigate to will have its content extracted and sent to your LLM provider automatically. A warning is shown when you enable this.
- **API keys are stored locally.** Your key is saved in `chrome.storage.local` (on-device only, not synced to Google's cloud). It is still accessible to the extension's own code.
- **LLM output can be manipulated.** A malicious web page could embed hidden text designed to influence the summary (prompt injection). The extension escapes all LLM output before rendering, preventing code execution, but the summary content itself could be misleading.
- **API costs are on you.** Each condensation makes one LLM API call. There is no rate limiting. Rapid use or auto-run on many pages will consume API credits.
- **No warranty.** This is an experimental tool, not a production product.
