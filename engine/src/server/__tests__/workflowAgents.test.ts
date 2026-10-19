import { expect, test } from 'bun:test';
import { AgentProtocol, agentArguments, parseAgentSettings, createAgentAdapter, ownedProcessAlive, recoverAgentResult } from '../workflow/agents';
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
