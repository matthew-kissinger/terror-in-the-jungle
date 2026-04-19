import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

type CheckStatus = 'PASS' | 'FAIL';

interface CheckResult {
  name: string;
  status: CheckStatus;
  details: string;
}

const repoRoot = process.cwd();
const results: CheckResult[] = [];

function addResult(name: string, status: CheckStatus, details: string): void {
  results.push({ name, status, details });
}

function readTrimmedFile(path: string): string {
  return readFileSync(path, 'utf8').trim();
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function run(command: string, args: string[]): { ok: boolean; output: string } {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return {
    ok: result.status === 0,
    output,
  };
}

const expectedNode = readTrimmedFile(join(repoRoot, '.nvmrc'));
const currentNode = process.versions.node;
const expectedNodeMajor = expectedNode.split('.')[0];
const currentNodeMajor = currentNode.split('.')[0];

addResult(
  'Node version',
  currentNodeMajor === expectedNodeMajor ? 'PASS' : 'FAIL',
  `expected ${expectedNode}, found ${currentNode}`
);

const nodeModulesPath = join(repoRoot, 'node_modules');
addResult(
  'Dependencies',
  existsSync(nodeModulesPath) ? 'PASS' : 'FAIL',
  existsSync(nodeModulesPath) ? 'node_modules present' : 'run npm ci'
);

const playwrightPackagePath = join(repoRoot, 'node_modules', 'playwright', 'package.json');
if (existsSync(playwrightPackagePath)) {
  const playwrightVersion = JSON.parse(readFileSync(playwrightPackagePath, 'utf8')) as {
    version?: string;
  };
  addResult(
    'Playwright package',
    'PASS',
    `playwright ${playwrightVersion.version ?? 'unknown'} is installed`
  );
} else {
  addResult('Playwright package', 'FAIL', 'playwright package missing from node_modules');
}

const playwrightList =
  process.platform === 'win32'
    ? run('cmd.exe', ['/d', '/s', '/c', 'npx playwright install --list'])
    : run('npx', ['playwright', 'install', '--list']);
if (!playwrightList.ok) {
  addResult(
    'Playwright browsers',
    'FAIL',
    playwrightList.output || 'failed to query playwright browser installs'
  );
} else {
  const normalizedOutput = normalizeSlashes(playwrightList.output);
  const normalizedRepoRoot = normalizeSlashes(repoRoot);
  const hasRepoReference = normalizedOutput.includes(
    `${normalizedRepoRoot}/node_modules/playwright-core`
  );
  const hasChromium = /chromium[-_]\d+/.test(normalizedOutput);
  addResult(
    'Playwright browsers',
    hasRepoReference && hasChromium ? 'PASS' : 'FAIL',
    hasRepoReference && hasChromium
      ? 'chromium browser install detected for the repo-local Playwright package'
      : 'run npx playwright install chromium'
  );
}

for (const result of results) {
  console.log(`${result.status.padEnd(4)} ${result.name}: ${result.details}`);
}

const hasFailure = results.some((result) => result.status === 'FAIL');
if (hasFailure) {
  process.exitCode = 1;
  console.error('\nDoctor failed. Resolve the failing checks before starting an agent session.');
} else {
  console.log('\nDoctor passed.');
}
