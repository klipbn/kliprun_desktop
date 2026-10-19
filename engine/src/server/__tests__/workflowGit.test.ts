import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGit } from '../gitProcess';
import { prepareWorkspace, inspectWorkspace, publishWorkflow, requestRepository, upsertRequest, validateOutputFiles } from '../workflow/git';
import { workflowTemplate, newAgentNode, type WorkflowRun, type PublicationNode } from '../../shared/workflow';
import { WorkflowStore } from '../workflow/store';
import { WorkflowRunner } from '../workflow/runner';
const folders: string[] = [];
afterEach(async () => { for (const path of folders.splice(0)) await rm(path, { recursive: true, force: true }); });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'kliprun-workflow-git-')); folders.push(directory);
  await runGit(directory, ['init', '-b', 'feature/work']);
  await runGit(directory, ['config', 'user.name', 'Workflow Test']); await runGit(directory, ['config', 'user.email', 'test@example.invalid']);
  await writeFile(join(directory, 'app.txt'), 'before\n'); await runGit(directory, ['add', 'app.txt']); await runGit(directory, ['commit', '-m', 'initial']);
  const remote = await mkdtemp(join(tmpdir(), 'kliprun-workflow-remote-')); folders.push(remote); await runGit(remote, ['init', '--bare']);
  await runGit(directory, ['remote', 'add', 'origin', remote]);
  const flow = workflowTemplate('Example', directory, true); flow.branch = 'feature/work';
  const node = flow.nodes.find(n => n.kind === 'publication') as PublicationNode; node.mode = 'push';
  const workspace = await prepareWorkspace(flow, () => {});
  const run: WorkflowRun = { id: 'run', workflowId: flow.id, snapshot: flow, workspace, publicationAuthorized: true, status: 'running', currentNodeId: node.id,
    attempts: [], latest: {}, returns: {}, feedback: '', startedAt: Date.now(), publicationReceipts: {} };
  return { directory, remote, run, node };
}
test('publishes reviewed files to the source branch, no empty commit on retry', async () => {
  const { directory, remote, run, node } = await fixture();
  await writeFile(join(directory, 'app.txt'), 'after\n');
  run.reviewed = (await inspectWorkspace(run))!;
  const first = await publishWorkflow(run, node, new AbortController().signal, () => {});
  const second = await publishWorkflow(run, node, new AbortController().signal, () => {});
  expect(second.publication?.sha).toBe(first.publication?.sha);
  expect((await runGit(remote, ['rev-parse', 'refs/heads/feature/work'])).out.trim()).toBe(first.publication?.sha!);
  expect((await runGit(directory, ['status', '--porcelain'])).out).toBe('');
  expect((await runGit(directory, ['rev-list', '--count', 'HEAD'])).out.trim()).toBe('2');
});
test('dirty Start and post-review changes stop without staging unrelated files', async () => {
  const { directory, run, node } = await fixture();
  await writeFile(join(directory, 'app.txt'), 'after\n');
  await expect(prepareWorkspace(run.snapshot, () => {})).rejects.toThrow(/clean|uncommitted/i);
  run.reviewed = (await inspectWorkspace(run))!;
  await writeFile(join(directory, 'unrelated.txt'), 'private');
  await expect(publishWorkflow(run, node, new AbortController().signal, () => {})).rejects.toThrow(/review|changed/i);
  expect((await runGit(directory, ['diff', '--cached', '--name-only'])).out).toBe('');
  expect(await readFile(join(directory, 'unrelated.txt'), 'utf8')).toBe('private');
});
test('changed branch and remote cannot silently change the publication destination', async () => {
  const { directory, run, node } = await fixture(); run.reviewed = (await inspectWorkspace(run))!;
  await runGit(directory, ['switch', '-c', 'different']);
  await expect(publishWorkflow(run, node, new AbortController().signal, () => {})).rejects.toThrow(/branch/i);
  await runGit(directory, ['switch', 'feature/work']); await runGit(directory, ['remote', 'set-url', 'origin', '/tmp/another-remote']);
  await expect(publishWorkflow(run, node, new AbortController().signal, () => {})).rejects.toThrow(/remote/i);
});
test('hosting selection supports corporate servers without guessing the provider', () => {
  expect(requestRepository('git@gitlab.example.test:team/repo.git', 'auto')).toEqual({ provider: 'gitlab', host: 'gitlab.example.test', project: 'team/repo' });
  expect(requestRepository('ssh://git@code.example.test/team/repo.git', 'github').provider).toBe('github');
  expect(() => requestRepository('git@code.example.test:team/repo.git', 'auto')).toThrow(/provider/i);
});
test('lost create response is reconciled by source AND target and updates the existing request', async () => {
  for (const provider of ['github', 'gitlab'] as const) {
    let requests: Record<string, unknown>[] = [], creates = 0;
    const repository = { provider, host: `${provider}.example.test`, project: 'team/repo' };
    const api = async (_repo: unknown, method: string, path: string, body?: Record<string, unknown>) => {
      if (method === 'GET') { expect(path).toContain(provider === 'github' ? 'base=develop' : 'target_branch=develop'); return requests; }
      if (method === 'POST') {
        creates++;
        expect(body?.[provider === 'github' ? 'head' : 'source_branch']).toBe('feature/work');
        requests = [provider === 'github' ? { number: 4, html_url: 'https://github.example.test/team/repo/pull/4', state: 'open', head: { ref: 'feature/work' }, base: { ref: 'develop' } }
          : { iid: 4, web_url: 'https://gitlab.example.test/team/repo/-/merge_requests/4', state: 'opened', source_branch: 'feature/work', target_branch: 'develop' }];
        throw Error('Response lost');
      }
      return requests[0];
    };
    const node: PublicationNode = { id: 'pub', kind: 'publication', title: 'Publish', x: 0, y: 0, mode: 'request', remote: 'origin', provider, targetBranch: 'develop', requestTitle: 'Fix', description: 'Result' };
    await expect(upsertRequest(repository, 'feature/work', node, 'Result', api)).rejects.toThrow('Response lost');
    expect(await upsertRequest(repository, 'feature/work', node, 'Updated', api)).toContain('/4');
    expect(creates).toBe(1);
  }
});

