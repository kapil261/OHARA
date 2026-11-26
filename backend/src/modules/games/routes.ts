import { Router } from 'express';
import { z } from 'zod';
import { hasConsent, requireConsent } from '../../lib/consent.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth } from '../../middleware/auth.js';
import { notFound } from '../../utils/errors.js';
import { localDate } from '../../utils/time.js';
import { GAMES, gameById, suggestGame } from './catalogue.js';
import { checkDecline, GAME_IDS, nextLevel, recomputeBaselines, sessionDto } from './service.js';

export const gamesRouter = Router();

export const sessionSchema = z.object({
  gameId: z.enum(GAME_IDS),
  level: z.number().int().min(1).max(5),
  accuracy: z.number().min(0).max(1),
  responseTimeMs: z.number().int().min(0).max(600_000),
  hintsUsed: z.number().int().min(0).max(100).default(0),
  rounds: z.number().int().min(0).max(1000).default(0),
  durationMs: z.number().int().min(0).max(4 * 3_600_000).default(0),
  completedAt: z.coerce.date().optional(),
  clientId: z.string().min(8).max(64).optional(),
});
export type SessionInput = z.infer<typeof sessionSchema>;

/**
 * Store one session (idempotent by clientId) and pick the next level. Needs games consent;
 * baselines and decline detection run only with analytics consent.
 */
export async function recordSession(patientId: string, input: SessionInput) {
  if (input.clientId) {
    const dup = await prisma.gameSession.findUnique({ where: { clientId: input.clientId } });
    if (dup) return { session: dup, duplicate: true, nextLevel: dup.level };
  }
  await requireConsent(patientId, 'games');
  const { completedAt, ...rest } = input;
  const playedAt = completedAt && completedAt.getTime() <= Date.now() + 60_000 ? completedAt : new Date();
  const session = await prisma.gameSession.create({ data: { ...rest, patientId, playedAt } });
  const level = await nextLevel(session);
  if (await hasConsent(patientId, 'analytics')) {
    await recomputeBaselines(patientId);
    await checkDecline(patientId);
  }
  return { session, duplicate: false, nextLevel: level };
}

gamesRouter.post('/patients/:patientId/sessions', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const body = parse(sessionSchema, req.body);
  const r = await recordSession(req.access!.patientId, body);
  res.status(r.duplicate ? 200 : 201).json({ session: sessionDto(r.session), nextLevel: r.nextLevel });
});

gamesRouter.get('/patients/:patientId/sessions', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const q = parse(
    z.object({ gameId: z.enum(GAME_IDS).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }),
    req.query,
  );
  const rows = await prisma.gameSession.findMany({
    where: { patientId: req.access!.patientId, ...(q.gameId ? { gameId: q.gameId } : {}) },
    orderBy: { playedAt: 'desc' },
    take: q.limit,
  });
  res.json(rows.map(sessionDto));
});

/** Game catalogue with level settings. */
gamesRouter.get('/games', requireAuth, (_req, res) => {
  res.json(GAMES);
});

gamesRouter.get('/games/:gameId/levels', requireAuth, (req, res) => {
  const g = gameById(String(req.params.gameId));
  if (!g) throw notFound('Game');
  res.json(g.levels);
});

/**
 * Current level per game (so each game starts at the right difficulty) and the game suggested today.
 * `/difficulty` is the path used in the design docs; both return the same list.
 */
gamesRouter.get(['/patients/:patientId/games', '/patients/:patientId/difficulty'], requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const patientId = req.access!.patientId;
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { timezone: true } });
  const now = new Date();
  const today = localDate(now, patient.timezone);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await Promise.all(
    GAME_IDS.map(async (gameId) => {
      const [last, playsLast7d] = await Promise.all([
        prisma.gameSession.findFirst({ where: { patientId, gameId }, orderBy: { playedAt: 'desc' } }),
        prisma.gameSession.count({ where: { patientId, gameId, playedAt: { gte: weekAgo } } }),
      ]);
      return { gameId, last, playsLast7d, playedToday: Boolean(last && localDate(last.playedAt, patient.timezone) === today) };
    }),
  );
  const suggested = suggestGame(rows.map((r) => ({ gameId: r.gameId, playsLast7d: r.playsLast7d, playedToday: r.playedToday, lastPlayedAt: r.last?.playedAt ?? null })));
  const out = await Promise.all(
    rows.map(async (r) => {
      const def = gameById(r.gameId)!;
      return {
        gameId: r.gameId,
        title: def.title,
        description: def.description,
        domain: def.domain,
        level: r.last ? await nextLevel(r.last) : 1,
        lastPlayedAt: r.last?.playedAt.toISOString() ?? null,
        playedToday: r.playedToday,
        suggested: r.gameId === suggested,
      };
    }),
  );
  res.json(out);
});
