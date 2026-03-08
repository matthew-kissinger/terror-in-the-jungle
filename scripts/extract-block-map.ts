/**
 * Procedural codebase block map extractor.
 * Parses imports, exports, setter injections, and update chains
 * to produce a structured JSON graph of all blocks and their relationships.
 *
 * Usage: npx tsx scripts/extract-block-map.ts
 * Output: artifacts/block-map.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC = path.resolve(__dirname, '../src');
const OUT = path.resolve(__dirname, '../artifacts/block-map.json');

interface FileInfo {
  relPath: string;          // e.g. "systems/combat/CombatantSystem.ts"
  classes: ClassInfo[];
  imports: ImportInfo[];
  singletons: string[];     // exported const singletons
  implementsGameSystem: boolean;
}

interface ClassInfo {
  name: string;
  exported: boolean;
  extendsClass?: string;
  implementsInterfaces: string[];
  setterMethods: string[];  // setFoo -> "Foo"
  publicMethods: string[];
  line: number;
}

interface ImportInfo {
  names: string[];          // imported symbols
  source: string;           // relative path as written
  resolvedPath?: string;    // resolved to src-relative
  isTypeOnly: boolean;
}

interface BlockNode {
  id: string;               // canonical: "Combat/CombatantSystem"
  className: string;
  filePath: string;
  domain: string;
  isGameSystem: boolean;
  isSingleton: boolean;
  isDeferred: boolean;
  tickGroup?: string;
  tickBudgetMs?: number;
  setterDeps: string[];     // what this block receives via setters
  importDeps: string[];     // what this block imports (classes only)
  internalModules: string[];// subsystem classes in same domain
}

interface WiringEdge {
  source: string;           // SystemConnector target (who receives)
  target: string;           // what is injected
  method: string;           // setter method name
  line: number;
}

// --- File parsing ---

function walkDir(dir: string, ext: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...walkDir(full, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext) && !entry.name.includes('.test.')) {
      results.push(full);
    }
  }
  return results;
}

function parseFile(filePath: string): FileInfo {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relPath = path.relative(SRC, filePath).replace(/\\/g, '/');

  const imports: ImportInfo[] = [];
  const classes: ClassInfo[] = [];
  const singletons: string[] = [];
  let implementsGameSystem = false;

  // Parse imports
  const importRe = /^import\s+(type\s+)?(\{[^}]+\}|[\w]+)\s+from\s+['"]([^'"]+)['"]/;
  for (const line of lines) {
    const m = line.match(importRe);
    if (m) {
      const isTypeOnly = !!m[1];
      const rawNames = m[2].replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean);
      const source = m[3];
      imports.push({ names: rawNames, source, isTypeOnly });
    }
  }

  // Parse class declarations
  const classRe = /^export\s+class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(classRe);
    if (m) {
      const name = m[1];
      const extendsClass = m[2];
      const implementsRaw = m[3]?.split(',').map(s => s.trim()).filter(Boolean) || [];
      if (implementsRaw.includes('GameSystem')) implementsGameSystem = true;

      // Scan class body for setter methods
      const setterMethods: string[] = [];
      const publicMethods: string[] = [];
      let braceDepth = 0;
      let inClass = false;
      for (let j = i; j < lines.length; j++) {
        const line = lines[j];
        for (const ch of line) {
          if (ch === '{') { braceDepth++; inClass = true; }
          if (ch === '}') braceDepth--;
        }
        if (inClass && braceDepth === 1) {
          const setterMatch = line.match(/^\s+(?:public\s+)?set([A-Z]\w*)\s*\(/);
          if (setterMatch) setterMethods.push(setterMatch[1]);
          const methodMatch = line.match(/^\s+(?:public\s+)(\w+)\s*\(/);
          if (methodMatch && !methodMatch[1].startsWith('set') && !methodMatch[1].startsWith('_')
              && !['constructor', 'init', 'update', 'dispose'].includes(methodMatch[1])) {
            publicMethods.push(methodMatch[1]);
          }
        }
        if (inClass && braceDepth === 0) break;
      }

      classes.push({
        name,
        exported: true,
        extendsClass,
        implementsInterfaces: implementsRaw,
        setterMethods,
        publicMethods,
        line: i + 1,
      });
    }
  }

  // Parse singleton exports
  const singletonRe = /^export\s+const\s+(\w+)\s*=\s*(?:new\s+\w+|[\w]+\.getInstance)\s*\(/;
  for (const line of lines) {
    const m = line.match(singletonRe);
    if (m) singletons.push(m[1]);
  }

  return { relPath, classes, imports, singletons, implementsGameSystem };
}

// --- SystemConnector wiring extraction ---

function extractWiring(connectorPath: string): WiringEdge[] {
  const content = fs.readFileSync(connectorPath, 'utf-8');
  const lines = content.split('\n');
  const edges: WiringEdge[] = [];

  // Pattern: refs.target.setMethod(refs.injected)
  const wireRe = /refs\.(\w+)\.set(\w+)\(refs\.(\w+)/;
  // Pattern: refs.target.setMethod(refs.source.getX())
  const wireGetRe = /refs\.(\w+)\.set(\w+)\(refs\.(\w+)\.\w+\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(wireRe) || line.match(wireGetRe);
    if (m) {
      edges.push({
        source: m[1],       // who receives the dependency
        target: m[3],       // what is injected
        method: `set${m[2]}`,
        line: i + 1,
      });
    }
  }

  return edges;
}

// --- Domain classification ---

function classifyDomain(relPath: string): string {
  if (relPath.startsWith('core/')) return 'Core';
  if (relPath.startsWith('config/')) return 'Config';
  if (relPath.startsWith('systems/combat/ai/')) return 'Combat/AI';
  if (relPath.startsWith('systems/combat/')) return 'Combat';
  if (relPath.startsWith('systems/terrain/')) return 'Terrain';
  if (relPath.startsWith('systems/strategy/')) return 'Strategy';
  if (relPath.startsWith('systems/player/weapon/')) return 'Player/Weapon';
  if (relPath.startsWith('systems/player/')) return 'Player';
  if (relPath.startsWith('systems/helicopter/')) return 'Vehicle';
  if (relPath.startsWith('systems/weapons/')) return 'Weapons';
  if (relPath.startsWith('systems/audio/')) return 'Audio';
  if (relPath.startsWith('systems/effects/')) return 'Effects';
  if (relPath.startsWith('systems/environment/')) return 'Environment';
  if (relPath.startsWith('systems/world/billboard/')) return 'World/Billboard';
  if (relPath.startsWith('systems/world/')) return 'World';
  if (relPath.startsWith('systems/input/')) return 'Input';
  if (relPath.startsWith('systems/assets/')) return 'Assets';
  if (relPath.startsWith('systems/debug/')) return 'Debug';
  if (relPath.startsWith('ui/hud/')) return 'UI/HUD';
  if (relPath.startsWith('ui/controls/')) return 'UI/Controls';
  if (relPath.startsWith('ui/minimap/')) return 'UI/Minimap';
  if (relPath.startsWith('ui/map/')) return 'UI/Map';
  if (relPath.startsWith('ui/compass/')) return 'UI/Compass';
  if (relPath.startsWith('ui/loading/')) return 'UI/Loading';
  if (relPath.startsWith('ui/loadout/')) return 'UI/Loadout';
  if (relPath.startsWith('ui/end/')) return 'UI/End';
  if (relPath.startsWith('ui/layout/')) return 'UI/Layout';
  if (relPath.startsWith('ui/design/')) return 'UI/Design';
  if (relPath.startsWith('ui/debug/')) return 'UI/Debug';
  if (relPath.startsWith('ui/')) return 'UI';
  if (relPath.startsWith('utils/')) return 'Utils';
  if (relPath.startsWith('workers/')) return 'Workers';
  if (relPath.startsWith('types/')) return 'Types';
  return 'Other';
}

// --- Tick group mapping ---

const TICK_GROUPS: Record<string, { group: string; budgetMs: number }> = {
  'combatantSystem': { group: 'Combat', budgetMs: 5.0 },
  'chunkManager': { group: 'Terrain', budgetMs: 2.0 },
  'globalBillboardSystem': { group: 'Billboards', budgetMs: 2.0 },
  'playerController': { group: 'Player', budgetMs: 1.0 },
  'firstPersonWeapon': { group: 'Player', budgetMs: 1.0 },
  'grenadeSystem': { group: 'Weapons', budgetMs: 1.0 },
  'mortarSystem': { group: 'Weapons', budgetMs: 1.0 },
  'sandbagSystem': { group: 'Weapons', budgetMs: 1.0 },
  'ammoSupplySystem': { group: 'Weapons', budgetMs: 1.0 },
  'hudSystem': { group: 'HUD', budgetMs: 1.0 },
  'minimapSystem': { group: 'TacticalUI', budgetMs: 0.5 },
  'fullMapSystem': { group: 'TacticalUI', budgetMs: 0.5 },
  'compassSystem': { group: 'TacticalUI', budgetMs: 0.5 },
  'warSimulator': { group: 'WarSim', budgetMs: 2.0 },
  'strategicFeedback': { group: 'WarSim', budgetMs: 2.0 },
  'zoneManager': { group: 'World', budgetMs: 1.0 },
  'ticketSystem': { group: 'World', budgetMs: 1.0 },
  'weatherSystem': { group: 'World', budgetMs: 1.0 },
  'waterSystem': { group: 'World', budgetMs: 1.0 },
};

const DEFERRED_SYSTEMS = new Set([
  'HelipadSystem', 'HelicopterModel'
]);

// --- Main ---

function main() {
  const files = walkDir(SRC, '.ts');
  const parsed = files.map(parseFile);

  // Build class -> file lookup
  const classToFile = new Map<string, FileInfo>();
  const classToPath = new Map<string, string>();
  for (const f of parsed) {
    for (const c of f.classes) {
      classToFile.set(c.name, f);
      classToPath.set(c.name, f.relPath);
    }
  }

  // Build SystemReferences field -> className lookup
  const refsFieldToClass = new Map<string, string>();
  // Read SystemInitializer to get refs.field = new ClassName() mappings
  const initFile = fs.readFileSync(path.join(SRC, 'core/SystemInitializer.ts'), 'utf-8');
  const refAssignRe = /refs\.(\w+)\s*=\s*(?:new\s+(\w+)|(\w+))\s*[;(]/g;
  let match;
  while ((match = refAssignRe.exec(initFile)) !== null) {
    const field = match[1];
    const className = match[2] || match[3];
    if (className && className !== 'spatialGridManager') {
      refsFieldToClass.set(field, className);
    } else if (match[3] === 'spatialGridManager') {
      refsFieldToClass.set(field, 'SpatialGridManager');
    }
  }

  // Extract wiring edges
  const connectorPath = path.join(SRC, 'core/SystemConnector.ts');
  const wiring = extractWiring(connectorPath);

  // Resolve wiring edges to class names
  const wiringResolved = wiring.map(e => ({
    ...e,
    sourceClass: refsFieldToClass.get(e.source) || e.source,
    targetClass: refsFieldToClass.get(e.target) || e.target,
  }));

  // Build block nodes
  const blocks: BlockNode[] = [];
  for (const f of parsed) {
    for (const c of f.classes) {
      if (!c.exported) continue;
      const domain = classifyDomain(f.relPath);
      const refField = [...refsFieldToClass.entries()].find(([_, cls]) => cls === c.name)?.[0];
      const tick = refField ? TICK_GROUPS[refField] : undefined;

      // Find setter dependencies from wiring
      const setterDeps = wiringResolved
        .filter(e => e.sourceClass === c.name)
        .map(e => e.targetClass);

      // Find import dependencies (class-level only)
      const importDeps = f.imports
        .filter(imp => !imp.isTypeOnly)
        .flatMap(imp => imp.names)
        .filter(name => classToFile.has(name) && name !== c.name);

      const isSingleton = f.singletons.length > 0
        || c.name === 'SettingsManager'
        || c.name === 'InputContextManager'
        || c.name === 'ViewportManager'
        || c.name === 'PerformanceTelemetry';

      blocks.push({
        id: `${domain}/${c.name}`,
        className: c.name,
        filePath: f.relPath,
        domain,
        isGameSystem: c.implementsInterfaces.includes('GameSystem'),
        isSingleton,
        isDeferred: DEFERRED_SYSTEMS.has(c.name),
        tickGroup: tick?.group,
        tickBudgetMs: tick?.budgetMs,
        setterDeps: [...new Set(setterDeps)],
        importDeps: [...new Set(importDeps)],
        internalModules: [],
      });
    }
  }

  // Group internal modules under their domain orchestrator
  const orchestrators: Record<string, string> = {
    'Combat': 'CombatantSystem',
    'Combat/AI': 'CombatantSystem',
    'Terrain': 'ImprovedChunkManager',
    'Strategy': 'WarSimulator',
    'Player': 'PlayerController',
    'Player/Weapon': 'FirstPersonWeapon',
    'Vehicle': 'HelicopterModel',
    'World': 'GameModeManager',
    'World/Billboard': 'GlobalBillboardSystem',
    'Audio': 'AudioManager',
    'UI/HUD': 'HUDSystem',
    'Effects': 'CombatantSystem',
  };

  for (const block of blocks) {
    const orchestratorName = orchestrators[block.domain];
    if (orchestratorName && block.className !== orchestratorName && !block.isGameSystem) {
      const orch = blocks.find(b => b.className === orchestratorName);
      if (orch) {
        orch.internalModules.push(block.className);
      }
    }
  }

  // Aggregate stats
  const stats = {
    totalFiles: parsed.length,
    totalClasses: blocks.length,
    gameSystems: blocks.filter(b => b.isGameSystem).length,
    singletons: blocks.filter(b => b.isSingleton).length,
    deferredSystems: blocks.filter(b => b.isDeferred).length,
    wiringEdges: wiringResolved.length,
    domains: [...new Set(blocks.map(b => b.domain))].sort(),
    tickGroups: Object.keys(TICK_GROUPS).length,
  };

  // Domain summaries
  const domainSummaries: Record<string, { classes: number; gameSystems: string[]; otherClasses: string[] }> = {};
  for (const block of blocks) {
    if (!domainSummaries[block.domain]) {
      domainSummaries[block.domain] = { classes: 0, gameSystems: [], otherClasses: [] };
    }
    domainSummaries[block.domain].classes++;
    if (block.isGameSystem) domainSummaries[block.domain].gameSystems.push(block.className);
    else domainSummaries[block.domain].otherClasses.push(block.className);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    stats,
    domainSummaries,
    blocks: blocks.sort((a, b) => a.id.localeCompare(b.id)),
    wiring: wiringResolved,
    refsFieldMapping: Object.fromEntries(refsFieldToClass),
    tickGroups: TICK_GROUPS,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`Block map written to ${OUT}`);
  console.log(`Stats:`, JSON.stringify(stats, null, 2));
}

main();
