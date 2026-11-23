import type { ReactNode } from 'react';
import { Avatar, Icon } from '../../components/ui';
import { activityBaseline, careTeam, weekActivity, type AlertLevel } from '../../lib/demoData';
import { useDemoStore } from '../../store/demoStore';

/** A stat tile: label, the big figure, one line of context. */
export const StatTile = ({
  icon,
  label,
  value,
  note,
  tint,
  delay = 0,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  note: ReactNode;
  tint: string;
  delay?: number;
}) => (
  <div className="card flex animate-rise flex-col gap-4 p-5" style={{ animationDelay: `${delay}ms` }}>
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold text-ohara-muted">{label}</span>
      <span className={`grid h-10 w-10 place-items-center rounded-pill [&>svg]:h-5 [&>svg]:w-5 ${tint}`}>{icon}</span>
    </div>
    <span className="text-3xl font-extrabold tracking-tight">{value}</span>
    <span className="text-sm text-ohara-muted">{note}</span>
  </div>
);

/** Weekly activity bars vs her own baseline (dashed line). No scores, no comparison with others. */
export const ActivityChart = () => {
  const max = Math.max(...weekActivity.map((d) => d.minutes), activityBaseline) * 1.15;
  const basePct = (activityBaseline / max) * 100;
  return (
    <figure>
      <div className="relative flex h-56 items-end gap-3 sm:gap-5">
        <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-ohara-ind/50" style={{ bottom: `${basePct}%` }}>
          <span className="chip absolute -top-3.5 right-0 bg-ohara-ind-soft text-ohara-ind-ink">Her usual · {activityBaseline} min</span>
        </div>
        {weekActivity.map((d, i) => {
          const below = d.minutes < activityBaseline * 0.7;
          const last = i === weekActivity.length - 1;
          return (
            <div key={d.day} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-2">
              <span className="text-xs font-semibold text-ohara-muted opacity-0 transition-opacity group-hover:opacity-100">{d.minutes}m</span>
              <div
                className={`w-full max-w-[44px] rounded-t-[10px] rounded-b-[4px] transition-colors ${
                  last ? 'bg-ohara-lime' : below ? 'bg-ohara-amb/70' : 'bg-ohara-ind'
                }`}
                style={{ height: `${(d.minutes / max) * 100}%` }}
                title={`${d.day}: ${d.minutes} min`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3 sm:gap-5">
        {weekActivity.map((d) => (
          <span key={d.day} className="flex-1 text-center text-xs font-semibold text-ohara-muted">
            {d.day}
          </span>
        ))}
      </div>
      <figcaption className="mt-4 flex flex-wrap gap-4 text-xs text-ohara-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-pill bg-ohara-ind" /> Minutes active</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-pill bg-ohara-amb/70" /> Well below her usual</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-pill bg-ohara-lime" /> Today</span>
      </figcaption>
    </figure>
  );
};

const LEVEL: Record<AlertLevel, { dot: string; chip: string; label: string }> = {
  urgent: { dot: 'bg-ohara-cri', chip: 'bg-ohara-cri-soft text-ohara-cri-ink', label: 'Urgent' },
  warn: { dot: 'bg-ohara-amb', chip: 'bg-ohara-amb-soft text-ohara-amb-ink', label: 'Check' },
  info: { dot: 'bg-ohara-ind', chip: 'bg-ohara-ind-soft text-ohara-ind-ink', label: 'Update' },
};

/** Alert rows with a working Acknowledge button. */
export const AlertList = ({ limit, filter = 'all' }: { limit?: number; filter?: 'all' | 'open' | 'done' }) => {
  const alerts = useDemoStore((s) => s.alerts);
  const acknowledge = useDemoStore((s) => s.acknowledge);
  const list = alerts.filter((a) => (filter === 'open' ? !a.acknowledged : filter === 'done' ? a.acknowledged : true)).slice(0, limit);

  if (!list.length)
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-pill bg-ohara-tea-soft text-ohara-tea-ink">
          <Icon.Leaf className="h-6 w-6" />
        </span>
        <p className="font-semibold">All caught up</p>
        <p className="text-sm text-ohara-muted">Nothing needs your attention.</p>
      </div>
    );

  return (
    <ul className="flex flex-col gap-3">
      {list.map((a) => {
        const L = LEVEL[a.level];
        return (
          <li key={a.id} className={`flex gap-3 rounded-lg border p-4 transition-opacity ${a.acknowledged ? 'border-ohara-line opacity-60' : 'border-ohara-line bg-ohara-surface'} ${a.level === 'urgent' && !a.acknowledged ? 'border-ohara-cri-line bg-ohara-cri-soft' : ''}`}>
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-pill ${L.dot}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{a.title}</p>
                <span className={`chip !py-0.5 ${L.chip}`}>{L.label}</span>
              </div>
              <p className="mt-0.5 text-sm text-ohara-muted">{a.detail}</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-ohara-muted">{a.time}</span>
                {a.acknowledged ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-ohara-tea-ink">
                    <Icon.Check className="h-4 w-4" /> Acknowledged
                  </span>
                ) : (
                  <button type="button" onClick={() => acknowledge(a.id)} className="btn-secondary !min-h-[34px] !px-3.5 !text-sm">
                    Acknowledge
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export const TeamList = ({ compact }: { compact?: boolean }) => (
  <ul className={compact ? 'flex flex-col gap-1' : 'grid grid-cols-1 gap-4 md:grid-cols-2'}>
    {careTeam.map((m) => (
      <li key={m.id} className={`flex items-center gap-3 ${compact ? 'rounded-lg px-1 py-2' : 'card p-5'}`}>
        <Avatar name={m.name} hue={m.hue} size={compact ? 'md' : 'lg'} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{m.name}</p>
          <p className="truncate text-sm text-ohara-muted">{m.role}</p>
        </div>
        <span className={`chip shrink-0 ${m.access === 'Owner' ? 'bg-ohara-night text-white' : 'bg-ohara-sunken text-ohara-muted'}`}>{m.access}</span>
      </li>
    ))}
  </ul>
);
