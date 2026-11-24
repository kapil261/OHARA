import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePatientAccess } from '../../middleware/access.js';
import { requireAuth } from '../../middleware/auth.js';
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

/** Store one session (idempotent by clientId) and run adaptive difficulty + decline checks. */
export async function recordSession(patientId: string, input: SessionInput) {
  if (input.clientId) {
    const dup = await prisma.gameSession.findUnique({ where: { clientId: input.clientId } });
    if (dup) return { session: dup, duplicate: true, nextLevel: dup.level };
  }
  const { completedAt, ...rest } = input;
  const playedAt = completedAt && completedAt.getTime() <= Date.now() + 60_000 ? completedAt : new Date();
  const session = await prisma.gameSession.create({ data: { ...rest, patientId, playedAt } });
  const level = await nextLevel(session);
  await recomputeBaselines(patientId);
  await checkDecline(patientId);
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

/** Current level per game, so the patient screen starts each game at the right difficulty. */
gamesRouter.get('/patients/:patientId/games', requireAuth, requirePatientAccess('view', { device: true }), async (req, res) => {
  const patientId = req.access!.patientId;
  const out = await Promise.all(
    GAME_IDS.map(async (gameId) => {
      const last = await prisma.gameSession.findFirst({ where: { patientId, gameId }, orderBy: { playedAt: 'desc' } });
      return { gameId, level: last ? await nextLevel(last) : 1, lastPlayedAt: last?.playedAt.toISOString() ?? null };
    }),
  );
  res.json(out);
});
