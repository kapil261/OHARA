import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { BigButton, BrandMark, Icon, TreeLines, TreeMark } from '../../components/ui';
import { api, queries } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import type { MeResponse, Role } from '../../types';

const HOME: Record<Role, string> = { PATIENT: '/patient', CAREGIVER: '/caregiver', HEALTH_WORKER: '/healthworker', ADMIN: '/patient' };

/** Email OTP login against the backend. On success it stores the in-memory JWT (the refresh token is an httpOnly cookie). */
export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);
  const params = new URLSearchParams(location.search);
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const next = params.get('next');
  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/otp/request', { email: email.trim() });
      setOtp('');
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
      const { token, me } = await api.post<{ token: string; me: MeResponse }>('/auth/otp/verify', { email: email.trim(), otp });
      qc.clear();
      setAuth(me, token);
      qc.setQueryData(queries.me, me);
      const home = HOME[me.role];
      navigate(next && next.startsWith(home) ? next : home, { replace: true });
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
            {sent ? `We sent a 6-digit code to ${email}.` : 'Sign in with your email — we will send you a code.'}
          </p>

          {!sent ? (
            <form onSubmit={onSend} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="eyebrow">Email</span>
                <input
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              {error && <p className="text-sm text-ohara-cri-ink">{error}</p>}
              <BigButton variant="primary" type="submit" disabled={loading || !email.trim()} className="w-full">
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
                Change email
              </BigButton>
            </form>
          )}

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
