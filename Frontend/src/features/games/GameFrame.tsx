import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, Page, TreeLines, TreeMark } from '../../components/ui';
import { speak, stopSpeaking } from '../../lib/voice';
import { recordSession } from '../../lib/data';
import type { SessionStats } from './engine';

/** Progress as leaves on a branch — how far along, never a score. */
const LeafProgress = ({ step, total }: { step: number; total: number }) => (
  <div className="flex items-center gap-1.5" aria-label={`Step ${Math.min(step + 1, total)} of ${total}`}>
    {Array.from({ length: total }).map((_, i) => (
      <Icon.Leaf key={i} className={`h-6 w-6 transition-colors duration-300 ${i < step ? 'text-ohara-tea' : 'text-ohara-line-strong'}`} />
    ))}
  </div>
);

/** Shared game frame: title, the spoken instruction, leaf progress, and a way back. */
export const GameFrame = ({
  title,
  instruction,
  step,
  total,
  children,
}: {
  title: string;
  instruction: string;
  step: number;
  total: number;
  children: ReactNode;
}) => {
  useEffect(() => {
    const t = window.setTimeout(() => speak(instruction), 350);
    return () => {
      window.clearTimeout(t);
      stopSpeaking();
    };
  }, [instruction]);

  return (
    <Page>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/patient/play" className="btn-secondary no-underline">
          <Icon.Back /> Games
        </Link>
        <LeafProgress step={step} total={total} />
      </header>
      <section className="card flex animate-rise flex-col gap-2 p-6 sm:flex-row sm:items-center sm:gap-5">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{title}</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{instruction}</h1>
        </div>
        <button type="button" className="btn-secondary shrink-0" onClick={() => speak(instruction, { force: true })} aria-label="Say it again">
          <Icon.Speaker className="h-7 w-7" /> Again
        </button>
      </section>
      {children}
    </Page>
  );
};

/** A gentle hint line — honey, never red. */
export const HintNote = ({ text }: { text: string | null }) =>
  text ? (
    <div role="status" className="flex animate-rise items-center gap-3 rounded-xl bg-ohara-lime-soft p-4 text-lg font-semibold text-ohara-lime-ink">
      <Icon.Leaf className="h-7 w-7 shrink-0" /> {text}
    </div>
  ) : null;

/** Every session ends here, on a win. Records the session (for the caregiver) exactly once. */
export const WinScreen = ({ gameId, gameTitle, stats, onAgain }: { gameId: string; gameTitle: string; stats: SessionStats; onAgain: () => void }) => {
  const record = recordSession;
  const saved = useRef(false);
  useEffect(() => {
    if (!saved.current) {
      saved.current = true;
      record({ gameId, gameTitle, ...stats });
    }
    const t = window.setTimeout(() => speak('You did it! Well done. Your tree has a new leaf.'), 300);
    return () => window.clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <section className="relative flex animate-rise flex-col items-center gap-6 overflow-hidden rounded-2xl bg-ohara-ind px-6 py-14 text-center text-white">
        <TreeLines className="absolute inset-0 h-full w-full text-white/10" />
        <span className="relative grid h-32 w-32 place-items-center rounded-pill bg-white/15 text-ohara-lime">
          <TreeMark className="h-20 w-20" />
        </span>
        <div className="relative">
          <h1 className="text-4xl font-extrabold tracking-tight">You did it 🌿</h1>
          <p className="mt-2 text-xl text-white/85">Well done. Your tree has a new leaf.</p>
        </div>
        <div className="relative flex flex-col gap-3 sm:flex-row">
          <button type="button" className="btn bg-white text-ohara-night hover:bg-ohara-lime" onClick={onAgain}>
            <Icon.Refresh className="h-6 w-6" /> Play again
          </button>
          <Link to="/patient/play" className="btn border border-white/40 text-white no-underline hover:bg-white/10">
            <Icon.Play className="h-6 w-6" /> Other games
          </Link>
        </div>
      </section>
    </Page>
  );
};

/** A big answer button. A wrong tap only dims it; the right one glows honey after a hint. */
export const ChoiceButton = ({
  children,
  onClick,
  glow,
  dim,
  className = '',
}: {
  children: ReactNode;
  onClick: () => void;
  glow?: boolean;
  dim?: boolean;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    data-choice
    data-glow={glow ? '' : undefined}
    className={`flex min-h-[96px] items-center justify-center gap-3 rounded-xl border-2 p-5 text-2xl font-bold transition-[transform,background-color,border-color,opacity] duration-200 hover:-translate-y-0.5 active:translate-y-0 ${
      glow ? 'border-ohara-lime bg-ohara-lime-soft shadow-lift' : 'border-ohara-line bg-ohara-surface shadow-card hover:border-ohara-ind/50'
    } ${dim ? 'opacity-50' : ''} ${className}`}
  >
    {children}
  </button>
);
