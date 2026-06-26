import { MCPServer, text, object, error, mix } from 'mcp-use/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, ProjectRow } from './db.js';

const server = new MCPServer({
  name: 'sirrod-production-design',
  version: '1.0.0',
});

const STATUSES = ['draft', 'manuscript_complete', 'in_illustration', 'illustrated', 'in_review', 'ready_for_launch'] as const;

// ---------- CREATE ----------
server.tool({
  name: 'create_project',
  description: 'Create a new book project with a title, optional manuscript text, illustration brief, and notes.',
  schema: z.object({
    title: z.string().describe('Book title, e.g. "Pip and the Goodnight Lanterns"'),
    status: z.enum(STATUSES).default('draft').describe('Initial production status'),
    manuscript: z.string().optional().describe('Full or partial manuscript text'),
    illustration_brief: z.string().optional().describe('Illustration brief / art direction notes'),
    notes: z.string().optional().describe('Free-form production notes'),
  }),
}, async ({ title, status, manuscript, illustration_brief, notes }) => {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO projects (id, title, status, manuscript, illustration_brief, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, title, status, manuscript ?? null, illustration_brief ?? null, notes ?? null);

  return object({ id, title, status });
});

// ---------- READ (one) ----------
server.tool({
  name: 'get_project',
  description: 'Retrieve a single book project by its id.',
  schema: z.object({
    id: z.string().describe('Project id'),
  }),
}, async ({ id }) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  if (!row) return error(`No project found with id ${id}`);
  return object(row);
});

// ---------- READ (list) ----------
server.tool({
  name: 'list_projects',
  description: 'List all book projects, optionally filtered by status.',
  schema: z.object({
    status: z.enum(STATUSES).optional().describe('Filter by production status'),
  }),
}, async ({ status }) => {
  const rows = status
    ? db.prepare('SELECT id, title, status, updated_at FROM projects WHERE status = ? ORDER BY updated_at DESC').all(status)
    : db.prepare('SELECT id, title, status, updated_at FROM projects ORDER BY updated_at DESC').all();
  return object({ count: rows.length, projects: rows });
});

// ---------- UPDATE ----------
server.tool({
  name: 'update_project',
  description: 'Update fields on an existing book project. Only provided fields are changed.',
  schema: z.object({
    id: z.string().describe('Project id'),
    title: z.string().optional(),
    status: z.enum(STATUSES).optional(),
    manuscript: z.string().optional(),
    illustration_brief: z.string().optional(),
    notes: z.string().optional(),
  }),
}, async ({ id, ...fields }) => {
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  if (!existing) return error(`No project found with id ${id}`);

  const merged = { ...existing, ...fields };
  db.prepare(`
    UPDATE projects
    SET title = ?, status = ?, manuscript = ?, illustration_brief = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(merged.title, merged.status, merged.manuscript, merged.illustration_brief, merged.notes, id);

  return object({ id, updated: Object.keys(fields) });
});

// ---------- DELETE ----------
server.tool({
  name: 'delete_project',
  description: 'Permanently delete a book project by id.',
  schema: z.object({
    id: z.string().describe('Project id'),
  }),
  annotations: { destructiveHint: true },
}, async ({ id }) => {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  if (result.changes === 0) return error(`No project found with id ${id}`);
  return text(`Deleted project ${id}`);
});

// ---------- BACKUP / RESTORE ----------
// Storage durability across redeploys on Manufact is not confirmed, so these
// let you snapshot and restore data manually around any redeploy.
server.tool({
  name: 'export_backup',
  description: 'Export all projects as JSON for backup purposes. Run this before redeploying the server.',
  schema: z.object({}),
}, async () => {
  const rows = db.prepare('SELECT * FROM projects').all();
  return mix(
    text(`Exported ${rows.length} project(s).`),
    object({ exported_at: new Date().toISOString(), projects: rows })
  );
});

server.tool({
  name: 'import_backup',
  description: 'Restore projects from a JSON backup previously produced by export_backup. Existing rows with matching ids are overwritten.',
  schema: z.object({
    projects: z.array(z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      manuscript: z.string().nullable().optional(),
      illustration_brief: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      created_at: z.string().optional(),
      updated_at: z.string().optional(),
    })).describe('Array of project rows from a previous export_backup call'),
  }),
}, async ({ projects }) => {
  const insert = db.prepare(`
    INSERT INTO projects (id, title, status, manuscript, illustration_brief, notes, created_at, updated_at)
    VALUES (@id, @title, @status, @manuscript, @illustration_brief, @notes, COALESCE(@created_at, datetime('now')), COALESCE(@updated_at, datetime('now')))
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      status = excluded.status,
      manuscript = excluded.manuscript,
      illustration_brief = excluded.illustration_brief,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);
  const tx = db.transaction((items: typeof projects) => {
    for (const p of items) {
      insert.run({
        ...p,
        manuscript: p.manuscript ?? null,
        illustration_brief: p.illustration_brief ?? null,
        notes: p.notes ?? null,
        created_at: p.created_at ?? null,
        updated_at: p.updated_at ?? null,
      });
    }
  });
  tx(projects);
  return text(`Restored ${projects.length} project(s).`);
});

const port = Number(process.env.PORT) || 3000;
await server.listen(port);
console.log(`sirrod-production-design listening on :${port}`);
