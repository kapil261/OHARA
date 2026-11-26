/**
 * Dummy data matching the frontend demo (src/lib/demoData.ts).
 * Wipes every table first, so it is safe to run again. Refuses in production unless SEED_FORCE=1.
 *
 *   npm run db:seed
 *
 * Sign in with any seeded email; with no SMTP configured the OTP code is printed in the API log.
 * No phone numbers are seeded on purpose (a made-up number may belong to a real person who would get
 * the SMS alerts); add your own with POST /api/me/phone to try SMS sign-in.
 */
import { PrismaClient, type OccurrenceStatus, type ReminderKind, type Role } from '@prisma/client';
import { recomputeBaselines } from '../src/modules/games/service.js';
import { addDays, localDate, zonedTimeToUtc } from '../src/utils/time.js';

const prisma = new PrismaClient();
const TZ = 'Asia/Kolkata';
const DAYS = 14;
const now = new Date();
const today = localDate(now, TZ);

// Deterministic pseudo-random so every seed looks the same.
let state = 42;
const rand = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const jitter = (n: number, spread: number) => n + (rand() * 2 - 1) * spread;

type ReminderSeed = { time: string; title: string; detail: string; kind: ReminderKind; voiceBy: string };

const binaReminders: ReminderSeed[] = [
  { time: '08:00', title: 'Morning medicine', detail: 'One white tablet after tea', kind: 'MEDICINE', voiceBy: 'Rina' },
  { time: '10:30', title: 'Drink water', detail: 'One full glass', kind: 'WATER', voiceBy: 'Rina' },
  { time: '13:00', title: 'Lunch', detail: 'Rice, dal and fish', kind: 'MEAL', voiceBy: 'Arup' },
  { time: '17:00', title: 'Evening walk', detail: 'Around the garden with Arup', kind: 'WALK', voiceBy: 'Arup' },
  { time: '18:00', title: 'Evening medicine', detail: 'One white tablet', kind: 'MEDICINE', voiceBy: 'Rina' },
  { time: '20:30', title: 'Dinner', detail: 'Roti and sabji', kind: 'MEAL', voiceBy: 'Rina' },
];

const basicReminders = (voice: string): ReminderSeed[] => [
  { time: '08:30', title: 'Morning medicine', detail: 'After breakfast', kind: 'MEDICINE', voiceBy: voice },
  { time: '12:00', title: 'Drink water', detail: 'One full glass', kind: 'WATER', voiceBy: voice },
  { time: '19:00', title: 'Evening medicine', detail: 'Before dinner', kind: 'MEDICINE', voiceBy: voice },
];

