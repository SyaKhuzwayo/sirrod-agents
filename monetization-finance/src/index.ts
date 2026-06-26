import { MCPServer, text, object, error, mix } from 'mcp-use/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, PricingRow, RevenueRow } from './db.js';

const server = new MCPServer({
  name: 'sirrod-monetization-finance',
  version: '1.0.0',
});

const FORMATS = ['ebook', 'paperback', 'hardcover', 'audiobook', 'bundle', 'other'] as const;

// ===================== PRICING =====================

server.tool({
  name: 'create_pricing',
  description: 'Set a price point for a title in a given format.',
  schema: z.object({
    title: z.string().describe('Book title'),
    format: z.enum(FORMATS),
    currency: z.string().default('USD'),
    price: z.number().positive().describe('Retail price'),
    royalty_rate: z.number().min(0).max(1).optional().describe('Royalty rate as a fraction, e.g. 0.7 for 70%'),
    notes: z.string().optional(),
  }),
}, async ({ title, format, currency, price, royalty_rate, notes }) => {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO pricing (id, title, format, currency, price, royalty_rate, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, format, currency, price, royalty_rate ?? null, notes ?? null);
  return object({ id, title, format, price, currency });
});

server.tool({
  name: 'get_pricing',
  description: 'Retrieve a single pricing record by id.',
  schema: z.object({ id: z.string() }),
}, async ({ id }) => {
  const row = db.prepare('SELECT * FROM pricing WHERE id = ?').get(id) as PricingRow | undefined;
  if (!row) return error(`No pricing record found with id ${id}`);
  return object(row);
});

server.tool({
  name: 'list_pricing',
  description: 'List pricing records, optionally filtered by title or format.',
  schema: z.object({
    title: z.string().optional(),
    format: z.enum(FORMATS).optional(),
  }),
}, async ({ title, format }) => {
  const clauses: string[] = [];
  const params: Record<string, string> = {};
  if (title) { clauses.push('title = @title'); params.title = title; }
  if (format) { clauses.push('format = @format'); params.format = format; }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM pricing ${where} ORDER BY updated_at DESC`).all(params);
  return object({ count: rows.length, pricing: rows });
});

server.tool({
  name: 'update_pricing',
  description: 'Update fields on an existing pricing record. Only provided fields are changed.',
  schema: z.object({
    id: z.string(),
    title: z.string().optional(),
    format: z.enum(FORMATS).optional(),
    currency: z.string().optional(),
    price: z.number().positive().optional(),
    royalty_rate: z.number().min(0).max(1).optional(),
    notes: z.string().optional(),
  }),
}, async ({ id, ...fields }) => {
  const existing = db.prepare('SELECT * FROM pricing WHERE id = ?').get(id) as PricingRow | undefined;
  if (!existing) return error(`No pricing record found with id ${id}`);
  const merged = { ...existing, ...fields };
  db.prepare(`
    UPDATE pricing
    SET title = ?, format = ?, currency = ?, price = ?, royalty_rate = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(merged.title, merged.format, merged.currency, merged.price, merged.royalty_rate, merged.notes, id);
  return object({ id, updated: Object.keys(fields) });
});

server.tool({
  name: 'delete_pricing',
  description: 'Permanently delete a pricing record by id.',
  schema: z.object({ id: z.string() }),
  annotations: { destructiveHint: true },
}, async ({ id }) => {
  const result = db.prepare('DELETE FROM pricing WHERE id = ?').run(id);
  if (result.changes === 0) return error(`No pricing record found with id ${id}`);
  return text(`Deleted pricing record ${id}`);
});

// ===================== REVENUE =====================

server.tool({
  name: 'log_revenue',
  description: 'Log a revenue entry for a title (e.g. a sales period summary or a batch of sales from a channel).',
  schema: z.object({
    title: z.string(),
    format: z.enum(FORMATS).optional(),
    channel: z.string().optional().describe('e.g. "Amazon KDP", "Direct site", "Audible"'),
    units: z.number().int().nonnegative().default(0),
    gross_revenue: z.number().nonnegative().default(0),
    period_start: z.string().optional().describe('ISO date'),
    period_end: z.string().optional().describe('ISO date'),
    notes: z.string().optional(),
  }),
}, async ({ title, format, channel, units, gross_revenue, period_start, period_end, notes }) => {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO revenue_entries (id, title, format, channel, units, gross_revenue, period_start, period_end, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, format ?? null, channel ?? null, units, gross_revenue, period_start ?? null, period_end ?? null, notes ?? null);
  return object({ id, title, units, gross_revenue });
});

server.tool({
  name: 'get_revenue_entry',
  description: 'Retrieve a single revenue entry by id.',
  schema: z.object({ id: z.string() }),
}, async ({ id }) => {
  const row = db.prepare('SELECT * FROM revenue_entries WHERE id = ?').get(id) as RevenueRow | undefined;
  if (!row) return error(`No revenue entry found with id ${id}`);
  return object(row);
});

