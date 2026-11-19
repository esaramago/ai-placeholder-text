import {
  collectTargetTextNodes,
  extractContext,
  getSelectionScreenName,
} from './context'
import { applyTextUpdates } from './typography'
import {
  DEFAULT_MODEL,
  DEFAULT_SCOPE,
  type ContextScope,
  type PluginSettings,
  type PluginToUiMessage,
  type UiToPluginMessage,
} from './types'

const STORAGE_KEYS = {
  apiKey: 'openrouter_api_key',
  model: 'openrouter_model',
  scope: 'context_scope',
} as const

let lastExtractedTargetIds = new Set<string>()

figma.showUI(__html__, {
  width: 340,
  height: 480,
  themeColors: true,
})

function postToUi(message: PluginToUiMessage): void {
  figma.ui.postMessage(message)
}

async function loadSettings(): Promise<PluginSettings> {
  const [apiKey, model, scope] = await Promise.all([
    figma.clientStorage.getAsync(STORAGE_KEYS.apiKey),
    figma.clientStorage.getAsync(STORAGE_KEYS.model),
    figma.clientStorage.getAsync(STORAGE_KEYS.scope),
  ])

  const validScope: ContextScope = scope === 'page' ? 'page' : DEFAULT_SCOPE

  return {
    apiKey: typeof apiKey === 'string' ? apiKey : '',
    model:
      typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_MODEL,
    scope: validScope,
  }
}

async function saveSettings(partial: Partial<PluginSettings>): Promise<void> {
  const writes: Promise<void>[] = []

  if (typeof partial.apiKey === 'string') {
    writes.push(
      figma.clientStorage.setAsync(STORAGE_KEYS.apiKey, partial.apiKey.trim()),
    )
  }
  if (typeof partial.model === 'string') {
    const modelValue = partial.model.trim() || DEFAULT_MODEL
    writes.push(figma.clientStorage.setAsync(STORAGE_KEYS.model, modelValue))
  }
  if (partial.scope === 'screen' || partial.scope === 'page') {
    writes.push(figma.clientStorage.setAsync(STORAGE_KEYS.scope, partial.scope))
  }

  await Promise.all(writes)
}

function sendSelectionSummary(): void {
  const selection = figma.currentPage.selection
  const targets = collectTargetTextNodes(selection)
  const screenName = getSelectionScreenName(selection)

  postToUi({
    type: 'selection-changed',
    summary: {
      targetCount: targets.length,
      screenName,
    },
  })
}

figma.on('selectionchange', () => {
  sendSelectionSummary()
})

figma.ui.onmessage = async (msg: UiToPluginMessage) => {
  switch (msg.type) {
    case 'init': {
      const settings = await loadSettings()
      postToUi({ type: 'settings-loaded', settings })
      sendSelectionSummary()
      break
    }

    case 'save-settings': {
      await saveSettings(msg.settings)
      break
    }

    case 'extract-context': {
      const selection = figma.currentPage.selection
      if (selection.length === 0) {
        postToUi({
          type: 'context-error',
          error:
            'Select at least one text layer, group, or component on the canvas.',
        })
        return
      }

      const payload = extractContext(selection, figma.currentPage, msg.scope)
      if (payload.targets.length === 0) {
        postToUi({
          type: 'context-error',
          error: 'No visible text layers found inside the current selection.',
        })
        return
      }

      lastExtractedTargetIds = new Set(payload.targets.map((t) => t.id))
      postToUi({ type: 'context-extracted', payload })
      break
    }

    case 'apply-updates': {
      try {
        // Intersect with active selection targets to prevent stale or injected IDs
        const activeTargets = collectTargetTextNodes(
          figma.currentPage.selection,
        )
        const activeTargetIds = new Set(activeTargets.map((t) => t.id))
        const allowedIds = new Set(
          Array.from(lastExtractedTargetIds).filter((id) =>
            activeTargetIds.has(id),
          ),
        )

        const updatedCount = await applyTextUpdates(msg.updates, allowedIds)
        if (updatedCount === 0) {
          postToUi({
            type: 'apply-error',
            error:
              'No matching target text layers were updated. Did your selection change?',
          })
          return
        }

        figma.commitUndo()
        figma.notify(
          `Updated ${updatedCount} text ${updatedCount === 1 ? 'layer' : 'layers'}`,
        )
        postToUi({ type: 'apply-success', updatedCount })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to update text layers.'
        postToUi({ type: 'apply-error', error: message })
      }
      break
    }
  }
}
