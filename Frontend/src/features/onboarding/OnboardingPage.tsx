import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BigButton, BrandMark, Icon } from '../../components/ui';
import { setDemoRole } from '../../lib/devBypass';

const STEPS = ['About you', 'Consent', 'Pair device'] as const;

/** Step indicator: numbered pills joined by a track — the current one violet, done ones lime. */
const Stepper = ({ step }: { step: number }) => (
  <ol className="flex items-center gap-2" aria-label="Setup progress">
    {STEPS.map((label, i) => {
      const n = i + 1;
      const state = n < step ? 'done' : n === step ? 'now' : 'next';
      return (
        <li key={label} className="flex flex-1 items-center gap-2" aria-current={state === 'now' ? 'step' : undefined}>
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-pill text-base font-bold ${
              state === 'done'
                ? 'bg-ohara-lime text-ohara-lime-ink'
                : state === 'now'
                  ? 'bg-ohara-ind text-white'
                  : 'bg-ohara-sunken text-ohara-muted'
            }`}
          >
            {state === 'done' ? <Icon.Check className="h-5 w-5" /> : n}
          </span>
          <span className={`hidden text-sm font-semibold sm:inline ${state === 'next' ? 'text-ohara-muted' : 'text-ohara-ink'}`}>
            {label}
          </span>
          {n < STEPS.length && <span className={`h-1 flex-1 rounded-pill ${n < step ? 'bg-ohara-lime' : 'bg-ohara-line'}`} />}
        </li>
      );
    })}
  </ol>
);

/**
 * Onboarding: patient setup, guardian consent, device pairing.
 * Backend not yet wired — UI shell for M2.
 */
export const OnboardingPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  return (
    <div data-size="elder" className="flex min-h-screen flex-col items-center bg-ohara-bg px-4 py-8 sm:py-12">
      <div className="mb-8 flex w-full max-w-2xl items-center justify-between">
        <BrandMark />
        <a href="/login" className="btn-ghost no-underline">
          <Icon.Back /> Sign in
        </a>
      </div>

      <div className="card w-full max-w-2xl animate-rise p-6 sm:p-10">
        <Stepper step={step} />

        <div key={step} className="mt-8 flex animate-rise flex-col gap-5">
          {step === 1 && (
            <>
              <header>
                <h1 className="text-2xl font-bold tracking-tight">Welcome to OHARA</h1>
                <p className="mt-1 text-base text-ohara-muted">Let's plant your tree. It takes about a minute.</p>
              </header>
              <label className="flex flex-col gap-2">
                <span className="eyebrow">Name</span>
                <input className="input" placeholder="Elder's name" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="eyebrow">Language</span>
                <select className="input appearance-none">
                  <option>English</option>
                  <option>Assamese (অসমীয়া)</option>
                  <option>Bodo (बड़ो)</option>
                  <option>Manipuri (মণিপুরী)</option>
                </select>
              </label>
              <BigButton variant="primary" className="w-full" onClick={() => setStep(2)}>
                Continue <Icon.Arrow className="h-6 w-6" />
              </BigButton>
            </>
          )}

          {step === 2 && (
            <>
              <header>
                <h1 className="text-2xl font-bold tracking-tight">Guardian consent</h1>
                <p className="mt-1 text-base text-ohara-muted">
                  A guardian must agree before any data is collected (DPDP Act, 2023).
                </p>
              </header>
              <ul className="flex flex-col gap-3 rounded-lg bg-ohara-sunken p-5">
                {[
                  'Game results and reminders are saved to track progress.',
                  'Data is shared only with the care team you choose.',
                  'You can export or delete all data at any time.',
                ].map((t) => (
                  <li key={t} className="flex gap-3 text-base">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-pill bg-ohara-ind-soft text-ohara-ind-ink">
                      <Icon.Leaf className="h-4 w-4" />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <BigButton variant="secondary" className="sm:flex-1" onClick={() => setStep(1)}>
                  Back
                </BigButton>
                <BigButton variant="primary" className="sm:flex-[2]" onClick={() => setStep(3)}>
                  <Icon.Shield className="h-6 w-6" /> I consent
                </BigButton>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <header>
                <h1 className="text-2xl font-bold tracking-tight">Pair this device</h1>
                <p className="mt-1 text-base text-ohara-muted">Ask your caregiver to enter this code in their app.</p>
              </header>
              <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-ohara-line-strong bg-ohara-surface p-8">
                <span className="font-mono text-4xl font-bold tracking-[0.3em] text-ohara-ind-ink">AB3F9</span>
                <span className="inline-flex items-center gap-2 rounded-pill bg-ohara-lime-soft px-4 py-1.5 text-sm font-semibold text-ohara-lime-ink">
                  <span className="h-2.5 w-2.5 rounded-pill bg-ohara-lime ring-1 ring-ohara-lime-ink/30" />
                  Waiting for caregiver
                </span>
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <BigButton variant="secondary" className="sm:flex-1" onClick={() => setStep(2)}>
                  Back
                </BigButton>
                <BigButton variant="primary" className="sm:flex-[2]" onClick={() => {
                    setDemoRole('PATIENT');
                    navigate('/patient', { replace: true });
                  }}>
                  Done
                </BigButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
