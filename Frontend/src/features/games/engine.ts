/**
 * Game engine — the README's contract:
 *
 *   interface Game {
 *     id: string;
 *     start(level: number): Round;
 *     answer(roundId: string, choice: string): { correct: boolean; hint?: string };
 *     finish(): SessionResult; // accuracy, responseTimeMs, hintsUsed
 *   }
 *
 * Dignity rules live here, not in the UI: errorless learning (a wrong answer only earns a hint and the
 * round waits for the right one), no visible score, and a session always ends on a correct answer — a win.
 * Difficulty (`level`) will come from the ML service; for now it's a fixed starting level.
 */

export interface Round {
  id: string;
  prompt: string;
  choices: string[];
}

export interface SessionStats {
  accuracy: number; // share of answers right on the first try (caregiver-only)
  responseTimeMs: number; // average time to the right answer
  hintsUsed: number;
  rounds: number;
}

export interface Game {
  id: string;
  start(level: number): Round;
  answer(roundId: string, choice: string): { correct: boolean; hint?: string; next?: Round; done?: boolean };
  finish(): SessionStats;
}

export const shuffle = <T,>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Tracks the numbers a caregiver sees later. Never shown to the elder. */
export class Session {
  private last = performance.now();
  private times: number[] = [];
  private missedThis = false;
  answers = 0;
  firstTry = 0;
  hints = 0;
  rounds = 0;

  correct() {
    this.answers++;
    if (!this.missedThis) this.firstTry++;
    this.missedThis = false;
    const now = performance.now();
    this.times.push(now - this.last);
    this.last = now;
  }
  miss() {
    this.missedThis = true;
  }
  hint() {
    this.hints++;
  }
  roundDone() {
    this.rounds++;
  }
  finish(): SessionStats {
    const avg = this.times.length ? this.times.reduce((a, b) => a + b, 0) / this.times.length : 0;
    return { accuracy: this.answers ? this.firstTry / this.answers : 1, responseTimeMs: Math.round(avg), hintsUsed: this.hints, rounds: Math.max(1, this.rounds) };
  }
}

export interface ChoiceStep {
  prompt: string;
  choices: string[];
  answer: string;
  hint: string;
}

/** A multiple-choice game (Who is this?, Sounds of Home, My Day) built on the Game contract. */
export function createChoiceGame(id: string, steps: ChoiceStep[], roundOf: (stepIndex: number) => number = () => 0): Game {
  const s = new Session();
  let i = 0;
  const roundFor = (k: number): Round => ({ id: `${id}-${k}`, prompt: steps[k].prompt, choices: steps[k].choices });
  return {
    id,
    start: () => {
      i = 0;
      return roundFor(0);
    },
    answer: (roundId, choice) => {
      if (roundId !== `${id}-${i}`) return { correct: false };
      const step = steps[i];
      if (choice !== step.answer) {
        s.miss();
        s.hint();
        return { correct: false, hint: step.hint };
      }
      s.correct();
      const prevRound = roundOf(i);
      i++;
      if (i >= steps.length || roundOf(i) !== prevRound) s.roundDone();
      if (i >= steps.length) return { correct: true, done: true };
      return { correct: true, next: roundFor(i) };
    },
    finish: () => s.finish(),
  };
}
