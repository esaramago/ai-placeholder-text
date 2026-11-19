import type { TextUpdate } from './types';

function deduplicateFonts(fonts: readonly FontName[]): FontName[] {
  const seen = new Set<string>();
  const unique: FontName[] = [];
  for (const font of fonts) {
    const key = `${font.family}::${font.style}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(font);
    }
  }
  return unique;
}

export async function loadFontsForTextNode(node: TextNode): Promise<void> {
  if (node.hasMissingFont) {
    throw new Error(`Missing font on layer "${node.name}". Please resolve missing fonts in Figma first.`);
  }

  let fonts: FontName[];
  if (node.fontName === figma.mixed) {
    if (node.characters.length === 0) {
      fonts = [];
    } else {
      fonts = deduplicateFonts(node.getRangeAllFontNames(0, node.characters.length));
    }
  } else {
    fonts = [node.fontName];
  }

  await Promise.all(fonts.map((font) => figma.loadFontAsync(font)));
}

export async function applyTextUpdates(
  updates: readonly TextUpdate[],
  allowedTargetIds: ReadonlySet<string>,
): Promise<number> {
  let updatedCount = 0;

  for (const update of updates) {
    // Security: strictly enforce that only selected target IDs can be modified
    if (!allowedTargetIds.has(update.id)) {
      continue;
    }

    const node = await figma.getNodeByIdAsync(update.id);
    if (!node || node.type !== 'TEXT') {
      continue;
    }

    await loadFontsForTextNode(node);
    node.characters = update.text;
    updatedCount += 1;
  }

  return updatedCount;
}
