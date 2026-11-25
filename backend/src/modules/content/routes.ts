import { Router } from 'express';
import { ContentCategory, PackStatus, Prisma, type ContentItem, type CulturePack } from '@prisma/client';
import { z } from 'zod';
import { contentUrl, signContentUpload } from '../../integrations/cloudinary.js';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requireAuth, requireRole, requireUser } from '../../middleware/auth.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';

/**
 * Culture packs: regional images, sounds, foods, festivals and routine cards used by the games,
 * with audio in each language. Admins edit drafts; "publish" freezes a numbered snapshot that
 * phones download on their next sync (they compare `version`).
 */
export const contentRouter = Router();

const admin = [requireAuth, requireUser, requireRole('ADMIN')] as const;

const lang = z.string().trim().regex(/^[a-z]{2,3}$/, 'Use a language code such as "as", "hi" or "en"');
const asset = z.string().trim().min(1).max(500);
const category = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.nativeEnum(ContentCategory));

const packBody = z.object({
  region: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, 'Use a short slug such as "assam"'),
  name: z.string().trim().min(1).max(60),
  languages: z.array(lang).min(1).max(10),
  status: z.enum([PackStatus.PLANNED, PackStatus.DRAFT]).optional(),
});

const itemBody = z.object({
  category,
  label: z.string().trim().min(1).max(80),
  labels: z.record(lang, z.string().trim().min(1).max(80)).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  image: asset.nullable().optional(),
  audio: z.record(lang, asset).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const audioOf = (i: ContentItem) => (i.audio ?? {}) as Record<string, string>;

/** Which of the pack's languages have audio for this item. */
const missingAudio = (i: ContentItem, languages: string[]) => languages.filter((l) => !audioOf(i)[l]);

function itemDto(i: ContentItem, languages: string[]) {
  const audio = audioOf(i);
  return {
    id: i.id,
    category: i.category.toLowerCase(),
    label: i.label,
    labels: i.labels,
    tags: i.tags,
    image: i.image,
    imageUrl: contentUrl(i.image, 'image'),
    audio,
    audioUrls: Object.fromEntries(Object.entries(audio).map(([l, v]) => [l, contentUrl(v, 'video')])),
    missingAudio: missingAudio(i, languages),
    sortOrder: i.sortOrder,
  };
}

function audioCheck(items: ContentItem[], languages: string[]) {
  return {
    items: items.length,
    complete: items.filter((i) => missingAudio(i, languages).length === 0).length,
    missingByLanguage: Object.fromEntries(languages.map((l) => [l, items.filter((i) => !audioOf(i)[l]).length])),
  };
}

const packDto = (p: CulturePack, items?: ContentItem[]) => ({
  id: p.id,
  region: p.region,
  name: p.name,
  languages: p.languages,
  status: p.status.toLowerCase(),
  version: p.version,
  publishedAt: p.publishedAt?.toISOString() ?? null,
  updatedAt: p.updatedAt.toISOString(),
  ...(items ? { audioCheck: audioCheck(items, p.languages) } : {}),
});

async function loadPack(id: string) {
  const p = await prisma.culturePack.findUnique({ where: { id }, include: { items: { orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] } } });
  if (!p) throw notFound('Culture pack');
  return p;
}

// ---------- Read (any signed-in user or paired device) ----------

/** Admins see every pack with its audio check; everyone else sees published packs only. */
contentRouter.get('/content/packs', requireAuth, async (req, res) => {
  const isAdmin = req.auth!.kind === 'user' && req.auth!.role === 'ADMIN';
  const packs = await prisma.culturePack.findMany({
    where: isAdmin ? {} : { version: { gt: 0 } },
    include: { items: isAdmin },
    orderBy: { name: 'asc' },
  });
  res.json(packs.map((p) => packDto(p, isAdmin ? p.items : undefined)));
});

/**
 * Latest published snapshot of a region's pack, which is what phones download.
 * Pass ?since=<version> to get { upToDate: true } when nothing changed.
 */
contentRouter.get('/content/packs/:region', requireAuth, async (req, res) => {
  const q = parse(z.object({ since: z.coerce.number().int().min(0).optional() }), req.query);
  const pack = await prisma.culturePack.findUnique({ where: { region: String(req.params.region).toLowerCase() } });
  if (!pack || pack.version === 0) throw notFound('Published culture pack');
  if (q.since !== undefined && q.since >= pack.version) return res.json({ region: pack.region, version: pack.version, upToDate: true });
  const snap = await prisma.culturePackVersion.findUniqueOrThrow({ where: { packId_version: { packId: pack.id, version: pack.version } } });
  res.json({ region: pack.region, name: pack.name, languages: pack.languages, version: snap.version, publishedAt: snap.publishedAt.toISOString(), items: snap.items });
});

// ---------- Admin ----------

contentRouter.post('/content/packs', ...admin, async (req, res) => {
  const body = parse(packBody, req.body);
  try {
    const p = await prisma.culturePack.create({ data: { ...body, status: body.status ?? 'DRAFT' } });
    await audit('content.pack_created', { actorId: req.auth!.sub, meta: { packId: p.id, region: p.region } });
    res.status(201).json(packDto(p, []));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict('A pack for this region already exists');
    throw err;
  }
});

/** Draft view of one pack: every item with image/audio URLs and which languages still need audio. */
contentRouter.get('/content/packs/:packId/items', ...admin, async (req, res) => {
  const p = await loadPack(String(req.params.packId));
  res.json({ ...packDto(p, p.items), items: p.items.map((i) => itemDto(i, p.languages)) });
});

contentRouter.patch('/content/packs/:packId', ...admin, async (req, res) => {
  const body = parse(packBody.partial(), req.body);
  const existing = await loadPack(String(req.params.packId));
  const p = await prisma.culturePack.update({ where: { id: existing.id }, data: body });
  await audit('content.pack_updated', { actorId: req.auth!.sub, meta: { packId: p.id, fields: Object.keys(body) } });
  res.json(packDto(p, existing.items));
});

contentRouter.delete('/content/packs/:packId', ...admin, async (req, res) => {
  const existing = await loadPack(String(req.params.packId));
  await prisma.culturePack.delete({ where: { id: existing.id } });
  await audit('content.pack_deleted', { actorId: req.auth!.sub, meta: { packId: existing.id, region: existing.region } });
  res.status(204).end();
});

/** Signed direct upload for a pack image ("image") or sound ("video": Cloudinary stores audio as video). */
contentRouter.post('/content/packs/:packId/sign', ...admin, async (req, res) => {
  const body = parse(z.object({ resourceType: z.enum(['image', 'video']) }), req.body);
  const p = await loadPack(String(req.params.packId));
  res.json(signContentUpload(p.id, body.resourceType));
});

contentRouter.post('/content/packs/:packId/items', ...admin, async (req, res) => {
  const body = parse(itemBody, req.body);
  const p = await loadPack(String(req.params.packId));
  const i = await prisma.contentItem.create({
    data: { ...body, packId: p.id, labels: body.labels ?? {}, audio: body.audio ?? {}, tags: body.tags ?? [], image: body.image ?? null },
  });
  await prisma.culturePack.update({ where: { id: p.id }, data: { updatedAt: new Date() } });
  res.status(201).json(itemDto(i, p.languages));
});

contentRouter.patch('/content/items/:itemId', ...admin, async (req, res) => {
  const body = parse(itemBody.partial(), req.body);
  const existing = await prisma.contentItem.findUnique({ where: { id: String(req.params.itemId) }, include: { pack: true } });
  if (!existing) throw notFound('Content item');
  // Audio and labels merge per language, so adding Bodo audio does not wipe the Assamese clip.
  const audio = body.audio ? { ...audioOf(existing), ...body.audio } : undefined;
  const labels = body.labels ? { ...(existing.labels as Record<string, string>), ...body.labels } : undefined;
  const i = await prisma.contentItem.update({ where: { id: existing.id }, data: { ...body, audio, labels } });
  await prisma.culturePack.update({ where: { id: existing.packId }, data: { updatedAt: new Date() } });
  res.json(itemDto(i, existing.pack.languages));
});

contentRouter.delete('/content/items/:itemId', ...admin, async (req, res) => {
  const { count } = await prisma.contentItem.deleteMany({ where: { id: String(req.params.itemId) } });
  if (!count) throw notFound('Content item');
  res.status(204).end();
});

/**
 * Publish: freeze the current items as the next version. Refuses an empty pack, and refuses items
 * missing audio unless ?force=true (the audio check is shown in the editor).
 */
contentRouter.post('/content/packs/:packId/publish', ...admin, async (req, res) => {
  const q = parse(z.object({ force: z.enum(['true', 'false']).optional() }), req.query);
  const p = await loadPack(String(req.params.packId));
  if (!p.items.length) throw badRequest('Add at least one item before publishing');
  const check = audioCheck(p.items, p.languages);
  if (check.complete < check.items && q.force !== 'true') {
    throw badRequest(`${check.items - check.complete} item(s) are missing audio. Add it, or publish anyway with ?force=true.`, check);
  }
  const version = p.version + 1;
  const items = p.items.map((i) => itemDto(i, p.languages));
  const [updated] = await prisma.$transaction([
    prisma.culturePack.update({ where: { id: p.id }, data: { version, status: 'PUBLISHED', publishedAt: new Date() } }),
    prisma.culturePackVersion.create({ data: { packId: p.id, version, items: items as unknown as Prisma.InputJsonValue } }),
  ]);
  await audit('content.pack_published', { actorId: req.auth!.sub, meta: { packId: p.id, version, items: items.length } });
  res.json(packDto(updated, p.items));
});
