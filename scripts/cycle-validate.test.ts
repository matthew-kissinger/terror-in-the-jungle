import { describe, expect, it } from 'vitest';

import { classifyBriefLoc } from './cycle-validate';

function syntheticBrief(lineCount: number): string {
  // Each entry becomes one line after the split-and-pop in classifyBriefLoc.
  return Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
}

describe('classifyBriefLoc', () => {
  it('treats a slim brief at the 80 LOC cap as OK', () => {
    const result = classifyBriefLoc('docs/tasks/_TEMPLATE.md', syntheticBrief(80));
    expect(result.level).toBe('ok');
    expect(result.lineCount).toBe(80);
    expect(result.message).toContain('within target');
  });

  it('treats exactly 100 LOC as OK (boundary is strictly >100)', () => {
    const result = classifyBriefLoc('docs/tasks/example.md', syntheticBrief(100));
    expect(result.level).toBe('ok');
    expect(result.lineCount).toBe(100);
  });

  it('warns on a brief above 100 LOC but at or under 150 LOC', () => {
    const result = classifyBriefLoc('docs/tasks/medium.md', syntheticBrief(120));
    expect(result.level).toBe('warn');
    expect(result.message).toContain('120 LOC');
    expect(result.message).toContain('80 LOC');
  });

  it('recommends a split on a synthetic 150-line brief that crosses the threshold', () => {
    // 151 is the first line count above BRIEF_SPLIT_LOC=150.
    const result = classifyBriefLoc('docs/tasks/long.md', syntheticBrief(151));
    expect(result.level).toBe('split');
    expect(result.message).toContain('151 LOC');
    expect(result.message).toContain('splitting');
  });

  it('handles CRLF line endings the same as LF', () => {
    const body = Array.from({ length: 130 }, (_, i) => `line ${i + 1}`).join('\r\n') + '\r\n';
    const result = classifyBriefLoc('docs/tasks/crlf.md', body);
    expect(result.level).toBe('warn');
    expect(result.lineCount).toBe(130);
  });

  it('does not double-count a trailing newline', () => {
    const result = classifyBriefLoc('docs/tasks/trim.md', 'one\ntwo\nthree\n');
    expect(result.lineCount).toBe(3);
  });
});
