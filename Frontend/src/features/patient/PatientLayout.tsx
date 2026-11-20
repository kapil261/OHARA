import { Link, Outlet, useOutletContext } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { Icon } from '../../components/ui';
import { useT } from '../../i18n/strings';
import { demoPatient } from '../../lib/demoData';
import { useDemoStore } from '../../store/demoStore';
import type { MeResponse } from '../../types';
import { ReminderRinging, useReminderClock } from './ReminderRinging';

/**
 * Patient layout: the frame at elder size — big nav rows, a big SOS card always in reach,
 * and reminders that ring full-screen when their time comes.
 * Forwards the AppGate context to the inner Outlet so pages can read it via useGateMe().
 */
export const PatientLayout = () => {
  const me = useOutletContext<MeResponse>();
  const t = useT();
  const pending = useDemoStore((s) => s.schedule.filter((x) => x.status !== 'done').length);
  const textSize = useDemoStore((s) => s.settings.textSize);
  const name = me.patient?.displayName ?? demoPatient.displayName;
  useReminderClock();

  return (
    <AppShell
      size="elder"
      text={textSize}
      user={{ name: demoPatient.fullName, role: demoPatient.place, hue: 'amber' }}
      nav={[
        { to: '/patient', label: t.home, icon: <Icon.Home />, end: true },
        { to: '/patient/play', label: t.play, icon: <Icon.Play /> },
        { to: '/patient/family', label: t.family, icon: <Icon.Family /> },
        { to: '/patient/reminders', label: t.reminders, icon: <Icon.Bell />, badge: pending },
        { to: '/patient/settings', label: t.settings, icon: <Icon.Gear /> },
        { to: '/patient/sos', label: t.sos, icon: <Icon.Phone />, mobileOnly: true },
      ]}
      sidebarFoot={
        <Link
          to="/patient/sos"
          className="group flex items-center gap-4 rounded-xl bg-ohara-cri p-4 text-white no-underline transition-colors hover:bg-ohara-cri-ink"
          aria-label={`SOS — call for help, ${name}`}
        >
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-pill bg-white/15">
            <Icon.Phone className="h-7 w-7" />
          </span>
          <span className="flex flex-col">
            <span className="text-xl font-extrabold">{t.sos}</span>
            <span className="text-sm text-white/90">{t.callForHelp}</span>
          </span>
        </Link>
      }
    >
      <Outlet context={me} />
      <ReminderRinging />
    </AppShell>
  );
};
