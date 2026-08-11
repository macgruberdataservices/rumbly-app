// Schedule non-urgent screen work without competing with a native navigation
// transition. React Native exposes requestIdleCallback, but keep a timer
// fallback for older runtimes and test environments.

type IdleGlobals = typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function scheduleAfterNavigation(task: () => void): () => void {
  const globals = globalThis as IdleGlobals;
  if (globals.requestIdleCallback && globals.cancelIdleCallback) {
    const handle = globals.requestIdleCallback(task, { timeout: 500 });
    return () => globals.cancelIdleCallback?.(handle);
  }

  const handle = setTimeout(task, 250);
  return () => clearTimeout(handle);
}

// For work that has been split into chunks and needs to resume promptly
// without competing with the user.
//
// Deliberately shorter-fused than scheduleAfterNavigation: that one defers a
// single task until things settle, and its 250ms fallback would stretch a
// ten-chunk job into multiple seconds. This yields to the thread between
// chunks -- so a tap or keystroke lands first -- while still resuming on the
// next tick when nothing else is competing.
export function scheduleChunk(task: () => void): () => void {
  const globals = globalThis as IdleGlobals;
  if (globals.requestIdleCallback && globals.cancelIdleCallback) {
    const handle = globals.requestIdleCallback(task, { timeout: 100 });
    return () => globals.cancelIdleCallback?.(handle);
  }

  const handle = setTimeout(task, 0);
  return () => clearTimeout(handle);
}
