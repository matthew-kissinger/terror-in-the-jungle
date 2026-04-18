/**
 * perf-active-driver (v2) — thin scenario launcher.
 *
 * Delegates to the declarative harness under `src/dev/harness/` (loaded via
 * `window.__harness`). Legacy keys are returned so `scripts/perf-capture.ts`
 * can log start/stop diagnostics without changes. A `result.overall==='fail'`
 * means validators failed; perf-capture must treat that as non-comparable.
 * See docs/tasks/perf-harness-architecture.md.
 */
(function () {
  const W = window;
  const MODE_TO_SCENARIO = {
    ai_sandbox: 'combat120',
    open_frontier: 'openfrontier-short',
    a_shau_valley: 'ashau-short',
    zone_control: 'combat120',
    team_deathmatch: 'combat120',
  };

  function resolveScenarioId(opts) {
    if (opts && typeof opts.scenarioId === 'string' && opts.scenarioId.length > 0) return opts.scenarioId;
    return MODE_TO_SCENARIO[String((opts && opts.mode) || '').toLowerCase()] || 'combat120';
  }

  function start(options) {
    if (!W.__harness || !W.__harness.runScenario || !W.__harness.createAgentFromEngine) {
      throw new Error('[perf-active-driver] window.__harness missing — build with VITE_PERF_HARNESS=1');
    }
    const scenarioId = resolveScenarioId(options || {});
    const scenario = W.__harness.findScenario(scenarioId);
    if (!scenario) throw new Error('[perf-active-driver] unknown scenario id "' + scenarioId + '"');
    const agent = W.__harness.createAgentFromEngine();
    const state = { scenarioId: scenarioId, mode: scenario.map, agent: agent, startedAt: Date.now(), result: null, running: true, error: null };
    state.runPromise = W.__harness.runScenario({ scenario: scenario, agent: agent })
      .then(function (r) { state.result = r; state.running = false; return r; })
      .catch(function (err) { state.running = false; state.error = (err && err.message) || String(err); return null; });
    return { scenarioId: scenarioId, mode: scenario.map, durationSec: scenario.durationSec, state: state, getDebugSnapshot: snapshot };
  }

  function stop() {
    const active = W.__perfHarnessDriverState;
    if (!active || !active.state) return null;
    try { active.state.agent.release(); } catch { /* ignore */ }
    const r = active.state.result;
    return {
      scenarioId: active.state.scenarioId,
      mode: active.state.mode,
      durationMs: Date.now() - active.state.startedAt,
      overall: r ? r.overall : 'pending',
      observations: r ? r.observations : null,
      validators: r ? r.validators : null,
      error: active.state.error,
      respawnCount: 0, ammoRefillCount: 0, healthTopUpCount: 0,
      frontlineCompressed: false, frontlineDistance: 0, frontlineMoveCount: 0,
      capturedZoneCount: 0, movementTransitions: 0,
    };
  }

  function snapshot() {
    const active = W.__perfHarnessDriverState;
    if (!active || !active.state) return null;
    const r = active.state.result;
    return {
      scenarioId: active.state.scenarioId,
      mode: active.state.mode,
      running: active.state.running,
      observations: r ? r.observations : null,
      validators: r ? r.validators : null,
      error: active.state.error,
    };
  }

  W.__perfHarnessDriver = {
    start: function (options) {
      if (W.__perfHarnessDriverState) { try { stop(); } catch { /* ignore */ } W.__perfHarnessDriverState = null; }
      const d = start(options || {});
      W.__perfHarnessDriverState = d;
      return {
        scenarioId: d.scenarioId, mode: d.mode, durationSec: d.durationSec,
        movementPatternCount: 0, compressFrontline: false, allowWarpRecovery: false,
        topUpHealth: true, autoRespawn: true,
      };
    },
    stop: function () { const s = stop(); W.__perfHarnessDriverState = null; return s; },
    getDebugSnapshot: snapshot,
  };
})();
