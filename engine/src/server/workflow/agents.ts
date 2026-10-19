import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentNode, StepResult, WorkflowAgent, WorkflowAgentSettings, WorkflowAttempt, WorkflowRun } from '@shared/workflow';
import { AgentProtocol } from './protocol';
export { AgentProtocol } from './protocol';
import { agentEnvironment, command } from './process';

export type AgentSettingsMap = Record<WorkflowAgent, WorkflowAgentSettings>;
export function parseAgentSettings(raw: unknown): AgentSettingsMap {
  const values = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const result = {} as AgentSettingsMap;
  for (const source of ['codex', 'opencode', 'claude'] as const) {
    const value = (values[source] ?? { cliPath: '', model: '', arguments: [] }) as WorkflowAgentSettings;
    if (!value || typeof value.cliPath !== 'string' || value.cliPath.length > 4096 || value.cliPath.includes('\0') || value.cliPath.startsWith('-') || typeof value.model !== 'string' || value.model.length > 256 || value.model.includes('\0') ||
      !Array.isArray(value.arguments) || value.arguments.length > 100 || !value.arguments.every(v => typeof v === 'string' && v.length < 4096 && !v.includes('\0'))) throw Error('Invalid desktop agent settings.');
    result[source] = structuredClone(value);
  }
  return result;
}
export function agentArguments(source: WorkflowAgent, model: string, settings: WorkflowAgentSettings): string[] {
  // Interactive/resume/output flags would break ownership or the completion protocol.
  const allowed: Record<WorkflowAgent, Set<string>> = { codex: new Set(['-c', '--config', '-p', '--profile']), opencode: new Set(['--variant', '--agent']), claude: new Set(['--effort', '--agent']) };
  for (let i = 0; i < settings.arguments.length; i += 2) {
    const flag = settings.arguments[i], value = settings.arguments[i + 1];
    if (!allowed[source].has(flag) || !value || value.startsWith('-') || (flag === '-c' || flag === '--config') && !/^model_(reasoning_effort|reasoning_summary|verbosity)=/.test(value)) throw Error(`Launch argument ${flag} is not supported in Workflow. Use agent settings compatible with structured execution.`);
  }
  const configured = settings.cliPath.trim().replace(/^~\//, `${homedir()}/`);
  const cli = configured || (source === 'codex' && Bun.which('codex-vk', { PATH: agentEnvironment().PATH }) ? 'codex-vk' : source);
  const chosen = model.trim() || settings.model.trim();
  const selection = chosen ? ['--model', chosen] : [];
  if (source === 'codex') return [cli, ...settings.arguments, 'exec', '--json', '--color', 'never', '--sandbox', 'workspace-write', '--skip-git-repo-check', ...selection, '-'];
  if (source === 'opencode') return [cli, 'run', '--format', 'json', ...settings.arguments, ...selection];
  return [cli, '--print', '--verbose', '--output-format', 'stream-json', '--permission-mode', 'acceptEdits', ...settings.arguments, ...selection];
}


export function attemptDirectory(stateDirectory: string, runId: string, attemptId: string) {
  if (![runId, attemptId].every(v => /^[a-zA-Z0-9_-]{1,100}$/.test(v))) throw Error('Invalid run or attempt ID.');
  return join(stateDirectory, 'workflow-runs', runId, attemptId);
}
export async function processStamp(pid: number): Promise<string | undefined> {
  if (!Number.isInteger(pid) || pid <= 0) return;
  try { return (await command(['/bin/ps', '-p', String(pid), '-o', 'lstart=', '-o', 'command='])).trim() || undefined; } catch { return; }
}
export async function ownedProcessAlive(attempt: WorkflowAttempt) {
  if (attempt.processMarker) {
    if (await Bun.file(join(attempt.processMarker, 'exit.json')).exists()) return false;
    // The marker is persisted before spawn, so even a crash before saving the PID is recoverable.
    const processes = await command(['/bin/ps', '-axo', 'command=']);
    return processes.split('\n').some(line => line.includes('workflow/agentHost.ts') && line.includes(attempt.processMarker!));
  }
  if (!attempt.pid || !attempt.processStamp) return false;
  return await processStamp(attempt.pid) === attempt.processStamp;
}
export async function recoverAgentResult(_run: WorkflowRun, node: AgentNode, attempt: WorkflowAttempt): Promise<StepResult | null> {
  if (!attempt.processMarker) return null;
  const file = Bun.file(join(attempt.processMarker, 'exit.json')); if (!await file.exists()) return null;
  const { code, finishedAt } = await file.json(); if (code !== 0) return null;
  if (typeof finishedAt === 'number' && Number.isFinite(finishedAt) && finishedAt >= attempt.startedAt) attempt.finishedAt = finishedAt;
  const saved = Bun.file(join(attempt.processMarker, 'response.json'));
  if (await saved.exists()) { try { return AgentProtocol.restore(node.agent, await saved.json()).result(code); } catch { return null; } }
  const protocol = new AgentProtocol(node.agent);
  for (const line of (await readFile(join(attempt.processMarker, 'events.jsonl'), 'utf8')).split('\n')) if (line.trim()) protocol.feed(JSON.parse(line));
  try { return protocol.result(code); } catch { return null; }
}
export function createAgentAdapter(stateDirectory: string) {
  return async (run: WorkflowRun, node: AgentNode, prompt: string, signal: AbortSignal, attempt: WorkflowAttempt, persist: () => void): Promise<StepResult> => {
    const directory = attemptDirectory(stateDirectory, run.id, attempt.id); await mkdir(directory, { recursive: true, mode: 0o700 });
    const args = agentArguments(node.agent, node.model, run.agentSettings?.[node.agent] ?? { cliPath: '', model: '', arguments: [] });
    signal.throwIfAborted();
    attempt.processMarker = directory; persist();
    const child = Bun.spawn([process.execPath, join(import.meta.dir, 'agentHost.ts'), directory], { env: agentEnvironment(), detached: true,
      stdin: new TextEncoder().encode(JSON.stringify({ args, agent: node.agent, prompt, cwd: run.workspace.directory })), stdout: 'pipe', stderr: 'pipe' });
    attempt.pid = child.pid; persist();
    let killed = false, killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (name: NodeJS.Signals) => { try { process.kill(-child.pid, name); } catch { if (child.exitCode === null) child.kill(name); } };
    const stop = () => { killed = true; kill('SIGTERM'); killTimer = setTimeout(() => kill('SIGKILL'), 1500); };
    signal.addEventListener('abort', stop, { once: true }); if (signal.aborted) stop();
    const decoder = new TextDecoder(); let pending = '';
    const event = async (line: string) => {
      if (!line.trim()) return;
      const value = JSON.parse(line) as { sessionId?: string; lastActivityAt?: number };
      if (value.sessionId) attempt.sessionId = value.sessionId;
      if (value.lastActivityAt) attempt.lastActivityAt = value.lastActivityAt;
      persist();
    };
    const stdout = async () => {
      for await (const chunk of child.stdout) {
        pending += decoder.decode(chunk, { stream: true });
        if (pending.length > 65536) throw Error('Invalid agent progress record.');
        let end: number;
        while ((end = pending.indexOf('\n')) >= 0) { const line = pending.slice(0, end); pending = pending.slice(end + 1); await event(line); }
      }
      pending += decoder.decode(); await event(pending);
    };
    const stderr = async () => { for await (const _chunk of child.stderr) { /* Host diagnostics are summarized in the exit record. */ } };
    try {
      const [, , code] = await Promise.all([stdout(), stderr(), child.exited]);
      if (killed) throw Error('Agent interrupted.');
      const exit = await Bun.file(join(directory, 'exit.json')).json();
      if (code || exit.code) throw Error(exit.error || `Agent exited with code ${exit.code ?? code}.`);
      return AgentProtocol.restore(node.agent, await Bun.file(join(directory, 'response.json')).json()).result(code);
    } catch (error) {
      stop(); await child.exited; throw error;
    } finally { signal.removeEventListener('abort', stop); if (killed) kill('SIGKILL'); if (killTimer) clearTimeout(killTimer); }
  };
}

export async function availableModels(settings: AgentSettingsMap): Promise<Record<WorkflowAgent, string[]>> {
  const models: Record<WorkflowAgent, Set<string>> = { codex: new Set(), opencode: new Set(), claude: new Set(['sonnet', 'opus', 'haiku']) };
  for (const source of ['codex', 'opencode', 'claude'] as const) if (settings[source].model) models[source].add(settings[source].model);
  try {
    const cache = JSON.parse(await readFile(join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'models_cache.json'), 'utf8'));
    for (const entry of cache.models ?? []) if (typeof entry.slug === 'string' && entry.visibility !== 'hidden') models.codex.add(entry.slug);
  } catch { /* Model IDs can still be entered manually, as in desktop settings. */ }
  try {
    const cli = settings.opencode.cliPath.trim().replace(/^~\//, `${homedir()}/`) || 'opencode';
    const output = await command([cli, 'models'], { timeout: 10_000 });
    for (const line of output.split('\n')) if (/^[\w.-]+\/[^\s]+$/.test(line.trim())) models.opencode.add(line.trim());
  } catch { /* Offline/missing agents do not prevent editing a workflow. */ }
  return { codex: [...models.codex], opencode: [...models.opencode], claude: [...models.claude] };
}
export async function readAttemptResponses(stateDirectory: string, runId: string, attemptId: string) {
  const path = join(attemptDirectory(stateDirectory, runId, attemptId), 'response.json');
  const file = Bun.file(path);
  if (!await file.exists()) return { messages: [], truncated: false };
  if (file.size > 2 * 1024 * 1024) throw Error('Saved response exceeds the supported size.');
  const value = await file.json();
  return { messages: Array.isArray(value.messages) ? value.messages : [], truncated: value.truncated === true };
}
