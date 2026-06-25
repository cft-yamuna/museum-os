/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import { sendSuccess, sendCreated } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';
import { authUser, requireMinRole } from '../middleware/auth.js';
import { createAuditLog } from '../services/auditLog.js';
import { DRIVER_FAMILIES } from '../drivers/index.js';

const router = Router();

const partSchema = z.object({
  part_number: z.string().min(1),
  brand: z.string().optional(),
  model: z.string().optional(),
  category: z.string().optional(),
  platform: z.string().optional(),
  protocol: z.string().optional(),
  driver_family: z.enum(DRIVER_FAMILIES).nullable().optional(),
  default_port: z.number().int().nullable().optional(),
  capabilities: z.array(z.string()).optional(),
  spec: z.record(z.unknown()).optional(),
  notes: z.string().nullable().optional(),
});

/** GET /api/catalog — list hardware catalog parts + known driver families. */
router.get('/', authUser, async (_req, res, next) => {
  try {
    const db = getDb();
    const parts = await db('catalog_parts').orderBy(['category', 'brand', 'part_number']);
    sendSuccess(res, { parts, driver_families: DRIVER_FAMILIES });
  } catch (err) {
    next(err);
  }
});

/** POST /api/catalog — add a part (site_admin+). */
router.post('/', authUser, requireMinRole('site_admin'), validateBody(partSchema), async (req, res, next) => {
  try {
    const db = getDb();
    const body = req.body as z.infer<typeof partSchema>;
    const [part] = await db('catalog_parts')
      .insert({
        ...body,
        capabilities: JSON.stringify(body.capabilities ?? []),
        spec: JSON.stringify(body.spec ?? {}),
      })
      .returning('*');
    createAuditLog({ userId: req.user?.id, action: 'catalog.create', entityType: 'catalog_part', entityId: part.id, details: { part_number: part.part_number } });
    sendCreated(res, { part });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/catalog/:id — update a part (site_admin+). */
router.put('/:id', authUser, requireMinRole('site_admin'), validateBody(partSchema.partial()), async (req, res, next) => {
  try {
    const db = getDb();
    const id = String(req.params.id);
    const body = req.body as Partial<z.infer<typeof partSchema>>;
    const updates: Record<string, unknown> = { ...body, updated_at: db.fn.now() };
    if (body.capabilities !== undefined) updates.capabilities = JSON.stringify(body.capabilities);
    if (body.spec !== undefined) updates.spec = JSON.stringify(body.spec);
    const [part] = await db('catalog_parts').where({ id }).update(updates).returning('*');
    if (!part) throw new NotFoundError('Catalog part', id);
    createAuditLog({ userId: req.user?.id, action: 'catalog.update', entityType: 'catalog_part', entityId: id });
    sendSuccess(res, { part });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/catalog/:id (site_admin+). */
router.delete('/:id', authUser, requireMinRole('site_admin'), async (req, res, next) => {
  try {
    const db = getDb();
    const id = String(req.params.id);
    const count = await db('catalog_parts').where({ id }).del();
    if (!count) throw new NotFoundError('Catalog part', id);
    createAuditLog({ userId: req.user?.id, action: 'catalog.delete', entityType: 'catalog_part', entityId: id });
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
