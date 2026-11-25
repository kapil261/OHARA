/** Small, dependency-free statistics used for personal baselines. */

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Exponentially weighted moving average over values in chronological order. */
export function ewma(values: number[], alpha = 0.3): number {
  if (!values.length) return 0;
  return values.slice(1).reduce((acc, v) => alpha * v + (1 - alpha) * acc, values[0]);
}

/** Sample standard deviation (n - 1). */
export function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export interface BaselineStats {
  median: number;
  ewma: number;
  std: number;
  sampleSize: number;
}

export const computeBaseline = (values: number[], alpha = 0.3): BaselineStats => ({
  median: median(values),
  ewma: ewma(values, alpha),
  std: std(values),
  sampleSize: values.length,
});

export const MIN_BASELINE_SAMPLES = 5;

/**
 * Local fallback for decline detection, used when the ML service is not configured.
 * Flags a decline when recent accuracy sits well below the personal median,
 * or recent response time is well above it (z-score style, with a floor on std).
 */
export function detectDeclineLocally(
  recent: { accuracy: number; responseTimeMs: number }[],
  base: { accuracy: BaselineStats; responseTimeMs: BaselineStats },
): { decline: boolean; reason: string; score: number } {
  if (recent.length < 3 || base.accuracy.sampleSize < MIN_BASELINE_SAMPLES) {
    return { decline: false, reason: 'Not enough history yet', score: 0 };
  }
  const recentAcc = median(recent.map((r) => r.accuracy));
  const recentRt = median(recent.map((r) => r.responseTimeMs));
  const accStd = Math.max(base.accuracy.std, 0.05);
  const rtStd = Math.max(base.responseTimeMs.std, 250);
  const accZ = (base.accuracy.median - recentAcc) / accStd;
  const rtZ = (recentRt - base.responseTimeMs.median) / rtStd;
  const score = Math.max(accZ, rtZ);
  if (accZ >= 2) {
    return { decline: true, score, reason: `Accuracy ${Math.round(recentAcc * 100)}% vs usual ${Math.round(base.accuracy.median * 100)}%` };
  }
  if (rtZ >= 2) {
    return { decline: true, score, reason: `Answers ${(recentRt / 1000).toFixed(1)}s vs usual ${(base.responseTimeMs.median / 1000).toFixed(1)}s` };
  }
  return { decline: false, score, reason: 'Within usual range' };
}

/** Local fallback for adaptive difficulty: aim for ~78% success (aligned with AI microservice). Levels 1..5. */
export function nextLevelLocally(current: number, accuracy: number, hintsUsed: number, targetSuccess = 0.78): number {
  let level = current;
  if (accuracy >= targetSuccess + 0.1 && hintsUsed === 0) level += 1;
  else if (accuracy < targetSuccess - 0.2 || hintsUsed >= 3) level -= 1;
  return Math.min(5, Math.max(1, level));
}
