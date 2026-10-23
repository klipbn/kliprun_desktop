import { expect, test } from 'bun:test';
import { AgentProtocol, agentArguments, visibleArguments, parseAgentSettings, createAgentAdapter, ownedProcessAlive, recoverAgentResult } from '../workflow/agents';
import { VisibleAgents } from '../workflow/visible';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newAgentNode, workflowTemplate, type WorkflowAttempt, type WorkflowRun } from '../../shared/workflow';

test('Codex completion requires turn.completed and a final message', () => {
  const protocol = new AgentProtocol('codex');
  protocol.feed({ type: 'thread.started', thread_id: 'test-thread' });
  protocol.feed({ type: 'item.completed', item: { type: 'agent_message', text: 'Done' } });
  expect(() => protocol.result(0)).toThrow(/completion/i);
  protocol.feed({ type: 'turn.completed', usage: {} });
  expect(protocol.result(0)).toMatchObject({ text: 'Done', sessionId: 'codex:test-thread' });
  expect(() => protocol.result(1)).toThrow();
});
test('OpenCode distinguishes a tool step from final stop and rejects permissions/errors', () => {
  const protocol = new AgentProtocol('opencode');
  protocol.feed({ type: 'text', sessionID: 'ses_example', part: { text: 'Result' } });
  protocol.feed({ type: 'step_finish', part: { reason: 'tool-calls' } });
  expect(() => protocol.result(0)).toThrow();
  protocol.feed({ type: 'step_finish', part: { reason: 'stop' } });
  expect(protocol.result(0).text).toBe('Result');
  protocol.feed({ type: 'error', error: { message: 'Permission required' } });
  expect(() => protocol.result(0)).toThrow(/Permission/);
});
test('Claude uses the result event and rejects tool permission denials', () => {
  const protocol = new AgentProtocol('claude');
  protocol.feed({ type: 'result', subtype: 'success', is_error: false, result: 'Done', session_id: 'example', permission_denials: [] });
  expect(protocol.result(0).text).toBe('Done');
  protocol.feed({ type: 'result', subtype: 'success', result: 'Could not edit', permission_denials: [{ tool_name: 'Edit' }] });
  expect(() => protocol.result(0)).toThrow(/permission/i);
});
test('structured arguments keep tasks out of the shell and forbid conflicting CLI settings', () => {
  const settings = parseAgentSettings({ codex: { cliPath: '/tmp/codex custom', model: 'custom-model', arguments: ['-c', 'model_reasoning_effort="high"'] } });
  const args = agentArguments('codex', 'selected-model', settings.codex);
  expect(args).toContain('/tmp/codex custom'); expect(args).toContain('selected-model'); expect(args).toContain('--json');
  for (const flag of ['--resume', '--output-last-message', '--worktree', '--model', '--output-format', '--dangerously-bypass-approvals-and-sandbox']) {
    expect(() => agentArguments('codex', '', { cliPath: 'codex', model: '', arguments: [flag] })).toThrow();
  }
});

