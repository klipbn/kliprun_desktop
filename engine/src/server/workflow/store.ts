import { Database } from 'bun:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { WorkflowDocument } from '@shared/workflow';
import type { WorkflowUI } from '@shared/workflowPresentation';

/** User-authored workflows and run artifacts, in KlipRun's own state directory. */
export class WorkflowStore {
  private db: Database;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000; CREATE TABLE IF NOT EXISTS workflows(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS workflow_ui(key TEXT PRIMARY KEY, data TEXT NOT NULL);');
  }
  list(): WorkflowDocument[] { return this.db.query<{ data: string }, []>('SELECT data FROM workflows ORDER BY rowid').all().map(r => JSON.parse(r.data)); }
  put(doc: WorkflowDocument) { this.db.query('INSERT INTO workflows(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(doc.definition.id, JSON.stringify(doc)); }
  delete(id: string) { this.db.query('DELETE FROM workflows WHERE id=?').run(id); }
  ui(): WorkflowUI { const row = this.db.query<{ data: string }, []>("SELECT data FROM workflow_ui WHERE key='selection'").get(); return row ? JSON.parse(row.data) : {}; }
  setUI(value: WorkflowUI) { this.db.query("INSERT INTO workflow_ui(key,data) VALUES('selection',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(JSON.stringify({ ...this.ui(), ...value })); }
  close() { this.db.close(); }
}
