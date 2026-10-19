import type { WorkflowDefinition, WorkflowNode } from '@shared/workflow';
import { workflowOrder } from '@shared/workflow';
export const CARD_WIDTH = 250, CARD_HEIGHT = 150;
export function autoLayoutWorkflow(flow:WorkflowDefinition,width:number,height:number) {
  const order=workflowOrder(flow);
  for(const node of flow.nodes)if(!order.includes(node.id))order.push(node.id);
  for(const node of flow.nodes){node.x=60+order.indexOf(node.id)*320;node.y=100;}
  flow.viewport=fitWorkflow(flow.nodes,width,height);
}
export function fitWorkflow(nodes: WorkflowNode[], width: number, height: number): WorkflowDefinition['viewport'] {
  if (!nodes.length) return { x: 40, y: 40, zoom: 1 };
  const left = Math.min(...nodes.map(n => n.x)), top = Math.min(...nodes.map(n => n.y));
  const right = Math.max(...nodes.map(n => n.x + CARD_WIDTH)), bottom = Math.max(...nodes.map(n => n.y + CARD_HEIGHT));
  const zoom = Math.max(.2, Math.min(1, (width - 32) / (right - left), (height - 80) / (bottom - top)));
  return { x: (width - (right - left) * zoom) / 2 - left * zoom, y: (height - (bottom - top) * zoom) / 2 - top * zoom, zoom };
}
export function connectionPath(from: WorkflowNode, to: WorkflowNode, back: boolean) {
  const x1 = from.x + CARD_WIDTH, y1 = from.y + (back ? 122 : 72), x2 = to.x, y2 = to.y + 72;
  if (back) {
    const bottom = Math.max(from.y, to.y) + CARD_HEIGHT + 85;
    return { path: `M ${x1} ${y1} C ${x1 + 85} ${y1}, ${x1 + 85} ${bottom}, ${x1} ${bottom} L ${x2} ${bottom} C ${x2 - 85} ${bottom}, ${x2 - 85} ${y2}, ${x2} ${y2}`, x: (x1 + x2) / 2, y: bottom - 10 };
  }
  const distance = Math.max(70, Math.abs(x2 - x1) * .5);
  return { path: `M ${x1} ${y1} C ${x1 + distance} ${y1}, ${x2 - distance} ${y2}, ${x2} ${y2}`, x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 12 };
}
