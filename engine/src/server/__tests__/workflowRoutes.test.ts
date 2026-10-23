import { expect, test } from 'bun:test';
import { Hono } from 'hono';
import { registerWorkflowRoutes } from '../workflow/routes';
import { WorkflowStore } from '../workflow/store';
import { WorkflowRunner, type WorkflowAdapters } from '../workflow/runner';
import { workflowTemplate } from '../../shared/workflow';
import { VisibleAgents } from '../workflow/visible';

test('workflow API validates input, same origin and stale saves', async () => {
  const store = new WorkflowStore(':memory:');
  try {
    const runner = new WorkflowRunner(store, {} as WorkflowAdapters), app = new Hono();
    registerWorkflowRoutes(app, runner, store, '/tmp/workflow-state');
    const flow = workflowTemplate('Example', '/tmp/example', false);
    const request = (body: unknown, origin?: string) => app.request('/api/workflows/save', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
    expect((await request({ definition: flow }, 'https://other.invalid')).status).toBe(403);
    expect((await request({ definition: { ...flow, nodes: [null] } })).status).toBe(400);
    expect((await request({ definition: flow })).status).toBe(200);
    expect((await request({ definition: flow })).status).toBe(409);
    expect((await request({ definition: flow, revision: 1 })).status).toBe(200);
    const listing = await (await app.request('/api/workflows')).json() as { workflows: { definition: { name: string } }[] };
    expect(listing.workflows[0].definition.name).toBe('Example');
    await app.request('/api/workflows/layout', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sidebarWidth:240,inspectorWidth:460,sidebarHidden:true})});
    await app.request('/api/workflows/selection', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workflowId:flow.id})});
    const status = await (await app.request('/api/workflows/status')).json() as any;
    expect(status.selection).toMatchObject({workflowId:flow.id,sidebarWidth:240,inspectorWidth:460,sidebarHidden:true});
    expect(status.workflows[0]).toMatchObject({name:'Example',status:'never_run',runCount:0});
    expect(status.workflows[0]).not.toHaveProperty('definition');
    expect((await app.request('/api/workflows/layout', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({inspectorWidth:99999})})).status).toBe(400);
    expect((await app.request('/api/workflows/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: flow.id, action: 'accept' }) })).status).toBe(409);
  } finally { store.close(); }
});

test('terminal launch requests are listed until the desktop app claims them', async () => {
  const store = new WorkflowStore(':memory:');
  try {
    const visible = new VisibleAgents(5000), app = new Hono();
    registerWorkflowRoutes(app, new WorkflowRunner(store, {} as WorkflowAdapters), store, '/tmp/workflow-state', visible);
    const claim = (body: unknown) => app.request('/api/workflows/visible/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const waiting = visible.request({ attemptId: 'a1', runId: 'r1', workflowId: 'w1', workflowName: 'Flow', title: 'Plan', source: 'claude', directory: '/tmp', argv: ['claude'], promptFile: '/tmp/prompt.md' }, new AbortController().signal);
    expect(((await (await app.request('/api/workflows/status')).json()) as any).launches).toMatchObject([{ attemptId: 'a1', title: 'Plan' }]);
    expect((await claim({ attemptId: 'a1', pid: 'nope' })).status).toBe(400);
    expect((await claim({ attemptId: 'unknown', pid: 4242 })).status).toBe(409);
    expect((await claim({ attemptId: 'a1', pid: 4242 })).status).toBe(200);
    expect(await waiting).toBe(4242);
    expect(((await (await app.request('/api/workflows/status')).json()) as any).launches).toEqual([]);
    expect((await claim({ attemptId: 'a1', pid: 4242 })).status).toBe(409);
  } finally { store.close(); }
});
