import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { BigButton, BrandMark, Icon, TreeLines, TreeMark } from '../../components/ui';
import { demoMe, setDemoRole } from '../../lib/devBypass';
import { useAuthStore } from '../../store/authStore';
import type { Role } from '../../types';

const HOME: Record<Role, string> = { PATIENT: '/patient', CAREGIVER: '/caregiver', HEALTH_WORKER: '/healthworker', ADMIN: '/patient' };

const DEMO_ROLES: { role: Role; label: string; hint: string; icon: keyof typeof Icon; tint: string }[] = [
  { role: 'PATIENT', label: 'Patient', hint: 'Big buttons, voice-first', icon: 'Heart', tint: 'bg-ohara-ind-soft text-ohara-ind-ink' },
  { role: 'CAREGIVER', label: 'Caregiver', hint: 'Family dashboard', icon: 'Users', tint: 'bg-ohara-lime-soft text-ohara-lime-ink' },
  { role: 'HEALTH_WORKER', label: 'Health worker', hint: 'Patients by need', icon: 'Chart', tint: 'bg-ohara-sky text-ohara-sky-ink' },
];

/**
 * Phone OTP login. Backend not yet wired — this is the UI shell for M2.
 * On success it sets the in-memory JWT + role via setAuth.
 */
export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const next = new URLSearchParams(location.search).get('next') || '/patient';

  const enterDemo = (role: Role, to?: string) => {
    setDemoRole(role);
    setAuth(demoMe(role), 'demo-token');
    navigate(to ?? HOME[role], { replace: true });
  };

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // TODO: POST /auth/otp/request { phone }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code');
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // TODO: POST /auth/otp/verify { phone, otp } → { token, me }
      // const { token, me } = await api.post('/auth/otp/verify', { phone, otp });
      // setAuth(me, token);
      // Demo until the backend is wired: any number + any 6-digit code signs in as the patient.
      enterDemo('PATIENT', next.startsWith('/patient') ? next : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-size="elder" className="flex min-h-screen bg-ohara-bg">
      {/* Brand panel (Hawkr's near-black rail) — hidden on phones */}
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-ohara-night p-10 text-white lg:flex">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-pill bg-ohara-ind/60 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute right-10 top-1/3 h-40 w-40 rounded-pill bg-ohara-lime/20 blur-3xl" />
        <TreeLines className="absolute bottom-24 right-0 h-[46%] w-full text-ohara-lime/20" />
        <TreeMark className="absolute -right-10 top-24 h-64 w-64 text-white/[0.04]" />
        <BrandMark onDark />
        <div className="relative flex flex-col gap-4">
          <p className="text-4xl font-extrabold leading-tight tracking-tight">
            Every <span className="text-ohara-lime">memory</span> is a leaf on your tree.
          </p>
          <p className="max-w-sm text-lg text-white/70">
            Like a great old tree that keeps its stories, OHARA holds on to the moments that matter — for elders, and the families who are their roots.
          </p>
        </div>
        <ul className="relative flex flex-col gap-3 text-base text-white/80">
          {['Speaks your language', 'Works without internet', "Your family's voice, every day"].map((t) => (
            <li key={t} className="flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-pill bg-ohara-lime text-ohara-night">
                <Icon.Leaf className="h-4 w-4" />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </aside>

      {/* Form */}
      <main className="flex flex-1 items-center justify-center overflow-y-auto p-4 sm:p-8">
        <div className="card w-full max-w-md animate-rise p-6 sm:p-8">
          <div className="mb-6 lg:hidden">
            <BrandMark />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{sent ? 'Enter your code' : 'Welcome'}</h1>
          <p className="mb-6 mt-1 text-base text-ohara-muted">
            {sent ? `We sent a 6-digit code to ${phone}.` : 'Sign in with your phone number.'}
          </p>

          {!sent ? (
            <form onSubmit={onSend} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="eyebrow">Phone number</span>
                <input
                  className="input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </label>
              {error && <p className="text-sm text-ohara-cri-ink">{error}</p>}
              <BigButton variant="primary" type="submit" disabled={loading || !phone} className="w-full">
                {loading ? 'Sending…' : 'Send code'} <Icon.Arrow className="h-6 w-6" />
              </BigButton>
            </form>
          ) : (
            <form onSubmit={onVerify} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="eyebrow">Code</span>
                <input
                  className="input text-center text-xl font-semibold tracking-[0.4em]"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="••••••"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </label>
              {error && <p className="text-sm text-ohara-cri-ink">{error}</p>}
              <BigButton variant="primary" type="submit" disabled={loading || otp.length < 6} className="w-full">
                {loading ? 'Verifying…' : 'Verify'}
              </BigButton>
              <BigButton variant="ghost" type="button" onClick={() => setSent(false)} className="w-full">
                Change number
              </BigButton>
            </form>
          )}

          <div className="my-7 flex items-center gap-3 text-sm text-ohara-muted">
            <span className="h-px flex-1 bg-ohara-line" /> or try the demo <span className="h-px flex-1 bg-ohara-line" />
          </div>
          <div className="flex flex-col gap-2.5">
            {DEMO_ROLES.map((d) => {
              const I = Icon[d.icon];
              return (
                <button
                  key={d.role}
                  type="button"
                  onClick={() => enterDemo(d.role)}
                  className="group flex items-center gap-4 rounded-xl border border-ohara-line bg-ohara-surface p-3 text-left transition-[border-color,box-shadow] hover:border-ohara-ind/50 hover:shadow-card"
                >
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-pill ${d.tint}`}>
                    <I className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">Try as {d.label}</span>
                    <span className="block text-sm text-ohara-muted">{d.hint}</span>
                  </span>
                  <Icon.Chevron className="h-6 w-6 text-ohara-muted transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>

          <p className="mt-6 text-center text-base">
            New here?{' '}
            <Link to="/onboarding" className="font-semibold text-ohara-ind-ink">
              Set up OHARA
            </Link>
          </p>

          <p className="mt-4 flex items-center gap-2 text-sm text-ohara-muted">
            <Icon.Shield className="h-5 w-5 shrink-0" />
            Your data is kept private and only shared with your care team.
          </p>
        </div>
      </main>
    </div>
  );
};
