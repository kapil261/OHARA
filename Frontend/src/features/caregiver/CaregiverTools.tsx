import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FamilyPhoto, HUE, Icon, Page, PageHeader, Section, TreeMark } from '../../components/ui';
import { fmtTime, games, type Hue, type ScheduleItem, type ScheduleKind } from '../../lib/models';
import { addFamily, removeFamily, removeReminder, upsertReminder, useAlerts, useFamily, useSchedule, useSessions, type SessionResult } from '../../lib/data';
import { useUiStore } from '../../store/uiStore';
import { KIND, KindBadge, StatusChip } from '../patient/schedule-ui';
import { SettingsPanel } from '../settings/SettingsPanel';
import { ActivityChart, AlertList } from './caregiver-ui';

import { patientLine, usePatientInfo, useProgress } from '../../lib/live';

const label = 'flex flex-col gap-1.5 text-sm font-semibold';
const field = 'input !rounded-lg';

/* ------------------------------------------------------------------ */
/* Schedule editor                                                     */
/* ------------------------------------------------------------------ */

type Draft = { id?: string; time: string; kind: ScheduleKind; title: string; detail: string; voice: string };
const emptyDraft = (voice: string): Draft => ({ time: '09:00', kind: 'medicine', title: '', detail: '', voice });

const ReminderForm = ({ draft, onCancel, onSave }: { draft: Draft; onCancel: () => void; onSave: (d: Draft) => void }) => {
  const { family } = useFamily();
  const [d, setD] = useState(draft);
  useEffect(() => setD(draft), [draft]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!d.title.trim()) return;
    onSave({ ...d, title: d.title.trim(), detail: d.detail.trim() });
  };
  return (
    <form onSubmit={submit} className="card flex animate-rise flex-col gap-4 border-ohara-ind/30 p-5 sm:p-6" aria-label={d.id ? 'Edit reminder' : 'New reminder'}>
      <h2 className="text-lg font-bold">{d.id ? 'Edit reminder' : 'New reminder'}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className={label}>
          Time
          <input type="time" className={field} value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} required />
        </label>
        <label className={label}>
          Type
          <select className={field} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as ScheduleKind })}>
            <option value="medicine">Medicine</option>
            <option value="water">Water</option>
            <option value="meal">Meal</option>
            <option value="walk">Walk</option>
          </select>
        </label>
        <label className={label}>
          Whose voice
          <select className={field} value={d.voice} onChange={(e) => setD({ ...d, voice: e.target.value })}>
            {family.map((f) => (
              <option key={f.id} value={f.name}>
                {f.name} ({f.relation})
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={label}>
        What Bina will see
        <input className={field} placeholder="e.g. Evening medicine" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} required maxLength={40} />
      </label>
      <label className={label}>
        A short note
        <input className={field} placeholder="e.g. One white tablet after dinner" value={d.detail} onChange={(e) => setD({ ...d, detail: e.target.value })} maxLength={80} />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary">
          <Icon.Check className="h-5 w-5" /> {d.id ? 'Save changes' : 'Add reminder'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
};

export const CaregiverSchedule = () => {
  const { schedule } = useSchedule();
  const { family } = useFamily();
  const upsert = upsertReminder;
  const remove = removeReminder;
  const ring = useUiStore((s) => s.ring);
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<Draft | null>(params.get('new') ? emptyDraft(family[0]?.name ?? '') : null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [rang, setRang] = useState<string | null>(null);

  const edit = (s: ScheduleItem) => setDraft({ id: s.id, time: s.time, kind: s.kind, title: s.title, detail: s.detail, voice: s.voice });
  const close = () => {
    setDraft(null);
    if (params.get('new')) setParams({}, { replace: true });
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Schedule"
        title="Bina's day"
        lead="Reminders ring on Bina's phone at these times — even without internet — in the voice you pick."
        actions={
          !draft && (
            <button type="button" className="btn-primary" onClick={() => setDraft(emptyDraft(family[0]?.name ?? ''))}>
              <Icon.Plus className="h-5 w-5" /> Add reminder
            </button>
          )
        }
      />

      {draft && (
        <ReminderForm
          draft={draft}
          onCancel={close}
          onSave={(d) => {
            upsert(d);
            close();
          }}
        />
      )}

      <Section>
        {schedule.length === 0 ? (
          <p className="py-8 text-center text-ohara-muted">No reminders yet. Add the first one.</p>
        ) : (
          <ol className="flex flex-col">
            {schedule.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-4 border-t border-ohara-line py-4 first:border-t-0 sm:flex-nowrap">
                <span className="w-20 shrink-0 text-sm font-bold">{fmtTime(s.time)}</span>
                <KindBadge kind={s.kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.title}</p>
                  <p className="truncate text-sm text-ohara-muted">
                    {s.detail || '—'} · voice of {s.voice}
                  </p>
                </div>
                <StatusChip status={s.status} />
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="btn-ghost !px-3"
                    title="Ring on Bina's phone now"
                    aria-label={`Ring ${s.title} now`}
                    onClick={() => {
                      ring(s.id);
                      setRang(s.id);
                      window.setTimeout(() => setRang(null), 2500);
                    }}
                  >
                    {rang === s.id ? <Icon.Check className="h-5 w-5 text-ohara-tea" /> : <Icon.Bell className="h-5 w-5" />}
                  </button>
                  <button type="button" className="btn-ghost !px-3" aria-label={`Edit ${s.title}`} onClick={() => edit(s)}>
                    <Icon.Edit className="h-5 w-5" />
                  </button>
                  {confirm === s.id ? (
                    <button
                      type="button"
                      className="btn !min-h-[36px] bg-ohara-cri-soft !px-3 !text-sm text-ohara-cri-ink"
                      onClick={() => {
                        remove(s.id);
                        setConfirm(null);
                      }}
                    >
                      Delete?
                    </button>
                  ) : (
                    <button type="button" className="btn-ghost !px-3" aria-label={`Delete ${s.title}`} onClick={() => setConfirm(s.id)}>
                      <Icon.Trash className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
      {rang && (
        <p role="status" className="text-center text-sm text-ohara-muted">
          Ringing on Bina's phone — sign in as the patient to see it.
        </p>
      )}
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Family album                                                        */
/* ------------------------------------------------------------------ */

const HUES: Hue[] = ['violet', 'teal', 'rose', 'amber', 'sky', 'lime'];

export const CaregiverFamily = () => {
  const { family } = useFamily();
  const add = addFamily;
  const remove = removeFamily;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', relation: '', place: '', memory: '' });
  const [photo, setPhoto] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const reset = () => {
    setForm({ name: '', relation: '', place: '', memory: '' });
    setPhoto(undefined);
    setOpen(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.relation.trim()) return;
    add({ ...form, name: form.name.trim(), relation: form.relation.trim(), hue: HUES[family.length % HUES.length], photo });
    reset();
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Family album"
        title="Faces Bina knows"
        lead="Photos here appear on Bina's My Family page and in the Who is this? game."
        actions={
          !open && (
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              <Icon.Plus className="h-5 w-5" /> Add family member
            </button>
          )
        }
      />

      {open && (
        <form onSubmit={submit} className="card flex animate-rise flex-col gap-4 p-5 sm:flex-row sm:p-6">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid h-36 w-36 place-items-center overflow-hidden rounded-xl border-2 border-dashed border-ohara-line-strong bg-ohara-sunken text-ohara-muted hover:border-ohara-ind"
              aria-label="Choose a photo"
            >
              {photo ? (
                <img src={photo} alt="Chosen photo" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1 text-sm font-semibold">
                  <Icon.Camera className="h-8 w-8" /> Add photo
                </span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPhoto(URL.createObjectURL(f));
              }}
            />
            <span className="text-xs text-ohara-muted">Optional</span>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={label}>
              Name
              <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Pallavi" required maxLength={24} />
            </label>
            <label className={label}>
              Relation to Bina
              <input className={field} value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} placeholder="e.g. Niece" required maxLength={24} />
            </label>
            <label className={label}>
              Lives in
              <input className={field} value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="e.g. Tezpur" maxLength={30} />
            </label>
            <label className={label}>
              A memory together
              <input className={field} value={form.memory} onChange={(e) => setForm({ ...form, memory: e.target.value })} placeholder="e.g. Cooking pitha at Bihu" maxLength={60} />
            </label>
            <div className="flex gap-3 sm:col-span-2">
              <button type="submit" className="btn-primary">
                <Icon.Check className="h-5 w-5" /> Add to album
              </button>
              <button type="button" className="btn-ghost" onClick={reset}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {family.map((f) => (
          <li key={f.id} className="card overflow-hidden">
            <FamilyPhoto m={f} letter="text-6xl" className="aspect-[4/3] w-full" />
            <div className="flex items-start gap-2 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{f.name}</p>
                <span className={`chip mt-1 ${HUE[f.hue].soft}`}>{f.relation}</span>
                {f.memory && <p className="mt-2 line-clamp-2 text-sm text-ohara-muted">{f.memory}</p>}
              </div>
              {confirm === f.id ? (
                <button
                  type="button"
                  className="btn !min-h-[32px] shrink-0 bg-ohara-cri-soft !px-3 !text-xs text-ohara-cri-ink"
                  onClick={() => {
                    remove(f.id);
                    setConfirm(null);
                  }}
                >
                  Remove?
                </button>
              ) : (
                <button type="button" className="btn-ghost !min-h-[32px] shrink-0 !px-2" aria-label={`Remove ${f.name}`} onClick={() => setConfirm(f.id)} disabled={family.length <= 3} title={family.length <= 3 ? 'Keep at least 3 for the Who is this? game' : undefined}>
                  <Icon.Trash className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Game history                                                        */
/* ------------------------------------------------------------------ */

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
};

/** Seed history so the section isn't empty before Bina plays (demo only). */
const SEED: SessionResult[] = [
  { id: 'seed1', gameId: 'memory-match', gameTitle: 'Memory Match', accuracy: 0.71, responseTimeMs: 5200, hintsUsed: 2, rounds: 2, playedAt: Date.now() - 1000 * 60 * 60 * 3 },
  { id: 'seed2', gameId: 'who-is-this', gameTitle: 'Who is this?', accuracy: 0.75, responseTimeMs: 4100, hintsUsed: 1, rounds: 1, playedAt: Date.now() - 1000 * 60 * 60 * 26 },
];

export const GameHistory = ({ limit }: { limit?: number }) => {
  const { sessions } = useSessions();
  const list = [...sessions, ...SEED].slice(0, limit);
  return (
    <ul className="flex flex-col">
      {list.map((s) => {
        const g = games.find((x) => x.id === s.gameId);
        return (
          <li key={s.id} className="flex items-center gap-3 border-t border-ohara-line py-3 first:border-t-0">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-pill ${g ? HUE[g.hue].soft : ''}`}>
              <Icon.Brain className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{s.gameTitle}</p>
              <p className="truncate text-xs text-ohara-muted">
                {ago(s.playedAt)} · {s.rounds} round{s.rounds > 1 ? 's' : ''} · {s.hintsUsed} hint{s.hintsUsed === 1 ? '' : 's'} · ~{Math.max(1, Math.round(s.responseTimeMs / 1000))}s per answer
              </p>
            </div>
            <span className="chip shrink-0 bg-ohara-sunken text-ohara-muted" title="Answers right on the first try. Compared only with Bina's own usual.">
              {Math.round(s.accuracy * 100)}% first try
            </span>
          </li>
        );
      })}
    </ul>
  );
};

/* ------------------------------------------------------------------ */
/* Weekly report (print → PDF)                                         */
/* ------------------------------------------------------------------ */

export const CaregiverReport = () => {
  const { schedule } = useSchedule();
  const { sessions } = useSessions();
  const { alerts } = useAlerts();
  const demoPatient = usePatientInfo();
  const { weekActivity, activityBaseline } = useProgress();
  const total = weekActivity.reduce((a, b) => a + b.minutes, 0);
  const avg = Math.round(total / Math.max(1, weekActivity.length));
  const below = weekActivity.filter((d) => d.minutes < activityBaseline * 0.7).map((d) => d.day);
  const week = (() => {
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 86400000);
    const f = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${f(start)} – ${f(end)} ${end.getFullYear()}`;
  })();

  return (
    <Page>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/caregiver" className="btn-secondary no-underline">
          <Icon.Back className="h-5 w-5" /> Overview
        </Link>
        <button type="button" className="btn-primary" onClick={() => window.print()}>
          <Icon.Printer className="h-5 w-5" /> Download PDF / Print
        </button>
      </div>
      <p className="-mt-2 text-sm text-ohara-muted print:hidden">Tip: in the print window choose “Save as PDF” to download it.</p>

      <article className="card flex flex-col gap-8 p-6 sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-ohara-line pb-6">
          <div>
            <p className="eyebrow">Weekly report · {week}</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{demoPatient.fullName}</h1>
            <p className="text-ohara-muted">
              {patientLine(demoPatient)}
            </p>
          </div>
          <span className="flex items-center gap-2 text-ohara-ind">
            <TreeMark className="h-10 w-10" />
            <span className="text-lg font-black tracking-wide text-ohara-ink">OHARA</span>
          </span>
        </header>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ['Active this week', `${total} min`],
            ['Daily average', `${avg} min`],
            ['Her usual', `${activityBaseline} min/day`],
            ['Games played', String(sessions.length + 2)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-ohara-sunken p-4 print:border print:border-ohara-line">
              <p className="text-xs text-ohara-muted">{k}</p>
              <p className="mt-1 text-xl font-extrabold">{v}</p>
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-bold">Activity compared with her own usual</h2>
          <ActivityChart />
          <p className="mt-3 text-sm text-ohara-muted">
            {below.length ? `Noticeably lower on ${below.join(', ')}. One-off dips are normal; talk to the doctor if it continues for more than a week.` : 'Close to her usual every day this week.'}
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">Today's routine</h2>
          <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            {schedule.map((s) => {
              const K = KIND[s.kind];
              return (
                <li key={s.id} className="flex items-center gap-3 border-b border-ohara-line py-2.5 text-sm">
                  <K.icon className="h-4 w-4 text-ohara-muted" />
                  <span className="w-16 font-semibold">{fmtTime(s.time)}</span>
                  <span className="flex-1">{s.title}</span>
                  <span className={s.status === 'done' ? 'font-semibold text-ohara-tea-ink' : 'text-ohara-muted'}>{s.status === 'done' ? 'Done' : 'Pending'}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <section>
            <h2 className="mb-2 text-lg font-bold">Games</h2>
            <GameHistory limit={6} />
          </section>
          <section>
            <h2 className="mb-2 text-lg font-bold">Alerts</h2>
            <ul className="flex flex-col text-sm">
              {alerts.map((a) => (
                <li key={a.id} className="border-b border-ohara-line py-2.5">
                  <span className="font-semibold">{a.title}</span> <span className="text-ohara-muted">· {a.time}</span>
                  <span className={`ml-2 ${a.acknowledged ? 'text-ohara-tea-ink' : 'text-ohara-amb-ink'}`}>{a.acknowledged ? 'seen' : 'open'}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="border-t border-ohara-line pt-4 text-xs text-ohara-muted">
          OHARA supports care and early detection. It does not diagnose and does not replace a doctor. Bina is compared only with her own usual, never with others.
        </footer>
      </article>
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Settings for Bina                                                   */
/* ------------------------------------------------------------------ */

export const CaregiverSettings = () => (
  <Page>
    <PageHeader eyebrow="Settings" title="Bina's phone" lead="Change these for Bina — they apply on her phone straight away." />
    <SettingsPanel forName="Bina" />
  </Page>
);

export { AlertList };
