import type { GameSession } from '@prisma/client';
import { mlDecline, mlDifficulty } from '../../integrations/mlClient.js';
import { prisma } from '../../lib/prisma.js';
import { computeBaseline, detectDeclineLocally, MIN_BASELINE_SAMPLES, nextLevelLocally } from '../../utils/baseline.js';
import { raiseAlert } from '../alerts/service.js';

export const GAME_IDS = ['memory-match', 'who-is-this', 'my-day', 'sounds-of-home'] as const;

const BASELINE_WINDOW_DAYS = 28;
const RECENT_SESSIONS = 5;
const DECLINE_COOLDOWN_MS = 24 * 3_600_000;

export const sessionDto = (s: GameSession) => ({
  id: s.id,
  gameId: s.gameId,
  level: s.level,
  accuracy: s.accuracy,
  responseTimeMs: s.responseTimeMs,
  hintsUsed: s.hintsUsed,
  rounds: s.rounds,
  durationMs: s.durationMs,
  completedAt: s.playedAt.toISOString(),
});

/** Recompute the patient's personal baselines from the last 4 weeks of play (excluding the recent window). */
export async function recomputeBaselines(patientId: string) {
  const since = new Date(Date.now() - BASELINE_WINDOW_DAYS * 86_400_000);
  const rows = await prisma.gameSession.findMany({ where: { patientId, playedAt: { gte: since } }, orderBy: { playedAt: 'asc' } });
  // Leave out the most recent sessions so a decline does not drag its own baseline down.
  const hist = rows.length > RECENT_SESSIONS + MIN_BASELINE_SAMPLES ? rows.slice(0, -RECENT_SESSIONS) : rows;
  const metrics = {
    accuracy: computeBaseline(hist.map((r) => r.accuracy)),
    responseTimeMs: computeBaseline(hist.map((r) => r.responseTimeMs)),
  };
  for (const [metric, b] of Object.entries(metrics)) {
    if (!b.sampleSize) continue;
    await prisma.baseline.upsert({
      where: { patientId_metric: { patientId, metric } },
      create: { patientId, metric, ...b },
      update: { ...b, computedAt: new Date() },
    });
  }
  return metrics;
}

/** After a session: check for decline (ML first with personal baseline, local fallback) and raise at most one DECLINE alert per day. */
export async function checkDecline(patientId: string) {
  const recent = await prisma.gameSession.findMany({ where: { patientId }, orderBy: { playedAt: 'desc' }, take: RECENT_SESSIONS });
  const bl = await prisma.baseline.findMany({ where: { patientId } });
  const acc = bl.find((b) => b.metric === 'accuracy');
  const rt = bl.find((b) => b.metric === 'responseTimeMs');

  const baselineMap: Record<string, { median: number; ewma: number; std: number; count: number }> = {};
  if (acc) baselineMap.accuracy = { median: acc.median, ewma: acc.ewma, std: acc.std, count: acc.sampleSize };
  if (rt) baselineMap.responseTimeMs = { median: rt.median, ewma: rt.ewma, std: rt.std, count: rt.sampleSize };

  const ml = await mlDecline({
    patientId,
    sessions: recent.map((s) => ({ accuracy: s.accuracy, responseTimeMs: s.responseTimeMs, playedAt: s.playedAt.toISOString() })),
    baseline: baselineMap,
  });

  let result: { decline: boolean; reason?: string; score?: number };
  if (ml) {
    result = ml;
  } else {
    if (!acc || !rt) return { decline: false, reason: 'No baseline yet' };
    result = detectDeclineLocally(recent, { accuracy: acc, responseTimeMs: rt });
  }
  if (!result.decline) return result;

  const lastDecline = await prisma.alert.findFirst({
    where: { patientId, type: 'DECLINE', createdAt: { gte: new Date(Date.now() - DECLINE_COOLDOWN_MS) } },
  });
  if (!lastDecline) {
    await raiseAlert({
      patientId,
      type: 'DECLINE',
      severity: 'WARN',
      title: 'Game scores lower than usual',
      detail: `${result.reason ?? 'Recent games are below the usual range'}. Not a diagnosis; consider a check-in call.`,
    });
  }
  return result;
}

export async function nextLevel(s: Pick<GameSession, 'patientId' | 'gameId' | 'level' | 'accuracy' | 'responseTimeMs' | 'hintsUsed'>) {
  const ml = await mlDifficulty(s);
  const level = ml?.level ?? nextLevelLocally(s.level, s.accuracy, s.hintsUsed);
  return Math.min(5, Math.max(1, Math.round(level)));
}
