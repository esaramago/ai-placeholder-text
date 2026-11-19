# Product Specification: Context-Aware Text Assistant for Figma (via OpenRouter)

## Overview

Build a native Figma plugin that allows designers to edit copy directly on the canvas using Artificial Intelligence models via the OpenRouter API (Bring Your Own Key model — users provide their own API key).

The core differentiator of this plugin is context awareness: the user selects only the specific element or group of texts they want to modify, while the plugin automatically reads the structure of the surrounding screen (top-level frame) where that element lives. This allows the AI to understand the purpose and tone of the entire screen before suggesting or applying changes.

## Problem Statement
* Lack of context in traditional tools: Asking an external AI to rewrite an isolated button or headline often results in copy that feels disconnected from the rest of the interface.
* High friction in MCP / external chat workflows: Forces the designer to copy frame links, manually explain where the text is located, and paste results back into Figma.
* Single-vendor lock-in: Designers and teams need the flexibility to switch between different AI models (Claude, Gemini, GPT, Llama, etc.) using a single OpenRouter account and API key.

## User Experience (Core Flow)

1. Initial Setup:
   - The user opens the plugin inside Figma.
   - Enters their OpenRouter API Key (stored locally on their machine so they don't have to re-enter it every time).
   - Types the desired AI model identifier (e.g., anthropic/claude-3.5-sonnet, google/gemini-2.5-pro). Default is deepseek/deepseek-v3.2.

2. Canvas Selection:
   - On the Figma canvas, the user selects a single text layer, a component (such as a button or card), or a group of elements.

3. Prompting:
   - Inside the plugin window, the user types their request in natural language (e.g., "Make this copy more direct and persuasive", "Translate to English matching the page's tone", or "Adapt this headline to fit the rest of the screen").
   - Clicks the "Apply to Selection" button.
4. Smart Processing (Under the Hood):
   - The plugin gathers the exact text layers currently selected (Targets).
   - Simultaneously, it reads all visible layer names and text content from the parent screen/artboard containing the selection (Context), ignoring hidden layers to keep the input clean.
5. Direct Canvas Update:
   - The AI returns updated copy strictly for the selected target elements.
   - The plugin replaces the text directly on the Figma canvas, preserving original fonts, sizes, colors, and text styles, and displays a subtle confirmation notification.

## Functional Requirements
   - Credential Management (BYOK): Masked input field for the OpenRouter API key, persisted locally via Figma's client storage (clientStorage).
   - Editable text input allowing the user to specify any OpenRouter model ID. The default is deepseek/deepseek-v3.2.
   - Selective Reading + Context Extraction:
     - Ability to find all text layers nested within simple selections or complex groups/frames.
     - Ability to traverse up the hierarchy to the top-level frame on the page to extract surrounding visual/textual context.
   - Simple toggle or option to switch context scope between current parent screen or entire page.
   - Typography Preservation: Before modifying any text node, the plugin must ensure all fonts used within that node are loaded to prevent errors or loss of formatting.
   - Visual Feedback: Clear status indicators inside the plugin UI (e.g., "Reading context...", "Generating copy...", "Done!", or friendly error messages if nothing is selected or the API key is invalid).

## For later
* How to incorporate model cache in order to make the input prompts lighter.

## Out of Scope (for Version 1)
* Creating new graphic elements, shapes, or modifying colors and Auto Layout properties.
* Image generation.
* Complex multi-turn chat history (V1 focuses on fast, direct, single-shot commands on the active selection).

## Success Criteria
* The user can configure their OpenRouter API key once and reuse it seamlessly across future sessions.
* When selecting a button labeled "Submit" inside a newsletter signup form and prompting "Improve the CTA", the AI suggests "Subscribe to Newsletter" by understanding the form's context, without altering any other text on the screen.
* The entire round-trip (from clicking apply to seeing the canvas update) takes only a few seconds and never breaks existing design formatting.