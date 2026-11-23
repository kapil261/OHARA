import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { FamilyPhoto, Icon } from '../../components/ui';
import { games } from '../../lib/demoData';
import { playSound, type SoundId } from '../../lib/sounds';
import { speak } from '../../lib/voice';
import { useDemoStore } from '../../store/demoStore';
import { Session, shuffle, type SessionStats } from './engine';
import { ChoiceButton, GameFrame, HintNote, WinScreen } from './GameFrame';
import { useChoiceGame } from './useChoiceGame';

/* ------------------------------------------------------------------ */
/* Who is this? — recognise family from their pictures                */
/* ------------------------------------------------------------------ */

const WhoIsThis = ({ onAgain }: { onAgain: () => void }) => {
  const family = useDemoStore((s) => s.family);
  const g = useChoiceGame('who-is-this', () => {
    const picks = shuffle(family).slice(0, Math.min(4, family.length));
    return {
      steps: picks.map((m) => ({
        prompt: m.id,
        answer: m.name,
        choices: shuffle([m.name, ...shuffle(family.filter((f) => f.id !== m.id)).slice(0, 2).map((f) => f.name)]),
        hint: `This is your ${m.relation.toLowerCase()}. The name starts with ${m.name[0]}.`,
      })),
    };
  });
  if (g.stats) return <WinScreen gameId="who-is-this" gameTitle="Who is this?" stats={g.stats} onAgain={onAgain} />;
  const person = family.find((f) => f.id === g.round.prompt)!;
  return (
    <GameFrame title="Who is this?" instruction="Who is in this picture?" step={g.step} total={g.total}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
        <FamilyPhoto key={person.id} m={person} letter="text-[9rem]" className="aspect-square w-full max-w-md animate-rise justify-self-center rounded-2xl shadow-lift" />
        <div className="flex flex-col gap-4">
          {g.round.choices.map((c) => (
            <ChoiceButton key={c} onClick={() => g.answerWith(c)} glow={!!g.hint && c === g.answer} dim={g.dimmed.includes(c)}>
              {c}
            </ChoiceButton>
          ))}
          <HintNote text={g.hint} />
        </div>
      </div>
    </GameFrame>
  );
};

/* ------------------------------------------------------------------ */
/* Sounds of Home — listen and pick what makes the sound             */
/* ------------------------------------------------------------------ */

const SOUNDS: Record<SoundId, { label: string; emoji: string; hint: string }> = {
  rain: { label: 'Rain', emoji: '🌧️', hint: 'It is water falling from the sky, on the roof.' },
  bell: { label: 'Temple bell', emoji: '🔔', hint: 'You hear it at the namghar or temple, at prayer time.' },
  birds: { label: 'Birds', emoji: '🐦', hint: 'They sing in the trees early in the morning.' },
  clock: { label: 'Clock', emoji: '🕰️', hint: 'Tick, tock — it keeps the time on the wall.' },
};

const SoundsOfHome = ({ onAgain }: { onAgain: () => void }) => {
  const g = useChoiceGame('sounds-of-home', () => {
    const ids = shuffle(Object.keys(SOUNDS) as SoundId[]);
    return {
      steps: ids.map((id) => ({
        prompt: id,
        answer: id,
        choices: shuffle([id, ...shuffle(ids.filter((x) => x !== id)).slice(0, 2)]),
        hint: `Listen again. ${SOUNDS[id].hint}`,
      })),
    };
  });
  const [heard, setHeard] = useState(false);
  useEffect(() => setHeard(false), [g.round.id]);
  if (g.stats) return <WinScreen gameId="sounds-of-home" gameTitle="Sounds of Home" stats={g.stats} onAgain={onAgain} />;
  const id = g.round.prompt as SoundId;
  const play = () => {
    playSound(id);
    setHeard(true);
  };
  return (
    <GameFrame title="Sounds of Home" instruction="Listen. What makes this sound?" step={g.step} total={g.total}>
      <div className="flex flex-col items-center gap-6">
        <button
          type="button"
          onClick={play}
          className={`grid h-44 w-44 place-items-center rounded-pill text-white shadow-lift transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98] ${heard ? 'bg-ohara-ind-hover' : 'bg-ohara-ind'}`}
          aria-label="Play the sound"
        >
          <span className="flex flex-col items-center gap-1">
            <Icon.Speaker className="h-16 w-16" />
            <span className="text-lg font-bold">{heard ? 'Play again' : 'Play sound'}</span>
          </span>
        </button>
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {g.round.choices.map((c) => {
            const sd = SOUNDS[c as SoundId];
            return (
              <ChoiceButton key={c} onClick={() => g.answerWith(c)} glow={!!g.hint && c === g.answer} dim={g.dimmed.includes(c)} className="flex-col !gap-2 py-6">
                <span className="text-6xl leading-none" aria-hidden="true">
                  {sd.emoji}
                </span>
                {sd.label}
              </ChoiceButton>
            );
          })}
        </div>
        <div className="w-full">
          <HintNote text={g.hint} />
        </div>
      </div>
    </GameFrame>
  );
};

