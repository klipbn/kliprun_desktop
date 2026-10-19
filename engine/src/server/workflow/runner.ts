import { activeRun, currentResult, parseReview, parseWorkflow, validateWorkflow, workflowOrder, WorkflowInputRequired } from '@shared/workflow';
import type { AgentNode, PublicationNode, ReviewedState, StepResult, WorkflowAttempt, WorkflowDefinition, WorkflowDocument, WorkflowRun, WorkspaceState, WorkflowAgent, WorkflowAgentSettings } from '@shared/workflow';
import type { WorkflowStore } from './store';
import { workflowSummary, type WorkflowAgentActivity, type WorkflowNotice, type WorkflowManagementAction } from '@shared/workflowPresentation';

export interface WorkflowAdapters {
  prepare(flow: WorkflowDefinition, claim: (directory: string) => void): Promise<WorkspaceState>;
  inspect(run: WorkflowRun): Promise<ReviewedState | null>;
  validateFiles(run: WorkflowRun, paths: string[]): Promise<string[]>;
  isAlive(attempt: WorkflowAttempt): Promise<boolean>;
  recover?(run: WorkflowRun, node: AgentNode, attempt: WorkflowAttempt): Promise<StepResult | null>;
  agent(run: WorkflowRun, node: AgentNode, prompt: string, signal: AbortSignal, attempt: WorkflowAttempt, persist: () => void): Promise<StepResult>;
  publish(run: WorkflowRun, node: PublicationNode, signal: AbortSignal, persist: () => void): Promise<StepResult>;
}

export function workflowPrompt(run: WorkflowRun, node: AgentNode): string {
  const order = workflowOrder(run.snapshot), position = order.indexOf(node.id);
  const original = order.map(id => run.snapshot.nodes.find(n => n.id === id)!).find(n => n.kind === 'agent');
  const prior = order.slice(0, position).flatMap(id => {
    const attempt = currentResult(run, id), card = run.snapshot.nodes.find(n => n.id === id)!;
    return attempt?.status === 'done' && attempt.result ? [`### ${card.title}\n${attempt.result.text}\nOutput files: ${attempt.result.files.join(', ') || '(none)'}`] : [];
  });
  return [
    `# Workflow: ${run.snapshot.name}\nWorking folder: ${run.workspace.directory}\nWorking branch: ${run.workspace.branch || '(no Git)'}\nBase HEAD: ${run.workspace.baseHead || '(none)'}`,
    `# Your task: ${node.title}\n${node.task}\nExpected result: ${node.resultKind}\nCompletion condition: ${node.completion}\nRequired output files: ${node.outputFiles.join(', ') || '(none)'}`,
    ...(original?.kind === 'agent' && original.id !== node.id ? [`# Original task\n${original.task}`] : []),
    '# Results of previous steps', ...prior,
    ...(run.feedback ? [`# Latest feedback / user input\n${run.feedback}`] : []),
    'Read the actual current files and Git diff where applicable. Earlier results are context, not proof of file changes. Do not commit, push, create a merge/pull request, or merge: publication is performed by KlipRun. If blocked, begin your final answer with NEEDS_INPUT: and explain what is needed.',
    ...(node.resultKind === 'review' ? ['Return only JSON: {"verdict":"approved|changes_requested|needs_input","summary":"...","findings":[{"id":"R-1","message":"..."}]}. Approved requires no findings. Changes requested requires at least one actionable finding. Review the current files without changing them.'] : ['Return your completed result as text, with verification evidence where relevant.']),
  ].join('\n\n');
}

