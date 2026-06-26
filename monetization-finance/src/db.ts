import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'monetization_finance.sqlite3');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS pricing (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    format TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    price REAL NOT NULL,
    royalty_rate REAL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS revenue_entries (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    format TEXT,
    channel TEXT,
    units INTEGER NOT NULL DEFAULT 0,
    gross_revenue REAL NOT NULL DEFAULT 0,
    period_start TEXT,
    period_end TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface PricingRow {
  [key: string]: unknown;
  id: string;
  title: string;
  format: string;
  currency: string;
  price: number;
  royalty_rate: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RevenueRow {
  [key: string]: unknown;
  id: string;
  title: string;
  format: string | null;
  channel: string | null;
  units: number;
  gross_revenue: number;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