test('a file chain outside Git hands an existing output file to the next agent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kliprun-workflow-files-')); folders.push(directory);
  const flow = workflowTemplate('File chain', directory, false);
  flow.nodes = [
    { ...newAgentNode('write'), task: 'Write the plan.', completion: 'A plan file.', resultKind: 'files', outputFiles: ['plan.txt'] },
    { ...newAgentNode('read'), task: 'Read the plan.', completion: 'A summary.' },
  ];
  flow.edges = [{ id: 'next', from: 'write', to: 'read', port: 'done' }];
  const store = new WorkflowStore(':memory:');
  const runner = new WorkflowRunner(store, {
    prepare: prepareWorkspace, inspect: inspectWorkspace, validateFiles: validateOutputFiles, isAlive: async () => false, publish: publishWorkflow,
    agent: async (_run, node, prompt) => {
      if (node.id === 'write') await writeFile(join(directory, 'plan.txt'), 'Read the real plan');
      else { expect(prompt).toContain('plan.txt'); expect(await readFile(join(directory, 'plan.txt'), 'utf8')).toBe('Read the real plan'); }
      return { text: 'Plan ready', files: [] };
    },
  });
  try {
    runner.save(flow); await runner.start(flow.id, false);
    for (let i = 0; i < 200 && runner.get(flow.id).runs[0].status === 'running'; i++) await Bun.sleep(5);
    expect(runner.get(flow.id).runs[0].status).toBe('completed');
    expect(runner.get(flow.id).runs[0].workspace.root).toBeUndefined();
  } finally { await runner.close(); store.close(); }
});

test('review receives actual builder changes and publishes that exact tree', async () => {
  const { directory, remote, run } = await fixture();
  const store = new WorkflowStore(':memory:');
  const runner = new WorkflowRunner(store, {
    prepare: prepareWorkspace, inspect: inspectWorkspace, validateFiles: validateOutputFiles, isAlive: async () => false, publish: publishWorkflow,
    agent: async (running, node, prompt) => {
      if (node.id === 'build') await writeFile(join(directory, 'app.txt'), 'reviewed implementation\n');
      if (node.id === 'review') {
        expect(prompt).toContain('app.txt');
        expect((await runGit(directory, ['diff', running.workspace.baseHead!, '--', 'app.txt'])).out).toContain('+reviewed implementation');
        return { text: '{"verdict":"approved","summary":"Actual diff checked","findings":[]}', files: [] };
      }
      return { text: 'Plan and implementation ready', files: [] };
    },
  });
  try {
    runner.save(run.snapshot); await runner.start(run.workflowId, true);
    for (let i = 0; i < 1000 && runner.get(run.workflowId).runs[0].status === 'running'; i++) await Bun.sleep(5);
    const result = runner.get(run.workflowId).runs[0];
    expect(result.status).toBe('human_review');
    const remoteTree = (await runGit(remote, ['rev-parse', 'refs/heads/feature/work^{tree}'])).out.trim();
    expect(remoteTree).toBe(result.reviewed!.tree);
  } finally { await runner.close(); store.close(); }
});
