// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

(function () {
  const globalWindow = window;
  const MAX_RECENT_ENTRIES = 32;
  const supports = {
    longtask: false,
    longAnimationFrame: false,
    measure: false,
    webglTextureUpload: false,
    rafCadence: false,
    resourceTiming: false
  };
  const totals = {
    longTaskCount: 0,
    longTaskTotalDurationMs: 0,
    longTaskMaxDurationMs: 0,
    longAnimationFrameCount: 0,
    longAnimationFrameTotalDurationMs: 0,
    longAnimationFrameMaxDurationMs: 0,
    longAnimationFrameBlockingDurationMs: 0,
    resourceCount: 0,
    resourceTotalDurationMs: 0,
    resourceMaxDurationMs: 0,
    resourceTransferSizeBytes: 0,
    webglTextureUploadCount: 0,
    webglTextureUploadTotalDurationMs: 0,
    webglTextureUploadMaxDurationMs: 0,
    webglTextureUploadByOperation: Object.create(null),
    rafCadence: {
      intervalCount: 0,
      totalGapMs: 0,
      maxGapMs: 0,
      stutter25Count: 0,
      hitch33Count: 0,
      hitch50Count: 0,
      hitch100Count: 0,
      overBudget60HzMs: 0,
      droppedFrameTime60HzMs: 0,
      estimatedDropped60HzFrames: 0
    },
    userTimingByName: Object.create(null)
  };
  const recent = {
    longTasks: [],
    longAnimationFrames: [],
    resources: [],
    webglTextureUploads: [],
    webglTextureUploadTop: [],
    rafCadence: [],
    userTimingByName: Object.create(null)
  };
  function createBoundedRing(capacity) {
    const entries = new Array(capacity);
    let writeIndex = 0;
    let count = 0;

    function snapshotLatest(limit) {
      if (!(limit > 0) || count === 0) {
        return [];
      }
      const outputCount = Math.min(count, Math.floor(limit));
      const output = new Array(outputCount);
      const start = (writeIndex - outputCount + capacity) % capacity;
      for (let i = 0; i < outputCount; i++) {
        output[i] = entries[(start + i) % capacity];
      }
      return output;
    }

    return {
      push: function (entry) {
        entries[writeIndex] = entry;
        writeIndex = (writeIndex + 1) % capacity;
        if (count < capacity) {
          count += 1;
        }
      },
      clear: function () {
        writeIndex = 0;
        count = 0;
      },
      snapshotLatest: snapshotLatest,
      snapshotSince: function (sinceSeq, limit) {
        const outputLimit = Math.min(count, Math.max(0, Math.floor(Number(limit) || 0)));
        if (outputLimit <= 0 || count === 0) {
          return [];
        }
        const thresholdSeq = Number(sinceSeq || 0);
        if (!(thresholdSeq > 0)) {
          return snapshotLatest(outputLimit);
        }
        const start = (writeIndex - count + capacity) % capacity;
        let matchingCount = 0;
        for (let i = 0; i < count; i++) {
          const entry = entries[(start + i) % capacity];
          if (Number(entry?.seq || 0) > thresholdSeq) {
            matchingCount += 1;
          }
        }
        const outputCount = Math.min(outputLimit, matchingCount);
        if (outputCount <= 0) {
          return [];
        }
        const output = new Array(outputCount);
        let skipped = matchingCount - outputCount;
        let outputIndex = 0;
        for (let i = 0; i < count; i++) {
          const entry = entries[(start + i) % capacity];
          if (Number(entry?.seq || 0) <= thresholdSeq) {
            continue;
          }
          if (skipped > 0) {
            skipped -= 1;
            continue;
          }
          output[outputIndex] = entry;
          outputIndex += 1;
        }
        return output;
      }
    };
  }

  const observers = [];
  const MAX_ATTRIBUTION_ENTRIES = 8;
  const MAX_SCRIPT_ENTRIES = 8;
  const MAX_RESOURCE_ENTRIES = 64;
  const MAX_WEBGL_UPLOAD_ENTRIES = 128;
  const TARGET_60HZ_FRAME_MS = 1000 / 60;
  const RAF_STUTTER_25_MS = 25;
  const RAF_HITCH_33_MS = 33.33;
  const RAF_HITCH_50_MS = 50;
  const RAF_HITCH_100_MS = 100;
  const MAX_PRESENTATION_EPOCHS = 4096;
  const presentationEpochs = createBoundedRing(MAX_PRESENTATION_EPOCHS);
  const TEXTURE_2D = 3553;
  const TEXTURE_CUBE_MAP = 34067;
  const TEXTURE_CUBE_MAP_POSITIVE_X = 34069;
  const TEXTURE_CUBE_MAP_NEGATIVE_Z = 34074;
  const TEXTURE_3D = 32879;
  const TEXTURE_2D_ARRAY = 35866;
  const TEXTURE0 = 33984;
  const webglTextureIds = new WeakMap();
  const webglContextState = new WeakMap();
  let nextWebglTextureId = 1;
  let nextPresentationEpochSeq = 1;
  let lastRafTimestamp = null;
  let rafHandle = 0;

  function trimBoundedArray(list, maxEntries) {
    if (!Array.isArray(list) || list.length <= maxEntries) {
      return;
    }
    const overflow = list.length - maxEntries;
    list.copyWithin(0, overflow);
    list.length = maxEntries;
  }

  function trimRecent(list) {
    trimBoundedArray(list, MAX_RECENT_ENTRIES);
  }

  function trimWebglUploads() {
    trimBoundedArray(recent.webglTextureUploads, MAX_WEBGL_UPLOAD_ENTRIES);
  }

  function pushTopWebglUpload(entry) {
    const list = recent.webglTextureUploadTop;
    let insertAt = list.length;
    for (let i = 0; i < list.length; i++) {
      if (Number(entry.duration || 0) > Number(list[i].duration || 0)) {
        insertAt = i;
        break;
      }
    }
    if (insertAt >= MAX_RECENT_ENTRIES && list.length >= MAX_RECENT_ENTRIES) {
      return;
    }
    const nextLength = Math.min(list.length + 1, MAX_RECENT_ENTRIES);
    for (let i = nextLength - 1; i > insertAt; i--) {
      list[i] = list[i - 1];
    }
    list[insertAt] = entry;
    list.length = nextLength;
  }

  function pushLongTask(entry) {
    const plain = {
      name: String(entry.name || 'longtask'),
      startTime: Number(entry.startTime || 0),
      duration: Number(entry.duration || 0),
      attribution: summarizeAttribution(entry.attribution)
    };
    recent.longTasks.push(plain);
    trimRecent(recent.longTasks);
    totals.longTaskCount += 1;
    totals.longTaskTotalDurationMs += plain.duration;
    if (plain.duration > totals.longTaskMaxDurationMs) {
      totals.longTaskMaxDurationMs = plain.duration;
    }
  }

  function pushLongAnimationFrame(entry) {
    const duration = Number(entry.duration || 0);
    const blockingDuration = Number(entry.blockingDuration || Math.max(0, duration - 50));
    const plain = {
      startTime: Number(entry.startTime || 0),
      duration: duration,
      blockingDuration: blockingDuration,
      renderStart: Number(entry.renderStart || 0),
      styleAndLayoutStart: Number(entry.styleAndLayoutStart || 0),
      firstUIEventTimestamp: Number(entry.firstUIEventTimestamp || 0),
      scripts: summarizeScripts(entry.scripts)
    };
    recent.longAnimationFrames.push(plain);
    trimRecent(recent.longAnimationFrames);
    totals.longAnimationFrameCount += 1;
    totals.longAnimationFrameTotalDurationMs += duration;
    totals.longAnimationFrameBlockingDurationMs += blockingDuration;
    if (duration > totals.longAnimationFrameMaxDurationMs) {
      totals.longAnimationFrameMaxDurationMs = duration;
    }
  }

  function pushResource(entry) {
    const duration = Number(entry.duration || 0);
    const transferSize = Number(entry.transferSize || 0);
    const plain = {
      name: String(entry.name || ''),
      initiatorType: String(entry.initiatorType || ''),
      startTime: Number(entry.startTime || 0),
      responseEnd: Number(entry.responseEnd || 0),
      duration: duration,
      transferSize: transferSize,
      encodedBodySize: Number(entry.encodedBodySize || 0),
      decodedBodySize: Number(entry.decodedBodySize || 0),
      renderBlockingStatus: String(entry.renderBlockingStatus || '')
    };

    recent.resources.push(plain);
    trimBoundedArray(recent.resources, MAX_RESOURCE_ENTRIES);
    totals.resourceCount += 1;
    totals.resourceTotalDurationMs += duration;
    totals.resourceTransferSizeBytes += transferSize;
    if (duration > totals.resourceMaxDurationMs) {
      totals.resourceMaxDurationMs = duration;
    }
  }

  function pushRafCadenceGap(timestamp) {
    if (lastRafTimestamp === null) {
      lastRafTimestamp = timestamp;
      return;
    }

    const gapMs = Number(timestamp - lastRafTimestamp);
    lastRafTimestamp = timestamp;
    if (!Number.isFinite(gapMs) || gapMs < 0) {
      return;
    }

    const estimatedDropped60HzFrames = gapMs > TARGET_60HZ_FRAME_MS * 1.5
      ? Math.max(1, Math.round(gapMs / TARGET_60HZ_FRAME_MS) - 1)
      : 0;
    const overBudget60HzMs = Math.max(0, gapMs - TARGET_60HZ_FRAME_MS);
    const droppedFrameTime60HzMs = estimatedDropped60HzFrames > 0
      ? overBudget60HzMs
      : 0;
    const stutter25 = gapMs > RAF_STUTTER_25_MS;
    const hitch33 = gapMs > RAF_HITCH_33_MS;
    const hitch50 = gapMs > RAF_HITCH_50_MS;
    const hitch100 = gapMs > RAF_HITCH_100_MS;

    totals.rafCadence.intervalCount += 1;
    totals.rafCadence.totalGapMs += gapMs;
    totals.rafCadence.maxGapMs = Math.max(totals.rafCadence.maxGapMs, gapMs);
    if (stutter25) totals.rafCadence.stutter25Count += 1;
    if (hitch33) totals.rafCadence.hitch33Count += 1;
    if (hitch50) totals.rafCadence.hitch50Count += 1;
    if (hitch100) totals.rafCadence.hitch100Count += 1;
    totals.rafCadence.overBudget60HzMs += overBudget60HzMs;
    totals.rafCadence.droppedFrameTime60HzMs += droppedFrameTime60HzMs;
    totals.rafCadence.estimatedDropped60HzFrames += estimatedDropped60HzFrames;

    if (stutter25 || estimatedDropped60HzFrames > 0) {
      const presentationContext = readPresentationContext();
      const harnessContext = readHarnessContext();
      const presentationEpoch = {
        seq: nextPresentationEpochSeq++,
        startAtMs: Number(timestamp - gapMs),
        endAtMs: Number(timestamp || 0),
        gapMs: gapMs,
        estimatedDropped60HzFrames: estimatedDropped60HzFrames,
        overBudget60HzMs: overBudget60HzMs,
        droppedFrameTime60HzMs: droppedFrameTime60HzMs,
        stutter25: stutter25,
        hitch33: hitch33,
        hitch50: hitch50,
        hitch100: hitch100,
        engineFrameCount: readEngineFrameCount(),
        wallAtMs: Date.now(),
        visibilityState: String(document.visibilityState || ''),
        presentationContext: presentationContext,
        harnessContext: harnessContext
      };
      presentationEpochs.push(presentationEpoch);
      recent.rafCadence.push({
        atMs: presentationEpoch.endAtMs,
        gapMs: presentationEpoch.gapMs,
        estimatedDropped60HzFrames: presentationEpoch.estimatedDropped60HzFrames,
        overBudget60HzMs: presentationEpoch.overBudget60HzMs,
        droppedFrameTime60HzMs: presentationEpoch.droppedFrameTime60HzMs,
        stutter25: presentationEpoch.stutter25,
        hitch33: presentationEpoch.hitch33,
        hitch50: presentationEpoch.hitch50,
        hitch100: presentationEpoch.hitch100,
        presentationContext: presentationContext,
        harnessContext: harnessContext
      });
      trimRecent(recent.rafCadence);
    }
  }

  function readEngineFrameCount() {
    try {
      const value = Number(globalWindow.__metrics?.frameCount ?? NaN);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  function clonePlain(value) {
    if (!value || typeof value !== 'object') {
      return null;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  function readPresentationContext() {
    try {
      const context = globalWindow.__presentationEpochContext?.getLatestContext?.();
      return clonePlain(context);
    } catch {
      return null;
    }
  }

  function readHarnessContext() {
    try {
      const state = globalWindow.__perfHarnessDriverState?.getDebugSnapshot?.();
      if (!state || typeof state !== 'object') {
        return null;
      }
      const weaponHarness = state.weaponHarness && typeof state.weaponHarness === 'object'
        ? state.weaponHarness
        : null;
      const ammoState = weaponHarness?.ammoState && typeof weaponHarness.ammoState === 'object'
        ? weaponHarness.ammoState
        : null;
      const runtimeLiveness = state.runtimeLiveness && typeof state.runtimeLiveness === 'object'
        ? state.runtimeLiveness
        : null;
      return {
        botState: String(state.botState ?? state.movementState ?? ''),
        objectiveKind: state.objectiveKind ?? null,
        objectiveDistance: Number.isFinite(Number(state.objectiveDistance)) ? Number(state.objectiveDistance) : null,
        currentTargetDistance: Number.isFinite(Number(state.currentTargetDistance)) ? Number(state.currentTargetDistance) : null,
        lastTargetLosStatus: state.lastTargetLosStatus ?? null,
        lastTargetLosReason: state.lastTargetLosReason ?? null,
        lastFireLosStatus: state.lastFireLosStatus ?? null,
        lastFireLosReason: state.lastFireLosReason ?? null,
        lastCurrentTargetLive: typeof state.lastCurrentTargetLive === 'boolean' ? state.lastCurrentTargetLive : null,
        lastCurrentTargetHealth: Number.isFinite(Number(state.lastCurrentTargetHealth)) ? Number(state.lastCurrentTargetHealth) : null,
        droppedDeadTargetLocks: Number(state.droppedDeadTargetLocks ?? 0),
        firingRetargets: Number(state.firingRetargets ?? 0),
        firingRetargetFireStops: Number(state.firingRetargetFireStops ?? 0),
        firingHeld: typeof state.firingHeld === 'boolean' ? state.firingHeld : null,
        shotsFired: Number(state.shotsFired ?? 0),
        engineShotsFired: Number(state.engineShotsFired ?? 0),
        weaponFiringActive: typeof weaponHarness?.firingActive === 'boolean' ? weaponHarness.firingActive : null,
        currentMagazine: Number.isFinite(Number(ammoState?.currentMagazine)) ? Number(ammoState.currentMagazine) : null,
        pathTargetKind: state.pathTargetKind ?? null,
        pathQueryStatus: state.pathQueryStatus ?? null,
        pathFailureReason: state.pathFailureReason ?? null,
        pathStartSnapDistance: Number.isFinite(Number(state.pathStartSnapDistance)) ? Number(state.pathStartSnapDistance) : null,
        pathEndSnapDistance: Number.isFinite(Number(state.pathEndSnapDistance)) ? Number(state.pathEndSnapDistance) : null,
        routeProgressAgeMs: Number.isFinite(Number(state.routeProgressAgeMs)) ? Number(state.routeProgressAgeMs) : null,
        routeProgressTravelMeters: Number.isFinite(Number(state.routeProgressTravelMeters)) ? Number(state.routeProgressTravelMeters) : null,
        playerPositionY: Number.isFinite(Number(runtimeLiveness?.playerPositionY)) ? Number(runtimeLiveness.playerPositionY) : null,
        terrainHeightAtPlayer: Number.isFinite(Number(runtimeLiveness?.terrainHeightAtPlayer)) ? Number(runtimeLiveness.terrainHeightAtPlayer) : null,
        effectiveHeightAtPlayer: Number.isFinite(Number(runtimeLiveness?.effectiveHeightAtPlayer)) ? Number(runtimeLiveness.effectiveHeightAtPlayer) : null,
        collisionHeightDeltaAtPlayer: Number.isFinite(Number(runtimeLiveness?.collisionHeightDeltaAtPlayer)) ? Number(runtimeLiveness.collisionHeightDeltaAtPlayer) : null,
        maxViewYawStepDeg: Number.isFinite(Number(state.maxViewYawStepDeg)) ? Number(state.maxViewYawStepDeg) : null,
        maxViewPitchStepDeg: Number.isFinite(Number(state.maxViewPitchStepDeg)) ? Number(state.maxViewPitchStepDeg) : null,
        viewSlewClampCount: Number.isFinite(Number(state.viewSlewClampCount)) ? Number(state.viewSlewClampCount) : null,
        lastViewStepYawDeg: Number.isFinite(Number(state.lastViewStepYawDeg)) ? Number(state.lastViewStepYawDeg) : null,
        lastViewStepPitchDeg: Number.isFinite(Number(state.lastViewStepPitchDeg)) ? Number(state.lastViewStepPitchDeg) : null,
        lastViewYawClamped: typeof state.lastViewYawClamped === 'boolean' ? state.lastViewYawClamped : null,
        lastViewPitchClamped: typeof state.lastViewPitchClamped === 'boolean' ? state.lastViewPitchClamped : null,
        lastViewTargetKind: state.lastViewTargetKind ?? null,
        lastViewAnchorResyncChanged: typeof state.lastViewAnchorResyncChanged === 'boolean'
          ? state.lastViewAnchorResyncChanged
          : null,
        lastViewAnchorResyncYawDeg: Number.isFinite(Number(state.lastViewAnchorResyncYawDeg))
          ? Number(state.lastViewAnchorResyncYawDeg)
          : null,
        lastViewAnchorResyncPitchDeg: Number.isFinite(Number(state.lastViewAnchorResyncPitchDeg))
          ? Number(state.lastViewAnchorResyncPitchDeg)
          : null,
        lastViewUpdateAtMs: Number.isFinite(Number(state.lastViewUpdateAtMs)) ? Number(state.lastViewUpdateAtMs) : null,
        lastAimDot: Number.isFinite(Number(state.lastAimDot)) ? Number(state.lastAimDot) : null,
        lastFireIntent: typeof state.lastFireIntent === 'boolean' ? state.lastFireIntent : null,
        lastAimGatePassed: typeof state.lastAimGatePassed === 'boolean' ? state.lastAimGatePassed : null,
        lastAimGateReason: state.lastAimGateReason ?? null,
        lastFireLosGatePassed: typeof state.lastFireLosGatePassed === 'boolean' ? state.lastFireLosGatePassed : null,
        lastFireProbe: clonePlain(state.lastFireProbe),
        maxAimMovementDivergenceDeg: Number.isFinite(Number(state.maxAimMovementDivergenceDeg)) ? Number(state.maxAimMovementDivergenceDeg) : null
      };
    } catch {
      return null;
    }
  }

  function installRafCadenceMonitor() {
    if (typeof requestAnimationFrame !== 'function') {
      supports.rafCadence = false;
      return;
    }
    supports.rafCadence = true;
    const tick = function (timestamp) {
      pushRafCadenceGap(Number(timestamp || performance.now()));
      rafHandle = requestAnimationFrame(tick);
    };
    rafHandle = requestAnimationFrame(tick);
  }

  function summarizeAttribution(attribution) {
    if (!Array.isArray(attribution)) {
      return [];
    }
    const out = [];
    const limit = Math.min(attribution.length, MAX_ATTRIBUTION_ENTRIES);
    for (let i = 0; i < limit; i++) {
      const item = attribution[i] || {};
      out.push({
        name: String(item.name || ''),
        entryType: String(item.entryType || ''),
        startTime: Number(item.startTime || 0),
        duration: Number(item.duration || 0),
        containerType: String(item.containerType || ''),
        containerSrc: String(item.containerSrc || ''),
        containerId: String(item.containerId || ''),
        containerName: String(item.containerName || '')
      });
    }
    return out;
  }

  function summarizeScripts(scripts) {
    if (!Array.isArray(scripts)) {
      return [];
    }
    const out = [];
    const limit = Math.min(scripts.length, MAX_SCRIPT_ENTRIES);
    for (let i = 0; i < limit; i++) {
      const item = scripts[i] || {};
      out.push({
        name: String(item.name || ''),
        invoker: String(item.invoker || ''),
        invokerType: String(item.invokerType || ''),
        sourceURL: String(item.sourceURL || ''),
        sourceFunctionName: String(item.sourceFunctionName || ''),
        sourceCharPosition: Number(item.sourceCharPosition || 0),
        windowAttribution: String(item.windowAttribution || ''),
        executionStart: Number(item.executionStart || 0),
        duration: Number(item.duration || 0),
        pauseDuration: Number(item.pauseDuration || 0),
        forcedStyleAndLayoutDuration: Number(item.forcedStyleAndLayoutDuration || 0)
      });
    }
    return out;
  }

  function getWebglState(context) {
    let state = webglContextState.get(context);
    if (!state) {
      state = {
        activeTextureUnit: TEXTURE0,
        boundByUnitAndTarget: Object.create(null)
      };
      webglContextState.set(context, state);
    }
    return state;
  }

  function getTextureId(texture) {
    if (!texture) {
      return 0;
    }
    let id = webglTextureIds.get(texture);
    if (!id) {
      id = nextWebglTextureId++;
      webglTextureIds.set(texture, id);
    }
    return id;
  }

  function getBindingTarget(target) {
    const numericTarget = Number(target || 0);
    if (numericTarget >= TEXTURE_CUBE_MAP_POSITIVE_X && numericTarget <= TEXTURE_CUBE_MAP_NEGATIVE_Z) {
      return TEXTURE_CUBE_MAP;
    }
    return numericTarget;
  }

  function getBoundTextureId(context, target) {
    const state = getWebglState(context);
    const bindingTarget = getBindingTarget(target);
    const key = `${state.activeTextureUnit}:${bindingTarget}`;
    return Number(state.boundByUnitAndTarget[key] || 0);
  }

  function textureTargetName(target) {
    const numericTarget = Number(target || 0);
    switch (numericTarget) {
      case TEXTURE_2D:
        return 'TEXTURE_2D';
      case TEXTURE_CUBE_MAP:
        return 'TEXTURE_CUBE_MAP';
      case TEXTURE_3D:
        return 'TEXTURE_3D';
      case TEXTURE_2D_ARRAY:
        return 'TEXTURE_2D_ARRAY';
      case TEXTURE_CUBE_MAP_POSITIVE_X:
        return 'TEXTURE_CUBE_MAP_POSITIVE_X';
      case 34070:
        return 'TEXTURE_CUBE_MAP_NEGATIVE_X';
      case 34071:
        return 'TEXTURE_CUBE_MAP_POSITIVE_Y';
      case 34072:
        return 'TEXTURE_CUBE_MAP_NEGATIVE_Y';
      case 34073:
        return 'TEXTURE_CUBE_MAP_POSITIVE_Z';
      case TEXTURE_CUBE_MAP_NEGATIVE_Z:
        return 'TEXTURE_CUBE_MAP_NEGATIVE_Z';
      default:
        return `target:${numericTarget}`;
    }
  }

  function sourceInfo(source) {
    if (!source) {
      return {
        sourceType: '',
        sourceWidth: 0,
        sourceHeight: 0,
        byteLength: 0
      };
    }

    const typeName = source.constructor && source.constructor.name
      ? source.constructor.name
      : typeof source;
    const width = Number(source.width || source.videoWidth || source.naturalWidth || 0);
    const height = Number(source.height || source.videoHeight || source.naturalHeight || 0);
    const byteLength = Number(source.byteLength || (source.buffer && source.buffer.byteLength) || 0);

    return {
      sourceType: String(typeName),
      sourceUrl: String(source.currentSrc || source.src || ''),
      sourceWidth: width,
      sourceHeight: height,
      byteLength: byteLength
    };
  }

  function summarizeWebglUploadArgs(operation, args) {
    const target = Number(args[0] || 0);
    let width = 0;
    let height = 0;
    let source = null;

    if (operation === 'texImage2D') {
      if (args.length >= 9 && typeof args[3] === 'number' && typeof args[4] === 'number') {
        width = Number(args[3] || 0);
        height = Number(args[4] || 0);
        source = args[8] || null;
      } else {
        source = args[5] || null;
      }
    } else if (operation === 'texSubImage2D') {
      if (args.length >= 9 && typeof args[4] === 'number' && typeof args[5] === 'number') {
        width = Number(args[4] || 0);
        height = Number(args[5] || 0);
        source = args[8] || null;
      } else {
        source = args[6] || null;
      }
    } else if (operation === 'texStorage2D') {
      width = Number(args[3] || 0);
      height = Number(args[4] || 0);
    } else if (operation === 'compressedTexImage2D') {
      width = Number(args[3] || 0);
      height = Number(args[4] || 0);
      source = args[6] || null;
    } else if (operation === 'compressedTexSubImage2D') {
      width = Number(args[4] || 0);
      height = Number(args[5] || 0);
      source = args[7] || null;
    }

    const sourceSummary = sourceInfo(source);
    return {
      target: target,
      targetName: textureTargetName(target),
      width: width || sourceSummary.sourceWidth,
      height: height || sourceSummary.sourceHeight,
      sourceType: sourceSummary.sourceType,
      sourceUrl: sourceSummary.sourceUrl,
      sourceWidth: sourceSummary.sourceWidth,
      sourceHeight: sourceSummary.sourceHeight,
      byteLength: sourceSummary.byteLength,
      argsLength: args.length
    };
  }

  function getOperationBucket(operation) {
    if (!totals.webglTextureUploadByOperation[operation]) {
      totals.webglTextureUploadByOperation[operation] = {
        count: 0,
        totalDurationMs: 0,
        maxDurationMs: 0
      };
    }
    return totals.webglTextureUploadByOperation[operation];
  }

  function pushWebglTextureUpload(operation, context, args, startTime, duration) {
    const upload = summarizeWebglUploadArgs(operation, args);
    const plain = {
      operation: operation,
      startTime: Number(startTime || 0),
      duration: Number(duration || 0),
      target: upload.targetName,
      textureId: getBoundTextureId(context, upload.target),
      width: upload.width,
      height: upload.height,
      sourceType: upload.sourceType,
      sourceUrl: upload.sourceUrl,
      sourceWidth: upload.sourceWidth,
      sourceHeight: upload.sourceHeight,
      byteLength: upload.byteLength,
      argsLength: upload.argsLength
    };

    recent.webglTextureUploads.push(plain);
    trimWebglUploads();
    pushTopWebglUpload(plain);
    totals.webglTextureUploadCount += 1;
    totals.webglTextureUploadTotalDurationMs += plain.duration;
    if (plain.duration > totals.webglTextureUploadMaxDurationMs) {
      totals.webglTextureUploadMaxDurationMs = plain.duration;
    }

    const bucket = getOperationBucket(operation);
    bucket.count += 1;
    bucket.totalDurationMs += plain.duration;
    if (plain.duration > bucket.maxDurationMs) {
      bucket.maxDurationMs = plain.duration;
    }
  }

  function cloneWebglOperationBuckets() {
    const out = Object.create(null);
    const names = Object.keys(totals.webglTextureUploadByOperation);
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const bucket = totals.webglTextureUploadByOperation[name];
      out[name] = {
        count: Number(bucket.count || 0),
        totalDurationMs: Number(bucket.totalDurationMs || 0),
        maxDurationMs: Number(bucket.maxDurationMs || 0)
      };
    }
    return out;
  }

  function patchWebglPrototype(proto) {
    if (!proto || proto.__perfHarnessTextureUploadPatched) {
      return false;
    }

    Object.defineProperty(proto, '__perfHarnessTextureUploadPatched', {
      value: true,
      configurable: true
    });

    const originalCreateTexture = proto.createTexture;
    if (typeof originalCreateTexture === 'function') {
      proto.createTexture = function () {
        const texture = originalCreateTexture.apply(this, arguments);
        getTextureId(texture);
        return texture;
      };
    }

    const originalActiveTexture = proto.activeTexture;
    if (typeof originalActiveTexture === 'function') {
      proto.activeTexture = function (unit) {
        const state = getWebglState(this);
        state.activeTextureUnit = Number(unit || TEXTURE0);
        return originalActiveTexture.apply(this, arguments);
      };
    }

    const originalBindTexture = proto.bindTexture;
    if (typeof originalBindTexture === 'function') {
      proto.bindTexture = function (target, texture) {
        const state = getWebglState(this);
        const key = `${state.activeTextureUnit}:${getBindingTarget(target)}`;
        state.boundByUnitAndTarget[key] = getTextureId(texture);
        return originalBindTexture.apply(this, arguments);
      };
    }

    const uploadOperations = [
      'texImage2D',
      'texSubImage2D',
      'texStorage2D',
      'compressedTexImage2D',
      'compressedTexSubImage2D',
      'generateMipmap'
    ];
    for (let i = 0; i < uploadOperations.length; i++) {
      const operation = uploadOperations[i];
      const original = proto[operation];
      if (typeof original !== 'function') {
        continue;
      }
      proto[operation] = function () {
        const startTime = performance.now();
        try {
          return original.apply(this, arguments);
        } finally {
          pushWebglTextureUpload(operation, this, arguments, startTime, performance.now() - startTime);
        }
      };
    }

    return true;
  }

  function installWebglTextureUploadObserver() {
    // This is diagnostic-only. It intentionally instruments WebGL calls so the
    // startup benchmark can name first-present texture upload costs; the same
    // artifact must not be used as an uncontaminated frame-time baseline.
    if (globalWindow.__perfHarnessDisableWebglTextureUploadObserver) {
      supports.webglTextureUpload = false;
      return;
    }

    let patched = false;
    if (typeof globalWindow.WebGLRenderingContext !== 'undefined') {
      patched = patchWebglPrototype(globalWindow.WebGLRenderingContext.prototype) || patched;
    }
    if (typeof globalWindow.WebGL2RenderingContext !== 'undefined') {
      patched = patchWebglPrototype(globalWindow.WebGL2RenderingContext.prototype) || patched;
    }
    supports.webglTextureUpload = patched;
  }

  function getTimingBucket(target, name) {
    if (!target[name]) {
      target[name] = {
        count: 0,
        totalDurationMs: 0,
        maxDurationMs: 0
      };
    }
    return target[name];
  }

  function pushMeasure(entry) {
    const name = String(entry.name || 'measure');
    const duration = Number(entry.duration || 0);
    const recentBucket = getTimingBucket(recent.userTimingByName, name);
    const totalBucket = getTimingBucket(totals.userTimingByName, name);

    recentBucket.count += 1;
    recentBucket.totalDurationMs += duration;
    if (duration > recentBucket.maxDurationMs) {
      recentBucket.maxDurationMs = duration;
    }

    totalBucket.count += 1;
    totalBucket.totalDurationMs += duration;
    if (duration > totalBucket.maxDurationMs) {
      totalBucket.maxDurationMs = duration;
    }
  }

  function installObservers() {
    if (typeof PerformanceObserver === 'undefined') {
      return;
    }

    const supportedEntryTypes = Array.isArray(PerformanceObserver.supportedEntryTypes)
      ? PerformanceObserver.supportedEntryTypes
      : [];

    if (supportedEntryTypes.includes('longtask')) {
      supports.longtask = true;
      const longTaskObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (let i = 0; i < entries.length; i++) {
          pushLongTask(entries[i]);
        }
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
      observers.push(longTaskObserver);
    }

    if (supportedEntryTypes.includes('long-animation-frame')) {
      supports.longAnimationFrame = true;
      const loafObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (let i = 0; i < entries.length; i++) {
          pushLongAnimationFrame(entries[i]);
        }
      });
      loafObserver.observe({ type: 'long-animation-frame', buffered: true });
      observers.push(loafObserver);
    }

    if (supportedEntryTypes.includes('measure')) {
      supports.measure = true;
      const measureObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (let i = 0; i < entries.length; i++) {
          pushMeasure(entries[i]);
          performance.clearMeasures(entries[i].name);
        }
      });
      measureObserver.observe({ type: 'measure', buffered: true });
      observers.push(measureObserver);
    }

    if (supportedEntryTypes.includes('resource')) {
      supports.resourceTiming = true;
      if (typeof performance.setResourceTimingBufferSize === 'function') {
        performance.setResourceTimingBufferSize(2048);
      }
      const resourceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (let i = 0; i < entries.length; i++) {
          pushResource(entries[i]);
        }
      });
      resourceObserver.observe({ type: 'resource', buffered: true });
      observers.push(resourceObserver);
    }
  }

  function summarizeLongTasks(entries) {
    let totalDurationMs = 0;
    let maxDurationMs = 0;
    for (let i = 0; i < entries.length; i++) {
      const duration = Number(entries[i].duration || 0);
      totalDurationMs += duration;
      if (duration > maxDurationMs) {
        maxDurationMs = duration;
      }
    }
    return {
      count: entries.length,
      totalDurationMs: totalDurationMs,
      maxDurationMs: maxDurationMs,
      entries: entries.slice()
    };
  }

  function summarizeLongAnimationFrames(entries) {
    let totalDurationMs = 0;
    let maxDurationMs = 0;
    let blockingDurationMs = 0;
    for (let i = 0; i < entries.length; i++) {
      const duration = Number(entries[i].duration || 0);
      const blockingDuration = Number(entries[i].blockingDuration || 0);
      totalDurationMs += duration;
      blockingDurationMs += blockingDuration;
      if (duration > maxDurationMs) {
        maxDurationMs = duration;
      }
    }
    return {
      count: entries.length,
      totalDurationMs: totalDurationMs,
      maxDurationMs: maxDurationMs,
      blockingDurationMs: blockingDurationMs,
      entries: entries.slice()
    };
  }

  function summarizeResources(entries) {
    let totalDurationMs = 0;
    let maxDurationMs = 0;
    let transferSizeBytes = 0;
    for (let i = 0; i < entries.length; i++) {
      const duration = Number(entries[i].duration || 0);
      totalDurationMs += duration;
      transferSizeBytes += Number(entries[i].transferSize || 0);
      if (duration > maxDurationMs) {
        maxDurationMs = duration;
      }
    }
    return {
      count: entries.length,
      totalDurationMs: totalDurationMs,
      maxDurationMs: maxDurationMs,
      transferSizeBytes: transferSizeBytes,
      entries: entries.slice()
    };
  }

  function cloneUserTimingBuckets(source) {
    const out = Object.create(null);
    const names = Object.keys(source);
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const bucket = source[name];
      out[name] = {
        count: Number(bucket.count || 0),
        totalDurationMs: Number(bucket.totalDurationMs || 0),
        maxDurationMs: Number(bucket.maxDurationMs || 0)
      };
    }
    return out;
  }

  function reset() {
    totals.longTaskCount = 0;
    totals.longTaskTotalDurationMs = 0;
    totals.longTaskMaxDurationMs = 0;
    totals.longAnimationFrameCount = 0;
    totals.longAnimationFrameTotalDurationMs = 0;
    totals.longAnimationFrameMaxDurationMs = 0;
    totals.longAnimationFrameBlockingDurationMs = 0;
    totals.resourceCount = 0;
    totals.resourceTotalDurationMs = 0;
    totals.resourceMaxDurationMs = 0;
    totals.resourceTransferSizeBytes = 0;
    totals.webglTextureUploadCount = 0;
    totals.webglTextureUploadTotalDurationMs = 0;
    totals.webglTextureUploadMaxDurationMs = 0;
    totals.webglTextureUploadByOperation = Object.create(null);
    totals.rafCadence = {
      intervalCount: 0,
      totalGapMs: 0,
      maxGapMs: 0,
      stutter25Count: 0,
      hitch33Count: 0,
      hitch50Count: 0,
      hitch100Count: 0,
      overBudget60HzMs: 0,
      droppedFrameTime60HzMs: 0,
      estimatedDropped60HzFrames: 0
    };
    totals.userTimingByName = Object.create(null);
    recent.longTasks.length = 0;
    recent.longAnimationFrames.length = 0;
    recent.resources.length = 0;
    recent.webglTextureUploads.length = 0;
    recent.webglTextureUploadTop.length = 0;
    recent.rafCadence.length = 0;
    recent.userTimingByName = Object.create(null);
    presentationEpochs.clear();
    nextPresentationEpochSeq = 1;
    lastRafTimestamp = null;
    if (typeof performance.clearMeasures === 'function') {
      performance.clearMeasures();
    }
    if (typeof performance.clearResourceTimings === 'function') {
      performance.clearResourceTimings();
    }
  }

  function drain() {
    const longTasks = summarizeLongTasks(recent.longTasks);
    const longAnimationFrames = summarizeLongAnimationFrames(recent.longAnimationFrames);
    const resources = summarizeResources(recent.resources);
    const recentUserTiming = cloneUserTimingBuckets(recent.userTimingByName);
    const totalUserTiming = cloneUserTimingBuckets(totals.userTimingByName);
    const webglTextureUploadByOperation = cloneWebglOperationBuckets();
    const webglTextureUploads = recent.webglTextureUploads.slice();
    const webglTextureUploadTop = recent.webglTextureUploadTop.slice();
    const rafCadence = {
      count: recent.rafCadence.length,
      estimatedDropped60HzFrames: recent.rafCadence.reduce((sum, entry) => {
        return sum + Number(entry.estimatedDropped60HzFrames || 0);
      }, 0),
      overBudget60HzMs: recent.rafCadence.reduce((sum, entry) => {
        return sum + Number(entry.overBudget60HzMs || 0);
      }, 0),
      droppedFrameTime60HzMs: recent.rafCadence.reduce((sum, entry) => {
        return sum + Number(entry.droppedFrameTime60HzMs || 0);
      }, 0),
      maxGapMs: recent.rafCadence.reduce((max, entry) => {
        return Math.max(max, Number(entry.gapMs || 0));
      }, 0),
      entries: recent.rafCadence.slice()
    };
    recent.longTasks.length = 0;
    recent.longAnimationFrames.length = 0;
    recent.resources.length = 0;
    recent.webglTextureUploads.length = 0;
    recent.webglTextureUploadTop.length = 0;
    recent.rafCadence.length = 0;
    recent.userTimingByName = Object.create(null);
    return {
      support: {
        longtask: supports.longtask,
        longAnimationFrame: supports.longAnimationFrame,
        measure: supports.measure,
        webglTextureUpload: supports.webglTextureUpload,
        rafCadence: supports.rafCadence,
        resourceTiming: supports.resourceTiming
      },
      totals: {
        longTaskCount: totals.longTaskCount,
        longTaskTotalDurationMs: totals.longTaskTotalDurationMs,
        longTaskMaxDurationMs: totals.longTaskMaxDurationMs,
        longAnimationFrameCount: totals.longAnimationFrameCount,
        longAnimationFrameTotalDurationMs: totals.longAnimationFrameTotalDurationMs,
        longAnimationFrameMaxDurationMs: totals.longAnimationFrameMaxDurationMs,
        longAnimationFrameBlockingDurationMs: totals.longAnimationFrameBlockingDurationMs,
        resourceCount: totals.resourceCount,
        resourceTotalDurationMs: totals.resourceTotalDurationMs,
        resourceMaxDurationMs: totals.resourceMaxDurationMs,
        resourceTransferSizeBytes: totals.resourceTransferSizeBytes,
        webglTextureUploadCount: totals.webglTextureUploadCount,
        webglTextureUploadTotalDurationMs: totals.webglTextureUploadTotalDurationMs,
        webglTextureUploadMaxDurationMs: totals.webglTextureUploadMaxDurationMs,
        webglTextureUploadByOperation: webglTextureUploadByOperation,
        rafCadence: {
          intervalCount: totals.rafCadence.intervalCount,
          totalGapMs: totals.rafCadence.totalGapMs,
          maxGapMs: totals.rafCadence.maxGapMs,
          avgGapMs: totals.rafCadence.intervalCount > 0
            ? totals.rafCadence.totalGapMs / totals.rafCadence.intervalCount
            : 0,
          stutter25Count: totals.rafCadence.stutter25Count,
          hitch33Count: totals.rafCadence.hitch33Count,
          hitch50Count: totals.rafCadence.hitch50Count,
          hitch100Count: totals.rafCadence.hitch100Count,
          overBudget60HzMs: totals.rafCadence.overBudget60HzMs,
          droppedFrameTime60HzMs: totals.rafCadence.droppedFrameTime60HzMs,
          estimatedDropped60HzFrames: totals.rafCadence.estimatedDropped60HzFrames
        },
        userTimingByName: totalUserTiming
      },
      recent: {
        longTasks: longTasks,
        longAnimationFrames: longAnimationFrames,
        resources: resources,
        webglTextureUploads: webglTextureUploads,
        webglTextureUploadTop: webglTextureUploadTop,
        rafCadence: rafCadence,
        userTimingByName: recentUserTiming
      }
    };
  }

  installObservers();
  installWebglTextureUploadObserver();
  installRafCadenceMonitor();

  globalWindow.__perfHarnessObservers = {
    reset: reset,
    drain: drain,
    getPresentationEpochs: function (options) {
      const opts = options && typeof options === 'object' ? options : {};
      const sinceSeq = Number.isFinite(Number(opts.sinceSeq)) ? Number(opts.sinceSeq) : 0;
      const limit = Number.isFinite(Number(opts.limit))
        ? Math.max(0, Math.min(MAX_PRESENTATION_EPOCHS, Math.floor(Number(opts.limit))))
        : MAX_PRESENTATION_EPOCHS;
      return presentationEpochs.snapshotSince(sinceSeq, limit);
    },
    getSupport: function () {
      return {
        longtask: supports.longtask,
        longAnimationFrame: supports.longAnimationFrame,
        measure: supports.measure,
        webglTextureUpload: supports.webglTextureUpload,
        rafCadence: supports.rafCadence,
        resourceTiming: supports.resourceTiming
      };
    },
    dispose: function () {
      if (rafHandle && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafHandle);
        rafHandle = 0;
      }
      for (let i = 0; i < observers.length; i++) {
        observers[i].disconnect();
      }
      observers.length = 0;
      reset();
    }
  };
})();
