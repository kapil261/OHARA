import { Icon } from '../../components/ui';
import type { ScheduleItem, ScheduleKind, ScheduleStatus } from '../../lib/models';

export const KIND: Record<ScheduleKind, { icon: (p: { className?: string }) => JSX.Element; tint: string }> = {
  medicine: { icon: Icon.Pill, tint: 'bg-ohara-ind-soft text-ohara-ind-ink' },
  water: { icon: Icon.Water, tint: 'bg-ohara-sky text-ohara-sky-ink' },
  meal: { icon: Icon.Meal, tint: 'bg-ohara-amb-soft text-ohara-amb-ink' },
  walk: { icon: Icon.Walk, tint: 'bg-ohara-tea-soft text-ohara-tea-ink' },
};

export const KindBadge = ({ kind, size = 'md' }: { kind: ScheduleKind; size?: 'md' | 'lg' }) => {
  const K = KIND[kind];
  return (
    <span className={`grid shrink-0 place-items-center rounded-pill ${K.tint} ${size === 'lg' ? 'h-16 w-16' : 'h-12 w-12'}`}>
      <K.icon className={size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'} />
    </span>
  );
};

const STATUS: Record<ScheduleStatus, { label: string; cls: string }> = {
  done: { label: 'Done', cls: 'bg-ohara-tea-soft text-ohara-tea-ink' },
  next: { label: 'Next', cls: 'bg-ohara-lime text-ohara-night' },
  later: { label: 'Later today', cls: 'bg-ohara-sunken text-ohara-muted' },
  snoozed: { label: 'In 10 min', cls: 'bg-ohara-amb-soft text-ohara-amb-ink' },
};

export const StatusChip = ({ status }: { status: ScheduleStatus }) => (
  <span className={`chip shrink-0 ${STATUS[status].cls}`}>
    {status === 'done' && <Icon.Leaf className="h-4 w-4" />}
    {STATUS[status].label}
  </span>
);

export const nextItem = (items: ScheduleItem[]) => items.find((s) => s.status === 'next') ?? null;
