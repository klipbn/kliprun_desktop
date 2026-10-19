import { expect, test } from 'bun:test';
import { fitWorkflow, connectionPath, autoLayoutWorkflow } from '../workflow/geometry';
import { newAgentNode, workflowTemplate } from '../../../shared/workflow';

test('fit keeps distant cards visible in both normal and narrow canvases', () => {
  const nodes = [newAgentNode('a', 'Plan', -200, 80), newAgentNode('b', 'Build', 700, 300)];
  for (const width of [1000, 340]) {
    const view = fitWorkflow(nodes, width, 450);
    for (const node of nodes) {
      expect(node.x * view.zoom + view.x).toBeGreaterThanOrEqual(15);
      expect((node.x + 250) * view.zoom + view.x).toBeLessThanOrEqual(width - 15);
      expect((node.y + 150) * view.zoom + view.y).toBeLessThanOrEqual(435);
    }
  }
});
test('review returns have a distinct path and finite endpoints', () => {
  const from = newAgentNode('review', 'Review', 700, 100), to = newAgentNode('build', 'Build', 380, 100);
  expect(connectionPath(from, to, true).path).not.toBe(connectionPath(from, to, false).path);
  expect(connectionPath(from, to, true).path).not.toMatch(/NaN|Infinity/);
});
test('auto layout follows forward arrows while preserving task settings and array order',()=>{
  const flow=workflowTemplate('Demo','/tmp/demo',true);
  flow.nodes.reverse();flow.nodes.forEach(n=>{n.x=0;n.y=0;});
  const ids=flow.nodes.map(n=>n.id),tasks=flow.nodes.filter(n=>n.kind==='agent').map(n=>n.task);
  autoLayoutWorkflow(flow,1000,600);
  expect(flow.nodes.map(n=>n.id)).toEqual(ids);
  expect(flow.nodes.filter(n=>n.kind==='agent').map(n=>n.task)).toEqual(tasks);
  expect(flow.nodes.find(n=>n.id==='plan')!.x).toBeLessThan(flow.nodes.find(n=>n.id==='build')!.x);
  expect(flow.nodes.find(n=>n.id==='build')!.x).toBeLessThan(flow.nodes.find(n=>n.id==='review')!.x);
  expect(flow.edges.find(e=>e.port==='changes_requested')?.to).toBe('build');
});
