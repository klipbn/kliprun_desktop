import { afterEach, describe, expect, test } from 'bun:test';
import { WorkflowStore } from '../workflow/store';
import { WorkflowRunner, type WorkflowAdapters } from '../workflow/runner';
import { workflowTemplate, type WorkflowRun } from '../../shared/workflow';

const stores: WorkflowStore[] = [];
afterEach(() => { for (const s of stores.splice(0)) s.close(); });
function setup(review: string[] = ['approved'], patch: Partial<WorkflowAdapters> = {}) {
  const store = new WorkflowStore(':memory:'); stores.push(store);
  const seen: { node: string; prompt: string }[] = [];
  let revision = 0, published = 0;
  const adapters: WorkflowAdapters = {
    prepare: async flow => ({ directory: flow.directory, branch: flow.branch, baseHead: 'base', remotes: { origin: 'git@example.test:team/project.git' } }),
    inspect: async () => ({ head: 'base', fingerprint: String(revision), tree: String(revision), paths: ['app.txt'] }),
    validateFiles: async (_run, files) => files,
    isAlive: async () => false,
    agent: async (run, node, prompt) => {
      seen.push({ node: node.id, prompt });
      if (node.id === 'build') revision++;
      if (node.resultKind === 'review') {
        const verdict = review.shift() ?? 'changes_requested';
        return { text: JSON.stringify({ verdict, summary: verdict === 'approved' ? 'Checked' : 'Fix empty response', findings: verdict === 'changes_requested' ? [{ id: 'R1', message: 'Handle empty response' }] : [] }), files: [] };
      }
      return { text: node.id === 'plan' ? 'CURRENT PLAN: implement empty response handling' : `Implemented ${run.id}`, files: [] };
    },
    publish: async () => { published++; return { text: 'Published', files: [], publication: { sha: 'sha', url: 'https://example.test/pull/1', remote: 'origin', branch: 'feature/work' } }; },
    ...patch,
  };
  const runner = new WorkflowRunner(store, adapters);
  const flow = workflowTemplate('Example', '/tmp/workflow-example', true); flow.branch = 'feature/work';
  const pub = flow.nodes.find(n => n.kind === 'publication')!; if (pub.kind === 'publication') pub.targetBranch = 'develop';
  runner.save(flow);
  return { runner, flow, seen, published: () => published };
}
async function settle(runner: WorkflowRunner, id: string): Promise<WorkflowRun> {
  for (let i = 0; i < 200; i++) {
    const run = runner.get(id).runs[0];
    if (run && run.status !== 'running') return run;
    await Bun.sleep(2);
  }
  throw Error('workflow did not settle');
}

