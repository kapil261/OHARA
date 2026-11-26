import { describe, expect, it } from 'vitest';
import { suggestGame } from '../src/modules/games/catalogue.js';
import { maskContact, normalizePhone, userLabel } from '../src/utils/contact.js';
import { compareWithBaseline, sessionScore } from '../src/utils/scores.js';

describe('sessionScore', () => {
  it('weights accuracy by level (level 1 = 80%, level 5 = 100%)', () => {
    expect(sessionScore({ accuracy: 1, level: 5 })).toBe(100);
    expect(sessionScore({ accuracy: 1, level: 1 })).toBe(80);
    expect(sessionScore({ accuracy: 0.5, level: 3 })).toBe(45);
  });
  it('clamps out-of-range input', () => {
    expect(sessionScore({ accuracy: 1.4, level: 9 })).toBe(100);
    expect(sessionScore({ accuracy: -1, level: 0 })).toBe(0);
  });
});

describe('compareWithBaseline', () => {
  const usual = [70, 72, 68, 71, 69, 70];
  it('no data / establishing baseline', () => {
    expect(compareWithBaseline([], usual).trend).toBe('no data');
    expect(compareWithBaseline([70], [70, 71]).trend).toBe('establishing baseline');
  });
  it('steady when close to usual', () => {
    expect(compareWithBaseline([69, 71], usual)).toMatchObject({ score: 70, baseline: 70, trend: 'steady' });
  });
  it('above baseline from +5', () => {
    expect(compareWithBaseline([76, 77], usual).trend).toBe('above baseline');
  });
  it('watch only on a clear drop (>= 10 points and >= 1.5 spread)', () => {
    expect(compareWithBaseline([62], usual).trend).toBe('steady');
    expect(compareWithBaseline([55, 56], usual).trend).toBe('watch');
  });
  it('a noisy baseline needs a bigger drop before "watch"', () => {
    const noisy = [40, 90, 55, 85, 60, 80];
    expect(compareWithBaseline([55], noisy).trend).toBe('steady');
  });
});

describe('suggestGame', () => {
  const d = (h: number) => new Date(Date.UTC(2026, 10, 20, h));
  it('prefers the least-practised game not played today', () => {
    expect(
      suggestGame([
        { gameId: 'memory-match', playsLast7d: 0, playedToday: true, lastPlayedAt: d(9) },
        { gameId: 'who-is-this', playsLast7d: 4, playedToday: false, lastPlayedAt: d(8) },
        { gameId: 'my-day', playsLast7d: 1, playedToday: false, lastPlayedAt: d(7) },
      ]),
    ).toBe('my-day');
  });
  it('ties go to the game played longest ago (never played first)', () => {
    expect(
      suggestGame([
        { gameId: 'memory-match', playsLast7d: 1, playedToday: false, lastPlayedAt: d(9) },
        { gameId: 'sounds-of-home', playsLast7d: 1, playedToday: false, lastPlayedAt: null },
      ]),
    ).toBe('sounds-of-home');
  });
});

describe('contact helpers', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['91-98765-43210', '+919876543210'],
  ])('normalizes %s', (raw, e164) => expect(normalizePhone(raw)).toBe(e164));
  it.each(['12345', '5876543210', '+1 415 555 0100', 'abc'])('rejects %s', (raw) => expect(normalizePhone(raw)).toBeNull());
  it('masks emails and numbers for logs', () => {
    expect(maskContact('rina@example.com')).toBe('ri***@example.com');
    expect(maskContact('+919876543210')).toBe('+91******3210');
  });
  it('labels users with only a phone without exposing it', () => {
    expect(userLabel({ name: null, email: null, phone: '+919876543210' })).toBe('+91******3210');
    expect(userLabel({ name: null, email: 'arup@example.com' })).toBe('arup');
  });
});
