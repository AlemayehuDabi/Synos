/**
 * Exponential moving average: recent completions matter more than old ones, but a
 * single unusually long or short run never fully overwrites the running estimate.
 * With no prior estimate, the first `actualMinutes` becomes the estimate outright.
 */
const EMA_ALPHA = 0.3;

export function updateAdaptiveEstimate(previousEstimateMinutes: number | null, actualMinutes: number): number {
  if (previousEstimateMinutes == null) return Math.round(actualMinutes);
  return Math.round(EMA_ALPHA * actualMinutes + (1 - EMA_ALPHA) * previousEstimateMinutes);
}
