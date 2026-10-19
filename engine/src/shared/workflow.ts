export type WorkflowAgent = 'opencode' | 'codex' | 'claude';
export type ResultKind = 'text' | 'files' | 'code' | 'review';
export class WorkflowInputRequired extends Error {}
interface NodeBase { id: string; title: string; x: number; y: number }
export interface AgentNode extends NodeBase {
  kind: 'agent'; agent: WorkflowAgent; model: string; task: string;
  resultKind: ResultKind; outputFiles: string[]; completion: string;
}
export interface PublicationNode extends NodeBase {
  kind: 'publication'; mode: 'push' | 'request'; remote: string;
  provider: 'auto' | 'github' | 'gitlab'; targetBranch: string; requestTitle: string; description: string;
}
export interface HumanNode extends NodeBase { kind: 'human' }
export type WorkflowNode = AgentNode | PublicationNode | HumanNode;
export interface WorkflowEdge { id: string; from: string; to: string; port: 'done' | 'approved' | 'changes_requested'; maxReturns?: number }
export interface WorkflowDefinition {
  id: string; name: string; directory: string; branch: string; createBranch: boolean;
  nodes: WorkflowNode[]; edges: WorkflowEdge[]; viewport: { x: number; y: number; zoom: number };
}
export interface WorkflowIssue { message: string; nodeId?: string; edgeId?: string }
export interface ReviewResult { verdict: 'approved' | 'changes_requested' | 'needs_input'; summary: string; findings: { id: string; message: string }[] }
export interface StepResult { text: string; files: string[]; sessionId?: string; review?: ReviewResult; publication?: { sha: string; url?: string; remote: string; branch: string } }
export type CardStatus = 'pending' | 'running' | 'done' | 'needs_input' | 'failed' | 'human_review' | 'interrupted';
export interface WorkflowAttempt {
  id: string; nodeId: string; number: number; status: CardStatus; startedAt: number; finishedAt?: number;
  input: string; result?: StepResult; error?: string; pid?: number; processStamp?: string; sessionId?: string;
  processMarker?: string; reviewBaseline?: ReviewedState | null; lastActivityAt?: number;
}
export interface WorkflowAgentSettings { cliPath: string; model: string; arguments: string[] }
export interface WorkspaceState { directory: string; root?: string; branch: string; baseHead?: string; remotes: Record<string, string> }
export interface ReviewedState { head: string; fingerprint: string; tree: string; paths: string[] }
export interface PublicationReceipt { sha?: string; url?: string; intendedTree?: string; baseHead?: string }
export interface WorkflowRun {
  id: string; workflowId: string; snapshot: WorkflowDefinition;
  status: 'running' | 'paused' | 'needs_attention' | 'human_review' | 'interrupted' | 'stopped' | 'completed';
  currentNodeId: string | null; attempts: WorkflowAttempt[]; latest: Record<string, string>;
  returns: Record<string, number>; feedback: string; reason?: string; startedAt: number;
  workspace: WorkspaceState; publicationAuthorized: boolean; reviewed?: ReviewedState;
  publicationReceipts: Record<string, PublicationReceipt>;
  agentSettings?: Partial<Record<WorkflowAgent, WorkflowAgentSettings>>;
}
export interface WorkflowDocument { definition: WorkflowDefinition; runs: WorkflowRun[]; revision: number; createdAt?: number; hidden?: boolean }
export function activeRun(doc: WorkflowDocument): WorkflowRun | undefined { return doc.runs.find(r => r.status !== 'stopped' && r.status !== 'completed'); }
export function currentResult(run: WorkflowRun, nodeId: string): WorkflowAttempt | undefined { return run.attempts.find(a => a.id === run.latest[nodeId]); }

