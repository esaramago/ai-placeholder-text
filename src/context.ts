import type { ContextPayload, ContextScope, TargetTextNode } from './types';

export interface NodeLike {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  characters?: string;
  children?: readonly NodeLike[];
  parent?: NodeLike | null;
}

export interface PageLike {
  id: string;
  name: string;
  children: readonly NodeLike[];
}

function isVisible(node: NodeLike): boolean {
  return node.visible !== false;
}

export function findTopLevelScreen(node: NodeLike): NodeLike | null {
  let current: NodeLike | null | undefined = node;
  while (current && current.parent) {
    if (current.parent.type === 'PAGE' || current.parent.type === 'DOCUMENT') {
      return current;
    }
    current = current.parent;
  }
  return current && current.type !== 'PAGE' && current.type !== 'DOCUMENT' ? current : null;
}

function buildNodePath(node: NodeLike): string {
  const parts: string[] = [];
  let current: NodeLike | null | undefined = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    parts.unshift(current.name);
    current = current.parent;
  }
  return parts.join(' > ');
}

export function collectTargetTextNodes(selection: readonly NodeLike[]): TargetTextNode[] {
  const seen = new Set<string>();
  const targets: TargetTextNode[] = [];

  function visit(node: NodeLike): void {
    if (!isVisible(node)) return;

    if (node.type === 'TEXT') {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        targets.push({
          id: node.id,
          name: node.name,
          text: node.characters ?? '',
          path: buildNodePath(node),
        });
      }
      return;
    }

    if (node.children) {
      for (const child of node.children) {
        visit(child);
      }
    }
  }

  for (const node of selection) {
    visit(node);
  }

  return targets;
}

function serializeNode(
  node: NodeLike,
  targetIds: ReadonlySet<string>,
  depth: number,
): string[] {
  if (!isVisible(node)) return [];

  const indent = '  '.repeat(depth);

  if (node.type === 'TEXT') {
    const text = node.characters ?? '';
    if (targetIds.has(node.id)) {
      return [
        `${indent}[TARGET id=${JSON.stringify(node.id)} name=${JSON.stringify(node.name)}]${JSON.stringify(text)}[/TARGET]`,
      ];
    }
    return [`${indent}TEXT ${JSON.stringify(node.name)}: ${JSON.stringify(text)}`];
  }

  if (!node.children || node.children.length === 0) {
    return [];
  }

  const childLines: string[] = [];
  for (const child of node.children) {
    childLines.push(...serializeNode(child, targetIds, depth + 1));
  }

  if (childLines.length === 0) {
    return [];
  }

  return [`${indent}${node.type} ${JSON.stringify(node.name)}`, ...childLines];
}

export function serializeContextTree(
  roots: readonly NodeLike[],
  targetIds: ReadonlySet<string>,
): string {
  const lines: string[] = [];
  for (const root of roots) {
    lines.push(...serializeNode(root, targetIds, 0));
  }
  return lines.join('\n');
}

export function getSelectionScreenName(selection: readonly NodeLike[]): string | null {
  if (selection.length === 0) return null;
  const screenNames = new Set<string>();
  for (const node of selection) {
    const top = findTopLevelScreen(node);
    if (top) {
      screenNames.add(top.name);
    }
  }
  if (screenNames.size === 1) {
    return Array.from(screenNames)[0];
  }
  if (screenNames.size > 1) {
    return `${screenNames.size} screens`;
  }
  return null;
}

export function extractContext(
  selection: readonly NodeLike[],
  currentPage: PageLike,
  scope: ContextScope,
): ContextPayload {
  const targets = collectTargetTextNodes(selection);
  const targetIds = new Set(targets.map((t) => t.id));

  let roots: NodeLike[];
  let screenName: string | null;

  if (scope === 'page') {
    roots = currentPage.children.filter(isVisible);
    screenName = currentPage.name;
  } else {
    const seenRootIds = new Set<string>();
    roots = [];
    for (const node of selection) {
      const top = findTopLevelScreen(node) ?? node;
      if (!seenRootIds.has(top.id) && isVisible(top)) {
        seenRootIds.add(top.id);
        roots.push(top);
      }
    }
    screenName = getSelectionScreenName(selection);
  }

  const contextTree = serializeContextTree(roots, targetIds);

  return {
    targets,
    contextTree,
    screenName,
  };
}
