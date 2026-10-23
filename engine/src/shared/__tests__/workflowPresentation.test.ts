import { expect, test } from 'bun:test';
import { workflowTemplate, type WorkflowDocument, type WorkflowRun } from '../workflow';
import { taskElapsed, workflowSummary, taskPreset, TASK_PRESETS, workflowRunSelection, formatWorkflowDuration, formatWorkflowTimestamp } from '../workflowPresentation';

test('task duration sums attempts and runs without counting pauses or human waiting', () => {
  const flow = workflowTemplate('Example', '/tmp/example', true);
  const run = (status: string, attempts: unknown[]) => ({ status, snapshot: flow, attempts }) as WorkflowRun;
  const runs = [run('completed', [{nodeId:'build',status:'done',startedAt:1000,finishedAt:4000}]),
    run('paused', [{nodeId:'build',status:'interrupted',startedAt:5000,finishedAt:7000}]),
    run('running', [{nodeId:'build',status:'running',startedAt:9000}])];
  expect(taskElapsed(runs, 'build', 12000)).toBe(8000);
  expect(taskElapsed([run('human_review', [{nodeId:'human',status:'human_review',startedAt:1000}])], 'human', 12000)).toBe(0);
  expect(taskElapsed([run('interrupted', [{nodeId:'build',status:'interrupted',startedAt:1000,lastActivityAt:2000}])], 'build', 12000)).toBe(1000);
});
test('workflow list distinguishes never run from a dated completed run without copying history', () => {
  const doc: WorkflowDocument = { definition: workflowTemplate('Notes', '/tmp/notes', false), revision: 1, createdAt: 1000, runs: [] };
  expect(workflowSummary(doc)).toMatchObject({ name:'Notes',date:1000,status:'never_run',runCount:0 });
  doc.runs.push({status:'completed',startedAt:5000} as WorkflowRun);
  expect(workflowSummary(doc)).toMatchObject({date:5000,status:'completed',runCount:1});
  expect(workflowSummary(doc)).not.toHaveProperty('runs');
});
test('review presets check task-specific evidence while Git presets never guess a target branch', () => {
  expect(taskPreset('review-code')).toMatchObject({resultKind:'review'});
  expect(taskPreset('review-code').task).toContain('diff');
  expect(taskPreset('review-text').task).toContain('unsupported claims');
  expect(taskPreset('review-files').task).toContain('open');
  expect(taskPreset('git-push')).toMatchObject({mode:'push'});
  expect(taskPreset('git-request')).toMatchObject({mode:'push'});
  expect(TASK_PRESETS.filter(p=>p.kind==='publication').map(p=>p.id)).toEqual(['git-push']);
  expect(taskPreset('git-request')).not.toHaveProperty('targetBranch');
  expect(taskPreset('review-code')).not.toHaveProperty('agent');
});

test('run history ignores a run selected in another workflow and never falls back to an unrelated snapshot', () => {
  const doc: WorkflowDocument = {definition:{...workflowTemplate('B','/tmp/b',false),id:'b'},revision:1,runs:[]};
  const latest={id:'run-b',workflowId:'b',status:'completed'} as WorkflowRun;
  doc.runs=[latest,{id:'foreign',workflowId:'a',status:'completed'} as WorkflowRun];
  expect(workflowRunSelection(doc,{workflowId:'a',runId:'foreign'})).toMatchObject({run:latest,historical:false,runId:''});
  expect(workflowRunSelection(doc,{workflowId:'b',runId:'foreign'})).toMatchObject({run:latest,historical:false,runId:''});
  expect(workflowRunSelection(doc,{workflowId:'b',runId:'run-b'})).toMatchObject({run:latest,historical:true,runId:'run-b'});
  expect(workflowRunSelection(doc,null).runs.map(r=>r.id)).toEqual(['run-b']);
});
test('workflow times show hours and minutes and duration retains seconds beyond an hour', () => {
  expect(formatWorkflowDuration(3661000)).toBe('01:01:01');
  expect(formatWorkflowDuration(90061000)).toBe('25:01:01');
  expect(formatWorkflowDuration(-1000)).toBe('00:00:00');
  expect(formatWorkflowTimestamp(new Date(2026,9,19,9,7,30).getTime())).toContain('09:07');
  expect(formatWorkflowTimestamp(null)).toBe('—');
});
