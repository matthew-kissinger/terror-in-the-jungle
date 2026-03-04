(function () {
  const globalWindow = window;
  const MAX_RECENT_ENTRIES = 32;
  const supports = {
    longtask: false,
    longAnimationFrame: false,
    measure: false
  };
  const totals = {
    longTaskCount: 0,
    longTaskTotalDurationMs: 0,
    longTaskMaxDurationMs: 0,
    longAnimationFrameCount: 0,
    longAnimationFrameTotalDurationMs: 0,
    longAnimationFrameMaxDurationMs: 0,
    longAnimationFrameBlockingDurationMs: 0,
    userTimingByName: Object.create(null)
  };
  const recent = {
    longTasks: [],
    longAnimationFrames: [],
    userTimingByName: Object.create(null)
  };
  const observers = [];

  function trimRecent(list) {
    while (list.length > MAX_RECENT_ENTRIES) {
      list.shift();
    }
  }

  function pushLongTask(entry) {
    const plain = {
      name: String(entry.name || 'longtask'),
      startTime: Number(entry.startTime || 0),
      duration: Number(entry.duration || 0)
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
      blockingDuration: blockingDuration
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
    totals.userTimingByName = Object.create(null);
    recent.longTasks.length = 0;
    recent.longAnimationFrames.length = 0;
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
    recent.longTasks.length = 0;
    recent.longAnimationFrames.length = 0;
    recent.userTimingByName = Object.create(null);
    return {
      support: {
        longtask: supports.longtask,
        longAnimationFrame: supports.longAnimationFrame,
        measure: supports.measure
      },
      totals: {
        longTaskCount: totals.longTaskCount,
        longTaskTotalDurationMs: totals.longTaskTotalDurationMs,
        longTaskMaxDurationMs: totals.longTaskMaxDurationMs,
        longAnimationFrameCount: totals.longAnimationFrameCount,
        longAnimationFrameTotalDurationMs: totals.longAnimationFrameTotalDurationMs,
        longAnimationFrameMaxDurationMs: totals.longAnimationFrameMaxDurationMs,
        longAnimationFrameBlockingDurationMs: totals.longAnimationFrameBlockingDurationMs,
        userTimingByName: totalUserTiming
      },
      recent: {
        longTasks: longTasks,
        longAnimationFrames: longAnimationFrames,
        userTimingByName: recentUserTiming
      }
    };
  }

  installObservers();

  globalWindow.__perfHarnessObservers = {
    reset: reset,
    drain: drain,
    getSupport: function () {
      return {
        longtask: supports.longtask,
        longAnimationFrame: supports.longAnimationFrame,
        measure: supports.measure
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
