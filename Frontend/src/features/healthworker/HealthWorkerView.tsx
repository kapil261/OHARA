import { useMemo, useState } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { Avatar, Icon, Page, PageHeader, Section, Sparkline } from '../../components/ui';
import { useHwPatients } from '../../lib/live';
import { type HwPatient, type HwStatus } from '../../lib/models';
import type { MeResponse } from '../../types';

const ORDER: Record<HwStatus, number> = { attention: 0, watch: 1, stable: 2 };
const STATUS: Record<HwStatus, { label: string; chip: string; line: string }> = {
  attention: { label: 'Needs attention', chip: 'bg-ohara-cri-soft text-ohara-cri-ink', line: 'text-ohara-cri' },
  watch: { label: 'Keep an eye', chip: 'bg-ohara-amb-soft text-ohara-amb-ink', line: 'text-ohara-amb' },
  stable: { label: 'On track', chip: 'bg-ohara-tea-soft text-ohara-tea-ink', line: 'text-ohara-tea' },
};

export const HealthWorkerLayout = () => {
  const me = useOutletContext<MeResponse>();
  const { patients: hwPatients } = useHwPatients();
  const attention = hwPatients.filter((p) => p.status === 'attention').length;
  return (
    <AppShell
      user={{ name: me.displayName ?? 'Health worker', role: 'ASHA worker · Titabar', hue: 'amber' }}
      nav={[{ to: '/healthworker', label: 'Patients', icon: <Icon.Users />, end: true, badge: attention }]}
    >
      <Outlet context={me} />
    </AppShell>
  );
};

