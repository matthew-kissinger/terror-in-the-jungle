// Throwaway prototype for E3 decision memo.
//
// Scenario expressed: VC squad member decides whether to WITHDRAW when
//   - friendly suppression exceeds a faction threshold, AND
//   - terrain cover is available in the withdrawal direction.
//
// Paradigm: utility AI. Each candidate action scores itself on a small set of
// considerations; highest score wins. Contrast this with the state-machine
// path in src/systems/combat/ai/AIStateEngage.ts, where there is no state to
// return to for "withdraw" and no cross-squad suppression aggregation.
//
// Run: `node docs/rearch/E3-prototype/utility-withdraw.mjs`
// No dependencies, no build step. Emits a short trace of scored decisions.

// ---------- world fixtures ----------

/** @typedef {{
 *   id: string,
 *   faction: 'VC'|'NVA'|'US'|'ARVN',
 *   pos: [number, number],
 *   health: number,       // 0..1
 *   suppression: number,  // 0..1, blackboard-aggregated across squad
 *   inCover: boolean,
 * }} Unit
 */

const DOCTRINE = {
  VC:   { withdrawSuppressionThreshold: 0.35, withdrawHealthPivot: 0.55, aggression: 0.3 },
  NVA:  { withdrawSuppressionThreshold: 0.80, withdrawHealthPivot: 0.25, aggression: 0.8 },
  US:   { withdrawSuppressionThreshold: 0.60, withdrawHealthPivot: 0.40, aggression: 0.6 },
  ARVN: { withdrawSuppressionThreshold: 0.55, withdrawHealthPivot: 0.45, aggression: 0.5 },
};

// Synthetic terrain: a patchy cover lookup. Returns true if there is
// concealment within `radius` around `pos` in the requested bearing.
const COVER_PATCHES = [
  { cx:  20, cz:   5, r: 6 },
  { cx: -30, cz: -15, r: 8 },
  { cx: -5, cz:  25, r: 5 },
];
function hasCoverNear(pos, bearingRad, radius) {
  const probe = [pos[0] + Math.cos(bearingRad) * radius, pos[1] + Math.sin(bearingRad) * radius];
  return COVER_PATCHES.some(p => {
    const dx = probe[0] - p.cx, dz = probe[1] - p.cz;
    return (dx*dx + dz*dz) <= p.r * p.r;
  });
}

function bearingAwayFromThreat(self, threat) {
  const dx = self.pos[0] - threat.pos[0];
  const dz = self.pos[1] - threat.pos[1];
  return Math.atan2(dz, dx);
}

// ---------- considerations ----------

// Each returns a score in [0, 1]. Linear curves here; in a real build these
// would be tunable curves per faction.
function suppressionUtility(self) {
  const d = DOCTRINE[self.faction];
  // Above threshold, withdraw utility climbs fast. Below, it stays near zero.
  return Math.max(0, (self.suppression - d.withdrawSuppressionThreshold) /
                       (1 - d.withdrawSuppressionThreshold));
}

function healthUtility(self) {
  const d = DOCTRINE[self.faction];
  // Below pivot, pressure to withdraw rises. Above pivot, no pressure.
  if (self.health >= d.withdrawHealthPivot) return 0;
  return (d.withdrawHealthPivot - self.health) / d.withdrawHealthPivot;
}

// Hard gate: withdrawal only scores if a cover-bearing path exists.
// Without this, the consideration model would still happily "withdraw into
// open ground," which is the failure mode we observed in the state-machine
// attempt below.
function coverGateUtility(self, threat) {
  const bearing = bearingAwayFromThreat(self, threat);
  return hasCoverNear(self.pos, bearing, 12) ? 1 : 0;
}

function aggressionUtility(self) {
  return DOCTRINE[self.faction].aggression;
}

// ---------- actions ----------

const ACTIONS = [
  {
    name: 'engage',
    score: (self) => aggressionUtility(self) * (1 - 0.5 * self.suppression),
  },
  {
    name: 'seek_cover',
    score: (self) => {
      // Useful when suppression is high but withdrawal isn't warranted yet.
      const d = DOCTRINE[self.faction];
      const nearBreakpoint = Math.max(0, self.suppression - d.withdrawSuppressionThreshold * 0.5);
      return self.inCover ? 0 : nearBreakpoint * 0.55;
    },
  },
  {
    name: 'withdraw',
    score: (self, threat) => {
      // Weighted average of pressures, hard-gated by cover availability.
      const suppr = suppressionUtility(self);
      const hp    = healthUtility(self);
      const gate  = coverGateUtility(self, threat);
      // If the gate is 0, withdraw scores 0 no matter the pressure.
      // This is the scenario the state machine cannot cleanly express
      // because the gate requires a compound (direction-aware) check.
      // Withdraw dominates seek_cover once above threshold AND gated by cover,
      // because leaving the fight entirely beats repositioning within it.
      const base = 0.8 * suppr + 0.35 * hp;
      return gate * base;
    },
  },
];

function chooseAction(self, threat) {
  const scored = ACTIONS.map(a => ({ name: a.name, score: a.score(self, threat) }));
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ---------- scenarios ----------

const threat = { id: 'player', faction: 'US', pos: [0, 0], health: 1, suppression: 0, inCover: true };

// Cases 1-3 are the headline behaviors. Cases 4-5 contrast NVA doctrine.
// Unit pos picked so bearing-away-from-threat (player at origin) either lands
// on a cover patch or does not. Cover patches: (20,5)r6, (-30,-15)r8, (-5,25)r5.
// Unit at (-15, -8) flees toward (-inf, -inf) -> probes land near (-30,-15) cover.
// Unit at (60, 60)   flees toward (+inf, +inf) -> probes land on open ground.
const cases = [
  { label: 'VC, light pressure, good health (should engage)',
    self: { id: 'vc1', faction: 'VC', pos: [-15, -8], health: 0.9, suppression: 0.2, inCover: false } },
  { label: 'VC, above threshold, cover patch in withdraw bearing (should withdraw)',
    self: { id: 'vc2', faction: 'VC', pos: [-15, -8], health: 0.7, suppression: 0.6, inCover: false } },
  { label: 'VC, above threshold, NO cover in withdraw bearing (should seek_cover, not withdraw)',
    self: { id: 'vc3', faction: 'VC', pos: [60, 60], health: 0.7, suppression: 0.6, inCover: false } },
  { label: 'NVA, same pressure as VC breakpoint (should still engage)',
    self: { id: 'nva1', faction: 'NVA', pos: [-15, -8], health: 0.7, suppression: 0.6, inCover: false } },
  { label: 'NVA, heavy pressure + low health + cover in bearing (finally withdraws)',
    self: { id: 'nva2', faction: 'NVA', pos: [-15, -8], health: 0.2, suppression: 0.9, inCover: false } },
];

console.log('E3 prototype — utility AI withdrawal decision');
console.log('-------------------------------------------------');
for (const c of cases) {
  const ranking = chooseAction(c.self, threat);
  const top = ranking[0];
  console.log(`\n${c.label}`);
  console.log(`  faction=${c.self.faction}  hp=${c.self.health}  suppr=${c.self.suppression}`);
  console.log(`  -> chose: ${top.name}  (score=${top.score.toFixed(3)})`);
  console.log(`  ranked: ${ranking.map(r => `${r.name}=${r.score.toFixed(2)}`).join(', ')}`);
}