async function wipe() {
  // Children first. Cascades would cover most of this, but being explicit keeps it obvious.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notificationLog.deleteMany(),
    prisma.visitNote.deleteMany(),
    prisma.culturePackVersion.deleteMany(),
    prisma.contentItem.deleteMany(),
    prisma.culturePack.deleteMany(),
    prisma.reminderEvent.deleteMany(),
    prisma.reminderOccurrence.deleteMany(),
    prisma.reminder.deleteMany(),
    prisma.alert.deleteMany(),
    prisma.gameSession.deleteMany(),
    prisma.baseline.deleteMany(),
    prisma.familyMember.deleteMany(),
    prisma.mediaItem.deleteMany(),
    prisma.pushSubscription.deleteMany(),
    prisma.pairingCode.deleteMany(),
    prisma.device.deleteMany(),
    prisma.consent.deleteMany(),
    prisma.careTeamMember.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.otpCode.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

const user = (email: string, name: string, role: Role = 'CAREGIVER') => prisma.user.create({ data: { email, name, role } });

/** Reminders + 14 days of occurrences/events. `adherence` is the chance a past reminder was done. */
async function seedSchedule(patientId: string, items: ReminderSeed[], adherence: number, missEvenings = false) {
  for (const r of items) {
    const reminder = await prisma.reminder.create({
      data: { ...r, patientId, daysOfWeek: [], alertIfMissed: r.kind === 'MEDICINE' || r.kind === 'APPOINTMENT' },
    });
    for (let i = DAYS - 1; i >= 0; i--) {
      const date = addDays(today, -i);
      const dueAt = zonedTimeToUtc(date, r.time, TZ);
      let status: OccurrenceStatus = 'PENDING';
      let completedAt: Date | null = null;
      if (dueAt <= now) {
        const p = missEvenings && r.time >= '18:00' ? adherence * 0.4 : adherence;
        if (rand() < p) {
          status = 'DONE';
          completedAt = new Date(dueAt.getTime() + Math.round(rand() * 20) * 60_000);
        } else status = 'MISSED';
      }
      await prisma.reminderOccurrence.create({
        data: {
          reminderId: reminder.id,
          patientId,
          date,
          dueAt,
          status,
          completedAt,
          notifiedAt: dueAt <= now ? dueAt : null,
          repeatedAt: dueAt <= now && status !== 'DONE' ? new Date(dueAt.getTime() + 10 * 60_000) : null,
          caregiverNotifiedAt: status === 'MISSED' ? new Date(dueAt.getTime() + 30 * 60_000) : null,
          smsAt: status === 'MISSED' ? new Date(dueAt.getTime() + 45 * 60_000) : null,
          emailedAt: status === 'MISSED' ? new Date(dueAt.getTime() + 45 * 60_000) : null,
        },
      });
      if (status !== 'PENDING') {
        await prisma.reminderEvent.create({ data: { reminderId: reminder.id, patientId, date, status, at: completedAt ?? new Date(dueAt.getTime() + 15 * 60_000) } });
      }
    }
  }
}

/** Game sessions over the last 14 days. `drift` < 0 slowly lowers accuracy (shows a gentle decline). */
async function seedGames(patientId: string, perDay: number, baseAcc: number, baseRt: number, drift = 0) {
  const ids = ['memory-match', 'who-is-this', 'my-day', 'sounds-of-home'];
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const n = Math.max(0, Math.round(jitter(perDay, 0.8)));
    for (let k = 0; k < n; k++) {
      const playedAt = zonedTimeToUtc(date, `${String(9 + k * 4).padStart(2, '0')}:${String(Math.floor(rand() * 50)).padStart(2, '0')}`, TZ);
      if (playedAt > now) continue;
      const age = DAYS - 1 - i;
      const accuracy = Math.min(1, Math.max(0.2, jitter(baseAcc + drift * age, 0.06)));
      const rounds = 6 + Math.floor(rand() * 5);
      await prisma.gameSession.create({
        data: {
          patientId,
          gameId: ids[Math.floor(rand() * ids.length)]!,
          level: accuracy > 0.85 ? 3 : accuracy > 0.65 ? 2 : 1,
          accuracy: Math.round(accuracy * 100) / 100,
          responseTimeMs: Math.round(jitter(baseRt - drift * age * 4000, 400)),
          hintsUsed: accuracy < 0.7 ? 2 : Math.floor(rand() * 2),
          rounds,
          durationMs: Math.round(jitter(9, 4) * 60_000),
          playedAt,
        },
      });
    }
  }
  await recomputeBaselines(patientId);
}

