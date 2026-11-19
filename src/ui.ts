import { generateCopyUpdates } from './openrouter';
import {
  DEFAULT_MODEL,
  DEFAULT_SCOPE,
  type ContextScope,
  type PluginToUiMessage,
  type UiToPluginMessage,
} from './types';

type UiStatus = 'idle' | 'reading' | 'generating' | 'applying';

interface UiState {
  settingsLoaded: boolean;
  isUnlocked: boolean;
  apiKey: string;
  model: string;
  scope: ContextScope;
  prompt: string;
  targetCount: number;
  screenName: string | null;
  status: UiStatus;
  feedback: { kind: 'error' | 'success'; message: string } | null;
  settingsOpen: boolean;
  showApiKey: boolean;
}

const state: UiState = {
  settingsLoaded: false,
  isUnlocked: false,
  apiKey: '',
  model: DEFAULT_MODEL,
  scope: DEFAULT_SCOPE,
  prompt: '',
  targetCount: 0,
  screenName: null,
  status: 'idle',
  feedback: null,
  settingsOpen: false,
  showApiKey: false,
};

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing DOM element #${id}`);
  }
  return el as T;
}

const dom = {
  apiKeyGate: getEl<HTMLDivElement>('api-key-gate'),
  gateApiKeyInput: getEl<HTMLInputElement>('gate-api-key-input'),
  gateToggleKeyBtn: getEl<HTMLButtonElement>('gate-toggle-key-btn'),
  gateContinueBtn: getEl<HTMLButtonElement>('gate-continue-btn'),
  app: getEl<HTMLDivElement>('app'),
  selectionBar: getEl<HTMLDivElement>('selection-bar'),
  selectionText: getEl<HTMLSpanElement>('selection-text'),
  promptInput: getEl<HTMLTextAreaElement>('prompt-input'),
  scopeScreenBtn: getEl<HTMLButtonElement>('scope-screen'),
  scopePageBtn: getEl<HTMLButtonElement>('scope-page'),
  applyBtn: getEl<HTMLButtonElement>('apply-btn'),
  applySpinner: getEl<HTMLSpanElement>('apply-spinner'),
  applyLabel: getEl<HTMLSpanElement>('apply-label'),
  feedbackBanner: getEl<HTMLDivElement>('feedback-banner'),
  settingsToggle: getEl<HTMLButtonElement>('settings-toggle'),
  settingsBadge: getEl<HTMLSpanElement>('settings-badge'),
  settingsBody: getEl<HTMLDivElement>('settings-body'),
  apiKeyInput: getEl<HTMLInputElement>('api-key-input'),
  toggleKeyBtn: getEl<HTMLButtonElement>('toggle-key-btn'),
  modelInput: getEl<HTMLInputElement>('model-input'),
};

