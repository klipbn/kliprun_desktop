import { Hono } from 'hono';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { activeRun, parseWorkflow } from '@shared/workflow';
import { gitRoot, gitStatus } from '../git';
import { availableModels, parseAgentSettings, readAttemptResponses } from './agents';
import type { WorkflowRunner } from './runner';
import type { WorkflowStore } from './store';
import type { WorkflowManagementAction } from '@shared/workflowPresentation';

export function registerWorkflowRoutes(parent: Hono, runner: WorkflowRunner, store: WorkflowStore, stateDirectory: string) {
  const app = new Hono();
  let settings = parseAgentSettings(JSON.parse(process.env.KLIPRUN_AGENT_SETTINGS ?? '{}'));
  let catalog: Awaited<ReturnType<typeof availableModels>> | undefined;
  app.onError((error, c) => c.json({ error: error.message }, 409));
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (c.req.method !== 'GET') {
      const origin = c.req.header('Origin');
      if (origin && origin !== new URL(c.req.url).origin || c.req.header('Sec-Fetch-Site') === 'cross-site') return c.json({ error: 'Cross-origin workflow operations are not allowed.' }, 403);
      if (!c.req.header('Content-Type')?.startsWith('application/json')) return c.json({ error: 'Expected JSON.' }, 400);
      const raw = await c.req.text();
      if (raw.length > 2 * 1024 * 1024) return c.json({ error: 'Workflow request is too large.' }, 413);
      try { const body = JSON.parse(raw); if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error(); } catch { return c.json({ error: 'Invalid JSON object.' }, 400); }
    }
    await next();
  });
  app.get('/', c => c.json({ workflows: runner.list(), selection: store.ui() }));
  app.get('/status', c => c.json({ ...runner.status(), selection: store.ui() }));
  app.get('/document', c => c.json(runner.get(c.req.query('id') ?? '')));
  app.post('/manage', async c => {
    const body = await c.req.json();
    if (typeof body.id !== 'string' || !['rename','hide','show','delete'].includes(body.action) || !Number.isSafeInteger(body.revision)) return c.json({error:'Invalid workflow management request.'},400);
    return c.json(runner.manage(body.id,body.action as WorkflowManagementAction,body.revision,body.name) ?? {ok:true});
  });
  app.post('/layout', async c => {
    const b = await c.req.json();
    if (Object.keys(b).some(k => !['sidebarHidden', 'sidebarWidth', 'inspectorWidth'].includes(k)) ||
      b.sidebarHidden !== undefined && typeof b.sidebarHidden !== 'boolean' ||
      b.sidebarWidth !== undefined && (!Number.isFinite(b.sidebarWidth) || b.sidebarWidth < 160 || b.sidebarWidth > 420) ||
      b.inspectorWidth !== undefined && (!Number.isFinite(b.inspectorWidth) || b.inspectorWidth < 260 || b.inspectorWidth > 800)) return c.json({error:'Invalid pane dimensions.'},400);
    store.setUI(b); return c.json(store.ui());
  });
  app.get('/models', async c => { catalog ??= await availableModels(settings); return c.json({ models: catalog, settings }); });
  app.post('/agent-settings', async c => { settings = parseAgentSettings(await c.req.json()); catalog = undefined; return c.json({ ok: true }); });
  app.get('/workspace', async c => {
    const directory = c.req.query('directory');
    if (!directory || !isAbsolute(directory) || directory.includes('\0') || directory.length > 4096) return c.json({ error: 'Choose an absolute working folder.' }, 400);
    const resolved = await realpath(directory); if (!(await stat(resolved)).isDirectory()) throw Error('Choose a folder.');
    let root: string;
    try { root = await gitRoot(resolved); } catch { return c.json({ directory: resolved, git: null }); }
    return c.json({ directory: resolved, git: await gitStatus(root) });
  });
  app.post('/save', async c => {
    const body = await c.req.json();
    try { parseWorkflow(body.definition); } catch (error) { return c.json({ error: (error as Error).message }, 400); }
    return c.json(runner.save(body.definition, body.revision));
  });
  app.post('/selection', async c => {
    const body = await c.req.json();
    for (const key of ['workflowId', 'nodeId']) if (body[key] !== undefined && (typeof body[key] !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body[key]))) return c.json({ error: 'Invalid selection.' }, 400);
    store.setUI({ workflowId: body.workflowId, nodeId: body.nodeId }); return c.json({ ok: true });
  });
  app.post('/action', async c => {
    const body = await c.req.json();
    if (typeof body.id !== 'string' || typeof body.action !== 'string' || body.input !== undefined && (typeof body.input !== 'string' || body.input.length > 100_000)) return c.json({ error: 'Invalid workflow action.' }, 400);
    if (body.action !== 'start' && body.action !== 'delete' && activeRun(runner.get(body.id))?.id !== body.runId) throw Error('The selected run changed. Refresh before continuing.');
    switch (body.action) {
      case 'start': await runner.start(body.id, body.publicationAuthorized === true, settings); break;
      case 'pause': await runner.pause(body.id); break;
      case 'resume': await runner.resume(body.id, body.input ?? ''); break;
      case 'stop': await runner.stop(body.id); break;
      case 'rework': if (typeof body.target !== 'string') throw Error('Choose a return card.'); await runner.rework(body.id, body.target, body.input ?? ''); break;
      case 'accept': runner.accept(body.id); break;
      case 'delete': runner.delete(body.id); return c.json({ ok: true });
      default: return c.json({ error: 'Unknown workflow action.' }, 400);
    }
    return c.json(runner.get(body.id));
  });
  app.get('/responses', async c => {
    const doc = runner.get(c.req.query('id') ?? ''), run = doc.runs.find(r => r.id === c.req.query('run'));
    const attempt = run?.attempts.find(a => a.id === c.req.query('attempt')); if (!run || !attempt) throw Error('Attempt not found.');
    const responses = await readAttemptResponses(stateDirectory, run.id, attempt.id);
    if (!responses.messages.length && attempt.result?.text) { responses.messages = [attempt.result.text.slice(-65536)]; responses.truncated = attempt.result.text.length > 65536; }
    return c.json(responses);
  });
  parent.route('/api/workflows', app);
}