/** Health worker: every patient, sorted by "needs attention", with a per-patient side panel. */
export const HealthWorkerPatients = () => {
  const [q, setQ] = useState('');
  const { patients: hwPatients, loading } = useHwPatients();
  const [picked, setSelected] = useState<string>('');
  const selected = picked || hwPatients[0]?.id || '';

  const rows = useMemo(
    () =>
      hwPatients
        .filter((p) => `${p.name} ${p.village}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => ORDER[a.status] - ORDER[b.status]),
    [q, hwPatients],
  );
  const sel = hwPatients.find((p) => p.id === selected) ?? null;
  const count = (s: HwStatus) => hwPatients.filter((p) => p.status === s).length;

  return (
    <Page wide>
      <PageHeader
        eyebrow="Titabar block · 3 villages"
        title="Your patients"
        lead={loading ? 'Loading your patients…' : 'Sorted so the people who need you most are on top. Each person is compared only with their own usual.'}
        actions={
          <label className="relative block w-full sm:w-72">
            <Icon.Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ohara-muted" />
            <input className="input !pl-11" placeholder="Search name or village" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        {(['attention', 'watch', 'stable'] as const).map((s, i) => (
          <div key={s} className="card flex animate-rise flex-col gap-1 p-5" style={{ animationDelay: `${40 + i * 40}ms` }}>
            <span className={`chip w-fit ${STATUS[s].chip}`}>{STATUS[s].label}</span>
            <span className="mt-2 text-3xl font-extrabold tracking-tight">{count(s)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Section className="!p-0 overflow-x-auto" delay={160}>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-ohara-line text-xs uppercase tracking-wider text-ohara-muted">
                <th className="px-5 py-3 font-semibold">Patient</th>
                <th className="hidden px-3 py-3 font-semibold md:table-cell">Status</th>
                <th className="hidden whitespace-nowrap px-3 py-3 font-semibold 2xl:table-cell">7-day activity</th>
                <th className="hidden px-3 py-3 font-semibold sm:table-cell">Medicines</th>
                <th className="whitespace-nowrap px-5 py-3 font-semibold">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(p.id)}
                  tabIndex={0}
                  aria-selected={selected === p.id}
                  className={`cursor-pointer border-b border-ohara-line transition-colors last:border-b-0 hover:bg-ohara-sunken/60 ${selected === p.id ? 'bg-ohara-ind-soft/60' : ''}`}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={p.name} hue={p.status === 'attention' ? 'rose' : p.status === 'watch' ? 'amber' : 'teal'} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{p.name}</p>
                        <p className="truncate text-sm text-ohara-muted">
                          {p.age} · {p.village}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-4 md:table-cell">
                    <span className={`chip whitespace-nowrap ${STATUS[p.status].chip}`}>{STATUS[p.status].label}</span>
                  </td>
                  <td className={`hidden px-3 py-4 2xl:table-cell ${STATUS[p.status].line}`}>
                    <Sparkline values={p.trend} />
                  </td>
                  <td className="hidden px-3 py-4 sm:table-cell">
                    <Adherence value={p.adherence} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-ohara-muted">{p.lastSeen}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-ohara-muted">
                    No one matches “{q}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Section>

        {sel && <PatientPanel p={sel} />}
      </div>
    </Page>
  );
};

const Adherence = ({ value }: { value: number }) => (
  <span className="flex items-center gap-2">
    <span className="relative h-2 w-16 overflow-hidden rounded-pill bg-ohara-sunken">
      <span className={`absolute inset-y-0 left-0 rounded-pill ${value < 0.6 ? 'bg-ohara-cri' : value < 0.9 ? 'bg-ohara-amb' : 'bg-ohara-tea'}`} style={{ width: `${value * 100}%` }} />
    </span>
    <span className="text-sm font-semibold">{Math.round(value * 100)}%</span>
  </span>
);

const PatientPanel = ({ p }: { p: HwPatient }) => {
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const avg = Math.round(p.trend.reduce((a, b) => a + b, 0) / p.trend.length);
  return (
    <aside key={p.id} className="card flex h-fit animate-rise flex-col gap-5 p-6 xl:sticky xl:top-6" aria-label={`${p.name} details`}>
      <div className="flex items-center gap-4">
        <Avatar name={p.name} hue={p.status === 'attention' ? 'rose' : p.status === 'watch' ? 'amber' : 'teal'} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-xl font-bold tracking-tight">{p.name}</p>
          <p className="text-sm text-ohara-muted">
            {p.age} years · {p.village}
          </p>
        </div>
      </div>

      <div className={`rounded-lg p-4 ${STATUS[p.status].chip}`}>
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{STATUS[p.status].label}</p>
        <p className="mt-1 font-semibold">{p.reason}</p>
      </div>

      <div className={STATUS[p.status].line}>
        <div className="mb-1 flex items-baseline justify-between text-ohara-ink">
          <span className="text-sm font-semibold">Activity, last 7 days</span>
          <span className="text-sm text-ohara-muted">avg {avg} min/day</span>
        </div>
        <Sparkline values={p.trend} className="h-20 w-full" />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-ohara-sunken p-3">
          <dt className="text-ohara-muted">Medicines</dt>
          <dd className="mt-1 text-lg font-bold">{Math.round(p.adherence * 100)}%</dd>
        </div>
        <div className="rounded-lg bg-ohara-sunken p-3">
          <dt className="text-ohara-muted">Last seen</dt>
          <dd className="mt-1 font-bold">{p.lastSeen}</dd>
        </div>
        <div className="col-span-2 rounded-lg bg-ohara-sunken p-3">
          <dt className="text-ohara-muted">Caregiver</dt>
          <dd className="mt-1 font-bold">{p.caregiver}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <button type="button" className="btn-primary w-full" onClick={() => setVisited((v) => ({ ...v, [p.id]: true }))} disabled={!!visited[p.id]}>
          {visited[p.id] ? (
            <>
              <Icon.Check className="h-5 w-5" /> Visit logged
            </>
          ) : (
            <>
              <Icon.Plus className="h-5 w-5" /> Log a home visit
            </>
          )}
        </button>
        <a href={`tel:+910000000000`} className="btn-secondary w-full no-underline">
          <Icon.Phone className="h-5 w-5" /> Call caregiver
        </a>
      </div>
    </aside>
  );
};
