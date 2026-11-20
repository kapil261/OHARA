import { Link, Outlet, useOutletContext } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { Avatar, Icon } from '../../components/ui';
import { demoPatient } from '../../lib/demoData';
import { useDemoStore } from '../../store/demoStore';
import type { MeResponse } from '../../types';

/** Caregiver: the Hawkr frame at normal size, with the patient being cared for pinned in the sidebar. */
export const CaregiverLayout = () => {
  const me = useOutletContext<MeResponse>();
  const open = useDemoStore((s) => s.alerts.filter((a) => !a.acknowledged).length);

  return (
    <AppShell
      user={{ name: me.displayName ?? 'Caregiver', role: 'Caregiver · Owner', hue: 'violet' }}
      nav={[
        { to: '/caregiver', label: 'Overview', icon: <Icon.Grid />, end: true },
        { to: '/caregiver/schedule', label: 'Schedule', icon: <Icon.Clock /> },
        { to: '/caregiver/family', label: 'Family album', icon: <Icon.Family /> },
        { to: '/caregiver/alerts', label: 'Alerts', icon: <Icon.Bell />, badge: open },
        { to: '/caregiver/report', label: 'Weekly report', icon: <Icon.Printer /> },
        { to: '/caregiver/team', label: 'Care team', icon: <Icon.Users /> },
        { to: '/caregiver/settings', label: "Bina's settings", icon: <Icon.Gear /> },
      ]}
      sidebarFoot={
        <Link to="/caregiver" className="flex items-center gap-3 rounded-xl border border-white/10 p-3 text-white no-underline hover:bg-ohara-night-2">
          <Avatar name={demoPatient.fullName} hue="amber" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/60">Caring for</p>
            <p className="truncate text-sm font-semibold">{demoPatient.fullName}</p>
          </div>
          <span className="h-2.5 w-2.5 rounded-pill bg-ohara-lime" title="Online" />
        </Link>
      }
    >
      <Outlet context={me} />
    </AppShell>
  );
};
