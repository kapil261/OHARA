import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { FamilyMember, Hue } from '../lib/demoData';

/* ------------------------------------------------------------------ */
/* Brand                                                               */
/* ------------------------------------------------------------------ */

/**
 * The OHARA tree: a wide, rounded canopy on a sturdy trunk with roots — a great old tree of
 * knowledge that keeps memories. Original artwork; colour comes from `currentColor`.
 */
export const TreeMark = ({ className = 'h-6 w-6' }: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="currentColor">
    <circle cx="13" cy="21" r="8" />
    <circle cx="24" cy="14" r="10" />
    <circle cx="35" cy="21" r="8" />
    <circle cx="18.5" cy="25.5" r="7" />
    <circle cx="29.5" cy="25.5" r="7" />
    <path d="M21.4 27h5.2v8c0 2.6 2.8 4.4 6.6 5.4H14.8c3.8-1 6.6-2.8 6.6-5.4z" />
    <path d="M12 43.5c3.5-.2 7-1.3 9.4-3.2M36 43.5c-3.5-.2-7-1.3-9.4-3.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** OHARA wordmark: the tree in a forest-green disc with a honey "sun". */
export const BrandMark = ({ onDark, small }: { onDark?: boolean; small?: boolean }) => (
  <span className="inline-flex items-center gap-2.5">
    <span className={`relative grid shrink-0 place-items-center rounded-[14px] bg-ohara-ind text-ohara-bg ${small ? 'h-10 w-10' : 'h-12 w-12'}`}>
      <TreeMark className={small ? 'h-7 w-7' : 'h-8 w-8'} />
      <span className={`absolute -right-1 -top-1 h-3.5 w-3.5 rounded-pill bg-ohara-lime ring-2 ${onDark ? 'ring-ohara-night' : 'ring-ohara-bg'}`} />
    </span>
    <span className="flex flex-col leading-none">
      <span className={`font-black tracking-wide ${small ? 'text-lg' : 'text-xl'} ${onDark ? 'text-white' : 'text-ohara-ink'}`}>OHARA</span>
      {!small && <span className={`mt-1 whitespace-nowrap text-[12px] font-semibold ${onDark ? 'text-white/60' : 'text-ohara-muted'}`}>Where every memory matters</span>}
    </span>
  </span>
);

/**
 * Thin branch line-art for banners and empty states — a tree's limbs reaching across the card.
 * Decorative only; sits behind content, colour from `currentColor`.
 */
export const TreeLines = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 400 220" className={`pointer-events-none ${className}`} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    {/* trunk rising from the bottom right, limbs fanning out */}
    <path d="M340 220c-4-40 2-78 -10-110" />
    <path d="M330 110c-30-20-70-24-110-14" />
    <path d="M330 110c10-34 34-56 62-66" />
    <path d="M326 140c-36-6-64 6-92 30" />
    <path d="M220 96c-30 6-58 0-84-18" />
    <path d="M220 96c-12-24-10-48 4-68" />
    <path d="M234 170c-24 4-44 18-58 40" />
    <path d="M136 78c-20-8-44-6-66 6" />
    <path d="M362 66c6-16 4-34-6-48" />
    {/* leaves */}
    {[
      [70, 84], [110, 70], [224, 28], [250, 56], [176, 210], [392, 44], [356, 18], [150, 92], [290, 104],
    ].map(([x, y], i) => (
      <path key={i} d={`M${x} ${y}c6-9 16-11 22-9-2 8-10 15-22 9z`} />
    ))}
  </svg>
);

/* ------------------------------------------------------------------ */
/* Colour families for avatars, games, photos                          */
/* ------------------------------------------------------------------ */

export const HUE: Record<Hue, { soft: string; solid: string; ring: string }> = {
  violet: { soft: 'bg-ohara-ind-soft text-ohara-ind-ink', solid: 'bg-ohara-ind text-white', ring: 'from-ohara-ind/90 to-ohara-ind-ink' },
  lime: { soft: 'bg-ohara-lime-soft text-ohara-lime-ink', solid: 'bg-ohara-lime text-ohara-night', ring: 'from-ohara-lime to-ohara-lime-ink/70' },
  sky: { soft: 'bg-ohara-sky text-ohara-sky-ink', solid: 'bg-ohara-sky-ink text-white', ring: 'from-ohara-sky to-ohara-sky-ink' },
  amber: { soft: 'bg-ohara-amb-soft text-ohara-amb-ink', solid: 'bg-ohara-amb text-white', ring: 'from-ohara-amb/80 to-ohara-amb-ink' },
  rose: { soft: 'bg-ohara-rose-soft text-ohara-rose-ink', solid: 'bg-ohara-rose text-white', ring: 'from-ohara-rose/80 to-ohara-rose-ink' },
  teal: { soft: 'bg-ohara-tea-soft text-ohara-tea-ink', solid: 'bg-ohara-tea text-white', ring: 'from-ohara-tea/80 to-ohara-tea-ink' },
};

