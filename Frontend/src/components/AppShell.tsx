import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Hue } from '../lib/models';
import { stopSpeaking } from '../lib/voice';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { Avatar, BrandMark, Icon } from './ui';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  badge?: number;
  /** Shown only in the phone menu (the desktop has it elsewhere, e.g. the SOS card). */
  mobileOnly?: boolean;
}

/** Calm strip when the network drops — the app keeps working (offline-first). */
const OfflineBanner = () => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-ohara-lime-soft px-4 py-2.5 text-sm font-semibold text-ohara-lime-ink print:hidden">
      <Icon.WifiOff className="h-5 w-5" /> Offline — everything still works. We'll sync when you're back online.
    </div>
  );
};

/**
 * The Hawkr-style frame in OHARA's colours: a deep-green edge and sidebar, the page on a big cream panel.
 * Desktop (lg+): sidebar on the left. Phones/tablets: a dark top bar with the menu as pills.
 * Printing hides the frame so pages like the weekly report print clean.
 */
export const AppShell = ({
  nav,
  user,
  size = 'normal',
  text,
  sidebarFoot,
  children,
}: {
  nav: NavItem[];
  user: { name: string; role: string; hue?: Hue };
  size?: 'normal' | 'elder';
  text?: 'large' | 'xl';
  sidebarFoot?: ReactNode;
  children: ReactNode;
}) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [resetDone, setResetDone] = useState(false);

  const signOut = () => {
    stopSpeaking();
    // Revokes the refresh cookie; the in-memory token is dropped below either way.
    void api.post('/auth/logout').catch(() => {});
    clearAuth();
    useUiStore.getState().reset();
    qc.clear();
    navigate('/login', { replace: true });
  };

  /** Refetch every screen's data from the API. */
  const onReset = () => {
    void qc.invalidateQueries();
    setResetDone(true);
    window.setTimeout(() => setResetDone(false), 1800);
  };

  const elder = size === 'elder';

  return (
    <div
      data-size={elder ? 'elder' : undefined}
      data-text={elder && text === 'xl' ? 'xl' : undefined}
      className="flex min-h-screen flex-col bg-ohara-night lg:h-screen lg:flex-row lg:gap-3.5 lg:p-3.5 print:block print:h-auto print:bg-white print:p-0"
    >
      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className={`hidden shrink-0 flex-col px-3 pb-3 pt-5 text-white lg:flex print:!hidden ${elder ? 'w-[300px]' : 'w-[264px]'}`}>
        <div className="px-3">
          <BrandMark onDark small={!elder} />
        </div>

        <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
          {nav
            .filter((n) => !n.mobileOnly)
            .map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-pill px-4 font-semibold no-underline transition-colors duration-150 ${
                    elder ? 'min-h-[60px] text-lg' : 'min-h-[44px] text-base'
                  } ${isActive ? 'bg-ohara-bg text-ohara-night' : 'text-white/70 hover:bg-ohara-night-2 hover:text-white'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={elder ? '[&>svg]:h-7 [&>svg]:w-7' : '[&>svg]:h-5 [&>svg]:w-5'}>{n.icon}</span>
                    <span className="flex-1">{n.label}</span>
                    {!!n.badge && <span className={`chip ${isActive ? 'bg-ohara-ind text-white' : 'bg-ohara-lime text-ohara-night'}`}>{n.badge}</span>}
                  </>
                )}
              </NavLink>
            ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          {sidebarFoot}
          <div className="flex items-center gap-3 rounded-xl bg-ohara-night-2 p-3">
            <Avatar name={user.name} hue={user.hue} size={elder ? 'md' : 'sm'} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-white/60">{user.role}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-pill text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Sign out"
              title="Sign out"
            >
              <Icon.Logout className="h-5 w-5" />
            </button>
          </div>
          <button type="button" onClick={onReset} className="flex items-center justify-center gap-2 rounded-pill py-1.5 text-[12px] font-semibold text-white/45 hover:text-white/80">
            <Icon.Refresh className="h-3.5 w-3.5" /> {resetDone ? 'Refreshed' : 'Refresh data'}
          </button>
        </div>
      </aside>

      {/* ---------- Top bar (phones / tablets) ---------- */}
      <header className="sticky top-0 z-20 flex flex-col gap-3 bg-ohara-night px-4 pb-3 pt-4 text-white lg:hidden print:!hidden">
        <div className="flex items-center justify-between">
          <BrandMark onDark small />
          <div className="flex items-center gap-1">
            <button type="button" onClick={onReset} className="grid h-10 w-10 place-items-center rounded-pill text-white/60 hover:bg-white/10" aria-label="Refresh data" title="Refresh data">
              <Icon.Refresh className="h-5 w-5" />
            </button>
            <button type="button" onClick={signOut} className="inline-flex items-center gap-2 rounded-pill px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10">
              <Icon.Logout className="h-5 w-5" /> Sign out
            </button>
          </div>
        </div>
        <nav aria-label="Main" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `inline-flex shrink-0 items-center gap-2 rounded-pill px-4 py-2.5 text-sm font-semibold no-underline [&>svg]:h-5 [&>svg]:w-5 ${
                  isActive ? 'bg-ohara-bg text-ohara-night' : 'bg-ohara-night-2 text-white/80'
                }`
              }
            >
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* ---------- Panel ---------- */}
      <main className="scroll-quiet relative flex-1 overflow-y-auto rounded-t-2xl bg-ohara-bg lg:rounded-2xl print:overflow-visible print:rounded-none print:bg-white">
        <OfflineBanner />
        {children}
      </main>
    </div>
  );
};
