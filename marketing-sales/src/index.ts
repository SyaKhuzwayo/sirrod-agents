import { MCPServer, text, object, error, mix } from 'mcp-use/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, AssetRow } from './db.js';

const server = new MCPServer({
  name: 'sirrod-marketing-sales',
  version: '1.0.0',
});

const ASSET_TYPES = ['sales_copy', 'listing', 'social_post', 'press_release', 'email', 'landing_page', 'press_kit', 'other'] as const;
const STATUSES = ['draft', 'in_review', 'approved', 'published'] as const;

// ---------- CREATE ----------
server.tool({
  name: 'create_asset',
  description: 'Create a new launch-kit asset (e.g. sales copy, a marketplace listing, a social post) for a book.',
  schema: z.object({
    title: z.string().describe('Short label, e.g. "Amazon listing - Pip and the Goodnight Lanterns"'),
    asset_type: z.enum(ASSET_TYPES).describe('Type of asset'),
    content: z.string().optional().describe('The actual asset text/copy'),
    channel: z.string().optional().describe('Distribution channel, e.g. "Amazon", "Instagram", "Newsletter"'),
    status: z.enum(STATUSES).default('draft'),
    notes: z.string().optional(),
  }),
}, async ({ title, asset_type, content, channel, status, notes }) => {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO assets (id, title, asset_type, content, channel, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, asset_type, content ?? null, channel ?? null, status, notes ?? null);

  return object({ id, title, asset_type, status });
});

// ---------- READ (one) ----------
server.tool({
  name: 'get_asset',
  description: 'Retrieve a single launch-kit asset by its id.',
  schema: z.object({
    id: z.string(),
  }),
}, async ({ id }) => {
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | undefined;
  if (!row) return error(`No asset found with id ${id}`);
  return object(row);
});

// ---------- READ (list) ----------
server.tool({
  name: 'list_assets',
  description: 'List launch-kit assets, optionally filtered by type, channel, or status.',
  schema: z.object({
    asset_type: z.enum(ASSET_TYPES).optional(),
    channel: z.string().optional(),
    status: z.enum(STATUSES).optional(),
  }),
}, async ({ asset_type, channel, status }) => {
  const clauses: string[] = [];
  const params: Record<string, string> = {};
  if (asset_type) { clauses.push('asset_type = @asset_type'); params.asset_type = asset_type; }
  if (channel) { clauses.push('channel = @channel'); params.channel = channel; }
  if (status) { clauses.push('status = @status'); params.status = status; }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT id, title, asset_type, channel, status, updated_at FROM assets ${where} ORDER BY updated_at DESC`).all(params);
  return object({ count: rows.length, assets: rows });
});

// ---------- UPDATE ----------
server.tool({
  name: 'update_asset',
  description: 'Update fields on an existing launch-kit asset. Only provided fields are changed.',
  schema: z.object({
    id: z.string(),
    title: z.string().optional(),
    asset_type: z.enum(ASSET_TYPES).optional(),
    content: z.string().optional(),
    channel: z.string().optional(),
    status: z.enum(STATUSES).optional(),
    notes: z.string().optional(),
  }),
}, async ({ id, ...fields }) => {
  const existing = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | undefined;
  if (!existing) return error(`No asset found with id ${id}`);

  const merged = { ...existing, ...fields };
  db.prepare(`
    UPDATE assets
    SET title = ?, asset_type = ?, content = ?, channel = ?, status = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(merged.title, merged.asset_type, merged.content, merged.channel, merged.status, merged.notes, id);

  return object({ id, updated: Object.keys(fields) });
});

// ---------- DELETE ----------
server.tool({
  name: 'delete_asset',
  description: 'Permanently delete a launch-kit asset by id.',
  schema: z.object({
    id: z.string(),
  }),
  annotations: { destructiveHint: true },
}, async ({ id }) => {
  const result = db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  if (result.changes === 0) return error(`No asset found with id ${id}`);
  return text(`Deleted asset ${id}`);
});

// ---------- BACKUP / RESTORE ----------
server.tool({
  name: 'export_backup',
  description: 'Export all launch-kit assets as JSON for backup. Run this before redeploying the server.',
  schema: z.object({}),
}, async () => {
  const rows = db.prepare('SELECT * FROM assets').all();
  return mix(
    text(`Exported ${rows.length} asset(s).`),
    object({ exported_at: new Date().toISOString(), assets: rows })
  );
});

server.tool({
  name: 'import_backup',
  description: 'Restore launch-kit assets from a JSON backup previously produced by export_backup. Existing rows with matching ids are overwritten.',
  schema: z.object({
    assets: z.array(z.object({
      id: z.string(),
      title: z.string(),
      asset_type: z.string(),
      content: z.string().nullable().optional(),
      channel: z.string().nullable().optional(),
      status: z.string(),
      notes: z.string().nullable().optional(),
      created_at: z.string().optional(),
      updated_at: z.string().optional(),
    })),
  }),
}, async ({ assets }) => {
  const insert = db.prepare(`
    INSERT INTO assets (id, title, asset_type, content, channel, status, notes, created_at, updated_at)
    VALUES (@id, @title, @asset_type, @content, @channel, @status, @notes, COALESCE(@created_at, datetime('now')), COALESCE(@updated_at, datetime('now')))
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      asset_type = excluded.asset_type,
      content = excluded.content,
      channel = excluded.channel,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);
  const tx = db.transaction((items: typeof assets) => {
    for (const a of items) {
      insert.run({
        ...a,
        content: a.content ?? null,
        channel: a.channel ?? null,
        notes: a.notes ?? null,
        created_at: a.created_at ?? null,
        updated_at: a.updated_at ?? null,
      });
    }
  });
  tx(assets);
  return text(`Restored ${assets.length} asset(s).`);
});

const port = Number(process.env.PORT) || 3000;
await server.listen(port);
console.log(`sirrod-marketing-sales listening on :${port}`);