const text = (v: unknown, limit = 100_000): v is string => typeof v === 'string' && v.length <= limit && !v.includes('\0');
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) && !['__proto__', 'constructor', 'prototype'].includes(v);
export function parseWorkflow(value: unknown): WorkflowDefinition {
  if (!object(value) || !identifier(value.id) || !text(value.name, 200) || !text(value.directory, 4096) || !text(value.branch, 256) || typeof value.createBranch !== 'boolean' ||
    !Array.isArray(value.nodes) || value.nodes.length > 100 || !Array.isArray(value.edges) || value.edges.length > 200 || !object(value.viewport) ||
    ![value.viewport.x, value.viewport.y, value.viewport.zoom].every(n => typeof n === 'number' && Number.isFinite(n)) || Number(value.viewport.zoom) < .2 || Number(value.viewport.zoom) > 2) throw Error('Invalid workflow definition.');
  for (const n of value.nodes) {
    if (!object(n) || !identifier(n.id) || !text(n.title, 200) || ![n.x, n.y].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 100_000)) throw Error('Invalid card.');
    if (n.kind === 'agent') {
      if (!['opencode', 'codex', 'claude'].includes(String(n.agent)) || !text(n.model, 256) || !text(n.task) || !text(n.completion, 2000) ||
        !['text', 'files', 'code', 'review'].includes(String(n.resultKind)) || !Array.isArray(n.outputFiles) || n.outputFiles.length > 500 || !n.outputFiles.every(p => text(p, 4096))) throw Error('Invalid agent card.');
    } else if (n.kind === 'publication') {
      if (!['push', 'request'].includes(String(n.mode)) || !['auto', 'github', 'gitlab'].includes(String(n.provider)) || !text(n.remote, 256) || !text(n.targetBranch, 256) || !text(n.requestTitle, 200) || !text(n.description)) throw Error('Invalid publication card.');
    } else if (n.kind !== 'human') throw Error('Unknown card type.');
  }
  for (const e of value.edges) if (!object(e) || !identifier(e.id) || !identifier(e.from) || !identifier(e.to) || !['done', 'approved', 'changes_requested'].includes(String(e.port)) ||
    e.maxReturns !== undefined && (!Number.isInteger(e.maxReturns) || Number(e.maxReturns) < 0 || Number(e.maxReturns) > 100)) throw Error('Invalid connection.');
  return structuredClone(value) as unknown as WorkflowDefinition;
}

export function validateWorkflow(flow: WorkflowDefinition): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const add = (message: string, nodeId?: string, edgeId?: string) => issues.push({ message, ...(nodeId ? { nodeId } : {}), ...(edgeId ? { edgeId } : {}) });
  if (!flow.name.trim()) add('Enter a workflow name.');
  if (!flow.directory.startsWith('/')) add('Choose an absolute working folder.');
  if (!flow.nodes.length) add('Add at least one card.');
  const ids = new Set(flow.nodes.map(n => n.id));
  if (ids.size !== flow.nodes.length || new Set(flow.edges.map(e => e.id)).size !== flow.edges.length) add('Card and connection IDs must be unique.');
  for (const n of flow.nodes) {
    if (!n.title.trim()) add('Enter a card title.', n.id);
    if (n.kind === 'agent') {
      if (!n.task.trim()) add('Enter a task.', n.id);
      if (!n.completion.trim()) add('Describe the completion condition.', n.id);
      if (n.resultKind === 'files' && !n.outputFiles.some(p => p.trim())) add('Specify at least one output file.', n.id);
    }
    if (n.kind === 'publication') {
      if (!flow.branch.trim()) add('Choose the working/source branch.', n.id);
      if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(n.remote)) add('Choose a valid remote.', n.id);
      if (!n.requestTitle.trim()) add('Enter a commit / request title.', n.id);
      if (n.mode === 'request' && !n.targetBranch.trim()) add('Choose the MR/PR target branch.', n.id);
      if (n.mode === 'request' && n.targetBranch === flow.branch) add('Source and target branches must differ.', n.id);
    }
    const outgoing = flow.edges.filter(e => e.from === n.id);
    const normal = outgoing.filter(e => e.port !== 'changes_requested');
    if (normal.length > 1) add('A card can have only one forward connection.', n.id);
    if (outgoing.filter(e => e.port === 'changes_requested').length > 1) add('Choose one review return target.', n.id);
    for (const e of outgoing) if (n.kind === 'agent' && n.resultKind === 'review' ? e.port === 'done' : e.port !== 'done') add('This output is unavailable for the card type.', n.id, e.id);
    if (n.kind === 'agent' && n.resultKind === 'review' && !outgoing.some(e => e.port === 'changes_requested')) add('Connect the review return output and set its limit.', n.id);
  }
  for (const e of flow.edges) if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) add('Connect two different existing cards.', undefined, e.id);
  const forward = flow.edges.filter(e => e.port !== 'changes_requested');
  for (const n of flow.nodes) if (forward.filter(e => e.to === n.id).length > 1) add('Merging independent branches is not supported.', n.id);
  const roots = flow.nodes.filter(n => !forward.some(e => e.to === n.id));
  if (roots.length !== 1) add('The workflow needs exactly one entry card.');
  const ordered: string[] = []; let cursor: string | undefined = roots[0]?.id;
  while (cursor && !ordered.includes(cursor)) { ordered.push(cursor); cursor = forward.find(e => e.from === cursor)?.to; }
  if (cursor) add('Forward connections must not form a cycle.', cursor);
  if (ordered.length !== flow.nodes.length) add('All cards must be connected in one sequence.');
  for (const e of flow.edges.filter(e => e.port === 'changes_requested')) {
    const target = flow.nodes.find(n => n.id === e.to);
    if (target?.kind !== 'agent' || ordered.indexOf(e.to) >= ordered.indexOf(e.from) || !Number.isInteger(e.maxReturns) || e.maxReturns! < 0 || e.maxReturns! > 100) add('Review must return to an earlier agent card, with a limit from 0 to 100.', e.from, e.id);
  }
  return issues;
}

