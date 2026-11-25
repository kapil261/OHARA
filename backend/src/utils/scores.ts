/**
 * Cognitive domain scores (0-100), always compared with the patient's own baseline, never with others.
 * Support signals only, not a diagnosis.
 */
import { median, std } from './baseline.js';

export const DOMAINS = ['memory', 'attention', 'recognition', 'routine'] as const;
export type Domain = (typeof DOMAINS)[number];

/** Which cognitive domain each game exercises. */
export const GAME_DOMAIN: Record<string, Domain> = {
  'memory-match': 'memory',
  'sounds-of-home': 'attention',
  'who-is-this': 'recognition',
  'my-day': 'routine',
};

export const MIN_BASELINE_SESSIONS = 5;

/**
 * Score for one session: accuracy weighted by level, so doing well on a harder level counts more.
 * Level 1 = 80% weight ... level 5 = 100%.
 */
export function sessionScore(s: { accuracy: number; level: number }): number {
  const weight = 0.75 + 0.05 * Math.min(5, Math.max(1, s.level));
  return Math.round(Math.min(1, Math.max(0, s.accuracy)) * weight * 100);
}

export type Trend = 'above baseline' | 'steady' | 'watch' | 'establishing baseline' | 'no data';

/**
 * Compare a recent score with the personal baseline (median of earlier scores).
 * "watch" needs a clear drop: at least 10 points and 1.5 standard deviations below usual.
 */
export function compareWithBaseline(recent: number[], earlier: number[]): { score: number | null; baseline: number | null; trend: Trend } {
  if (!recent.length) return { score: null, baseline: earlier.length >= MIN_BASELINE_SESSIONS ? Math.round(median(earlier)) : null, trend: 'no data' };
  const score = Math.round(median(recent));
  if (earlier.length < MIN_BASELINE_SESSIONS) return { score, baseline: null, trend: 'establishing baseline' };
  const baseline = Math.round(median(earlier));
  const spread = Math.max(std(earlier), 5);
  const diff = score - baseline;
  const trend: Trend = diff >= 5 ? 'above baseline' : diff <= -10 && diff / spread <= -1.5 ? 'watch' : 'steady';
  return { score, baseline, trend };
}
