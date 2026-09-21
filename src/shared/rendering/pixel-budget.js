// One policy, explicit per-experience budgets. Small previews need fewer pixels.
export function pixelRatio(width, height, { maxPixels = 1800000, maxDpr = 2, dpr = globalThis.devicePixelRatio || 1 } = {}) {
  return Math.min(dpr, maxDpr, Math.sqrt(maxPixels / Math.max(1, width * height)));
}
