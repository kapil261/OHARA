import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGateMe } from '../../app/AppGate';
import { ActionTile, FamilyPhoto, Icon, Page, Section, TreeLines } from '../../components/ui';
import { useT } from '../../i18n/strings';
import { demoPatient, fmtTime } from '../../lib/demoData';
import { speak, stopSpeaking } from '../../lib/voice';
import { useDemoStore } from '../../store/demoStore';
import { KindBadge, StatusChip, nextItem } from './schedule-ui';

/**
 * Patient home: greeting, four big tiles (Play, My Family, Reminders, SOS),
 * then today's routine next to a family strip. One action per tile, icons plus voice.
 */
export const PatientHome = () => {
  const me = useGateMe();
  const t = useT();
  const name = me.patient?.displayName || demoPatient.displayName;
  const schedule = useDemoStore((s) => s.schedule);
  const family = useDemoStore((s) => s.family);
  const [speaking, setSpeaking] = useState(false);
  const next = nextItem(schedule);
  const done = schedule.filter((s) => s.status === 'done').length;
  const now = new Date();
  const h = now.getHours();
  const hello = h < 12 ? t.goodMorning : h < 17 ? t.goodAfternoon : t.goodEvening;
  const lang = useDemoStore((s) => s.settings.lang);
  const today = now.toLocaleDateString(`${lang}-IN`, { weekday: 'long', day: 'numeric', month: 'long' });
  const evening = h >= 17;

  const listen = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const text = [`${hello}, ${name}.`, today + '.', t.leavesToday(done, schedule.length) + '.', next ? t.nextIs(next.title, fmtTime(next.time)) : t.allDone].join(' ');
    if (speak(text, { force: true })) {
      setSpeaking(true);
      window.setTimeout(() => setSpeaking(false), Math.min(12000, text.length * 90));
    }
  };

  return (
    <Page>
      {/* Greeting */}
      <section className="relative animate-rise overflow-hidden rounded-2xl bg-ohara-night p-6 text-white sm:p-8 lg:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-pill bg-ohara-ind/70 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-40 h-56 w-56 rounded-pill bg-ohara-lime/20 blur-3xl" />
        <TreeLines className="absolute -bottom-2 right-0 h-full w-[60%] text-ohara-lime/25" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-5">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-pill bg-white/10 text-ohara-lime">
              {evening ? <Icon.Moon className="h-9 w-9" /> : <Icon.Sun className="h-9 w-9" />}
            </span>
            <div>
              <p className="text-lg text-white/70">{today}</p>
              <h1 className="text-3xl font-extrabold tracking-tight lg:text-4xl">
                {hello}, {name}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-4 py-2.5 text-base font-semibold">
              <Icon.Leaf className="h-5 w-5 text-ohara-lime" />
              {t.leavesToday(done, schedule.length)}
            </span>
            <button type="button" onClick={listen} aria-pressed={speaking} className={`btn ${speaking ? 'bg-ohara-lime text-ohara-night' : 'bg-white text-ohara-night hover:bg-ohara-lime'}`}>
              <Icon.Speaker className="h-7 w-7" /> {speaking ? '…' : t.listen}
            </button>
          </div>
        </div>
      </section>

      {/* Big tiles */}
      <nav aria-label="What would you like to do?" className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <ActionTile to="/patient/play" tone="violet" icon={<Icon.Play className="h-9 w-9" />} title={t.play} hint={t.gentleGame} delay={40} />
        <ActionTile to="/patient/family" tone="plain" icon={<Icon.Family className="h-9 w-9" />} title={t.family} hint={t.photosVoices} delay={80} />
        <ActionTile to="/patient/reminders" tone="sky" icon={<Icon.Bell className="h-9 w-9" />} title={t.reminders} hint={t.medWaterMeals} delay={120} />
        <ActionTile to="/patient/sos" tone="sos" icon={<Icon.Phone className="h-9 w-9" />} title={t.sos} hint={t.callForHelp} delay={160} />
      </nav>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Today */}
        <Section
          className="xl:col-span-3"
          delay={200}
          title={t.today}
          action={
            <Link to="/patient/reminders" className="inline-flex items-center gap-1 text-base font-semibold text-ohara-ind-ink no-underline hover:underline">
              {t.seeAll} <Icon.Chevron />
            </Link>
          }
        >
          {next && (
            <div className="mb-4 flex items-center gap-4 rounded-xl bg-ohara-lime-soft p-4">
              <KindBadge kind={next.kind} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="eyebrow !text-ohara-lime-ink">
                  {t.next} · {fmtTime(next.time)}
                </p>
                <p className="truncate text-xl font-bold">{next.title}</p>
                <p className="truncate text-base text-ohara-muted">{next.detail}</p>
              </div>
            </div>
          )}
          <ol className="flex flex-col">
            {schedule
              .filter((s) => s.status !== 'next')
              .map((s) => (
                <li key={s.id} className="flex items-center gap-4 border-t border-ohara-line py-3 first:border-t-0">
                  <span className="hidden w-28 shrink-0 text-base font-semibold text-ohara-muted sm:block">{fmtTime(s.time)}</span>
                  <KindBadge kind={s.kind} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-lg font-semibold ${s.status === 'done' ? 'text-ohara-muted' : ''}`}>{s.title}</span>
                    <span className="block text-sm text-ohara-muted sm:hidden">{fmtTime(s.time)}</span>
                  </span>
                  <StatusChip status={s.status} />
                </li>
              ))}
          </ol>
        </Section>

        {/* Family strip */}
        <Section
          className="xl:col-span-2"
          delay={240}
          title={t.family}
          action={
            <Link to="/patient/family" className="inline-flex items-center gap-1 text-base font-semibold text-ohara-ind-ink no-underline hover:underline">
              {t.open} <Icon.Chevron />
            </Link>
          }
        >
          <ul className="grid grid-cols-3 gap-3">
            {family.slice(0, 6).map((f) => (
              <li key={f.id}>
                <Link to="/patient/family" className="group flex flex-col items-center gap-2 no-underline">
                  <FamilyPhoto m={f} letter="text-3xl" className="aspect-square w-full rounded-xl transition-transform duration-200 group-hover:-translate-y-0.5" />
                  <span className="text-center leading-tight">
                    <span className="block text-base font-bold text-ohara-ink">{f.name}</span>
                    <span className="block text-sm text-ohara-muted">{f.relation}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </Page>
  );
};
