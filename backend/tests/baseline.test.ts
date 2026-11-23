import { describe, expect, it } from 'vitest';
import { computeBaseline, detectDeclineLocally, ewma, median, nextLevelLocally, std } from '../src/utils/baseline.js';

describe('stats', () => {
  it('median / ewma / std', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
    expect(ewma([10, 20], 0.5)).toBe(15);
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });
});

describe('detectDeclineLocally', () => {
  const base = {
    accuracy: computeBaseline([0.8, 0.82, 0.85, 0.8, 0.83, 0.84]),
    responseTimeMs: computeBaseline([4000, 4200, 4100, 3900, 4300, 4000]),
  };
  it('needs enough history', () => {
    expect(detectDeclineLocally([{ accuracy: 0.1, responseTimeMs: 9000 }], base).decline).toBe(false);
  });
  it('flags an accuracy drop', () => {
    const recent = [0.5, 0.55, 0.5].map((accuracy) => ({ accuracy, responseTimeMs: 4100 }));
    const r = detectDeclineLocally(recent, base);
    expect(r.decline).toBe(true);
    expect(r.reason).toMatch(/Accuracy/);
  });
  it('stays quiet within the usual range', () => {
    const recent = [0.82, 0.83, 0.81].map((accuracy) => ({ accuracy, responseTimeMs: 4100 }));
    expect(detectDeclineLocally(recent, base).decline).toBe(false);
  });
});

describe('nextLevelLocally', () => {
  it('moves up on easy wins and stays in 1..5', () => {
    expect(nextLevelLocally(2, 1, 0)).toBe(3);
    expect(nextLevelLocally(5, 1, 0)).toBeLessThanOrEqual(5);
    expect(nextLevelLocally(1, 0, 3)).toBeGreaterThanOrEqual(1);
  });
});
