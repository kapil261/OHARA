import { useEffect } from 'react';
import { FamilyPhoto, Icon, TreeLines } from '../../components/ui';
import { fmtTime } from '../../lib/demoData';
import { speak, stopSpeaking } from '../../lib/voice';
import { useDemoStore } from '../../store/demoStore';
import { KindBadge } from './schedule-ui';

const SNOOZE_MS = 10 * 60 * 1000;
const snoozeTimers = new Map<string, number>();

const hhmmNow = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Rings a reminder when its time comes (checked every 30 s). Reminders are scheduled on the device, so they ring offline. */
export const useReminderClock = () => {
  useEffect(() => {
    const check = () => {
      const { schedule, rung, ringingId, ring } = useDemoStore.getState();
      if (ringingId) return;
      const now = hhmmNow();
      const due = schedule.find((s) => s.time === now && s.status !== 'done' && s.status !== 'snoozed' && !rung.includes(s.id));
      if (due) ring(due.id);
    };
    check();
    const t = window.setInterval(check, 30_000);
    return () => window.clearInterval(t);
  }, []);
};

/**
 * Full-screen reminder: the family member whose voice it is, the reminder spoken aloud,
 * and two big answers. No countdown, no flashing.
 */
export const ReminderRinging = () => {
  const ringingId = useDemoStore((s) => s.ringingId);
  const item = useDemoStore((s) => s.schedule.find((x) => x.id === s.ringingId) ?? null);
  const family = useDemoStore((s) => s.family);
  const setStatus = useDemoStore((s) => s.setStatus);
  const stopRinging = useDemoStore((s) => s.stopRinging);
  const ring = useDemoStore((s) => s.ring);
  const who = item ? family.find((f) => f.name === item.voice) : undefined;

  const message = item ? `It's ${who?.name ?? 'your family'}. It is time for ${item.title.toLowerCase()}. ${item.detail}.` : '';

  useEffect(() => {
    if (!item) return;
    speak(message);
    // Say it once more after a gentle pause, like a person would.
    const again = window.setTimeout(() => speak(message), 9000);
    return () => window.clearTimeout(again);
  }, [ringingId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null;

  const done = () => {
    stopSpeaking();
    setStatus(item.id, 'done');
    stopRinging();
  };

  const later = () => {
    stopSpeaking();
    setStatus(item.id, 'snoozed');
    stopRinging();
    const prev = snoozeTimers.get(item.id);
    if (prev) window.clearTimeout(prev);
    snoozeTimers.set(
      item.id,
      window.setTimeout(() => {
        const cur = useDemoStore.getState().schedule.find((s) => s.id === item.id);
        if (cur && cur.status === 'snoozed') ring(item.id);
      }, SNOOZE_MS),
    );
  };

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="ring-title" className="fixed inset-0 z-50 grid place-items-center bg-ohara-night/80 p-4 backdrop-blur-sm" data-size="elder">
      <div className="relative w-full max-w-2xl animate-rise overflow-hidden rounded-2xl bg-ohara-bg shadow-lift">
        <div className="relative flex flex-col items-center gap-5 bg-ohara-ind px-6 pb-8 pt-10 text-center text-white">
          <TreeLines className="absolute inset-0 h-full w-full text-white/10" />
          {who ? (
            <FamilyPhoto m={who} className="relative h-36 w-36 rounded-pill ring-8 ring-white/20" letter="text-6xl" />
          ) : (
            <span className="relative grid h-36 w-36 place-items-center rounded-pill bg-white/15">
              <Icon.Bell className="h-16 w-16" />
            </span>
          )}
          <div className="relative">
            <p className="text-lg text-white/80">{who ? `${who.name} is reminding you` : 'Reminder'} · {fmtTime(item.time)}</p>
            <h2 id="ring-title" className="mt-1 text-4xl font-extrabold tracking-tight">
              {item.title}
            </h2>
          </div>
        </div>

        <div className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex items-center gap-4 rounded-xl bg-ohara-surface p-4">
            <KindBadge kind={item.kind} size="lg" />
            <p className="flex-1 text-xl font-semibold">{item.detail}</p>
            <button type="button" className="btn-secondary px-5" onClick={() => speak(message, { force: true })} aria-label="Say it again">
              <Icon.Speaker className="h-7 w-7" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button type="button" className="btn-primary !min-h-[88px] text-2xl" onClick={done} autoFocus>
              <Icon.Check className="h-9 w-9" /> Done
            </button>
            <button type="button" className="btn-secondary !min-h-[88px] text-2xl" onClick={later}>
              <Icon.Clock className="h-9 w-9" /> In 10 min
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
