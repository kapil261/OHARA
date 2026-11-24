import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, HoldToConfirm, Icon } from '../../components/ui';
import { useTeam } from '../../lib/live';
import { sendSos } from '../../lib/data';
import { useUiStore } from '../../store/uiStore';

/** SOS: hold-to-confirm sends POST /patients/:id/sos; the server alerts the care team. Calm, no countdown. */
export const SosPage = () => {
  const sent = useUiStore((s) => s.sosSent);
  const setSent = useUiStore((s) => s.setSosSent);
  const [failed, setFailed] = useState(false);
  const onConfirm = () => {
    setFailed(false);
    void sendSos().then((ok) => (ok ? setSent(true) : setFailed(true)));
  };
  const contacts = useTeam().slice(0, 2);

  return (
    <div className={`flex min-h-full flex-col items-center justify-center gap-10 px-4 py-10 transition-colors duration-500 ${sent ? 'bg-ohara-tea-soft' : 'bg-ohara-cri-soft'}`}>
      <div className="flex max-w-xl animate-rise flex-col items-center gap-3 text-center">
        <h1 className={`text-4xl font-extrabold tracking-tight ${sent ? 'text-ohara-tea-ink' : 'text-ohara-cri-ink'}`}>
          {sent ? 'Help is on the way' : 'Need help?'}
        </h1>
        <p className="text-lg text-ohara-ink">
          {sent ? 'We told your family. Stay where you are — someone will call you soon.' : 'Press and hold the red button. Your family will be told right away.'}
        </p>
      </div>

      <HoldToConfirm onConfirm={onConfirm} done={sent}>
        Hold to call for help
      </HoldToConfirm>
      {failed && <p role="alert" className="text-lg font-semibold text-ohara-cri-ink">Could not send. Please call your family directly.</p>}

      <div className="flex w-full max-w-2xl animate-rise flex-col gap-4" style={{ animationDelay: '120ms' }}>
        <p className="text-center text-base font-semibold text-ohara-muted">{sent ? 'We told' : 'We will tell'}</p>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-4 rounded-xl bg-ohara-surface/80 p-4">
              <Avatar name={c.name} hue={c.hue} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold">{c.name}</p>
                <p className="truncate text-sm text-ohara-muted">{c.role}</p>
              </div>
              {sent && <Icon.Check className="h-7 w-7 shrink-0 text-ohara-tea" />}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-pill bg-ohara-surface/70 px-4 py-2 text-sm font-medium text-ohara-muted">
            <Icon.Wifi className="h-5 w-5" /> Works even without internet
          </span>
          <Link to="/patient" className="btn-secondary no-underline">
            <Icon.Back /> Back home
          </Link>
        </div>
      </div>
    </div>
  );
};
