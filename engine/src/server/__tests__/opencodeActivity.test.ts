import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('confirmed Hermes activity keeps long OpenCode turns running and yields to waiting, idle and errors', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'kliprun-opencode-activity-'));
  try {
    // Isolate the read-only DB singleton from every other test and the user's database.
    const script = `
      import { Database } from 'bun:sqlite';
      import { Engine } from ${JSON.stringify(import.meta.resolve('../classifier'))};
      const path = process.env.KLIPRUN_BUN_DB, directory = ${JSON.stringify(directory)}, now = Date.now(), old = now - 2 * 60 * 60_000;
      const db = new Database(path);
      db.exec('CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, title TEXT, time_created INTEGER, time_updated INTEGER); CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT); CREATE TABLE part (id TEXT PRIMARY KEY, session_id TEXT, message_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT)');
      db.query('INSERT INTO session VALUES (?,?,?,?,?,?,?)').run('ses_busy', 'project', null, directory, 'Long task', old, old);
      const assistant = {role:'assistant', agent:'build', time:{created:old+1}};
      db.query('INSERT INTO message VALUES (?,?,?,?,?)').run('user','ses_busy',old,old,JSON.stringify({role:'user',time:{created:old}}));
      db.query('INSERT INTO message VALUES (?,?,?,?,?)').run('assistant','ses_busy',old+1,old+1,JSON.stringify(assistant));
      db.query('INSERT INTO part VALUES (?,?,?,?,?,?)').run('tool','ses_busy','assistant',old+1,old+1,JSON.stringify({type:'tool',tool:'bash',state:{status:'running'}}));
      const engine = new Engine();
      const live = (busy = true, waiting = false, matched = true) => ({sessionIds:new Set(matched?['ses_busy']:[]),directories:new Set([directory]),waitingIds:new Set(waiting?['ses_busy']:[]),busyIds:new Set(busy?['ses_busy']:[]),fallbackDirectories:new Set(matched?[]:[directory]),sessionDirectories:new Map([['ses_busy',directory]])});
      const snapshot = (at = now) => { engine.rebuild(at); const card = Object.values(engine.board(at).columns).flatMap(c=>c.cards).find(c=>c.session_id==='ses_busy'); return {column:card.column,stage:card.stage,finished:card.finished_at}; };
      engine.setTuiLiveness(live()); const busy = snapshot();
      const changed = engine.setTuiLiveness(live(false)); const stale = snapshot(now+1000);
      engine.setTuiLiveness(live(true,false,false)); const unmatched = snapshot(now+2000);
      engine.setTuiLiveness(live(true,true)); const waiting = snapshot(now+3000);
      db.query('UPDATE message SET data=?,time_updated=? WHERE id=?').run(JSON.stringify({...assistant,time:{created:old+1,completed:old+300},finish:'tool-calls'}),old+300,'assistant');
      db.query('UPDATE part SET data=?,time_updated=?').run(JSON.stringify({type:'tool',tool:'bash',state:{status:'completed'}}),old+300);
      engine.setTuiLiveness(live()); const betweenSteps = snapshot(now+4000);
      db.query('UPDATE message SET data=?,time_updated=? WHERE id=?').run(JSON.stringify({...assistant,time:{created:old+1,completed:now},finish:'stop'}),now,'assistant');
      engine.setTuiLiveness(live(false)); const done = snapshot(now+5000);
      db.query('UPDATE message SET data=?,time_updated=? WHERE id=?').run(JSON.stringify({...assistant,error:{message:'Fixture failure'}}),now+6000,'assistant');
      engine.setTuiLiveness(live()); const failed = snapshot(now+11000);
      console.log(JSON.stringify({busy,changed,stale,unmatched,waiting,betweenSteps,done,failed})); db.close();
    `;
    const child = Bun.spawn([process.execPath, '-e', script], { env: { ...process.env, KLIPRUN_BUN_DB: join(directory, 'opencode.db') }, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
    const result = JSON.parse(stdout);
    expect(result.busy).toMatchObject({ column: 'running', stage: 'Tool: bash', finished: null });
    expect(result.changed).toBe(true);
    expect(result.stale).toMatchObject({ column: 'idle', stage: 'Interrupted' });
    expect(result.unmatched).toMatchObject({ column: 'idle', stage: 'Interrupted' });
    expect(result.waiting).toMatchObject({ column: 'attention', stage: 'Waiting for permission' });
    expect(result.betweenSteps).toMatchObject({ column: 'running', stage: 'Working', finished: null });
    expect(result.done).toMatchObject({ column: 'idle', stage: 'Finished' });
    expect(result.failed).toMatchObject({ column: 'idle', stage: 'Error' });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
