import type { CodeChangePair } from '../types/lesson';

const BLOCK_HEADER_REGEX = /(?:^|\n)\/\* === 수정 코드 (\d+) === \*\/\n?/g;

export function serializeCodeChanges(pairs: CodeChangePair[]): {
  beforeCode: string;
  afterCode: string;
} {
  if (pairs.length <= 1) {
    const first = pairs[0] ?? { beforeCode: '', afterCode: '' };
    return {
      beforeCode: first.beforeCode,
      afterCode: first.afterCode,
    };
  }

  return {
    beforeCode: pairs
      .map((pair, idx) => `/* === 수정 코드 ${idx + 1} === */\n${pair.beforeCode.trimEnd()}`)
      .join('\n\n'),
    afterCode: pairs
      .map((pair, idx) => `/* === 수정 코드 ${idx + 1} === */\n${pair.afterCode.trimEnd()}`)
      .join('\n\n'),
  };
}

function splitTaggedBlocks(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.includes('/* === 수정 코드 ')) {
    return [normalized];
  }

  const matches = Array.from(normalized.matchAll(BLOCK_HEADER_REGEX));
  if (matches.length === 0) {
    return [normalized];
  }

  const parts: string[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? normalized.length) : normalized.length;
    parts.push(normalized.slice(start, end).replace(/\n+$/, ''));
  }
  return parts;
}

export function parseCodeChanges(beforeCode: string, afterCode: string): CodeChangePair[] {
  const beforeParts = splitTaggedBlocks(beforeCode || '');
  const afterParts = splitTaggedBlocks(afterCode || '');
  const count = Math.max(beforeParts.length, afterParts.length, 1);

  const result: CodeChangePair[] = [];
  for (let i = 0; i < count; i += 1) {
    result.push({
      beforeCode: beforeParts[i] ?? '',
      afterCode: afterParts[i] ?? '',
    });
  }
  return result;
}
