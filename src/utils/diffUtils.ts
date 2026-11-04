export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface DiffResult {
  lines: DiffLine[];
  additions: number;
  deletions: number;
  same: number;
}

/**
 * Computes line-by-line diff using Longest Common Subsequence (LCS).
 */
export function computeLineDiff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText ? oldText.split(/\r?\n/) : [];
  const newLines = newText ? newText.split(/\r?\n/) : [];

  if (oldLines.length === 0 && newLines.length === 0) {
    return { lines: [], additions: 0, deletions: 0, same: 0 };
  }

  if (oldLines.length === 0) {
    const lines: DiffLine[] = newLines.map((content, idx) => ({
      type: 'added',
      newLineNumber: idx + 1,
      content,
    }));
    return { lines, additions: lines.length, deletions: 0, same: 0 };
  }

  if (newLines.length === 0) {
    const lines: DiffLine[] = oldLines.map((content, idx) => ({
      type: 'removed',
      oldLineNumber: idx + 1,
      content,
    }));
    return { lines, additions: 0, deletions: lines.length, same: 0 };
  }

  // Fast check: identical
  if (oldText === newText) {
    const lines: DiffLine[] = oldLines.map((content, idx) => ({
      type: 'same',
      oldLineNumber: idx + 1,
      newLineNumber: idx + 1,
      content,
    }));
    return { lines, additions: 0, deletions: 0, same: lines.length };
  }

  const n = oldLines.length;
  const m = newLines.length;

  // LCS DP table (optimized with bounds check if files are huge)
  const maxLines = 1500;
  const trimN = Math.min(n, maxLines);
  const trimM = Math.min(m, maxLines);

  const dp: number[][] = Array.from({ length: trimN + 1 }, () => new Array(trimM + 1).fill(0));

  for (let i = 1; i <= trimN; i++) {
    for (let j = 1; j <= trimM; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const lines: DiffLine[] = [];
  let i = trimN;
  let j = trimM;
  let additions = 0;
  let deletions = 0;
  let same = 0;

  const stack: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({
        type: 'same',
        oldLineNumber: i,
        newLineNumber: j,
        content: oldLines[i - 1],
      });
      same++;
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({
        type: 'added',
        newLineNumber: j,
        content: newLines[j - 1],
      });
      additions++;
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      stack.push({
        type: 'removed',
        oldLineNumber: i,
        content: oldLines[i - 1],
      });
      deletions++;
      i--;
    }
  }

  while (stack.length > 0) {
    lines.push(stack.pop()!);
  }

  return { lines, additions, deletions, same };
}