export function workflowOrder(flow: WorkflowDefinition): string[] {
  const edges = flow.edges.filter(e => e.port !== 'changes_requested');
  let id = flow.nodes.find(n => !edges.some(e => e.to === n.id))?.id;
  const result: string[] = [];
  while (id && !result.includes(id)) { result.push(id); id = edges.find(e => e.from === id)?.to; }
  return result;
}

export function parseReview(raw: string): ReviewResult {
  let value: unknown;
  try { value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '')); } catch { throw Error('Review did not return valid JSON.'); }
  if (!object(value) || !['approved', 'changes_requested', 'needs_input'].includes(String(value.verdict)) || !text(value.summary) || !value.summary.trim() ||
    !Array.isArray(value.findings) || !value.findings.every(f => object(f) && text(f.id, 100) && f.id.trim() && text(f.message) && f.message.trim()) ||
    new Set(value.findings.map(f => f.id)).size !== value.findings.length ||
    value.verdict === 'approved' && value.findings.length !== 0 || value.verdict === 'changes_requested' && value.findings.length === 0) throw Error('Review needs a consistent verdict, summary and findings.');
  return value as unknown as ReviewResult;
}

export function newAgentNode(id: string, title = 'Agent', x = 80, y = 100): AgentNode {
  return { id, kind: 'agent', title, x, y, agent: 'codex', model: '', task: '', resultKind: 'text', outputFiles: [], completion: '' };
}
export function workflowTemplate(name: string, directory: string, template: boolean): WorkflowDefinition {
  const flow: WorkflowDefinition = { id: crypto.randomUUID(), name, directory, branch: '', createBranch: false, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  if (!template) return flow;
  flow.nodes = [
    { ...newAgentNode('plan', 'Plan', 60, 100), task: 'Inspect the project and write a concrete implementation plan for the requested change. Ask for missing requirements.', completion: 'A plan with scope, implementation steps and verification.' },
    { ...newAgentNode('build', 'Implement', 380, 100), resultKind: 'code', task: 'Implement the current plan in the working folder. Address the latest review findings. Verify the change. Do not commit or publish.', completion: 'The requested changes exist in the working files and checks are reported.' },
    { ...newAgentNode('review', 'Review', 700, 100), resultKind: 'review', task: 'Review the current files and actual Git diff against the plan. Check correctness and verification. Return a review verdict. Do not edit files.', completion: 'A structured review of the actual current changes.' },
    { id: 'publish', kind: 'publication', title: 'Publish', x: 1020, y: 100, mode: 'request', remote: 'origin', provider: 'auto', targetBranch: '', requestTitle: name, description: '{{results}}' },
    { id: 'human', kind: 'human', title: 'Human review', x: 1340, y: 100 },
  ];
  flow.edges = [
    { id: 'plan-build', from: 'plan', to: 'build', port: 'done' }, { id: 'build-review', from: 'build', to: 'review', port: 'done' },
    { id: 'review-publish', from: 'review', to: 'publish', port: 'approved' }, { id: 'publish-human', from: 'publish', to: 'human', port: 'done' },
    { id: 'review-return', from: 'review', to: 'build', port: 'changes_requested', maxReturns: 3 },
  ];
  return flow;
}