server.tool({
  name: 'list_revenue',
  description: 'List revenue entries, optionally filtered by title or channel. Also returns aggregate totals for the matched rows.',
  schema: z.object({
    title: z.string().optional(),
    channel: z.string().optional(),
  }),
}, async ({ title, channel }) => {
  const clauses: string[] = [];
  const params: Record<string, string> = {};
  if (title) { clauses.push('title = @title'); params.title = title; }
  if (channel) { clauses.push('channel = @channel'); params.channel = channel; }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM revenue_entries ${where} ORDER BY period_start DESC, created_at DESC`).all(params) as RevenueRow[];
  const totals = rows.reduce((acc, r) => ({
    units: acc.units + r.units,
    gross_revenue: acc.gross_revenue + r.gross_revenue,
  }), { units: 0, gross_revenue: 0 });
  return object({ count: rows.length, totals, entries: rows });
});

server.tool({
  name: 'update_revenue_entry',
  description: 'Update fields on an existing revenue entry. Only provided fields are changed.',
  schema: z.object({
    id: z.string(),
    title: z.string().optional(),
    format: z.enum(FORMATS).optional(),
    channel: z.string().optional(),
    units: z.number().int().nonnegative().optional(),
    gross_revenue: z.number().nonnegative().optional(),
    period_start: z.string().optional(),
    period_end: z.string().optional(),
    notes: z.string().optional(),
  }),
}, async ({ id, ...fields }) => {
  const existing = db.prepare('SELECT * FROM revenue_entries WHERE id = ?').get(id) as RevenueRow | undefined;
  if (!existing) return error(`No revenue entry found with id ${id}`);
  const merged = { ...existing, ...fields };
  db.prepare(`
    UPDATE revenue_entries
    SET title = ?, format = ?, channel = ?, units = ?, gross_revenue = ?, period_start = ?, period_end = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(merged.title, merged.format, merged.channel, merged.units, merged.gross_revenue, merged.period_start, merged.period_end, merged.notes, id);
  return object({ id, updated: Object.keys(fields) });
});

server.tool({
  name: 'delete_revenue_entry',
  description: 'Permanently delete a revenue entry by id.',
  schema: z.object({ id: z.string() }),
  annotations: { destructiveHint: true },
}, async ({ id }) => {
  const result = db.prepare('DELETE FROM revenue_entries WHERE id = ?').run(id);
  if (result.changes === 0) return error(`No revenue entry found with id ${id}`);
  return text(`Deleted revenue entry ${id}`);
});

// ===================== BACKUP / RESTORE =====================

server.tool({
  name: 'export_backup',
  description: 'Export all pricing and revenue data as JSON for backup. Run this before redeploying the server.',
  schema: z.object({}),
}, async () => {
  const pricing = db.prepare('SELECT * FROM pricing').all();
  const revenue_entries = db.prepare('SELECT * FROM revenue_entries').all();
  return mix(
    text(`Exported ${pricing.length} pricing record(s) and ${revenue_entries.length} revenue entry(ies).`),
    object({ exported_at: new Date().toISOString(), pricing, revenue_entries })
  );
});

server.tool({
  name: 'import_backup',
  description: 'Restore pricing and revenue data from a JSON backup previously produced by export_backup. Existing rows with matching ids are overwritten.',
  schema: z.object({
    pricing: z.array(z.object({
      id: z.string(), title: z.string(), format: z.string(), currency: z.string(),
      price: z.number(), royalty_rate: z.number().nullable().optional(), notes: z.string().nullable().optional(),
      created_at: z.string().optional(), updated_at: z.string().optional(),
    })).default([]),
    revenue_entries: z.array(z.object({
      id: z.string(), title: z.string(), format: z.string().nullable().optional(), channel: z.string().nullable().optional(),
      units: z.number(), gross_revenue: z.number(), period_start: z.string().nullable().optional(), period_end: z.string().nullable().optional(),
      notes: z.string().nullable().optional(), created_at: z.string().optional(), updated_at: z.string().optional(),
    })).default([]),
  }),
}, async ({ pricing, revenue_entries }) => {
  const insertPricing = db.prepare(`
    INSERT INTO pricing (id, title, format, currency, price, royalty_rate, notes, created_at, updated_at)
    VALUES (@id, @title, @format, @currency, @price, @royalty_rate, @notes, COALESCE(@created_at, datetime('now')), COALESCE(@updated_at, datetime('now')))
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, format=excluded.format, currency=excluded.currency, price=excluded.price,
      royalty_rate=excluded.royalty_rate, notes=excluded.notes, updated_at=excluded.updated_at
  `);
  const insertRevenue = db.prepare(`
    INSERT INTO revenue_entries (id, title, format, channel, units, gross_revenue, period_start, period_end, notes, created_at, updated_at)
    VALUES (@id, @title, @format, @channel, @units, @gross_revenue, @period_start, @period_end, @notes, COALESCE(@created_at, datetime('now')), COALESCE(@updated_at, datetime('now')))
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, format=excluded.format, channel=excluded.channel, units=excluded.units,
      gross_revenue=excluded.gross_revenue, period_start=excluded.period_start, period_end=excluded.period_end,
      notes=excluded.notes, updated_at=excluded.updated_at
  `);
  const tx = db.transaction((p: typeof pricing, r: typeof revenue_entries) => {
    for (const row of p) insertPricing.run({ ...row, royalty_rate: row.royalty_rate ?? null, notes: row.notes ?? null, created_at: row.created_at ?? null, updated_at: row.updated_at ?? null });
    for (const row of r) insertRevenue.run({ ...row, format: row.format ?? null, channel: row.channel ?? null, period_start: row.period_start ?? null, period_end: row.period_end ?? null, notes: row.notes ?? null, created_at: row.created_at ?? null, updated_at: row.updated_at ?? null });
  });
  tx(pricing, revenue_entries);
  return text(`Restored ${pricing.length} pricing record(s) and ${revenue_entries.length} revenue entry(ies).`);
});

const port = Number(process.env.PORT) || 3000;
await server.listen(port);
console.log(`sirrod-monetization-finance listening on :${port}`);
