import type { Domain } from '../../utils/scores.js';

/** Static game catalogue with per-level settings. Levels are chosen by the adaptive engine (target ~78% success). */
export interface GameDef {
  id: string;
  title: string;
  description: string;
  domain: Domain;
  levels: { level: number; [setting: string]: number }[];
}

export const GAMES: GameDef[] = [
  {
    id: 'memory-match',
    title: 'Memory match',
    description: 'Find the pairs',
    domain: 'memory',
    levels: [
      { level: 1, pairs: 2, revealMs: 3000 },
      { level: 2, pairs: 3, revealMs: 2500 },
      { level: 3, pairs: 4, revealMs: 2000 },
      { level: 4, pairs: 5, revealMs: 1500 },
      { level: 5, pairs: 6, revealMs: 1200 },
    ],
  },
  {
    id: 'who-is-this',
    title: 'Who is this?',
    description: 'Family faces',
    domain: 'recognition',
    levels: [
      { level: 1, choices: 2, rounds: 4 },
      { level: 2, choices: 2, rounds: 6 },
      { level: 3, choices: 3, rounds: 6 },
      { level: 4, choices: 4, rounds: 6 },
      { level: 5, choices: 4, rounds: 8 },
    ],
  },
  {
    id: 'my-day',
    title: 'My day',
    description: 'Put the routine in order',
    domain: 'routine',
    levels: [
      { level: 1, steps: 2 },
      { level: 2, steps: 3 },
      { level: 3, steps: 4 },
      { level: 4, steps: 5 },
      { level: 5, steps: 6 },
    ],
  },
  {
    id: 'sounds-of-home',
    title: 'Sounds of home',
    description: 'Which sound is it?',
    domain: 'attention',
    levels: [
      { level: 1, choices: 2, plays: 3 },
      { level: 2, choices: 3, plays: 3 },
      { level: 3, choices: 3, plays: 2 },
      { level: 4, choices: 4, plays: 2 },
      { level: 5, choices: 4, plays: 1 },
    ],
  },
];

export const gameById = (id: string) => GAMES.find((g) => g.id === id);

/**
 * "Suggested today": the game whose domain has had the least practice in the last week,
 * skipping games already played today; ties go to the one played longest ago.
 */
export function suggestGame(stats: { gameId: string; playsLast7d: number; playedToday: boolean; lastPlayedAt: Date | null }[]): string {
  const ranked = [...stats].sort(
    (a, b) =>
      Number(a.playedToday) - Number(b.playedToday) ||
      a.playsLast7d - b.playsLast7d ||
      (a.lastPlayedAt?.getTime() ?? 0) - (b.lastPlayedAt?.getTime() ?? 0),
  );
  return ranked[0]?.gameId ?? GAMES[0].id;
}
