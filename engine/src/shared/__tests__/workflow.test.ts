import { describe, expect, test } from 'bun:test';
import { workflowTemplate, validateWorkflow, parseReview, parseWorkflow } from '../workflow';

describe('workflow graph', () => {
  test('card and edge IDs cannot alias object prototype properties', () => {
    for (const id of ['__proto__', 'constructor', 'prototype']) {
      const flow = workflowTemplate('Example', '/tmp/example', true); flow.nodes[0].id = id;
      expect(() => parseWorkflow(flow)).toThrow();
    }
  });
  test('the editable template is one chain with a bounded review return', () => {
    const flow = workflowTemplate('Example', '/tmp/example', true);
    flow.branch = 'feature/example';
    const publication = flow.nodes.find(n => n.kind === 'publication')!;
    if (publication.kind === 'publication') publication.targetBranch = 'develop';
    expect(validateWorkflow(flow)).toEqual([]);
    flow.edges.push({ id: 'fork', from: 'plan', to: 'review', port: 'done' });
    expect(validateWorkflow(flow).some(e => e.nodeId === 'plan')).toBe(true);
  });
  test('rejects disconnected cards, ordinary cycles and non-agent return targets', () => {
    const flow = workflowTemplate('Example', '/tmp/example', true);
    flow.branch = 'feature/example';
    flow.nodes = flow.nodes.filter(n => n.kind !== 'publication');
    flow.edges = flow.edges.filter(e => e.from !== 'publish' && e.to !== 'publish');
    expect(validateWorkflow(flow).some(e => /entry|connected/i.test(e.message))).toBe(true);
    flow.edges.push({ id: 'next', from: 'review', to: 'human', port: 'approved' });
    expect(validateWorkflow(flow)).toEqual([]);
    flow.edges.find(e => e.port === 'changes_requested')!.to = 'human';
    expect(validateWorkflow(flow).some(e => e.edgeId === 'review-return')).toBe(true);
    flow.edges.push({ id: 'cycle', from: 'human', to: 'plan', port: 'done' });
    expect(validateWorkflow(flow).length).toBeGreaterThan(0);
  });
  test('source and target branches are independent and push does not need a target', () => {
    const flow = workflowTemplate('Example', '/tmp/example', true);
    flow.branch = 'feature/example';
    const node = flow.nodes.find(n => n.kind === 'publication')!;
    if (node.kind !== 'publication') throw Error('fixture');
    node.mode = 'push'; node.targetBranch = '';
    expect(validateWorkflow(flow)).toEqual([]);
    node.mode = 'request';
    expect(validateWorkflow(flow).some(e => /target branch/i.test(e.message))).toBe(true);
  });
});

test('review requires an explicit, consistent verdict', () => {
  expect(parseReview('{"verdict":"approved","summary":"Checked","findings":[]}').verdict).toBe('approved');
  for (const text of ['', 'Looks good', '{}', '{"verdict":"approved","summary":"fix it","findings":[{"id":"R1","message":"bug"}]}', '{"verdict":"changes_requested","summary":"bad","findings":[]}']) {
    expect(() => parseReview(text)).toThrow();
  }
  expect(parseReview('{"verdict":"needs_input","summary":"Which API?","findings":[]}').verdict).toBe('needs_input');
});