/** Assam pack published (v1), Bodoland draft, Manipur planned. Audio is left for the content team to record. */
async function seedCulturePacks() {
  const assam = await prisma.culturePack.create({ data: { region: 'assam', name: 'Assam', languages: ['as', 'hi', 'en'], status: 'DRAFT' } });
  const items = [
    { category: 'OBJECT', label: 'Gamosa', labels: { as: 'গামোচা', hi: 'गमछा' }, tags: ['cloth', 'bihu'] },
    { category: 'OBJECT', label: 'Japi', labels: { as: 'জাপি', hi: 'जापी' }, tags: ['hat'] },
    { category: 'FOOD', label: 'Pitha', labels: { as: 'পিঠা', hi: 'पीठा' }, tags: ['bihu', 'sweet'] },
    { category: 'FOOD', label: 'Masor tenga', labels: { as: 'মাছৰ টেঙা', hi: 'मछली टेंगा' }, tags: ['fish'] },
    { category: 'FESTIVAL', label: 'Bihu dance', labels: { as: 'বিহু নাচ', hi: 'बिहू नृत्य' }, tags: ['rongali'] },
    { category: 'SOUND', label: 'Pepa', labels: { as: 'পেঁপা', hi: 'पेपा' }, tags: ['music', 'bihu'] },
    { category: 'SOUND', label: 'Temple bell', labels: { as: 'ঘণ্টা', hi: 'घंटी' }, tags: ['namghar'] },
    { category: 'ROUTINE', label: 'Morning tea', labels: { as: 'ৰাতিপুৱাৰ চাহ', hi: 'सुबह की चाय' }, tags: ['morning'] },
  ] as const;
  for (const [i, it] of items.entries()) {
    await prisma.contentItem.create({ data: { ...it, tags: [...it.tags], packId: assam.id, sortOrder: i, audio: {} } });
  }
  const rows = await prisma.contentItem.findMany({ where: { packId: assam.id }, orderBy: { sortOrder: 'asc' } });
  const snapshot = rows.map((r) => ({ id: r.id, category: r.category.toLowerCase(), label: r.label, labels: r.labels, tags: r.tags, image: null, audio: {}, sortOrder: r.sortOrder }));
  await prisma.culturePackVersion.create({ data: { packId: assam.id, version: 1, items: snapshot } });
  await prisma.culturePack.update({ where: { id: assam.id }, data: { version: 1, status: 'PUBLISHED', publishedAt: now } });

  const bodo = await prisma.culturePack.create({ data: { region: 'bodoland', name: 'Bodoland', languages: ['brx', 'as', 'en'], status: 'DRAFT' } });
  await prisma.contentItem.create({ data: { packId: bodo.id, category: 'OBJECT', label: 'Dokhona', tags: ['cloth'], audio: {} } });
  await prisma.culturePack.create({ data: { region: 'manipur', name: 'Manipur', languages: ['mni', 'en'], status: 'PLANNED' } });
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== '1') {
    throw new Error('Refusing to wipe a production database. Set SEED_FORCE=1 if you really mean it.');
  }
  await wipe();

  // --- Users (example.com only) ---
  const admin = await user('admin@example.com', 'OHARA Admin', 'ADMIN');
  const rina = await user('rina@example.com', 'Rina Kalita');
  const arup = await user('arup@example.com', 'Arup Kalita');
  const doctor = await user('dr.bora@example.com', 'Dr. Anil Bora', 'HEALTH_WORKER');
  const asha = await user('mousumi@example.com', 'Mousumi Das', 'HEALTH_WORKER');

  // --- Bina, the main demo patient ---
  const bina = await prisma.patient.create({
    data: { displayName: 'Bina', fullName: 'Bina Kalita', age: 72, place: 'Jorhat, Assam', language: 'Assamese', timezone: TZ },
  });
  await prisma.user.updateMany({ where: { id: { in: [rina.id, arup.id] } }, data: { activePatientId: bina.id } });
  await prisma.careTeamMember.createMany({
    data: [
      { patientId: bina.id, userId: rina.id, relation: 'Daughter · Guwahati', memberRole: 'CAREGIVER', isOwner: true, permissions: ['view', 'schedule', 'upload', 'export', 'delete', 'manage_team'], hue: 'violet' },
      { patientId: bina.id, userId: arup.id, relation: 'Son · Jorhat', memberRole: 'CAREGIVER', permissions: ['view', 'schedule', 'upload'], hue: 'teal' },
      { patientId: bina.id, userId: doctor.id, relation: 'Doctor · Jorhat Medical College', memberRole: 'HEALTH_WORKER', permissions: ['view', 'export'], hue: 'sky' },
      { patientId: bina.id, userId: asha.id, relation: 'ASHA worker · Titabar', memberRole: 'HEALTH_WORKER', permissions: ['view'], hue: 'amber' },
    ],
  });
  await prisma.consent.createMany({
    data: [
      { patientId: bina.id, grantedById: rina.id, scope: 'care_data', guardian: true, text: 'I agree, as Bina’s guardian, to store her reminders, game results and family photos to support her care.' },
      { patientId: bina.id, grantedById: rina.id, scope: 'location', guardian: true, text: 'Share Bina’s location with the family when she presses SOS.' },
    ],
  });
  await prisma.device.create({
    data: { patientId: bina.id, label: 'Bina’s tablet', model: 'Redmi Pad SE', appVersion: '1.0.3', lastSeenAt: new Date(now.getTime() - 40 * 60_000) },
  });
  await prisma.familyMember.createMany({
    data: [
      { name: 'Rina', relation: 'Daughter', place: 'Guwahati', hue: 'violet', memory: 'Her wedding at Kamakhya, 2004' },
      { name: 'Arup', relation: 'Son', place: 'Jorhat', hue: 'teal', memory: 'Fishing at the pond every Sunday' },
      { name: 'Moni', relation: 'Granddaughter', place: 'Bengaluru', hue: 'rose', memory: 'Her first Bihu dance' },
      { name: 'Dipen', relation: 'Husband', place: 'Jorhat', hue: 'amber', memory: 'The tea garden walks' },
      { name: 'Jyoti', relation: 'Sister', place: 'Dibrugarh', hue: 'sky', memory: 'Making pitha together' },
      { name: 'Bablu', relation: 'Grandson', place: 'Delhi', hue: 'lime', memory: 'Learning to ride a cycle' },
    ].map((f) => ({ ...f, patientId: bina.id })),
  });
  await seedSchedule(bina.id, binaReminders, 0.88);
  await seedGames(bina.id, 1.5, 0.82, 4200, -0.004);

  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  await prisma.alert.createMany({
    data: [
      { patientId: bina.id, type: 'MISSED_DOSE', severity: 'WARN', title: 'Water reminder missed', detail: 'No response to the 10:30 AM reminder for 15 minutes.', createdAt: ago(90) },
      { patientId: bina.id, type: 'INACTIVITY', severity: 'INFO', title: 'Lower activity yesterday', detail: 'Played 9 min, below her usual 16 min. One day only — no action needed yet.', createdAt: ago(60 * 20) },
      { patientId: bina.id, type: 'INFO', severity: 'INFO', title: 'Played Memory Match', detail: '12 minutes, finished on a win. Used 2 gentle hints.', createdAt: ago(150) },
      {
        patientId: bina.id,
        type: 'SOS',
        severity: 'CRITICAL',
        title: 'SOS pressed',
        detail: 'Bina pressed SOS. Arup called back and all was well.',
        createdAt: ago(60 * 24 * 4),
        acknowledged: true,
        acknowledgedAt: ago(60 * 24 * 4 - 6),
        acknowledgedBy: arup.id,
        resolved: true,
        resolvedAt: ago(60 * 24 * 4 - 20),
        resolvedBy: arup.id,
        resolutionNote: 'She was looking for her glasses. All fine.',
      },
    ],
  });
  await prisma.visitNote.create({
    data: { patientId: bina.id, authorId: asha.id, text: 'Home visit: BP 132/84, taking tablets regularly. Enjoys the face game. Asked Rina to add Moni’s new photos.', visitedAt: ago(60 * 24 * 2) },
  });

  // --- Other patients for the health-worker list (Mousumi is on every team) ---
  const others = [
    { full: 'Hemanta Saikia', short: 'Hemanta', age: 78, place: 'Titabar', cg: ['pranab@example.com', 'Pranab Saikia', 'Son'], adherence: 0.75, missEvenings: true, games: [0.6, 0.55, 6200, -0.01] },
    { full: 'Lakhi Gogoi', short: 'Lakhi', age: 81, place: 'Mariani', cg: ['nitu@example.com', 'Nitu Gogoi', 'Daughter-in-law'], adherence: 0.72, missEvenings: false, games: [0.8, 0.68, 5400, 0], sos: true },
    { full: 'Ramesh Baruah', short: 'Ramesh', age: 69, place: 'Teok', cg: ['anjali@example.com', 'Anjali Baruah', 'Wife'], adherence: 1, missEvenings: false, games: [1.2, 0.9, 3500, 0.002] },
    { full: 'Kamala Das', short: 'Kamala', age: 75, place: 'Titabar', cg: ['bijoy@example.com', 'Bijoy Das', 'Son'], adherence: 0.93, missEvenings: false, games: [1, 0.8, 4600, -0.006], warn: 'Recognition game slower than usual' },
    { full: 'Jogen Hazarika', short: 'Jogen', age: 84, place: 'Mariani', cg: ['rupa@example.com', 'Rupa Hazarika', 'Daughter'], adherence: 0.95, missEvenings: false, games: [0.8, 0.78, 5000, 0] },
  ] as const;

  for (const o of others) {
    const p = await prisma.patient.create({ data: { displayName: o.short, fullName: o.full, age: o.age, place: o.place, language: 'Assamese', timezone: TZ } });
    const cg = await prisma.user.create({ data: { email: o.cg[0], name: o.cg[1], role: 'CAREGIVER', activePatientId: p.id } });
    await prisma.careTeamMember.createMany({
      data: [
        { patientId: p.id, userId: cg.id, relation: o.cg[2], isOwner: true, permissions: ['view', 'schedule', 'upload', 'export', 'delete', 'manage_team'], hue: 'violet' },
        { patientId: p.id, userId: asha.id, relation: `ASHA worker · ${o.place}`, memberRole: 'HEALTH_WORKER', permissions: ['view'], hue: 'amber' },
      ],
    });
    await prisma.consent.create({ data: { patientId: p.id, grantedById: cg.id, text: 'Guardian consent for care data.' } });
    await prisma.device.create({
      data: { patientId: p.id, label: `${o.short}’s phone`, model: 'Redmi 9A', appVersion: '1.0.2', lastSeenAt: ago(60 * (o.adherence < 0.8 ? 50 : 3)) },
    });
    await seedSchedule(p.id, basicReminders(o.cg[1].split(' ')[0]!), o.adherence, o.missEvenings);
    const [perDay, acc, rt, drift] = o.games;
    await seedGames(p.id, perDay, acc, rt, drift);
    if ('sos' in o) {
      await prisma.alert.create({ data: { patientId: p.id, type: 'SOS', severity: 'CRITICAL', title: 'SOS pressed', detail: `${o.short} pressed SOS yesterday.`, createdAt: ago(60 * 26) } });
    }
    if ('warn' in o) {
      await prisma.alert.create({ data: { patientId: p.id, type: 'DECLINE', severity: 'WARN', title: o.warn, detail: 'Response time is above her own baseline for the last 5 sessions.', createdAt: ago(60 * 5) } });
    }
  }

  await seedCulturePacks();

  await prisma.auditLog.create({ data: { actorId: admin.id, action: 'seed.loaded', meta: { at: now.toISOString() } } });

  const counts = {
    users: await prisma.user.count(),
    patients: await prisma.patient.count(),
    reminders: await prisma.reminder.count(),
    occurrences: await prisma.reminderOccurrence.count(),
    sessions: await prisma.gameSession.count(),
    baselines: await prisma.baseline.count(),
    alerts: await prisma.alert.count(),
    family: await prisma.familyMember.count(),
    visitNotes: await prisma.visitNote.count(),
    cultureItems: await prisma.contentItem.count(),
  };
  console.log('Seeded:', counts);
  console.log('Sign in as rina@example.com (caregiver, owner of Bina), arup@example.com, mousumi@example.com / dr.bora@example.com (health workers) or admin@example.com.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
