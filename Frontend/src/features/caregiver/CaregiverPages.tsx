import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, Page, PageHeader, Section } from '../../components/ui';
import { fmtTime } from '../../lib/models';
import { patientLine, usePatientInfo, useProgress } from '../../lib/live';
import { useSchedule } from '../../lib/data';
import { KindBadge, StatusChip } from '../patient/schedule-ui';
import { ActivityChart, AlertList, StatTile, TeamList } from './caregiver-ui';
import { GameHistory } from './CaregiverTools';

/** A short "done" note for demo-only actions, so no button is silently dead. */
const useFlash = () => {
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 2600);
  };
  const node = msg && (
    <div role="status" className="fixed bottom-6 right-6 z-50 flex animate-rise items-center gap-2 rounded-pill bg-ohara-night px-5 py-3 text-sm font-semibold text-white shadow-lift">
      <span className="h-2.5 w-2.5 rounded-pill bg-ohara-lime" /> {msg}
    </div>
  );
  return { flash, node };
};

export const CaregiverOverview = () => {
  const schedule = useSchedule().schedule;
  const { node } = useFlash();
  const navigate = useNavigate();
  const meds = schedule.filter((s) => s.kind === 'medicine');
  const medsDone = meds.filter((s) => s.status === 'done').length;
  const done = schedule.filter((s) => s.status === 'done').length;
  const demoPatient = usePatientInfo();
  const { weekActivity, activityBaseline } = useProgress();
  const today = weekActivity[weekActivity.length - 1]?.minutes ?? 0;

  return (
    <Page wide>
      <PageHeader
        eyebrow="Caring for"
        title={demoPatient.fullName}
        lead={patientLine(demoPatient)}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => navigate('/caregiver/report')}>
              <Icon.Download className="h-5 w-5" /> Weekly report
            </button>
            <button type="button" className="btn-primary" onClick={() => navigate('/caregiver/schedule?new=1')}>
              <Icon.Plus className="h-5 w-5" /> Add reminder
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile delay={40} icon={<Icon.Pill />} tint="bg-ohara-ind-soft text-ohara-ind-ink" label="Medicines" value={`${medsDone} of ${meds.length}`} note={medsDone === meds.length ? 'All taken today' : 'Evening dose still due'} />
        <StatTile delay={80} icon={<Icon.Chart />} tint="bg-ohara-lime-soft text-ohara-lime-ink" label="Active today" value={`${today} min`} note={`Her usual is ${activityBaseline} min`} />
        <StatTile delay={120} icon={<Icon.Clock />} tint="bg-ohara-sky text-ohara-sky-ink" label="Last active" value="9:20 AM" note="Played Memory Match" />
        <StatTile delay={160} icon={<Icon.Leaf />} tint="bg-ohara-rose-soft text-ohara-rose-ink" label="Routine" value={`${done}/${schedule.length}`} note="Reminders done today" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section className="xl:col-span-2" delay={200} title="This week" action={<span className="chip bg-ohara-sunken text-ohara-muted">Compared with her own usual</span>}>
          <ActivityChart />
        </Section>
        <Section
          delay={240}
          title="Alerts"
          action={
            <Link to="/caregiver/alerts" className="inline-flex items-center gap-1 text-sm font-semibold text-ohara-ind-ink no-underline hover:underline">
              All <Icon.Chevron className="h-4 w-4" />
            </Link>
          }
        >
          <AlertList limit={3} filter="open" />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section
          className="xl:col-span-2"
          delay={280}
          title="Today's schedule"
          action={
            <Link to="/caregiver/schedule" className="inline-flex items-center gap-1 text-sm font-semibold text-ohara-ind-ink no-underline hover:underline">
              Edit <Icon.Chevron className="h-4 w-4" />
            </Link>
          }
        >
          <ol className="flex flex-col">
            {schedule.map((s) => (
              <li key={s.id} className="flex items-center gap-4 border-t border-ohara-line py-3 first:border-t-0">
                <span className="w-20 shrink-0 text-sm font-semibold text-ohara-muted">{fmtTime(s.time)}</span>
                <KindBadge kind={s.kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.title}</p>
                  <p className="truncate text-sm text-ohara-muted">
                    {s.detail} · voice of {s.voice}
                  </p>
                </div>
                <StatusChip status={s.status} />
              </li>
            ))}
          </ol>
        </Section>
        <Section
          delay={320}
          title="Care team"
          action={
            <Link to="/caregiver/team" className="inline-flex items-center gap-1 text-sm font-semibold text-ohara-ind-ink no-underline hover:underline">
              Manage <Icon.Chevron className="h-4 w-4" />
            </Link>
          }
        >
          <TeamList compact />
        </Section>
      </div>

      <Section delay={360} title="Games played" action={<span className="chip bg-ohara-sunken text-ohara-muted">Only compared with her own usual</span>}>
        <GameHistory limit={5} />
      </Section>
      {node}
    </Page>
  );
};

export const CaregiverAlerts = () => {
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');
  const tabs = [
    ['open', 'Open'],
    ['done', 'Acknowledged'],
    ['all', 'All'],
  ] as const;
  return (
    <Page>
      <PageHeader eyebrow="Alerts" title="What needs you" lead="Missed reminders, SOS and changes from Bina's own usual. Acknowledge to let the team know you've seen it." />
      <div className="flex gap-2" role="tablist">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={`rounded-pill px-4 py-2 text-sm font-semibold transition-colors ${filter === k ? 'bg-ohara-night text-white' : 'bg-ohara-surface text-ohara-muted hover:text-ohara-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Section>
        <AlertList filter={filter} />
      </Section>
    </Page>
  );
};

export const CaregiverTeam = () => {
  const { flash, node } = useFlash();
  return (
    <Page>
      <PageHeader
        eyebrow="Care team"
        title="The roots that hold Bina up"
        lead="Everyone here gets alerts. Choose what each person can see and change."
        actions={
          <button type="button" className="btn-primary" onClick={() => flash('Invite sent (demo)')}>
            <Icon.Plus className="h-5 w-5" /> Invite someone
          </button>
        }
      />
      <TeamList />
      <Section title="Pair Bina's phone">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <span className="rounded-lg border-2 border-dashed border-ohara-line-strong px-6 py-3 font-mono text-2xl font-bold tracking-[0.3em] text-ohara-ind-ink">AB3F9</span>
          <p className="text-sm text-ohara-muted">Enter this code on Bina's phone, or scan the QR from the OHARA app. The code changes every 10 minutes.</p>
        </div>
      </Section>
      {node}
    </Page>
  );
};