/* ------------------------------------------------------------------ */
/* My Day — put the routine in order                                  */
/* ------------------------------------------------------------------ */

const DAYS: { name: string; steps: [string, string][] }[] = [
  {
    name: 'morning',
    steps: [
      ['🌅', 'Wake up'],
      ['🪥', 'Brush teeth'],
      ['🍵', 'Morning tea'],
      ['💊', 'Medicine'],
      ['🍚', 'Breakfast'],
    ],
  },
  {
    name: 'evening',
    steps: [
      ['🚶', 'Evening walk'],
      ['🪔', 'Light the lamp'],
      ['🍽️', 'Dinner'],
      ['💊', 'Night medicine'],
      ['🛏️', 'Sleep'],
    ],
  },
];

const MyDay = ({ onAgain }: { onAgain: () => void }) => {
  const [placed, setPlaced] = useState<string[]>([]);
  const g = useChoiceGame(
    'my-day',
    () => {
      const steps = DAYS.flatMap((day) => {
        const labels = day.steps.map((s) => s[1] as string);
        return labels.map((label, k) => ({
          prompt: day.name,
          answer: label,
          choices: shuffle(labels.slice(k)),
          hint: k === 0 ? `We start the ${day.name} with: ${label}.` : `After ${labels[k - 1].toLowerCase()} comes: ${label}.`,
        }));
      });
      return { steps, roundOf: (i) => (i < DAYS[0].steps.length ? 0 : 1) };
    },
    (choice) => setPlaced((p) => [...p, choice]),
  );
  const dayIndex = g.round.prompt === 'morning' ? 0 : 1;
  const day = DAYS[dayIndex];
  const emojiOf = (label: string) => DAYS.flatMap((d) => d.steps).find((s) => s[1] === label)?.[0] ?? '';
  const placedHere = placed.filter((p) => day.steps.some((s) => s[1] === p));

  // A new part of the day: speak it.
  const lastDay = useRef(dayIndex);
  useEffect(() => {
    if (lastDay.current !== dayIndex) {
      lastDay.current = dayIndex;
      speak('Well done! Now the evening.');
    }
  }, [dayIndex]);

  if (g.stats)
    return (
      <WinScreen
        gameId="my-day"
        gameTitle="My Day"
        stats={g.stats}
        onAgain={() => {
          setPlaced([]);
          onAgain();
        }}
      />
    );

  return (
    <GameFrame title="My Day" instruction={dayIndex === 0 ? 'What do we do first in the morning? Tap in order.' : 'Now the evening. What comes first?'} step={g.step} total={g.total}>
      <section className="card p-5">
        <p className="eyebrow mb-3">{dayIndex === 0 ? 'Your morning' : 'Your evening'}</p>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          {day.steps.map((_, k) => {
            const label = placedHere[k];
            return (
              <li
                key={k}
                className={`flex min-h-[88px] items-center gap-3 rounded-xl border-2 border-dashed p-3 sm:flex-col sm:justify-center sm:text-center ${
                  label ? 'animate-rise border-transparent bg-ohara-tea-soft' : 'border-ohara-line-strong'
                }`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-ohara-surface text-base font-bold text-ohara-muted">{k + 1}</span>
                {label && (
                  <span className="flex items-center gap-2 text-lg font-bold sm:flex-col sm:gap-1">
                    <span className="text-3xl" aria-hidden="true">
                      {emojiOf(label)}
                    </span>
                    {label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {g.round.choices.map((c) => (
          <ChoiceButton key={c} onClick={() => g.answerWith(c)} glow={!!g.hint && c === g.answer} dim={g.dimmed.includes(c)} className="flex-col !gap-2 !text-xl">
            <span className="text-5xl leading-none" aria-hidden="true">
              {emojiOf(c)}
            </span>
            {c}
          </ChoiceButton>
        ))}
      </div>
      <HintNote text={g.hint} />
    </GameFrame>
  );
};

/* ------------------------------------------------------------------ */
/* Memory Match — flip cards, find the pairs                          */
/* ------------------------------------------------------------------ */

const PICTURES = ['🍵', '🔔', '🍚', '☂️', '🐟', '🌺', '🐘', '🥭'];
const LEVELS = [3, 4]; // pairs per round; the ML service will tune this later

interface Card {
  key: string;
  pic: string;
}

const MemoryMatch = ({ onAgain }: { onAgain: () => void }) => {
  const session = useRef(new Session());
  const [round, setRound] = useState(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [open, setOpen] = useState<string[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [glow, setGlow] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const misses = useRef(0);

  useEffect(() => {
    const pics = shuffle(PICTURES).slice(0, LEVELS[round]);
    setCards(shuffle(pics.flatMap((p) => [{ key: `${p}-a`, pic: p }, { key: `${p}-b`, pic: p }])));
    setOpen([]);
    setFound([]);
    setHint(null);
    misses.current = 0;
  }, [round]);

  const flip = (c: Card) => {
    if (open.length === 2 || open.includes(c.key) || found.includes(c.pic)) return;
    const nowOpen = [...open, c.key];
    setOpen(nowOpen);
    if (nowOpen.length < 2) return;
    const [a, b] = nowOpen.map((k) => cards.find((x) => x.key === k)!);
    if (a.pic === b.pic) {
      session.current.correct();
      misses.current = 0;
      setHint(null);
      setGlow(null);
      const nf = [...found, a.pic];
      setFound(nf);
      setOpen([]);
      if (nf.length === LEVELS[round]) {
        session.current.roundDone();
        window.setTimeout(() => {
          if (round + 1 < LEVELS.length) {
            speak('Well done! Here are some more cards.');
            setRound(round + 1);
          } else setStats(session.current.finish());
        }, 700);
      }
    } else {
      session.current.miss();
      misses.current++;
      window.setTimeout(() => setOpen([]), 1100);
      if (misses.current >= 2) {
        // Gentle hint: light up one pair that hasn't been found yet.
        const left = cards.find((x) => !found.includes(x.pic));
        if (left) {
          session.current.hint();
          misses.current = 0;
          setGlow(left.pic);
          const text = 'Look — the two glowing cards go together.';
          setHint(text);
          speak(text);
        }
      }
    }
  };

  if (stats) return <WinScreen gameId="memory-match" gameTitle="Memory Match" stats={stats} onAgain={onAgain} />;

  const total = LEVELS.reduce((a, b) => a + b, 0);
  const doneSoFar = LEVELS.slice(0, round).reduce((a, b) => a + b, 0) + found.length;

  return (
    <GameFrame title="Memory Match" instruction="Turn over two cards. Find the pictures that match." step={doneSoFar} total={total}>
      <div className={`mx-auto grid w-full gap-4 ${cards.length <= 6 ? 'max-w-xl grid-cols-3' : 'max-w-2xl grid-cols-4'}`}>
        {cards.map((c) => {
          const shown = open.includes(c.key) || found.includes(c.pic);
          const isFound = found.includes(c.pic);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => flip(c)}
              data-card
              aria-label={shown ? c.pic : 'Hidden card'}
              className={`grid aspect-square place-items-center rounded-xl border-2 text-5xl shadow-card transition-[transform,background-color,border-color] duration-300 sm:text-7xl ${
                isFound
                  ? 'border-ohara-tea/40 bg-ohara-tea-soft'
                  : shown
                    ? 'border-ohara-ind/40 bg-ohara-surface'
                    : glow === c.pic
                      ? 'border-ohara-lime bg-ohara-lime-soft'
                      : 'border-transparent bg-ohara-ind hover:-translate-y-0.5'
              }`}
            >
              {shown ? <span className="animate-rise">{c.pic}</span> : <Icon.Leaf className={`h-12 w-12 ${glow === c.pic ? 'text-ohara-lime-ink' : 'text-white/40'}`} />}
            </button>
          );
        })}
      </div>
      <HintNote text={hint} />
    </GameFrame>
  );
};

/* ------------------------------------------------------------------ */
/* Route                                                               */
/* ------------------------------------------------------------------ */

const BY_ID = { 'memory-match': MemoryMatch, 'who-is-this': WhoIsThis, 'my-day': MyDay, 'sounds-of-home': SoundsOfHome } as const;

export const GamePage = () => {
  const { gameId = '' } = useParams();
  const [run, setRun] = useState(0); // bump to play again with a fresh session
  const G = BY_ID[gameId as keyof typeof BY_ID];
  if (!G || !games.some((g) => g.id === gameId)) return <Navigate to="/patient/play" replace />;
  return <G key={run} onAgain={() => setRun((r) => r + 1)} />;
};
