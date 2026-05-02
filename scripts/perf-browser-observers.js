(function () {
  const globalWindow = window;
  const MAX_RECENT_ENTRIES = 32;
  const supports = {
    longtask: false,
    longAnimationFrame: false,
    measure: false,
    webglTextureUpload: false
  };
  const totals = {
    longTaskCount: 0,
    longTaskTotalDurationMs: 0,
    longTaskMaxDurationMs: 0,
    longAnimationFrameCount: 0,
    longAnimationFrameTotalDurationMs: 0,
    longAnimationFrameMaxDurationMs: 0,
    longAnimationFrameBlockingDurationMs: 0,
    webglTextureUploadCount: 0,
    webglTextureUploadTotalDurationMs: 0,
    webglTextureUploadMaxDurationMs: 0,
    webglTextureUploadByOperation: Object.create(null),
    userTimingByName: Object.create(null)
  };
  const recent = {
    longTasks: [],
    longAnimationFrames: [],
    webglTextureUploads: [],
    webglTextureUploadTop: [],
    userTimingByName: Object.create(null)
  };
  const observers = [];
  const MAX_ATTRIBUTION_ENTRIES = 8;
  const MAX_SCRIPT_ENTRIES = 8;
  const MAX_WEBGL_UPLOAD_ENTRIES = 128;
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

  function trimRecent(list) {
    while (list.length > MAX_RECENT_ENTRIES) {
      list.shift();
    }
  }

  function trimWebglUploads() {
    while (recent.webglTextureUploads.length > MAX_WEBGL_UPLOAD_ENTRIES) {
      recent.webglTextureUploads.shift();
    }
  }

  function pushTopWebglUpload(entry) {
    recent.webglTextureUploadTop.push(entry);
    recent.webglTextureUploadTop.sort((a, b) => b.duration - a.duration);
    while (recent.webglTextureUploadTop.length > MAX_RECENT_ENTRIES) {
      recent.webglTextureUploadTop.pop();
    }
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
    totals.webglTextureUploadCount = 0;
    totals.webglTextureUploadTotalDurationMs = 0;
    totals.webglTextureUploadMaxDurationMs = 0;
    totals.webglTextureUploadByOperation = Object.create(null);
    totals.userTimingByName = Object.create(null);
    recent.longTasks.length = 0;
    recent.longAnimationFrames.length = 0;
    recent.webglTextureUploads.length = 0;
    recent.webglTextureUploadTop.length = 0;
    recent.userTimingByName = Object.create(null);
    if (typeof performance.clearMeasures === 'function') {
      performance.clearMeasures();
    }
  }

  function drain() {
    const longTasks = summarizeLongTasks(recent.longTasks);
    const longAnimationFrames = summarizeLongAnimationFrames(recent.longAnimationFrames);
    const recentUserTiming = cloneUserTimingBuckets(recent.userTimingByName);
    const totalUserTiming = cloneUserTimingBuckets(totals.userTimingByName);
    const webglTextureUploadByOperation = cloneWebglOperationBuckets();
    const webglTextureUploads = recent.webglTextureUploads.slice();
    const webglTextureUploadTop = recent.webglTextureUploadTop.slice();
    recent.longTasks.length = 0;
    recent.longAnimationFrames.length = 0;
    recent.webglTextureUploads.length = 0;
    recent.webglTextureUploadTop.length = 0;
    recent.userTimingByName = Object.create(null);
    return {
      support: {
        longtask: supports.longtask,
        longAnimationFrame: supports.longAnimationFrame,
        measure: supports.measure,
        webglTextureUpload: supports.webglTextureUpload
      },
      totals: {
        longTaskCount: totals.longTaskCount,
        longTaskTotalDurationMs: totals.longTaskTotalDurationMs,
        longTaskMaxDurationMs: totals.longTaskMaxDurationMs,
        longAnimationFrameCount: totals.longAnimationFrameCount,
        longAnimationFrameTotalDurationMs: totals.longAnimationFrameTotalDurationMs,
        longAnimationFrameMaxDurationMs: totals.longAnimationFrameMaxDurationMs,
        longAnimationFrameBlockingDurationMs: totals.longAnimationFrameBlockingDurationMs,
        webglTextureUploadCount: totals.webglTextureUploadCount,
        webglTextureUploadTotalDurationMs: totals.webglTextureUploadTotalDurationMs,
        webglTextureUploadMaxDurationMs: totals.webglTextureUploadMaxDurationMs,
        webglTextureUploadByOperation: webglTextureUploadByOperation,
        userTimingByName: totalUserTiming
      },
      recent: {
        longTasks: longTasks,
        longAnimationFrames: longAnimationFrames,
        webglTextureUploads: webglTextureUploads,
        webglTextureUploadTop: webglTextureUploadTop,
        userTimingByName: recentUserTiming
      }
    };
  }

  installObservers();
  installWebglTextureUploadObserver();

  globalWindow.__perfHarnessObservers = {
    reset: reset,
    drain: drain,
    getSupport: function () {
      return {
        longtask: supports.longtask,
        longAnimationFrame: supports.longAnimationFrame,
        measure: supports.measure,
        webglTextureUpload: supports.webglTextureUpload
      };
    },
    dispose: function () {
      for (let i = 0; i < observers.length; i++) {
        observers[i].disconnect();
      }
      observers.length = 0;
      reset();
    }
  };
})();
