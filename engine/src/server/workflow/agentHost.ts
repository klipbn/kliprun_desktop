/** Own one attempt process group; persist compact responses, never raw tool logs. */
import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WorkflowAgent } from '@shared/workflow';
import { AgentProtocol } from './protocol';

const directory = process.argv[2];
if (!directory) throw Error('Missing owned attempt directory.');
await writeFile(join(directory, 'owner.json'), JSON.stringify({ pid: process.pid, parent: process.ppid }), { mode: 0o600 });
const config = JSON.parse(await Bun.stdin.text()) as { args: string[]; agent: WorkflowAgent; prompt: string; cwd: string };
const child = Bun.spawn(config.args, { cwd: config.cwd, env: process.env, stdin: new TextEncoder().encode(config.prompt), stdout: 'pipe', stderr: 'pipe' });
const protocol = new AgentProtocol(config.agent);
let interrupted = false, stderr = '', savedAt = 0;
const stop = () => { interrupted = true; child.kill('SIGTERM'); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
const parent = process.ppid;
const watchdog = setInterval(() => { try { process.kill(parent, 0); } catch { process.kill(-process.pid, 'SIGKILL'); } }, 1000);
async function record(name: string, value: unknown) {
  const path = join(directory, name);
  await writeFile(path + '.tmp', JSON.stringify(value), { mode: 0o600 }); await rename(path + '.tmp', path);
}
async function checkpoint(force = false) {
  if (!force && Date.now() - savedAt < 500) return;
  savedAt = Date.now(); await record('response.json', protocol.snapshot());
  await Bun.write(Bun.stdout, JSON.stringify({ sessionId: protocol.sessionId, lastActivityAt: protocol.updatedAt }) + '\n');
}
async function readEvents() {
  const decoder = new TextDecoder(); let pending = '';
  const consume = async (line: string) => { if (line.trim()) { protocol.feed(JSON.parse(line)); await checkpoint(); } };
  for await (const chunk of child.stdout) {
    pending += decoder.decode(chunk, { stream: true });
    if (pending.length > 2 * 1024 * 1024) throw Error('Agent event exceeds 2 MiB. Write large output to files.');
    let end: number;
    while ((end = pending.indexOf('\n')) >= 0) { const line = pending.slice(0, end); pending = pending.slice(end + 1); await consume(line); }
  }
  await consume(pending + decoder.decode());
}
async function readErrors() { const decoder = new TextDecoder(); for await (const chunk of child.stderr) stderr = (stderr + decoder.decode(chunk, { stream: true })).slice(-4000); }
try {
  const [, , code] = await Promise.all([readEvents(), readErrors(), child.exited]);
  await checkpoint(true);
  await record('exit.json', { code: interrupted ? 130 : code, finishedAt:Date.now(), ...(code ? { error: stderr } : {}) });
  process.exitCode = interrupted ? 130 : code;
} catch (error) {
  stop();
  await record('exit.json', { code: 1, finishedAt:Date.now(), error: error instanceof Error ? error.message : 'Agent protocol failed.' });
  process.kill(-process.pid, 'SIGKILL');
} finally { clearInterval(watchdog); }
