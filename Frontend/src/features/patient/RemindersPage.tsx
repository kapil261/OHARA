import { Icon, Page, PageHeader, TreeLines } from '../../components/ui';
import { fmtTime } from '../../lib/models';
import { setStatus, useSchedule } from '../../lib/data';
import { useUiStore } from '../../store/uiStore';
import { KindBadge, StatusChip, nextItem } from './schedule-ui';

/** Reminders: today's routine. Done / Later change the state everywhere (demo store). */
export const RemindersPage = () => {
  const { schedule } = useSchedule();
  const ring = useUiStore((s) => s.ring);
  const next = nextItem(schedule);
  const done = schedule.filter((s) => s.status === 'done').length;
  const pct = schedule.length ? Math.round((done / schedule.length) * 100) : 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Reminders"
        title="Your day"
        lead="Each reminder plays in your family's voice. Every one you finish adds a leaf to your tree."
        actions={
          <>
          {next && (
            <button type="button" className="btn-secondary" onClick={() => ring(next.id)}>
              <Icon.Bell className="h-6 w-6" /> Ring now
            </button>
          )}
          <span className="inline-flex items-center gap-3 rounded-pill border border-ohara-line bg-ohara-surface px-5 py-3 text-base font-semibold">
            <span className="relative h-3 w-28 overflow-hidden rounded-pill bg-ohara-sunken">
              <span className="absolute inset-y-0 left-0 rounded-pill bg-ohara-tea transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </span>
            {done} of {schedule.length} done
          </span>
          </>
        }
      />

      {/* The one that's ringing now */}
      {next ? (
        <section className="relative animate-rise overflow-hidden rounded-2xl bg-ohara-ind p-6 text-white sm:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-pill bg-ohara-lime/25 blur-3xl" />
          <TreeLines className="absolute bottom-0 right-0 h-full w-1/2 text-white/15" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-pill bg-white/15">
              <Icon.Bell className="h-10 w-10" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg text-white/75">Now · {fmtTime(next.time)}</p>
              <h2 className="text-3xl font-extrabold tracking-tight">{next.title}</h2>
              <p className="mt-1 text-lg text-white/80">
                {next.detail} · <span className="text-ohara-lime">voice of {next.voice}</span>
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className="btn bg-white text-ohara-night hover:bg-ohara-lime" onClick={() => setStatus(next.id, 'done')}>
                <Icon.Check className="h-7 w-7" /> Done
              </button>
              <button type="button" className="btn border border-white/40 text-white hover:bg-white/10" onClick={() => setStatus(next.id, 'snoozed')}>
                <Icon.Clock className="h-7 w-7" /> Later
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="relative flex animate-rise items-center gap-5 overflow-hidden rounded-2xl bg-ohara-tea-soft p-8">
          <TreeLines className="absolute bottom-0 right-0 h-full w-1/2 text-ohara-tea/30" />
          <span className="relative grid h-20 w-20 shrink-0 place-items-center rounded-pill bg-ohara-tea text-white">
            <Icon.Tree className="h-12 w-12" />
          </span>
          <div className="relative">
            <h2 className="text-3xl font-extrabold tracking-tight text-ohara-tea-ink">Your tree grew today</h2>
            <p className="text-lg text-ohara-muted">Everything is done. Well done — rest well.</p>
          </div>
        </section>
      )}

      <ol className="card animate-rise divide-y divide-ohara-line" style={{ animationDelay: '80ms' }}>
        {schedule.map((s) => (
          <li key={s.id} className={`flex flex-wrap items-center gap-4 p-5 sm:flex-nowrap ${s.status === 'next' ? 'bg-ohara-lime-soft/60' : ''}`}>
            <span className="w-28 shrink-0 text-lg font-semibold text-ohara-muted">{fmtTime(s.time)}</span>
            <KindBadge kind={s.kind} size="lg" />
            <div className="min-w-0 flex-1">
              <p className={`text-xl font-bold ${s.status === 'done' ? 'text-ohara-muted line-through decoration-2' : ''}`}>{s.title}</p>
              <p className="text-base text-ohara-muted">{s.detail}</p>
            </div>
            <StatusChip status={s.status} />
            {s.status === 'done' ? (
              <button type="button" className="btn-ghost" onClick={() => setStatus(s.id, 'later')}>
                Undo
              </button>
            ) : (
              <button type="button" className="btn-secondary" onClick={() => setStatus(s.id, 'done')}>
                <Icon.Check className="h-6 w-6" /> Done
              </button>
            )}
          </li>
        ))}
      </ol>
    </Page>
  );
};