export class WorkflowRunner {
  private documents = new Map<string, WorkflowDocument>();
  private jobs = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  private starting = new Set<string>();
  private preparing = false;
  constructor(private store: WorkflowStore, private adapters: WorkflowAdapters) {
    for (const doc of store.list()) {
      const run = activeRun(doc);
      if (run?.status === 'running' || run?.attempts.some(a => a.status === 'running')) {
        run.status = 'interrupted'; run.reason = 'KlipRun stopped during execution. Resume checks the owned process and publication state before retrying.';
        for (const a of run.attempts) if (a.status === 'running') { a.status = 'interrupted'; a.finishedAt ??= a.lastActivityAt ?? a.startedAt; a.error = run.reason; }
        store.put(doc);
      }
      this.documents.set(doc.definition.id, doc);
    }
  }
  list() { return structuredClone([...this.documents.values()]); }
  status() {
    const agents: WorkflowAgentActivity[] = [], notices: WorkflowNotice[] = [];
    for (const doc of this.documents.values()) {
      const run = doc.runs[0]; if (!run) continue;
      const attempt = run.attempts.at(-1);
      if (['completed', 'human_review', 'needs_attention'].includes(run.status)) notices.push({ workflowId: doc.definition.id, runId: run.id, name: run.snapshot.name, status: run.status, revision: attempt?.finishedAt ?? attempt?.startedAt ?? run.startedAt, nodeId: run.currentNodeId ?? undefined, id: `${run.id}:${run.status}:${attempt?.id ?? ''}` });
      if (!activeRun(doc)) continue;
      for (const a of run.attempts) {
        const node = run.snapshot.nodes.find(n => n.id === a.nodeId);
        if (node?.kind !== 'agent' || run.latest[a.nodeId] !== a.id || !['running', 'interrupted'].includes(a.status)) continue;
        agents.push({ workflowId: doc.definition.id, workflowName: doc.definition.name, runId:run.id,attemptId:a.id,nodeId:a.nodeId,title:node.title,agent:node.agent,model:node.model || run.agentSettings?.[node.agent]?.model || '',startedAt:a.startedAt,lastActivityAt:a.lastActivityAt,pid:a.pid,sessionId:a.sessionId,status:a.status as 'running' | 'interrupted' });
      }
    }
    return { workflows: [...this.documents.values()].map(workflowSummary), agents, notices };
  }
  get(id: string): WorkflowDocument { return structuredClone(this.document(id)); }
  private document(id: string) { const doc = this.documents.get(id); if (!doc) throw Error('Workflow not found.'); return doc; }
  private running(id: string) { const doc = this.document(id), run = activeRun(doc); if (!run) throw Error('There is no active run.'); return { doc, run }; }
  private persist(doc: WorkflowDocument) { this.store.put(this.documents.get(doc.definition.id) ?? doc); }
  save(value: unknown, revision?: number) {
    const definition = parseWorkflow(value), old = this.documents.get(definition.id);
    if (old && old.revision !== revision) throw Error('Workflow changed. Reload before saving.');
    if (this.starting.has(definition.id)) throw Error('Workflow is starting.');
    if (old && activeRun(old)) {
      const execution = (f: WorkflowDefinition) => ({ ...f, viewport: undefined, nodes: f.nodes.map(({ x: _x, y: _y, ...n }) => n) });
      if (JSON.stringify(execution(old.definition)) !== JSON.stringify(execution(definition))) throw Error('Stop the active run before changing execution settings.');
    }
    const doc = { definition, revision: (old?.revision ?? 0) + 1, runs: old?.runs ?? [], createdAt: old?.createdAt ?? old?.runs.at(-1)?.startedAt ?? Date.now(), hidden: old?.hidden ?? false };
    this.documents.set(definition.id, doc); this.persist(doc); return this.get(definition.id);
  }
  manage(id: string, action: WorkflowManagementAction, revision: number, name?: string) {
    const doc = this.document(id);
    if (revision !== doc.revision) throw Error('Workflow changed. Refresh before trying again.');
    if (this.starting.has(id)) throw Error('Workflow is starting. Try again shortly.');
    if (action === 'delete') { this.delete(id); return; }
    if (action === 'rename') {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 200 || name.includes('\0')) throw Error('Enter a workflow name between 1 and 200 characters.');
      doc.definition.name = name.trim();
    } else doc.hidden = action === 'hide';
    doc.revision++; this.persist(doc); return this.get(id);
  }
  delete(id: string) {
    if (activeRun(this.document(id)) || this.starting.has(id)) throw Error('Stop the run before deleting this workflow.');
    this.store.delete(id); this.documents.delete(id);
    if (this.store.ui().workflowId === id) this.store.setUI({workflowId:undefined,nodeId:undefined});
  }
  async start(id: string, publicationAuthorized: boolean, settings?: Partial<Record<WorkflowAgent, WorkflowAgentSettings>>) {
    const doc = this.document(id);
    if (activeRun(doc) || this.starting.has(id)) throw Error('This workflow already has an active run.');
    const issues = validateWorkflow(doc.definition); if (issues.length) throw Error(issues.map(i => i.message).join('\n'));
    if (doc.definition.nodes.some(n => n.kind === 'publication') && !publicationAuthorized) throw Error('Authorize the selected publication when starting this run.');
    // Serialize folder resolution and branch switching across simultaneous Start requests.
    if (this.preparing) throw Error('Another workflow is preparing its folder. Try again.');
    this.preparing = true; this.starting.add(id);
    try {
      const definition = structuredClone(doc.definition);
      this.assertFolderAvailable(definition.directory);
      const workspace = await this.adapters.prepare(definition, directory => this.assertFolderAvailable(directory));
      this.assertFolderAvailable(workspace.root ?? workspace.directory);
      const run: WorkflowRun = { id: crypto.randomUUID(), workflowId: id, snapshot: definition, workspace, publicationAuthorized,
        status: 'running', currentNodeId: workflowOrder(definition)[0], attempts: [], latest: {}, returns: {}, feedback: '', startedAt: Date.now(), publicationReceipts: {}, agentSettings: settings ? structuredClone(settings) : undefined };
      doc.runs.unshift(run); this.persist(doc); this.launch(doc, run); return structuredClone(run);
    } finally { this.preparing = false; this.starting.delete(id); }
  }
  private assertFolderAvailable(directory: string) {
    for (const doc of this.documents.values()) {
      const run = activeRun(doc); if (!run) continue;
      const folder = run.workspace.root ?? run.workspace.directory;
      if (folder === directory || directory.startsWith(folder + '/') || folder.startsWith(directory + '/')) throw Error('Another workflow owns this working folder. Stop it before starting another writer.');
    }
  }
  private launch(doc: WorkflowDocument, run: WorkflowRun, recovered?: StepResult) {
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => this.drive(doc, run, controller.signal, recovered)).finally(() => this.jobs.delete(doc.definition.id));
    this.jobs.set(doc.definition.id, { controller, promise });
  }
  private invalidateFrom(run: WorkflowRun, target: string) {
    const order = workflowOrder(run.snapshot);
    for (const id of order.slice(order.indexOf(target))) delete run.latest[id];
    run.reviewed = undefined; run.currentNodeId = target;
  }
  private async drive(doc: WorkflowDocument, run: WorkflowRun, signal: AbortSignal, recovered?: StepResult) {
    while (run.status === 'running' && run.currentNodeId && !signal.aborted) {
      const recovering = !!recovered;
      const node = run.snapshot.nodes.find(n => n.id === run.currentNodeId)!;
      const attempt: WorkflowAttempt = recovered ? currentResult(run, node.id)! : { id: crypto.randomUUID(), nodeId: node.id, number: run.attempts.filter(a => a.nodeId === node.id).length + 1,
        status: 'running', startedAt: Date.now(), input: node.kind === 'agent' ? workflowPrompt(run, node) : '' };
      if (!recovered) run.attempts.push(attempt);
      attempt.status = 'running'; attempt.error = undefined; run.latest[node.id] = attempt.id; this.persist(doc);
      try {
        if (node.kind === 'human') { attempt.status = 'human_review'; run.status = 'human_review'; run.reason = 'Waiting for human review.'; this.persist(doc); return; }
        const before = recovered ? attempt.reviewBaseline ?? null : await this.adapters.inspect(run);
        if (!recovered) {
          attempt.reviewBaseline = before;
          if (node.kind === 'agent' && before) attempt.input += `\n\n# Current code changes\nCurrent HEAD: ${before.head}\nUncommitted paths: ${before.paths.join(', ') || '(none)'}\nCompare the actual files with base HEAD ${run.workspace.baseHead}; include committed changes since that base.`;
          this.persist(doc);
        }
        if (signal.aborted) throw Error('Interrupted before starting the card.');
        let result: StepResult;
        if (node.kind === 'agent') {
          const inputs = workflowOrder(run.snapshot).slice(0, workflowOrder(run.snapshot).indexOf(node.id))
            .flatMap(id => currentResult(run, id)?.result?.files ?? []);
          if (inputs.length) await this.adapters.validateFiles(run, inputs);
          if (node.resultKind !== 'review') run.reviewed = undefined;
          result = recovered ?? await this.adapters.agent(run, node, attempt.input, signal, attempt, () => this.persist(doc));
          recovered = undefined;
          if (signal.aborted) throw Error('Interrupted. Resume starts a new attempt with the current files.');
          if (!result.text?.trim()) throw Error('Agent completed without a result.');
          if (/^NEEDS_INPUT:/i.test(result.text.trim())) { attempt.status = 'needs_input'; throw Error(result.text.trim().slice(12).trim() || 'Agent needs input.'); }
          result.files = await this.adapters.validateFiles(run, [...new Set([...node.outputFiles, ...result.files])]);
          const after = await this.adapters.inspect(run);
          if (node.resultKind === 'code' && after && !after.paths.length && after.head === run.workspace.baseHead) throw Error('No code changes were found in the working files or commits.');
          if (node.resultKind === 'review') {
            result.review = parseReview(result.text);
            if (before?.fingerprint !== after?.fingerprint) throw Error('Files changed during review. Repeat the review on the current version.');
            if (result.review.verdict === 'needs_input') { attempt.result = result; attempt.status = 'needs_input'; throw Error(result.review.summary); }
            if (result.review.verdict === 'approved') run.reviewed = after ?? undefined;
          } else if (!run.snapshot.nodes.some(n => n.kind === 'agent' && n.resultKind === 'review')) run.reviewed = after ?? undefined;
        } else {
          if (!run.publicationAuthorized) throw Error('Publication is not authorized for this run.');
          result = await this.adapters.publish(run, node, signal, () => this.persist(doc));
        }
        attempt.result = result; attempt.status = 'done'; attempt.finishedAt = recovering ? attempt.finishedAt ?? Date.now() : Date.now();
        if (result.review?.verdict === 'changes_requested') {
          const edge = run.snapshot.edges.find(e => e.from === node.id && e.port === 'changes_requested')!;
          const count = run.returns[edge.id] ?? 0;
          if (count >= edge.maxReturns!) {
            run.status = 'needs_attention'; run.reason = `Automatic rework limit reached (${count}/${edge.maxReturns}). Review findings are unresolved.`;
            this.persist(doc); return;
          }
          run.returns[edge.id] = count + 1;
          run.feedback = `${result.review.summary}\n${result.review.findings.map(f => `${f.id}: ${f.message}`).join('\n')}`;
          this.invalidateFrom(run, edge.to);
        } else {
          run.currentNodeId = run.snapshot.edges.find(e => e.from === node.id && e.port === (result.review ? 'approved' : 'done'))?.to ?? null;
          if (!run.currentNodeId && run.status === 'running') run.status = 'completed';
        }
        this.persist(doc);
      } catch (error) {
        attempt.error = error instanceof Error ? error.message : String(error); attempt.finishedAt = Date.now();
        if (signal.aborted) { attempt.status = 'interrupted'; }
        else { if (error instanceof WorkflowInputRequired) attempt.status = 'needs_input'; else if (attempt.status !== 'needs_input') attempt.status = 'failed'; run.status = 'needs_attention'; run.reason = attempt.error; }
        this.persist(doc); return;
      }
    }
  }
  async pause(id: string) {
    const { doc, run } = this.running(id);
    if (run.status !== 'running') throw Error('Only a running workflow can be paused.');
    run.status = 'paused'; run.reason = 'Paused. Resume retries an interrupted card with current files.'; this.persist(doc);
    const job = this.jobs.get(id); job?.controller.abort(); await job?.promise;
  }
  async stop(id: string) {
    const { doc, run } = this.running(id);
    // An orphan from a previous engine is never killed based solely on a PID.
    if (!this.jobs.has(id)) for (const attempt of run.attempts) if (await this.adapters.isAlive(attempt)) throw Error('The previous owned process is still running. Stop that process before releasing this folder.');
    run.status = 'stopped'; run.reason = 'Stopped by user.'; this.persist(doc);
    const job = this.jobs.get(id); job?.controller.abort(); await job?.promise;
  }
  async resume(id: string, input = '') {
    const { doc, run } = this.running(id);
    if (this.jobs.has(id)) throw Error('Wait for the current process to stop.');
    if (!['paused', 'needs_attention', 'interrupted'].includes(run.status)) throw Error('This run cannot be resumed.');
    for (const attempt of run.attempts) if (await this.adapters.isAlive(attempt)) throw Error('The previous owned process is still running. Resume after it exits.');
    await this.adapters.inspect(run);
    const node = run.snapshot.nodes.find(n => n.id === run.currentNodeId), attempt = run.currentNodeId ? currentResult(run, run.currentNodeId) : undefined;
    const recovered = node?.kind === 'agent' && attempt?.status === 'interrupted' && this.adapters.recover ? await this.adapters.recover(run, node, attempt) : null;
    if (input.trim()) run.feedback = input.trim();
    run.status = 'running'; run.reason = undefined;
    if (!run.currentNodeId) run.status = 'completed';
    this.persist(doc); if (run.status === 'running') this.launch(doc, run, recovered ?? undefined);
  }
  async rework(id: string, target: string, comment: string) {
    const { doc, run } = this.running(id);
    if (!['human_review', 'needs_attention'].includes(run.status) || this.jobs.has(id)) throw Error('Return is available while awaiting review or attention.');
    const order = workflowOrder(run.snapshot);
    if (!comment.trim() || !run.snapshot.nodes.some(n => n.id === target && n.kind === 'agent') || order.indexOf(target) >= order.indexOf(run.currentNodeId!)) throw Error('Choose an earlier agent card and enter feedback.');
    await this.adapters.inspect(run);
    run.feedback = comment.trim(); this.invalidateFrom(run, target);
    run.status = 'running'; run.reason = undefined; this.persist(doc); this.launch(doc, run);
  }
  accept(id: string) {
    const { doc, run } = this.running(id); if (run.status !== 'human_review') throw Error('The run is not waiting for human review.');
    const attempt = currentResult(run, run.currentNodeId!); if (attempt) { attempt.status = 'done'; attempt.finishedAt = Date.now(); }
    run.status = 'completed'; run.reason = 'Accepted locally. MR/PR merging is managed in GitHub/GitLab.'; this.persist(doc);
  }
  async close() { await Promise.all([...this.jobs.keys()].map(id => this.pause(id))); }
}
