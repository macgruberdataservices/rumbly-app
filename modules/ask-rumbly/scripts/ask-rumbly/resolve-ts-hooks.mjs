export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error;
    for (const suffix of ['.ts', '.tsx', '.mjs', '.js']) {
      try {
        return await nextResolve(`${specifier}${suffix}`, context);
      } catch {
        // Try the next local extension.
      }
    }
    throw error;
  }
}