export const initials = (name: string) =>
  name
    .replace(/^Dr\.\s*/, '')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const Avatar = ({ name, hue = 'violet', size = 'md' }: { name: string; hue?: Hue; size?: 'sm' | 'md' | 'lg' }) => {
  const dim = { sm: 'h-8 w-8 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-16 w-16 text-lg' }[size];
  return (
    <span className={`grid shrink-0 place-items-center rounded-pill font-bold ${dim} ${HUE[hue].soft}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
};

/** A family member's picture: their photo if the caregiver added one, otherwise a warm initial tile. */
export const FamilyPhoto = ({ m, className = '', letter = 'text-5xl' }: { m: Pick<FamilyMember, 'name' | 'hue' | 'photo'>; className?: string; letter?: string }) =>
  m.photo ? (
    <img src={m.photo} alt={m.name} className={`object-cover ${className}`} />
  ) : (
    <span className={`grid place-items-center bg-gradient-to-br font-extrabold text-white ${HUE[m.hue].ring} ${letter} ${className}`} aria-hidden="true">
      {m.name[0]}
    </span>
  );

/* ------------------------------------------------------------------ */
/* Page frames                                                         */
/* ------------------------------------------------------------------ */

/** Full-screen loading state while /api/me resolves. */
export const FullPageLoader = () => (
  <div className="flex h-screen items-center justify-center bg-ohara-bg" role="status" aria-label="Loading">
    <div className="h-12 w-12 animate-spin rounded-pill border-4 border-ohara-line border-t-ohara-ind" />
  </div>
);

/** A centered card on the warm canvas — used for errors and simple walls. */
export const Door = ({ children, wide }: { children: ReactNode; wide?: boolean }) => (
  <div className="flex min-h-screen items-center justify-center bg-ohara-bg p-4">
    <div className={`card w-full animate-rise ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
      <div className="flex flex-col gap-4 p-6 sm:p-8">{children}</div>
    </div>
  </div>
);

/** The page column inside the shell's panel. */
export const Page = ({ children, wide }: { children: ReactNode; wide?: boolean }) => (
  <div className={`mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-8 lg:px-12 lg:py-10 ${wide ? 'max-w-[1320px]' : 'max-w-6xl'}`}>
    {children}
  </div>
);

/** A page's title row: eyebrow, title, one line, optional actions on the right. */
export const PageHeader = ({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}) => (
  <header className="flex animate-rise flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      {lead && <p className="mt-1.5 max-w-2xl text-lg text-ohara-muted">{lead}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
  </header>
);

/** A titled card section. */
export const Section = ({
  title,
  action,
  children,
  className,
  delay = 0,
  id,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
  id?: string;
}) => (
  <section id={id} className={`card animate-rise p-5 sm:p-6 ${className ?? ''}`} style={{ animationDelay: `${delay}ms` }}>
    {(title || action) && (
      <div className="mb-4 flex items-center justify-between gap-3">
        {title && <h2 className="text-lg font-bold tracking-tight">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </section>
);

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

/** BigButton: pill button sized by the area's control token (64px for elders). */
export const BigButton = ({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className,
  type = 'button',
  'data-testid': testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  'data-testid'?: string;
}) => {
  const classes = { primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger' }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} className={`${classes} ${className ?? ''}`}>
      {children}
    </button>
  );
};

type Tone = 'violet' | 'plain' | 'sky' | 'sos';

const TILE_TONE: Record<Tone, { card: string; badge: string; hint: string }> = {
  violet: {
    card: 'bg-ohara-ind text-white border-transparent hover:bg-ohara-ind-hover',
    badge: 'bg-white/15 text-white',
    hint: 'text-white/80',
  },
  plain: {
    card: 'bg-ohara-surface text-ohara-ink border-ohara-line hover:border-ohara-line-strong',
    badge: 'bg-ohara-ind-soft text-ohara-ind-ink',
    hint: 'text-ohara-muted',
  },
  sky: {
    card: 'bg-ohara-surface text-ohara-ink border-ohara-line hover:border-ohara-line-strong',
    badge: 'bg-ohara-sky text-ohara-sky-ink',
    hint: 'text-ohara-muted',
  },
  sos: {
    card: 'bg-ohara-cri-soft text-ohara-cri-ink border-ohara-cri-line hover:border-ohara-cri/60',
    badge: 'bg-ohara-cri text-white',
    hint: 'text-ohara-cri-ink/80',
  },
};

/** ActionTile: a large home-screen card — icon, title, one short hint. */
export const ActionTile = ({
  to,
  icon,
  title,
  hint,
  tone = 'plain',
  delay = 0,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  hint: string;
  tone?: Tone;
  delay?: number;
}) => {
  const t = TILE_TONE[tone];
  return (
    <Link
      to={to}
      style={{ animationDelay: `${delay}ms` }}
      className={`group flex min-h-[188px] animate-rise flex-col justify-between gap-6 rounded-xl border p-6 no-underline shadow-card transition-[transform,box-shadow,background-color,border-color] duration-200 hover:-translate-y-1 hover:shadow-lift active:translate-y-0 ${t.card}`}
    >
      <span className={`grid h-16 w-16 place-items-center rounded-pill ${t.badge}`}>{icon}</span>
      <span className="flex items-end justify-between gap-3">
        <span className="flex flex-col">
          <span className="text-2xl font-bold tracking-tight">{title}</span>
          <span className={`text-base ${t.hint}`}>{hint}</span>
        </span>
        <span className="opacity-60 transition-transform duration-200 group-hover:translate-x-1">
          <Icon.Arrow />
        </span>
      </span>
    </Link>
  );
};

/** Hold-to-confirm for SOS — a big round button with a calm fill ring. Works offline. */
export const HoldToConfirm = ({
  children,
  onConfirm,
  done: doneProp,
  holdMs = 1500,
  className,
}: {
  children: ReactNode;
  onConfirm: () => void;
  done?: boolean;
  holdMs?: number;
  className?: string;
}) => {
  const [progress, setProgress] = useState(0);
  const [doneLocal, setDone] = useState(false);
  const done = doneProp ?? doneLocal;
  const raf = useRef<number | null>(null);
  const start = useRef<number | null>(null);

  const clear = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    start.current = null;
    setProgress(0);
  };

  useEffect(() => () => clear(), []);

  const tick = () => {
    if (!start.current) return;
    const p = Math.min(1, (performance.now() - start.current) / holdMs);
    setProgress(p);
    if (p >= 1) {
      setDone(true);
      onConfirm();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const onDown = () => {
    if (done) return;
    clear();
    start.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  };

  const R = 46;
  const C = 2 * Math.PI * R;
  const shown = done ? 1 : progress;

  return (
    <button
      type="button"
      onPointerDown={onDown}
      onPointerUp={() => !done && clear()}
      onPointerLeave={() => !done && clear()}
      onPointerCancel={() => !done && clear()}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="hold-to-confirm"
      aria-label="Hold to send SOS"
      className={`relative grid h-64 w-64 select-none place-items-center rounded-pill text-white shadow-lift transition-[transform,background-color] duration-200 active:scale-[0.98] sm:h-72 sm:w-72 ${
        done ? 'bg-ohara-tea' : 'bg-ohara-cri'
      } ${className ?? ''}`}
      style={{ touchAction: 'none' }}
    >
      <span className={`absolute inset-[-16px] rounded-pill ${done ? 'bg-ohara-tea/10' : 'bg-ohara-cri/10'}`} aria-hidden="true" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="4" />
        <circle cx="50" cy="50" r={R} fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - shown)} />
      </svg>
      <span className="relative z-10 flex flex-col items-center gap-2 px-6 text-center">
        {done ? <Icon.Check className="h-14 w-14" /> : <Icon.Phone className="h-14 w-14" />}
        <span className="text-xl font-bold leading-tight">{done ? 'Help is coming' : children}</span>
      </span>
    </button>
  );
};

/* ------------------------------------------------------------------ */
/* Small data marks                                                    */
/* ------------------------------------------------------------------ */

/** A tiny trend line for a table row. Colour comes from `currentColor`. */
export const Sparkline = ({ values, className = 'h-8 w-24' }: { values: number[]; className?: string }) => {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`).join(' ');
  const last = pts.split(' ').pop()!.split(',');
  return (
    <svg viewBox="-2 0 104 32" className={className} aria-hidden="true" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="currentColor" />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* Icons (stroke, 2px, rounded — one family)                          */
/* ------------------------------------------------------------------ */

const svg = (className = 'h-8 w-8') => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  'aria-hidden': true,
});

type IP = { className?: string };
export const Icon = {
  Home: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  Play: ({ className }: IP) => (
    <svg {...svg(className)}>
      <rect x="3" y="6" width="18" height="12" rx="4" />
      <path d="M7 12h4M9 10v4" />
      <circle cx="15.5" cy="11" r=".6" fill="currentColor" />
      <circle cx="17.5" cy="13" r=".6" fill="currentColor" />
    </svg>
  ),
  Family: ({ className }: IP) => (
    <svg {...svg(className)}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9.5" r="2.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M15 14.2c.6-.1 1.3-.2 2-.2 2.8 0 4 2 4 5" />
    </svg>
  ),
  Bell: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  ),
  Phone: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
    </svg>
  ),
  Pill: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </svg>
  ),
  Water: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M12 2.7S5 10 5 14.5a7 7 0 0 0 14 0C19 10 12 2.7 12 2.7z" />
    </svg>
  ),
  Meal: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M3 11h18a9 9 0 0 1-18 0zM12 4v3M8 5v2M16 5v2" />
    </svg>
  ),
  Walk: ({ className }: IP) => (
    <svg {...svg(className)}>
      <circle cx="13" cy="4" r="2" />
      <path d="m9 21 2-6 3 2v4M7 12l3-4 4 1 2 3 2 1M11 15l-1-7" />
    </svg>
  ),
  Sun: ({ className }: IP) => (
    <svg {...svg(className)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  Moon: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  Speaker: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
    </svg>
  ),
  PlayCircle: ({ className }: IP) => (
    <svg {...svg(className)}>
      <circle cx="12" cy="12" r="10" />
      <path d="m10 8 6 4-6 4z" fill="currentColor" />
    </svg>
  ),
  Arrow: ({ className = 'h-7 w-7' }: IP) => (
    <svg {...svg(className)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  Chevron: ({ className = 'h-5 w-5' }: IP) => (
    <svg {...svg(className)}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  ),
  Back: ({ className = 'h-6 w-6' }: IP) => (
    <svg {...svg(className)}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  ),
  Check: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  Clock: ({ className }: IP) => (
    <svg {...svg(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  Shield: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  Wifi: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M5 12.6a10 10 0 0 1 14 0M8.5 16.1a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 20 0" />
      <circle cx="12" cy="19.5" r=".8" fill="currentColor" />
    </svg>
  ),
  Grid: ({ className }: IP) => (
    <svg {...svg(className)}>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </svg>
  ),
  Users: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </svg>
  ),
  Chart: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 5-6" />
    </svg>
  ),
  Heart: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" />
    </svg>
  ),
  Brain: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v.1A3 3 0 0 0 4.5 9a3 3 0 0 0 .4 5A3 3 0 0 0 9 18.5V20a2 2 0 0 0 3 0V4.5A2.5 2.5 0 0 0 9.5 2z" />
      <path d="M14.5 2A2.5 2.5 0 0 1 17 4.5v.1A3 3 0 0 1 19.5 9a3 3 0 0 1-.4 5 3 3 0 0 1-4.1 4.5V20a2 2 0 0 1-3 0" />
    </svg>
  ),
  Search: ({ className }: IP) => (
    <svg {...svg(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  Logout: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  Plus: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Upload: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  ),
  Download: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  ),
  X: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  Sparkle: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />
    </svg>
  ),
  Leaf: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M5 20c-.5-9 5.5-15.5 16-16 .3 10.3-6 16.4-16 16z" />
      <path d="M5 20 15 10" />
    </svg>
  ),
  Tree: ({ className }: IP) => <TreeMark className={className} />,
  Gear: ({ className }: IP) => (
    <svg {...svg(className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  Edit: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  ),
  Trash: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  ),
  Printer: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  ),
  Camera: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Refresh: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" />
    </svg>
  ),
  WifiOff: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="m2 2 20 20M8.5 16.1a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 5.2-2.8M2 8.8a15 15 0 0 1 4.2-2.7M19 12.6c-.6-.6-1.3-1.1-2-1.5M22 8.8a15 15 0 0 0-11.3-3.8" />
      <circle cx="12" cy="19.5" r=".8" fill="currentColor" />
    </svg>
  ),
  Pin: ({ className }: IP) => (
    <svg {...svg(className)}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
};