function postToPlugin(message: UiToPluginMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

function setState(patch: Partial<UiState>): void {
  Object.assign(state, patch);
  render();
}

function renderSelectionBar(): void {
  if (state.targetCount === 0) {
    dom.selectionBar.classList.add('is-empty');
    dom.selectionText.textContent = 'Select a text layer, component, or group';
    return;
  }

  dom.selectionBar.classList.remove('is-empty');
  const layerLabel = state.targetCount === 1 ? '1 text layer' : `${state.targetCount} text layers`;
  const locationLabel = state.screenName ? ` in "${state.screenName}"` : '';
  dom.selectionText.textContent = `${layerLabel} selected${locationLabel}`;
}

function renderScopeControl(): void {
  const isScreen = state.scope === 'screen';
  dom.scopeScreenBtn.setAttribute('aria-pressed', String(isScreen));
  dom.scopePageBtn.setAttribute('aria-pressed', String(!isScreen));
}

function renderApplyButton(): void {
  const isBusy = state.status !== 'idle';
  const canSubmit =
    !isBusy &&
    state.targetCount > 0 &&
    state.prompt.trim().length > 0 &&
    state.apiKey.trim().length > 0;

  dom.applyBtn.disabled = !canSubmit;
  dom.applySpinner.hidden = !isBusy;

  switch (state.status) {
    case 'reading':
      dom.applyLabel.textContent = 'Reading context...';
      break;
    case 'generating':
      dom.applyLabel.textContent = 'Generating copy...';
      break;
    case 'applying':
      dom.applyLabel.textContent = 'Updating canvas...';
      break;
    default:
      dom.applyLabel.textContent = 'Apply to Selection';
      break;
  }
}

function renderFeedback(): void {
  if (!state.feedback) {
    dom.feedbackBanner.hidden = true;
    dom.feedbackBanner.className = 'banner';
    dom.feedbackBanner.textContent = '';
    return;
  }

  dom.feedbackBanner.hidden = false;
  dom.feedbackBanner.className =
    state.feedback.kind === 'error' ? 'banner is-error' : 'banner is-success';
  dom.feedbackBanner.textContent = state.feedback.message;
}

function syncApiKeyField(input: HTMLInputElement, toggleBtn: HTMLButtonElement): void {
  if (input.value !== state.apiKey) {
    input.value = state.apiKey;
  }
  input.type = state.showApiKey ? 'text' : 'password';
  toggleBtn.textContent = state.showApiKey ? 'Hide' : 'Show';
}

function renderGate(): void {
  const showGate = state.settingsLoaded && !state.isUnlocked;
  dom.apiKeyGate.hidden = !showGate;
  if (!showGate) return;

  syncApiKeyField(dom.gateApiKeyInput, dom.gateToggleKeyBtn);
  dom.gateContinueBtn.disabled = state.apiKey.trim().length === 0;
}

function renderSettings(): void {
  dom.settingsToggle.setAttribute('aria-expanded', String(state.settingsOpen));
  dom.settingsBody.hidden = !state.settingsOpen;

  const hasKey = state.apiKey.trim().length > 0;
  dom.settingsBadge.textContent = hasKey ? 'Configured' : 'API key required';
  dom.settingsBadge.className = hasKey ? 'settings-badge' : 'settings-badge is-missing';

  syncApiKeyField(dom.apiKeyInput, dom.toggleKeyBtn);

  if (dom.modelInput.value !== state.model && document.activeElement !== dom.modelInput) {
    dom.modelInput.value = state.model;
  }
}

function render(): void {
  renderGate();
  dom.app.hidden = !state.settingsLoaded || !state.isUnlocked;
  if (!state.settingsLoaded || !state.isUnlocked) return;

  renderSelectionBar();
  renderScopeControl();
  renderApplyButton();
  renderFeedback();
  renderSettings();
}

function handleApply(): void {
  if (state.status !== 'idle') return;

  if (!state.apiKey.trim()) {
    setState({
      settingsOpen: true,
      feedback: { kind: 'error', message: 'Enter your OpenRouter API key in Settings first.' },
    });
    return;
  }

  if (state.targetCount === 0) {
    setState({
      feedback: {
        kind: 'error',
        message: 'Select at least one text layer, component, or group on the canvas.',
      },
    });
    return;
  }

  if (!state.prompt.trim()) {
    setState({
      feedback: { kind: 'error', message: 'Enter an instruction before applying.' },
    });
    return;
  }

  setState({ status: 'reading', feedback: null });
  postToPlugin({ type: 'extract-context', scope: state.scope });
}

function handleUnlockWithApiKey(): void {
  const trimmed = state.apiKey.trim();
  if (!trimmed) return;
  postToPlugin({ type: 'save-settings', settings: { apiKey: trimmed } });
  setState({
    apiKey: trimmed,
    isUnlocked: true,
    settingsOpen: false,
    feedback: null,
  });
}

// Event Listeners
dom.gateApiKeyInput.addEventListener('input', () => {
  setState({ apiKey: dom.gateApiKeyInput.value });
});

dom.gateApiKeyInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleUnlockWithApiKey();
  }
});

