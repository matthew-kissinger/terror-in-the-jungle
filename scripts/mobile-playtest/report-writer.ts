import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ConsoleEntry } from './cdp-bridge';
import type { ScenarioResult } from './gameplay-scenarios';

export type PlaytestReport = {
  timestamp: string;
  device: string;
  config: string;
  duration: string;
  screenFlowPassed: boolean;
  scenarioResults: ScenarioResult[];
  consoleErrorCount: number;
  pageErrorCount: number;
};

export function createResultsDir(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = join(process.cwd(), 'playtest-results', ts);
  mkdirSync(join(dir, 'screenshots'), { recursive: true });
  return dir;
}

export function writeConsoleLog(dir: string, entries: ConsoleEntry[]): void {
  const lines = entries.map(e => `[${e.ts}] [${e.type}] ${e.text}`);
  writeFileSync(join(dir, 'console.log'), lines.join('\n'), 'utf-8');
}

export function writeErrorLog(dir: string, errors: ConsoleEntry[]): void {
  const lines = errors.map(e => `[${e.ts}] ${e.text}`);
  writeFileSync(join(dir, 'errors.log'), lines.join('\n'), 'utf-8');
}

export function writeReport(dir: string, reports: PlaytestReport[]): void {
  // JSON
  writeFileSync(join(dir, 'report.json'), JSON.stringify(reports, null, 2), 'utf-8');

  // Markdown
  const md: string[] = ['# Mobile Playtest Report', ''];
  md.push(`Generated: ${new Date().toISOString()}`, '');

  for (const report of reports) {
    md.push(`## ${report.config}`, '');
    md.push(`- Device: ${report.device}`);
    md.push(`- Duration: ${report.duration}`);
    md.push(`- Screen flow: ${report.screenFlowPassed ? 'PASS' : 'FAIL'}`);
    md.push(`- Console errors: ${report.consoleErrorCount}`);
    md.push('');

    if (report.scenarioResults.length > 0) {
      md.push('### Scenarios', '');
      md.push('| Test | Result | Details |');
      md.push('|------|--------|---------|');
      for (const r of report.scenarioResults) {
        const status = r.passed ? 'PASS' : 'FAIL';
        md.push(`| ${r.name} | ${status} | ${r.details.slice(0, 80)} |`);
      }
      md.push('');

      const passed = report.scenarioResults.filter(r => r.passed).length;
      const total = report.scenarioResults.length;
      md.push(`**${passed}/${total} scenarios passed**`, '');
    }

    if (report.consoleErrorCount > 0) {
      md.push(`See \`errors.log\` for ${report.consoleErrorCount} console errors.`, '');
    }
    md.push('---', '');
  }

  writeFileSync(join(dir, 'report.md'), md.join('\n'), 'utf-8');
}
