import { useEffect, useState } from 'react';
import { FamilyPhoto, HUE, Icon, Page, PageHeader } from '../../components/ui';
import { demoPatient } from '../../lib/demoData';
import { speak, stopSpeaking } from '../../lib/voice';
import { useDemoStore } from '../../store/demoStore';

/** My Family: photo cards; "Hear voice" speaks a greeting from that person (real recorded clips arrive with the backend). */
export const FamilyPage = () => {
  const family = useDemoStore((s) => s.family);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(
    () => () => {
      stopSpeaking();
    },
    [],
  );

  const hear = (id: string) => {
    if (playing === id) {
      stopSpeaking();
      setPlaying(null);
      return;
    }
    const f = family.find((x) => x.id === id);
    if (!f) return;
    const text = `Hello ${demoPatient.displayName}, it's ${f.name}, your ${f.relation.toLowerCase()}. Do you remember? ${f.memory}. I love you.`;
    speak(text, { force: true });
    setPlaying(id);
    window.setTimeout(() => setPlaying((p) => (p === id ? null : p)), Math.min(14000, text.length * 95));
  };

  return (
    <Page>
      <PageHeader eyebrow="My Family" title="Your family tree" lead="The people who love you. Touch a picture to hear their voice." />

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {family.map((f, i) => {
          const on = playing === f.id;
          return (
            <li key={f.id} className="animate-rise" style={{ animationDelay: `${40 + i * 40}ms` }}>
              <button
                type="button"
                onClick={() => hear(f.id)}
                aria-pressed={on}
                className={`card group flex w-full flex-col overflow-hidden text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-lift ${on ? 'ring-4 ring-ohara-lime' : ''}`}
              >
                <span className="relative block aspect-[4/3] w-full">
                  <FamilyPhoto m={f} letter="text-7xl" className="absolute inset-0 h-full w-full" />
                  <span
                    className={`absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-base font-semibold shadow-card transition-colors ${
                      on ? 'bg-ohara-lime text-ohara-night' : 'bg-white text-ohara-night'
                    }`}
                  >
                    {on ? <Icon.Speaker className="h-6 w-6" /> : <Icon.PlayCircle className="h-6 w-6" />}
                    {on ? 'Speaking…' : 'Hear voice'}
                  </span>
                </span>
                <span className="flex flex-col gap-1 p-5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-2xl font-bold tracking-tight">{f.name}</span>
                    <span className={`chip ${HUE[f.hue].soft}`}>{f.relation}</span>
                  </span>
                  <span className="text-base text-ohara-muted">{f.memory}</span>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-sm text-ohara-muted">
                    <Icon.Pin className="h-4 w-4" /> {f.place}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Page>
  );
};