dom.gateToggleKeyBtn.addEventListener('click', () => {
  setState({ showApiKey: !state.showApiKey });
});

dom.gateContinueBtn.addEventListener('click', handleUnlockWithApiKey);

dom.promptInput.addEventListener('input', () => {
  setState({ prompt: dom.promptInput.value, feedback: null });
});

dom.promptInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    handleApply();
  }
});

dom.scopeScreenBtn.addEventListener('click', () => {
  if (state.scope === 'screen') return;
  setState({ scope: 'screen' });
  postToPlugin({ type: 'save-settings', settings: { scope: 'screen' } });
});

dom.scopePageBtn.addEventListener('click', () => {
  if (state.scope === 'page') return;
  setState({ scope: 'page' });
  postToPlugin({ type: 'save-settings', settings: { scope: 'page' } });
});

dom.applyBtn.addEventListener('click', handleApply);

dom.settingsToggle.addEventListener('click', () => {
  setState({ settingsOpen: !state.settingsOpen });
});

dom.toggleKeyBtn.addEventListener('click', () => {
  setState({ showApiKey: !state.showApiKey });
});

dom.apiKeyInput.addEventListener('input', () => {
  const apiKey = dom.apiKeyInput.value;
  setState({ apiKey, feedback: null });
  postToPlugin({ type: 'save-settings', settings: { apiKey } });
});

dom.modelInput.addEventListener('input', () => {
  const model = dom.modelInput.value;
  setState({ model });
  postToPlugin({ type: 'save-settings', settings: { model } });
});

dom.modelInput.addEventListener('blur', () => {
  const normalized = dom.modelInput.value.trim() || DEFAULT_MODEL;
  if (normalized !== state.model) {
    setState({ model: normalized });
    postToPlugin({ type: 'save-settings', settings: { model: normalized } });
  }
});

// Messages from Figma Sandbox
window.onmessage = async (event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>) => {
  if (event.source !== window.parent) return;
  const msg = event.data?.pluginMessage;
  if (!msg) return;

  switch (msg.type) {
    case 'settings-loaded': {
      const hasKey = msg.settings.apiKey.trim().length > 0;
      setState({
        settingsLoaded: true,
        isUnlocked: hasKey,
        apiKey: msg.settings.apiKey,
        model: msg.settings.model,
        scope: msg.settings.scope,
        settingsOpen: false,
      });
      break;
    }

    case 'selection-changed': {
      setState({
        targetCount: msg.summary.targetCount,
        screenName: msg.summary.screenName,
      });
      break;
    }

    case 'context-error': {
      setState({
        status: 'idle',
        feedback: { kind: 'error', message: msg.error },
      });
      break;
    }

    case 'context-extracted': {
      setState({ status: 'generating' });
      try {
        const modelToUse = state.model.trim() || DEFAULT_MODEL;
        const updates = await generateCopyUpdates({
          apiKey: state.apiKey,
          model: modelToUse,
          instruction: state.prompt,
          payload: msg.payload,
        });
        setState({ status: 'applying' });
        postToPlugin({ type: 'apply-updates', updates });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate copy.';
        setState({
          status: 'idle',
          feedback: { kind: 'error', message },
        });
      }
      break;
    }

    case 'apply-success': {
      const countLabel =
        msg.updatedCount === 1 ? '1 text layer' : `${msg.updatedCount} text layers`;
      setState({
        status: 'idle',
        feedback: { kind: 'success', message: `Done! Updated ${countLabel}.` },
      });
      break;
    }

    case 'apply-error': {
      setState({
        status: 'idle',
        feedback: { kind: 'error', message: msg.error },
      });
      break;
    }
  }
};

// Bootstrap
render();
postToPlugin({ type: 'init' });