describe('workflow execution', () => {
  test('rename and hiding are persistent metadata, preserving runs and immutable snapshots', async () => {
    const {runner,flow}=setup(['approved']);
    await runner.start(flow.id,true); await settle(runner,flow.id);
    let doc=runner.get(flow.id);
    runner.manage(flow.id,'rename',doc.revision,'  New workflow name  ');
    doc=runner.get(flow.id);
    expect(doc.definition.name).toBe('New workflow name');
    expect(doc.runs[0].snapshot.name).toBe('Example');
    runner.manage(flow.id,'hide',doc.revision);
    doc=runner.get(flow.id);
    expect(doc.hidden).toBe(true);
    expect(doc.runs[0].status).toBe('human_review');
    expect(runner.status().workflows[0]).toMatchObject({hidden:true,active:true});
    doc.definition.nodes[0].x=999;
    runner.save(doc.definition,doc.revision);
    expect(stores.at(-1)!.list()[0].hidden).toBe(true);
    expect(()=>runner.manage(flow.id,'delete',runner.get(flow.id).revision)).toThrow(/Stop/);
    expect(()=>runner.manage(flow.id,'rename',runner.get(flow.id).revision,'   ')).toThrow(/name/i);
    expect(()=>runner.manage(flow.id,'rename',1,'Stale')).toThrow(/changed/i);
    runner.accept(flow.id);
    runner.manage(flow.id,'show',runner.get(flow.id).revision);
    expect(runner.get(flow.id).hidden).toBe(false);
    runner.manage(flow.id,'delete',runner.get(flow.id).revision);
    expect(stores.at(-1)!.list()).toHaveLength(0);
  });
  test('passes the plan and latest review through a repeat, publishes once and waits for a human', async () => {
    const { runner, flow, seen, published } = setup(['changes_requested', 'approved']);
    await runner.start(flow.id, true);
    const run = await settle(runner, flow.id);
    expect(run.status).toBe('human_review');
    expect(runner.status().notices[0]).toMatchObject({status:'human_review',workflowId:flow.id});
    expect(runner.status().agents).toHaveLength(0);
    expect(seen.map(s => s.node)).toEqual(['plan', 'build', 'review', 'build', 'review']);
    expect(seen[1].prompt).toContain('CURRENT PLAN');
    expect(seen[1].prompt).toContain('Inspect the project and write a concrete implementation plan');
    expect(seen[3].prompt).toContain('CURRENT PLAN');
    expect(seen[3].prompt).toContain('Handle empty response');
    expect(run.returns['review-return']).toBe(1);
    expect(run.attempts.filter(a => a.nodeId === 'build')).toHaveLength(2);
    expect(published()).toBe(1);
    runner.accept(flow.id);
    expect(runner.get(flow.id).runs[0].status).toBe('completed');
  });
  test('three returns mean four reviews, then attention without publishing', async () => {
    const { runner, flow, seen, published } = setup([]);
    await runner.start(flow.id, true);
    const run = await settle(runner, flow.id);
    expect(run.status).toBe('needs_attention');
    expect(run.returns['review-return']).toBe(3);
    expect(seen.filter(s => s.node === 'review')).toHaveLength(4);
    expect(published()).toBe(0);
  });
  test('invalid verdict, missing result and needs_input never advance', async () => {
    for (const text of ['', 'Looks good', '{"verdict":"needs_input","summary":"Which API?","findings":[]}']) {
      const { runner, flow, published } = setup([], { agent: async (_r, n) => ({ text: n.resultKind === 'review' ? text : 'Plan and code', files: [] }) });
      await runner.start(flow.id, true);
      const run = await settle(runner, flow.id);
      expect(run.status).toBe('needs_attention'); expect(published()).toBe(0);
    }
  });
  test('one folder cannot be leased by two workflows, including while paused', async () => {
    const { runner, flow } = setup([], { agent: async (_r, _n, _p, signal) => {
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
      throw Error('Interrupted');
    } });
    await runner.start(flow.id, true);
    const other = { ...flow, id: 'other' }; runner.save(other);
    await expect(runner.start('other', true)).rejects.toThrow(/folder/i);
    await runner.pause(flow.id);
    expect(runner.get(flow.id).runs[0].status).toBe('paused');
    expect(runner.status().agents[0]).toMatchObject({workflowId:flow.id,nodeId:'plan',status:'interrupted'});
    await expect(runner.start('other', true)).rejects.toThrow(/folder/i);
    await runner.stop(flow.id);
    expect(runner.get(flow.id).runs[0].status).toBe('stopped');
  });
  test('text-only chains need no Git or publication authorization', async () => {
    const { runner, flow } = setup([], { inspect: async () => null });
    flow.nodes = flow.nodes.slice(0, 2).map(n => n.kind === 'agent' ? { ...n, resultKind: 'text' as const } : n);
    flow.edges = flow.edges.slice(0, 1); flow.branch = '';
    runner.save(flow, runner.get(flow.id).revision);
    await runner.start(flow.id, false);
    expect((await settle(runner, flow.id)).status).toBe('completed');
  });
  test('restoration marks unfinished work interrupted and refuses duplicate live sessions', async () => {
    const { runner, flow } = setup([], { agent: async () => { throw Error('Agent unavailable'); } });
    await runner.start(flow.id, true); await settle(runner, flow.id);
    const doc = runner.get(flow.id); doc.runs[0].status = 'running'; doc.runs[0].attempts[0].status = 'running';
    const store = new WorkflowStore(':memory:'); stores.push(store); store.put(doc);
    const restored = new WorkflowRunner(store, { isAlive: async () => true } as unknown as WorkflowAdapters);
    expect(restored.get(flow.id).runs[0].status).toBe('interrupted');
    await expect(restored.resume(flow.id)).rejects.toThrow(/still running/i);
  });
  test('a confirmed recovered attempt is consumed without launching another session', async () => {
    const { runner, flow } = setup([], { agent: async () => { throw Error('Disconnected'); } });
    await runner.start(flow.id, true); await settle(runner, flow.id);
    const doc = runner.get(flow.id); doc.runs[0].status = 'running'; doc.runs[0].attempts[0].status = 'running';
    const store = new WorkflowStore(':memory:'); stores.push(store); store.put(doc);
    let launches = 0;
    const restored = new WorkflowRunner(store, {
      isAlive: async () => false, inspect: async () => null, validateFiles: async (_r: WorkflowRun, p: string[]) => p,
      recover: async (_r:WorkflowRun, _n:unknown, attempt:WorkflowRun['attempts'][number]) => { attempt.finishedAt=2000; return { text: 'Recovered plan', files: [], sessionId: 'codex:original' }; },
      agent: async () => { launches++; throw Error('Next card intentionally stopped'); },
    } as unknown as WorkflowAdapters);
    await restored.resume(flow.id); const run = await settle(restored, flow.id);
    expect(run.attempts.filter(a => a.nodeId === 'plan')).toHaveLength(1);
    expect(run.attempts[0].result?.text).toBe('Recovered plan');
    expect(run.attempts[0].result?.sessionId).toBe('codex:original');
    expect(run.attempts[0].finishedAt).toBe(2000);
    expect(launches).toBe(1);
  });
  test('missing output files stop the chain and manual rework invalidates downstream results', async () => {
    const missing = setup([], { validateFiles: async () => { throw Error('Output file is missing'); } });
    await missing.runner.start(missing.flow.id, true);
    expect((await settle(missing.runner, missing.flow.id)).attempts).toHaveLength(1);
    const { runner, flow, seen } = setup(['approved', 'approved']);
    await runner.start(flow.id, true); await settle(runner, flow.id);
    await runner.rework(flow.id, 'build', 'Handle another input');
    const rerun = await settle(runner, flow.id);
    expect(rerun.status).toBe('human_review');
    expect(seen.filter(v => v.node === 'plan')).toHaveLength(1);
    expect(seen.filter(v => v.node === 'build')[1].prompt).toContain('Handle another input');
    expect(seen.filter(v => v.node === 'build')[1].prompt).not.toContain('Published');
    expect(rerun.attempts.filter(a => a.nodeId === 'publish')).toHaveLength(2);
  });
  test('moving a card during execution survives subsequent persisted progress', async () => {
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const { runner, flow } = setup([], { agent: async () => { await wait; return { text: 'Result', files: [] }; } });
    flow.nodes = [flow.nodes[0]]; flow.edges = [];
    runner.save(flow, runner.get(flow.id).revision);
    await runner.start(flow.id, false);
    const changed = runner.get(flow.id); changed.definition.nodes[0].x = 777;
    const saved = runner.save(changed.definition, changed.revision);
    release(); await settle(runner, flow.id);
    const persisted = stores.at(-1)!.list()[0];
    expect(persisted.definition.nodes[0].x).toBe(777);
    expect(persisted.revision).toBe(saved.revision);
    expect(persisted.runs[0].status).toBe('completed');
  });
});
