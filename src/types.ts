export type ContextScope = 'screen' | 'page';

export const DEFAULT_MODEL = 'deepseek/deepseek-v3.2';
export const DEFAULT_SCOPE: ContextScope = 'screen';

export interface PluginSettings {
  apiKey: string;
  model: string;
  scope: ContextScope;
}

export interface TargetTextNode {
  id: string;
  name: string;
  text: string;
  path: string;
}

export interface SelectionSummary {
  targetCount: number;
  screenName: string | null;
}

export interface ContextPayload {
  targets: TargetTextNode[];
  contextTree: string;
  screenName: string | null;
}

export interface TextUpdate {
  id: string;
  text: string;
}

export type UiToPluginMessage =
  | { type: 'init' }
  | { type: 'save-settings'; settings: Partial<PluginSettings> }
  | { type: 'extract-context'; scope: ContextScope }
  | { type: 'apply-updates'; updates: TextUpdate[] };

export type PluginToUiMessage =
  | { type: 'settings-loaded'; settings: PluginSettings }
  | { type: 'selection-changed'; summary: SelectionSummary }
  | { type: 'context-extracted'; payload: ContextPayload }
  | { type: 'context-error'; error: string }
  | { type: 'apply-success'; updatedCount: number }
  | { type: 'apply-error'; error: string };