test('owned agent host persists its exit evidence and passes stdin literally', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'kliprun-agent-host-'));
  try {
    const fake = join(folder, 'fake-cli');
    await writeFile(fake, '#!/bin/sh\ncat > prompt.txt\nprintf \'%s\\n\' \'{"type":"thread.started","thread_id":"example"}\' \'{"type":"item.completed","item":{"type":"agent_message","text":"Completed text"}}\' \'{"type":"turn.completed"}\'\n', { mode: 0o700 });
    const flow = workflowTemplate('Demo', folder, false), node = newAgentNode('agent');
    const attempt: WorkflowAttempt = { id: 'attempt', nodeId: 'agent', number: 1, status: 'running', startedAt: Date.now(), input: '' };
    const run = { id: 'run', snapshot: flow, workspace: { directory: folder }, agentSettings: { codex: { cliPath: fake, model: '', arguments: [] } } } as unknown as WorkflowRun;
    const result = await createAgentAdapter(folder)(run, node, 'Literal $(no-command) prompt', new AbortController().signal, attempt, () => {});
    expect(result.text).toBe('Completed text');
    expect(await readFile(join(folder, 'prompt.txt'), 'utf8')).toBe('Literal $(no-command) prompt');
    expect(JSON.parse(await readFile(join(folder, 'workflow-runs/run/attempt/exit.json'), 'utf8')).code).toBe(0);
    expect(await readdir(join(folder, 'workflow-runs/run/attempt'))).not.toContain('events.jsonl');
    expect(await readdir(join(folder, 'workflow-runs/run/attempt'))).not.toContain('terminal.log');
    const response = JSON.parse(await readFile(join(folder, 'workflow-runs/run/attempt/response.json'), 'utf8'));
    expect(response.messages).toEqual(['Completed text']);
    expect((await recoverAgentResult(run, node, attempt))?.text).toBe('Completed text');
    expect(await ownedProcessAlive(attempt)).toBe(false);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('readable responses contain prose only, deduplicate final answers and bound history', () => {
  const protocol = new AgentProtocol('claude');
  protocol.feed({type:'assistant',message:{content:[{type:'thinking',thinking:'private reasoning'},{type:'tool_use',name:'Bash',input:{command:'large output'}},{type:'text',text:'## Result\nA readable answer.'}]}});
  protocol.feed({type:'result',subtype:'success',result:'## Result\nA readable answer.'});
  expect(protocol.snapshot().messages).toEqual(['## Result\nA readable answer.']);
  for(let i=0;i<200;i++) protocol.feed({type:'assistant',message:{content:[{type:'text',text:`${i} `+'a'.repeat(2000)}]}});
  expect(protocol.snapshot().messages.join('').length).toBeLessThanOrEqual(65536);
  expect(protocol.snapshot().truncated).toBe(true);
});

async function visibleFixture(agent: 'claude' | 'codex', claimTimeout = 5000) {
  const folder = await mkdtemp(join(tmpdir(), 'kliprun-visible-'));
  const flow = workflowTemplate('Demo', folder, false), node = { ...newAgentNode('agent'), agent };
  const attempt: WorkflowAttempt = { id: 'attempt', nodeId: 'agent', number: 1, status: 'running', startedAt: Date.now(), input: '' };
  const run = { id: 'run', workflowId: 'flow', snapshot: flow, workspace: { directory: folder }, agentSettings: {} } as unknown as WorkflowRun;
  const visible = new VisibleAgents(claimTimeout);
  const controller = new AbortController();
  const promise = createAgentAdapter(folder, visible)(run, node, '# Workflow: Demo\nDo the task', controller.signal, attempt, () => {});
  return { folder, attempt, visible, promise, controller, directory: join(folder, 'workflow-runs/run/attempt') };
}
async function nextLaunch(visible: VisibleAgents) {
  for (let i = 0; i < 100; i++) { const [launch] = visible.list(); if (launch) return launch; await Bun.sleep(20); }
  throw Error('No launch request.');
}

test('a visible Claude card is finished by the Stop hook, not by terminal silence', async () => {
  const { folder, attempt, visible, promise, directory } = await visibleFixture('claude');
  const terminal = Bun.spawn(['sleep', '30']);
  try {
    const launch = await nextLaunch(visible);
    expect(launch).toMatchObject({ source: 'claude', directory: folder, workflowName: 'Demo' });
    expect(launch.argv).toContain('--session-id'); expect(launch.argv).toContain('--settings');
    expect(await readFile(launch.promptFile, 'utf8')).toContain('Do the task');
    expect(await readFile(launch.promptFile, 'utf8')).toContain('NEEDS_INPUT:');
    expect(visible.claim(launch.attemptId, terminal.pid)).toBe(true);
    await Bun.sleep(700);
    expect((await readdir(directory)).some(n => n.startsWith('done-'))).toBe(false);
    const hook = Bun.spawn([join(directory, 'done.sh')], { stdin: new TextEncoder().encode(JSON.stringify({ hook_event_name: 'Stop', last_assistant_message: 'All done' })) });
    await hook.exited;
    const result = await promise;
    expect(result.text).toBe('All done');
    expect(result.sessionId).toMatch(/^claude:[0-9a-f-]{36}$/);
    expect(attempt).toMatchObject({ visible: true, pid: terminal.pid });
    expect(JSON.parse(await readFile(join(directory, 'response.json'), 'utf8')).messages).toEqual(['All done']);
    expect(JSON.parse(await readFile(join(directory, 'exit.json'), 'utf8')).code).toBe(0);
    // The tab stays open for review but no longer owns the working folder.
    expect(await ownedProcessAlive(attempt)).toBe(false);
    expect(await recoverAgentResult({} as WorkflowRun, newAgentNode('agent'), attempt)).toMatchObject({ text: 'All done' });
  } finally { terminal.kill(); await rm(folder, { recursive: true, force: true }); }
});

test('a visible Codex card reads the notify payload passed as an argument', async () => {
  const { folder, visible, promise, directory } = await visibleFixture('codex');
  const terminal = Bun.spawn(['sleep', '30']);
  try {
    const launch = await nextLaunch(visible);
    expect(launch.argv.join(' ')).toContain('notify=[');
    visible.claim(launch.attemptId, terminal.pid);
    const notify = (payload: object) => Bun.spawn([join(directory, 'done.sh'), JSON.stringify({ type: 'agent-turn-complete', ...payload })]).exited;
    // A helper turn (thread title) fires first and must not complete the card.
    await notify({ 'thread-id': 'title-thread', 'input-messages': ['Generate a short title'], 'last-assistant-message': '{"title":"Plan"}' });
    await Bun.sleep(700);
    await notify({ 'thread-id': 'thread-1', 'input-messages': [`Read the full Workflow task from ${launch.promptFile}. Follow all its instructions and complete the task.`], 'last-assistant-message': 'Codex answer' });
    expect(await promise).toMatchObject({ text: 'Codex answer', sessionId: 'codex:thread-1' });
  } finally { terminal.kill(); await rm(folder, { recursive: true, force: true }); }
});

test('closing a visible terminal before the hook fires fails the card instead of completing it', async () => {
  const { folder, visible, promise, directory } = await visibleFixture('claude');
  const terminal = Bun.spawn(['sleep', '30']);
  try {
    const launch = await nextLaunch(visible);
    visible.claim(launch.attemptId, terminal.pid);
    terminal.kill(); await terminal.exited;
    await expect(promise).rejects.toThrow(/terminal was closed/);
    expect(JSON.parse(await readFile(join(directory, 'exit.json'), 'utf8')).code).toBe(1);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('pausing a visible agent stops its tool processes even when they ignore SIGTERM', async () => {
  const { folder, visible, promise, controller } = await visibleFixture('claude');
  const childFile = join(folder, 'tool.pid');
  const terminal = Bun.spawn(['/bin/sh', '-c', 'trap "" TERM; /bin/sh -c \'trap "" TERM; while :; do sleep 1; done\' & echo $! > "$1"; wait', 'agent', childFile], { detached: true });
  try {
    const launch = await nextLaunch(visible);
    visible.claim(launch.attemptId, terminal.pid);
    for (let i = 0; i < 100 && !await Bun.file(childFile).exists(); i++) await Bun.sleep(20);
    const childPid = Number(await readFile(childFile, 'utf8'));
    controller.abort();
    await expect(promise).rejects.toThrow(/interrupted/i);
    await terminal.exited;
    await Bun.sleep(100);
    expect(() => process.kill(childPid, 0)).toThrow();
  } finally {
    try { process.kill(-terminal.pid, 'SIGKILL'); } catch { /* test group already stopped */ }
    await terminal.exited;
    await rm(folder, { recursive: true, force: true });
  }
});

test('cancellation during a terminal claim does not leave an untracked agent running', async () => {
  const { folder, visible, promise, controller } = await visibleFixture('claude');
  const terminal = Bun.spawn(['sleep', '30'], { detached: true });
  try {
    const launch = await nextLaunch(visible);
    visible.claim(launch.attemptId, terminal.pid);
    controller.abort();
    await expect(promise).rejects.toThrow(/interrupted/i);
    await Bun.sleep(100);
    expect(() => process.kill(terminal.pid, 0)).toThrow();
  } finally {
    terminal.kill(); await terminal.exited;
    await rm(folder, { recursive: true, force: true });
  }
});

for (const source of ['claude', 'codex'] as const) test(`a ${source} completion hook remains recoverable after the engine exits`, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'kliprun-visible-recovery-'));
  const terminal = Bun.spawn(['sleep', '30'], { detached: true });
  const node = { ...newAgentNode('agent'), agent: source };
  const run = { id: 'run', workflowId: 'flow', snapshot: workflowTemplate('Demo', folder, false), workspace: { directory: folder }, agentSettings: {} } as unknown as WorkflowRun;
  const attemptFile = join(folder, 'attempt.json'), workerFile = join(folder, 'engine.ts');
  await writeFile(workerFile, `
    import { writeFileSync } from 'node:fs';
    import { createAgentAdapter } from ${JSON.stringify(import.meta.resolve('../workflow/agents'))};
    import { VisibleAgents } from ${JSON.stringify(import.meta.resolve('../workflow/visible'))};
    const visible = new VisibleAgents();
    const attempt = { id: 'attempt', nodeId: 'agent', number: 1, status: 'running', startedAt: Date.now(), input: '' };
    const job = createAgentAdapter(${JSON.stringify(folder)}, visible)(${JSON.stringify(run)}, ${JSON.stringify(node)}, '# Workflow: Demo\\nDo the task', new AbortController().signal, attempt, () => {
      if (attempt.processStamp) writeFileSync(${JSON.stringify(attemptFile)}, JSON.stringify(attempt));
    });
    while (!visible.list().length) await Bun.sleep(10);
    visible.claim('attempt', ${terminal.pid});
    await job;
  `);
  const engine = Bun.spawn([process.execPath, workerFile], { stderr: 'inherit' });
  try {
    for (let i = 0; i < 100 && !await Bun.file(attemptFile).exists(); i++) await Bun.sleep(20);
    const attempt = JSON.parse(await readFile(attemptFile, 'utf8')) as WorkflowAttempt;
    engine.kill('SIGKILL'); await engine.exited;
    const directory = join(folder, 'workflow-runs/run/attempt');
    const payload = source === 'claude'
      ? { hook_event_name: 'Stop', session_id: attempt.sessionId?.slice(7), last_assistant_message: 'Recovered answer' }
      : { type: 'agent-turn-complete', 'thread-id': 'recovered-thread', 'input-messages': [`Read the full Workflow task from ${join(directory, 'prompt.md')}. Follow all its instructions and complete the task.`], 'last-assistant-message': 'Recovered answer' };
    const hook = Bun.spawn([join(directory, 'done.sh'), ...(source === 'codex' ? [JSON.stringify(payload)] : [])], { stdin: source === 'claude' ? new TextEncoder().encode(JSON.stringify(payload)) : 'ignore' });
    expect(await hook.exited).toBe(0);
    expect(await ownedProcessAlive(attempt)).toBe(false);
    expect(await recoverAgentResult(run, node, attempt)).toMatchObject({ text: 'Recovered answer' });
    expect(await readFile(join(directory, 'response.json'), 'utf8')).toContain('Recovered answer');
  } finally {
    engine.kill(); await engine.exited;
    terminal.kill(); await terminal.exited;
    await rm(folder, { recursive: true, force: true });
  }
});

test('an unclaimed visible request falls back to the headless structured run', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'kliprun-visible-'));
  try {
    const fake = join(folder, 'fake-cli');
    await writeFile(fake, '#!/bin/sh\ncat > /dev/null\nprintf \'%s\\n\' \'{"type":"thread.started","thread_id":"t"}\' \'{"type":"item.completed","item":{"type":"agent_message","text":"Headless"}}\' \'{"type":"turn.completed"}\'\n', { mode: 0o700 });
    const node = { ...newAgentNode('agent'), agent: 'codex' as const };
    const attempt: WorkflowAttempt = { id: 'attempt', nodeId: 'agent', number: 1, status: 'running', startedAt: Date.now(), input: '' };
    const run = { id: 'run', workflowId: 'flow', snapshot: workflowTemplate('Demo', folder, false), workspace: { directory: folder }, agentSettings: { codex: { cliPath: fake, model: '', arguments: [] } } } as unknown as WorkflowRun;
    const visible = new VisibleAgents(60);
    const result = await createAgentAdapter(folder, visible)(run, node, 'Task', new AbortController().signal, attempt, () => {});
    expect(result.text).toBe('Headless'); expect(attempt.visible).toBeUndefined(); expect(visible.list()).toEqual([]);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('visible launch arguments quote the hook path and keep conflicting settings out', () => {
  const claude = visibleArguments('claude', 'sonnet', { cliPath: '', model: '', arguments: ['--effort', 'high'] }, "/State Dir/it's/done.sh", 'id');
  const settings = JSON.parse(claude[claude.indexOf('--settings') + 1]);
  expect(settings.hooks.Stop[0].hooks[0].command).toBe("'/State Dir/it'\\''s/done.sh'");
  expect(claude).toEqual(expect.arrayContaining(['--permission-mode', 'acceptEdits', '--effort', 'high', '--model', 'sonnet']));
  expect(claude).not.toContain('--print');
  expect(() => visibleArguments('codex', '', { cliPath: 'codex', model: '', arguments: ['--resume', 'x'] }, '/h', 'id')).toThrow();
});

const sampleLaunch = { attemptId: 'a', runId: 'r', workflowId: 'w', workflowName: 'W', title: 'T', source: 'claude' as const, directory: '/tmp', argv: ['claude'], promptFile: '/tmp/p' };
test('while the desktop app is polling, a slow terminal is awaited instead of silently running headless', async () => {
  const visible = new VisibleAgents(80, 2000);
  visible.heartbeat();
  const waiting = visible.request(sampleLaunch, new AbortController().signal);
  const beat = setInterval(() => visible.heartbeat(), 20);
  await Bun.sleep(300); // well past the claim timeout
  expect(visible.list()).toHaveLength(1);
  expect(visible.claim('a', 4321)).toBe(true);
  clearInterval(beat);
  expect(await waiting).toBe(4321);
});
test('a terminal the app cannot open fails the card with the reason, and an absent app falls back quickly', async () => {
  const visible = new VisibleAgents(80, 2000);
  const rejected = visible.request(sampleLaunch, new AbortController().signal);
  expect(visible.reject('a', 'the working folder no longer exists')).toBe(true);
  await expect(rejected).rejects.toThrow(/working folder no longer exists/);
  expect(await visible.request({ ...sampleLaunch, attemptId: 'b' }, new AbortController().signal)).toBeUndefined();
});
