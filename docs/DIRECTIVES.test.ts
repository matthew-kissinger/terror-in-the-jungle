// DIRECTIVES.md structural parse test.
//
// Pure parsing — no app code. Asserts the slim-refactor shape from
// `docs/tasks/cycle-framework-recovery-pass-2.md`:
//  - file parses into an "Open" table and a "Recently closed" table
//  - every row has 6 columns
//  - no row has empty `id` or `title`
//
// Sibling-of-DIRECTIVES.md per the brief; picked up by vitest via
// the docs/**/*.test.ts glob in `vitest.config.ts`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIRECTIVES_PATH = join(__dirname, 'DIRECTIVES.md');

interface DirectivesTable {
  heading: string;
  rows: string[][];
}

function parseDirectivesTables(markdown: string): DirectivesTable[] {
  const lines = markdown.split(/\r?\n/);
  const tables: DirectivesTable[] = [];

  let currentHeading: string | null = null;
  let collecting = false;
  let pendingRows: string[][] = [];

  const flush = () => {
    if (currentHeading !== null && pendingRows.length > 0) {
      tables.push({ heading: currentHeading, rows: pendingRows });
    }
    pendingRows = [];
    collecting = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = /^##\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1];
      continue;
    }
    // Detect markdown table start: a row starting with `|`, followed by a
    // separator row like `|---|---|...`.
    if (!collecting && line.trim().startsWith('|') && lines[i + 1]?.trim().match(/^\|[\s:|-]+\|$/)) {
      collecting = true;
      // skip the header row + separator row
      i += 1;
      continue;
    }
    if (collecting) {
      if (!line.trim().startsWith('|')) {
        // end of table block
        flush();
        // re-evaluate this line (could be a new heading)
        i -= 1;
        continue;
      }
      const cells = line
        .trim()
        // strip leading/trailing pipe
        .replace(/^\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map((c) => c.trim());
      pendingRows.push(cells);
    }
  }
  flush();
  return tables;
}

describe('docs/DIRECTIVES.md', () => {
  const markdown = readFileSync(DIRECTIVES_PATH, 'utf-8');
  const tables = parseDirectivesTables(markdown);

  it('parses into at least an Open and a Recently-closed table', () => {
    const headings = tables.map((t) => t.heading.toLowerCase());
    expect(headings.some((h) => h === 'open')).toBe(true);
    expect(headings.some((h) => h.startsWith('recently closed'))).toBe(true);
  });

  it('every directive row has 6 columns', () => {
    const directiveTables = tables.filter((t) => {
      const h = t.heading.toLowerCase();
      return h === 'open' || h.startsWith('recently closed');
    });
    expect(directiveTables.length).toBeGreaterThanOrEqual(2);
    for (const table of directiveTables) {
      expect(table.rows.length).toBeGreaterThan(0);
      for (const row of table.rows) {
        expect(row.length, `row in "${table.heading}": ${JSON.stringify(row)}`).toBe(6);
      }
    }
  });

  it('no row has an empty id or title cell', () => {
    const directiveTables = tables.filter((t) => {
      const h = t.heading.toLowerCase();
      return h === 'open' || h.startsWith('recently closed');
    });
    for (const table of directiveTables) {
      for (const row of table.rows) {
        const [id, title] = row;
        expect(id, `id in "${table.heading}"`).not.toBe('');
        expect(title, `title in "${table.heading}"`).not.toBe('');
      }
    }
  });

  it('stays under the 200 LOC ceiling', () => {
    const lineCount = markdown.split(/\r?\n/).length;
    expect(lineCount).toBeLessThanOrEqual(200);
  });
});
