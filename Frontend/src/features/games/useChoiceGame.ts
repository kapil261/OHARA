import { useCallback, useState } from 'react';
import { speak } from '../../lib/voice';
import { createChoiceGame, type ChoiceStep, type Game, type Round, type SessionStats } from './engine';

/** Drives a choice game: current round, gentle hint state, and the finish. */
export function useChoiceGame(id: string, build: () => { steps: ChoiceStep[]; roundOf?: (i: number) => number }, onCorrect?: (choice: string) => void) {
  const make = useCallback(() => {
    const { steps, roundOf } = build();
    const game: Game = createChoiceGame(id, steps, roundOf);
    return { game, steps, round: game.start(1) };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [state, setState] = useState(make);
  const [step, setStep] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [dimmed, setDimmed] = useState<string[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);

  const answer = (choice: string) => {
    const res = state.game.answer(state.round.id, choice);
    if (!res.correct) {
      if (res.hint) {
        setHint(res.hint);
        speak(res.hint);
      }
      setDimmed((d) => [...d, choice]);
      return;
    }
    onCorrect?.(choice);
    setHint(null);
    setDimmed([]);
    setStep((s) => s + 1);
    if (res.done) setStats(state.game.finish());
    else if (res.next) setState((st) => ({ ...st, round: res.next as Round }));
  };

  const restart = () => {
    setState(make());
    setStep(0);
    setHint(null);
    setDimmed([]);
    setStats(null);
  };

  const current = state.steps[step];
  return { round: state.round, step, total: state.steps.length, answer: current?.answer, hint, dimmed, stats, answerWith: answer, restart };
}
