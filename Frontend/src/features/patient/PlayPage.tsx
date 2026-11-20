import { Link } from 'react-router-dom';
import { HUE, Icon, Page, PageHeader } from '../../components/ui';
import { games } from '../../lib/demoData';
import { useDemoStore } from '../../store/demoStore';

const GAME_ICON: Record<string, (p: { className?: string }) => JSX.Element> = {
  'memory-match': Icon.Grid,
  'who-is-this': Icon.Family,
  'my-day': Icon.Sun,
  'sounds-of-home': Icon.Speaker,
};

/** Play: the four games as big cards. "Played today" shows as a leaf — never a score. */
export const PlayPage = () => {
  const sessions = useDemoStore((s) => s.sessions);
  const played = new Set(sessions.map((x) => x.gameId));

  return (
    <Page>
      <PageHeader eyebrow="Play" title="Pick a game" lead="Short, gentle games that keep your memories green. There is no wrong answer — we will help you along." />

      <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {games.map((g, i) => {
          const GI = GAME_ICON[g.id];
          return (
            <li key={g.id} className="card group flex animate-rise flex-col overflow-hidden" style={{ animationDelay: `${40 + i * 40}ms` }}>
              <div className={`relative flex h-40 items-end justify-between bg-gradient-to-br p-6 text-white ${HUE[g.hue].ring}`}>
                <GI className="absolute right-6 top-6 h-20 w-20 opacity-25 transition-transform duration-300 group-hover:scale-110" />
                <span className="chip bg-white/20 text-white">
                  <Icon.Brain className="h-4 w-4" /> {g.trains}
                </span>
                {played.has(g.id) && (
                  <span className="chip bg-ohara-lime text-ohara-night">
                    <Icon.Leaf className="h-4 w-4" /> Played today
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-4 p-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">{g.title}</h2>
                  <p className="mt-1 text-lg text-ohara-muted">{g.blurb}</p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-base text-ohara-muted">
                    <Icon.Clock className="h-6 w-6" /> About {g.minutes} min
                  </span>
                  <Link to={`/patient/play/${g.id}`} className="btn-primary no-underline">
                    <Icon.PlayCircle className="h-7 w-7" /> Start
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Page>
  );
};
