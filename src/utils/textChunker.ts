/**
 * 智能分块工具
 * 基于空行 (\n\n) 将 Markdown 文本分割为多个块，确保不截断代码块
 */

const BACKTICK_FENCE_REGEX = /^```/gm;
const TILDE_FENCE_REGEX = /^~~~/gm;
const SPLIT_REGEX = /\n\n/g;

interface Range {
  start: number;
  end: number;
}

function findFenceRanges(text: string): Range[] {
  const ranges: Range[] = [];
  const backtickStack: number[] = [];
  const tildeStack: number[] = [];

  const allMatches: Array<{ index: number; length: number; kind: '`' | '~' }> = [];

  BACKTICK_FENCE_REGEX.lastIndex = 0;
  let match;
  while ((match = BACKTICK_FENCE_REGEX.exec(text)) !== null) {
    allMatches.push({ index: match.index, length: match[0].length, kind: '`' });
  }

  TILDE_FENCE_REGEX.lastIndex = 0;
  while ((match = TILDE_FENCE_REGEX.exec(text)) !== null) {
    allMatches.push({ index: match.index, length: match[0].length, kind: '~' });
  }

  allMatches.sort((a, b) => a.index - b.index);

  for (const m of allMatches) {
    if (m.kind === '`') {
      if (backtickStack.length === 0) {
        backtickStack.push(m.index);
      } else {
        const start = backtickStack.pop()!;
        const lineEnd = text.indexOf('\n', m.index);
        const end = lineEnd === -1 ? text.length : lineEnd + 1;
        ranges.push({ start, end });
      }
    } else {
      if (tildeStack.length === 0) {
        tildeStack.push(m.index);
      } else {
        const start = tildeStack.pop()!;
        const lineEnd = text.indexOf('\n', m.index);
        const end = lineEnd === -1 ? text.length : lineEnd + 1;
        ranges.push({ start, end });
      }
    }
  }

  return ranges;
}

function isInsideFence(pos: number, ranges: Range[]): boolean {
  return ranges.some(r => pos > r.start && pos < r.end);
}

export function splitMarkdownIntoChunks(text: string, maxCharLength: number): string[] {
  const fenceRanges = findFenceRanges(text);

  const splitPositions: number[] = [];
  SPLIT_REGEX.lastIndex = 0;
  let match;
  while ((match = SPLIT_REGEX.exec(text)) !== null) {
    if (!isInsideFence(match.index, fenceRanges)) {
      splitPositions.push(match.index);
    }
  }

  const segments: string[] = [];
  let lastPos = 0;
  for (const pos of splitPositions) {
    segments.push(text.slice(lastPos, pos));
    lastPos = pos + 2; // skip \n\n
  }
  segments.push(text.slice(lastPos));

  const nonEmpty = segments.filter(s => s.length > 0);

  const chunks: string[] = [];
  let currentChunk = '';

  for (const seg of nonEmpty) {
    if (currentChunk.length === 0) {
      currentChunk = seg;
      continue;
    }

    if (currentChunk.length + 2 + seg.length > maxCharLength) {
      chunks.push(currentChunk);
      currentChunk = seg;
    } else {
      currentChunk += '\n\n' + seg;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.length === 0 ? [text] : chunks;
}

