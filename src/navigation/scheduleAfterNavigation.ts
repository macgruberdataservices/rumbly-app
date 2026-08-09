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
