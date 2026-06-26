import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// Persisted to local disk. If Manufact's container storage is ephemeral across
// redeploys, use the export_backup / import_backup tools before/after redeploying
// to avoid losing data.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'production_design.sqlite3');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    manuscript TEXT,
    illustration_brief TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface ProjectRow {
  id: string;
  title: string;
  status: string;
  manuscript: string | null;
  illustration_brief: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
