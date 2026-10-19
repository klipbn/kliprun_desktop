import { useEffect, useRef, useState } from 'react';
import { GitBranch, Hand, Maximize2, Minus, Plus, UserRound, Workflow as WorkflowIcon, AlignHorizontalDistributeCenter } from 'lucide-react';
import { currentResult } from '@shared/workflow';
import type { WorkflowDefinition, WorkflowEdge, WorkflowIssue, WorkflowRun } from '@shared/workflow';
import { taskElapsed, formatWorkflowDuration } from '@shared/workflowPresentation';
import { HarnessIcon } from '../components/HarnessIcon';
import { connectionPath, fitWorkflow, autoLayoutWorkflow } from './geometry';

export const statusLabel = (value: string) => ({ pending: 'Pending', running: 'Running', done: 'Done', needs_input: 'Needs input', failed: 'Failed', human_review: 'Human review', interrupted: 'Interrupted', needs_attention: 'Needs attention', paused: 'Paused', stopped: 'Stopped', completed: 'Completed' }[value] ?? value);
export const resultLabel = (value: string) => ({ text: 'Text', files: 'Files', code: 'Code changes', review: 'Review verdict' }[value] ?? value);
interface Props {
  flow: WorkflowDefinition; run?: WorkflowRun; runs:WorkflowRun[]; now:number; locked: boolean; historical?:boolean; issues: WorkflowIssue[]; selected: string; edgeId: string;
  onSelect: (id: string) => void; onEdge: (id: string) => void; edit: (change: (flow: WorkflowDefinition) => void) => void;
}
export function WorkflowCanvas({ flow, run, runs, now, locked, historical, issues, selected, edgeId, onSelect, onEdge, edit }: Props) {
  const surface = useRef<HTMLDivElement>(null), drag = useRef<{ id?: string; x: number; y: number; fromX: number; fromY: number } | null>(null);
  const [connecting, setConnecting] = useState<{ from: string; port: WorkflowEdge['port'] } | null>(null);
  useEffect(() => { const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') setConnecting(null); }; window.addEventListener('keydown', cancel); return () => window.removeEventListener('keydown', cancel); }, []);
  const zoom = (factor: number) => edit(f => {
    const rect = surface.current?.getBoundingClientRect(); const cx = (rect?.width ?? 600) / 2, cy = (rect?.height ?? 400) / 2;
    const next = Math.max(.2, Math.min(2, f.viewport.zoom * factor)), ratio = next / f.viewport.zoom;
    f.viewport = { x: cx - (cx - f.viewport.x) * ratio, y: cy - (cy - f.viewport.y) * ratio, zoom: next };
  });
  const connect = (to: string) => {
    if (!connecting || locked || connecting.from === to) return;
    edit(f => { f.edges = f.edges.filter(e => !(e.from === connecting.from && e.port === connecting.port)); f.edges.push({ id: crypto.randomUUID(), ...connecting, to, ...(connecting.port === 'changes_requested' ? { maxReturns: 3 } : {}) }); });
    setConnecting(null);
  };
  return <div className="workflow-canvas-wrap">
    <div className="workflow-canvas" ref={surface} data-testid="workflow-canvas" onWheel={e => {
      if (e.ctrlKey || e.metaKey) zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08);
      else edit(f => { f.viewport.x -= e.deltaX; f.viewport.y -= e.deltaY; });
    }} onPointerDown={e => {
      if (e.target !== e.currentTarget && !(e.target instanceof SVGElement && e.target.tagName === 'svg')) return;
      if (e.button !== 0) return; setConnecting(null);
      drag.current = { x: e.clientX, y: e.clientY, fromX: flow.viewport.x, fromY: flow.viewport.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={e => {
      const value = drag.current; if (!value) return;
      const dx = e.clientX - value.x, dy = e.clientY - value.y;
      edit(f => { if (value.id) { const n = f.nodes.find(n => n.id === value.id)!; n.x = value.fromX + dx / f.viewport.zoom; n.y = value.fromY + dy / f.viewport.zoom; }
        else { f.viewport.x = value.fromX + dx; f.viewport.y = value.fromY + dy; } });
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="workflow-world" style={{ transform: `translate(${flow.viewport.x}px, ${flow.viewport.y}px) scale(${flow.viewport.zoom})` }}>
        <svg className="workflow-edges" aria-label="Connections">
          <defs><marker id="workflow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
          {flow.edges.map(edge => {
            const from = flow.nodes.find(n => n.id === edge.from), to = flow.nodes.find(n => n.id === edge.to); if (!from || !to) return null;
            const back = edge.port === 'changes_requested', geometry = connectionPath(from, to, back);
            return <g key={edge.id} className={`workflow-edge ${back ? 'return' : ''} ${edgeId === edge.id ? 'selected' : ''} ${issues.some(i => i.edgeId === edge.id) ? 'invalid' : ''}`}>
              <path d={geometry.path} className="edge-hit" onClick={() => { onEdge(edge.id); onSelect(''); }} />
              <path d={geometry.path} markerEnd="url(#workflow-arrow)" className="edge-line" />
              <text x={geometry.x} y={geometry.y} textAnchor="middle" onClick={() => { onEdge(edge.id); onSelect(''); }}>{back ? `Rework ${run?.returns[edge.id] ?? 0}/${edge.maxReturns ?? 0}` : edge.port === 'approved' ? 'Approved' : 'Done'}</text>
            </g>;
          })}
        </svg>
        {flow.nodes.map(node => {
          const attempt = run ? currentResult(run, node.id) : undefined, status = attempt?.status ?? 'pending';
          const review = node.kind === 'agent' && node.resultKind === 'review', back = flow.edges.find(e => e.from === node.id && e.port === 'changes_requested');
          return <article key={node.id} className={`workflow-card ${selected === node.id ? 'selected' : ''} ${issues.some(i => i.nodeId === node.id) ? 'invalid' : ''} status-${status}`} style={{ left: node.x, top: node.y }} data-testid={`workflow-card-${node.id}`}>
            <button className="workflow-input-port" aria-label={`Connect to ${node.title}`} title="Connect an output to this card" disabled={locked} onClick={() => connect(node.id)} />
            <button className="workflow-card-title" onClick={() => { onSelect(node.id); onEdge(''); }} onPointerDown={e => {
              if (e.button !== 0) return;
              onSelect(node.id); onEdge(''); drag.current = { id: node.id, x: e.clientX, y: e.clientY, fromX: node.x, fromY: node.y };
              surface.current?.setPointerCapture(e.pointerId);
            }}>{node.kind === 'agent' ? <HarnessIcon source={node.agent} /> : node.kind === 'publication' ? <GitBranch /> : <UserRound />}<strong>{node.title || 'Untitled card'}</strong></button>
            <button className="workflow-card-body" onClick={() => { if (connecting) connect(node.id); else { onSelect(node.id); onEdge(''); } }}>
              <span>{node.kind === 'agent' ? `${node.agent === 'claude' ? 'Claude Code' : node.agent === 'codex' ? 'Codex' : 'OpenCode'} · ${node.model || 'Agent default'}` : node.kind === 'publication' ? node.mode === 'push' ? 'Commit & Push' : 'Create / Update MR or PR' : 'Waiting for your decision'}</span>
              <span className="workflow-card-result">{node.kind === 'agent' ? resultLabel(node.resultKind) : node.kind === 'publication' ? node.remote : 'Manual checkpoint'}{review && back ? ` · ${run?.returns[back.id] ?? 0}/${back.maxReturns} reworks` : ''}</span>
              <span className="workflow-card-footer"><span className={`workflow-status ${status}`}>{statusLabel(status)}</span><span>#{attempt?.number ?? 0} · <span title="Total execution time across all attempts and runs (HH:MM:SS)">{formatWorkflowDuration(taskElapsed(runs,node.id,now))} total</span></span></span>
            </button>
            <button className={`workflow-output-port ${connecting?.from === node.id && connecting.port !== 'changes_requested' ? 'connecting' : ''}`} disabled={locked} title={review ? 'Approved: connect to next card' : 'Done: connect to next card'} aria-label={`${node.title}: ${review ? 'Approved' : 'Done'} output`} onClick={() => setConnecting({ from: node.id, port: review ? 'approved' : 'done' })} />
            {review && <button className="workflow-output-port return" disabled={locked} title="Changes requested: return to an earlier agent" aria-label={`${node.title}: Changes requested output`} onClick={() => setConnecting({ from: node.id, port: 'changes_requested' })} />}
          </article>;
        })}
      </div>
      {!flow.nodes.length && <div className="workflow-canvas-empty"><WorkflowIcon /><h2>Build your workflow</h2><p>Add an agent card, write its task and connect its output to the next card.</p></div>}
    </div>
    <div className="workflow-canvas-tools"><span><Hand size={14} />{connecting ? 'Choose an input dot or card to connect · Esc to cancel' : 'Drag cards or canvas · Scroll to pan'}</span>
      {connecting && <button onClick={() => setConnecting(null)}>Cancel connection</button>}
      <button aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}><Minus /></button><span>{Math.round(flow.viewport.zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => zoom(1.2)}><Plus /></button>
      <button onClick={() => edit(f => { f.viewport = fitWorkflow(f.nodes, surface.current?.clientWidth ?? 800, surface.current?.clientHeight ?? 500); })}><Maximize2 />Fit view</button>
      <button disabled={historical||!flow.nodes.length} onClick={()=>edit(f=>autoLayoutWorkflow(f,surface.current?.clientWidth??800,surface.current?.clientHeight??500))}><AlignHorizontalDistributeCenter/>Auto layout</button>
    </div>
  </div>;
}
