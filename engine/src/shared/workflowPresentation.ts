import type { WorkflowDocument, WorkflowRun } from './workflow';

export interface WorkflowRunChoice { workflowId: string; runId: string }
export type WorkflowManagementAction = 'rename' | 'hide' | 'show' | 'delete';
export function workflowRunSelection(doc: WorkflowDocument | undefined, choice: WorkflowRunChoice | null) {
  const runs = doc?.runs.filter(run => run.workflowId === doc.definition.id) ?? [];
  const active = runs.find(run => run.status !== 'completed' && run.status !== 'stopped');
  const requested = choice?.workflowId === doc?.definition.id ? runs.find(run => run.id === choice?.runId) : undefined;
  return { runs, active, run: requested ?? active ?? runs[0], runId: requested?.id ?? '', historical: !!requested && requested.id !== active?.id };
}
export function formatWorkflowDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(ms) ? ms / 1000 : 0));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
}
const timestamp = new Intl.DateTimeFormat(undefined, { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
export function formatWorkflowTimestamp(at: number | null): string { return at !== null && Number.isFinite(at) && !Number.isNaN(new Date(at).getTime()) ? timestamp.format(new Date(at)) : '—'; }

export function taskElapsed(runs: WorkflowRun[], nodeId: string, now: number): number {
  return runs.reduce((total, run) => {
    if (run.snapshot.nodes.find(n => n.id === nodeId)?.kind === 'human') return total;
    return total + run.attempts.filter(a => a.nodeId === nodeId).reduce((sum, a) => {
      const end = a.finishedAt ?? (run.status === 'running' && a.status === 'running' ? now : a.lastActivityAt ?? a.startedAt);
      return sum + Math.max(0, end - a.startedAt);
    }, 0);
  }, 0);
}
export interface WorkflowSummary { id: string; name: string; date: number | null; status: WorkflowRun['status'] | 'never_run'; runCount: number; hidden: boolean; active: boolean; revision: number }
export function workflowSummary(doc: WorkflowDocument): WorkflowSummary {
  const latest = doc.runs[0];
  return { id: doc.definition.id, name: doc.definition.name, date: latest?.startedAt ?? doc.createdAt ?? null, status: latest?.status ?? 'never_run', runCount: doc.runs.length, hidden: doc.hidden === true, active: doc.runs.some(r => !['completed','stopped'].includes(r.status)), revision: doc.revision };
}
export const TASK_PRESETS = [
  { id: 'review-code', label: 'Review code', kind: 'agent' },
  { id: 'review-text', label: 'Review text', kind: 'agent' },
  { id: 'review-files', label: 'Review files / data', kind: 'agent' },
  { id: 'git-push', label: 'Commit & Push', kind: 'publication' },
  { id: 'git-request', label: 'Create / Update MR or PR', kind: 'publication' },
] as const;
export type TaskPreset = typeof TASK_PRESETS[number]['id'];
export function taskPreset(id: TaskPreset): {
  title?: string; task?: string; resultKind?: 'review'; completion?: string; mode?: 'push' | 'request'; description?: string;
} {
  const contract = 'Do not edit files, commit or publish. Distinguish blocking findings from optional suggestions. Return approved only when the requested result is ready; changes_requested with concrete findings otherwise; needs_input when requirements or evidence are missing.';
  switch (id) {
    case 'review-code': return { title:'Review code', resultKind:'review', task:`Review the actual current files and Git diff against the original task and latest plan. Include committed changes since the run base. Check correctness, edge cases, compatibility, error handling, security boundaries and focused test evidence. Verify previous findings were addressed; cite file paths and specific fixes. ${contract}`, completion:'A structured verdict based on the current code and verification evidence, with actionable blocking findings.' };
    case 'review-text': return { title:'Review text', resultKind:'review', task:`Review the latest draft against the original brief, intended audience and required format. Check factual consistency, unsupported claims, missing requirements, structure, clarity and terminology. Preserve the author’s intent. Cite specific passages and explain corrections; avoid cosmetic rewrites that do not improve the requested outcome. ${contract}`, completion:'A structured verdict on the actual draft, with specific corrections and no unsupported factual approval.' };
    case 'review-files': return { title:'Review files / data', resultKind:'review', task:`Locate and open the declared output files. Check their existence, readability, expected format, completeness and consistency with the original task. For data, check schema, missing/duplicate values, units, totals and reproducibility of calculations; for documents, check required sections and internal references. Cite file paths and observed evidence. ${contract}`, completion:'A structured verdict supported by inspection of the real output files and relevant validation.' };
    case 'git-push': return { title:'Commit & Push', mode:'push' };
    case 'git-request': return { title:'Publish for review', mode:'request', description:'## Outcome and verification\n{{results}}\n\n## Review\nReview the changes and verification above. Merge is handled manually.' };
  }
}

export interface WorkflowAgentActivity {
  workflowId: string; workflowName: string; runId: string; attemptId: string; nodeId: string; title: string;
  agent: string; model: string; startedAt: number; lastActivityAt?: number; pid?: number; sessionId?: string;
  status: 'running' | 'interrupted';
}
export interface WorkflowNotice { id: string; workflowId: string; runId: string; name: string; status: string; revision: number; nodeId?: string }
export interface WorkflowUI { workflowId?: string; nodeId?: string; sidebarHidden?: boolean; sidebarWidth?: number; inspectorWidth?: number }
