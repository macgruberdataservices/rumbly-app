export function dimensionsForLongEdge(
  width: number,
  height: number,
  maximumLongEdge: number
): { width?: number; height?: number } {
  if (width <= 0 || height <= 0 || maximumLongEdge <= 0) {
    throw new Error('Journal photo dimensions must be positive.');
  }
  if (Math.max(width, height) <= maximumLongEdge) return {};
  return width >= height
    ? { width: maximumLongEdge }
    : { height: maximumLongEdge };
}

export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
