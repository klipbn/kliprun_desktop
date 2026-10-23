import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGit } from '../gitProcess';
import { prepareWorkspace, inspectWorkspace, publishWorkflow, validateOutputFiles } from '../workflow/git';
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
test('saved request cards commit with a default message and push without any hosting setup', async () => {
  const { directory, remote, run, node } = await fixture();
  node.mode = 'request'; node.targetBranch = ''; node.requestTitle = '';
  run.workspace = await prepareWorkspace(run.snapshot, () => {});
  await writeFile(join(directory, 'app.txt'), 'push-only result\n');
  run.reviewed = (await inspectWorkspace(run))!;
  const first = await publishWorkflow(run, node, new AbortController().signal, () => {});
  const retry = await publishWorkflow(run, node, new AbortController().signal, () => {});
  expect(first.publication?.url).toBeUndefined();
  expect(retry.publication?.sha).toBe(first.publication?.sha);
  expect((await runGit(directory, ['log', '-1', '--format=%s'])).out.trim()).toBe('Workflow: Example');
  expect((await runGit(remote, ['rev-parse', 'refs/heads/feature/work'])).out.trim()).toBe(first.publication?.sha!);
});
test('publication switches to an existing branch and automatically creates a missing one', async () => {
  const { directory, run } = await fixture();
  run.snapshot.branch = 'feature/new-work'; run.snapshot.createBranch = false;
  expect((await prepareWorkspace(run.snapshot, () => {})).branch).toBe('feature/new-work');
  await runGit(directory, ['switch', 'feature/work']);
  run.snapshot.createBranch = true;
  expect((await prepareWorkspace(run.snapshot, () => {})).branch).toBe('feature/new-work');
});
test('a push-only workflow can publish an existing clean branch without an artificial review card', async () => {
  const { directory, remote, run, node } = await fixture();
  run.snapshot.nodes = [node]; run.snapshot.edges = [];
  const result = await publishWorkflow(run, node, new AbortController().signal, () => {});
  expect((await runGit(remote, ['rev-parse', 'refs/heads/feature/work'])).out.trim()).toBe(result.publication?.sha!);
  expect((await runGit(directory, ['rev-list', '--count', 'HEAD'])).out.trim()).toBe('1');
});
test('Start checks only selected remotes and validates them before changing branches', async () => {
  const { directory, run, node } = await fixture();
  await runGit(directory, ['remote', 'add', 'unused', '/tmp/unused-remote']);
  await runGit(directory, ['remote', 'set-url', '--add', '--push', 'unused', '/tmp/unused-one']);
  await runGit(directory, ['remote', 'set-url', '--add', '--push', 'unused', '/tmp/unused-two']);
  expect((await prepareWorkspace(run.snapshot, () => {})).branch).toBe('feature/work');
  run.snapshot.branch = 'feature/not-created'; node.remote = 'missing';
  await expect(prepareWorkspace(run.snapshot, () => {})).rejects.toThrow(/remote.*missing/i);
  expect((await runGit(directory, ['branch', '--show-current'])).out.trim()).toBe('feature/work');
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
