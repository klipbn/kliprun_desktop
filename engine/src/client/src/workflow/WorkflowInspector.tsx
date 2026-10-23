import { useEffect, useState } from 'react';
import { ExternalLink, FileText, GitBranch, Trash2, X } from 'lucide-react';
import { currentResult, publicationCommitMessage, workflowOrder } from '@shared/workflow';
import type { WorkflowAgent, WorkflowDefinition, WorkflowEdge, WorkflowNode, WorkflowRun } from '@shared/workflow';
import { notifyNativeFileAction } from '../nativeBridge';
import { workflowAPI } from './useWorkflows';
import { statusLabel } from './WorkflowCanvas';
import { AgentResponse } from './AgentResponse';
import { TASK_PRESETS, taskPreset, formatWorkflowTimestamp, type TaskPreset } from '@shared/workflowPresentation';
import { WorkflowPicker } from './WorkflowPicker';

type Props = { flow: WorkflowDefinition; node?: WorkflowNode; edge?: WorkflowEdge; run?: WorkflowRun; locked: boolean; models: Record<WorkflowAgent, string[]>;
  branches?: string[]; remotes?: string[];
  edit: (change: (flow: WorkflowDefinition) => void) => void; onSelect:(id:string)=>void; onClose: () => void; onGit: () => void };
export function WorkflowInspector({ flow, node, edge, run, locked, models, branches = [], remotes = [], edit, onSelect, onClose, onGit }: Props) {
  const [tab, setTab] = useState('settings'), [historyId, setHistoryId] = useState(''), [responses, setResponses] = useState<{messages:string[];truncated:boolean}>({messages:[],truncated:false}), [responseError,setResponseError]=useState('');
  const attempts = run?.attempts.filter(a => a.nodeId === node?.id) ?? [];
  const current = run && node ? currentResult(run, node.id) : undefined;
  const attempt = attempts.find(a => a.id === historyId) ?? current ?? attempts.at(-1);
  useEffect(() => { setHistoryId(''); setTab(locked && node ? node.kind==='agent'?'responses':'result' : 'settings'); }, [node?.id, edge?.id]);
  useEffect(() => {
    setResponses({messages:[],truncated:false}); setResponseError('');
    if (tab !== 'responses' || !attempt || !run || node?.kind !== 'agent') return;
    let live = true;
    const load = () => { void workflowAPI<{ messages: string[]; truncated: boolean }>(`/responses?id=${flow.id}&run=${run.id}&attempt=${attempt.id}`).then(v => { if (live) setResponses(v); }).catch(e => { if (live) setResponseError(e.message); }); };
    load(); const timer = attempt.status==='running'?setInterval(load, 1500):undefined; return () => { live = false; clearInterval(timer); };
  }, [tab, flow.id, run?.id, attempt?.id, attempt?.status]);
  const update = (field: string, value: unknown) => edit(f => { const n = f.nodes.find(n => n.id === node?.id); if (n) Object.assign(n, { [field]: value }); });
  if (!node && !edge) {
    const order=workflowOrder(flow),ids=[...order,...flow.nodes.filter(n=>!order.includes(n.id)).map(n=>n.id)];
    return <aside className="workflow-inspector"><header><h3>Run order</h3><span>{flow.nodes.length} tasks</span></header><div className="workflow-inspector-content">
      <p>Follow the arrows through the workflow. Select a task to view its settings and responses.</p>
      <ol className="workflow-run-order">{ids.map((id,index)=>{const task=flow.nodes.find(n=>n.id===id);if(!task)return null;const status=run?currentResult(run,id)?.status??'pending':'pending';return <li key={id}><button onClick={()=>onSelect(id)}><span>{index+1}</span><strong>{task.title||'Untitled task'}</strong><span className={`workflow-status ${status}`}>{statusLabel(status)}</span></button></li>;})}</ol>
      {!flow.nodes.length&&<p>No tasks yet. Add an agent or a preset to begin.</p>}
    </div></aside>;
  }
  if (edge) return <aside className="workflow-inspector"><header><h3>Connection</h3><button aria-label="Close inspector" onClick={onClose}><X /></button></header>
    <div className="workflow-inspector-content"><p>{flow.nodes.find(n => n.id === edge.from)?.title} → {flow.nodes.find(n => n.id === edge.to)?.title}</p>
      <label>Output<input readOnly value={edge.port === 'changes_requested' ? 'Changes requested' : edge.port === 'approved' ? 'Approved' : 'Done'} /></label>
      {edge.port === 'changes_requested' && <><label>Maximum automatic reworks<input type="number" min={0} max={100} disabled={locked} value={edge.maxReturns ?? 3} onChange={e => edit(f => { f.edges.find(v => v.id === edge.id)!.maxReturns = Math.max(0, Math.min(100, Number(e.target.value))); })} /></label><p>{run?.returns[edge.id] ?? 0}/{edge.maxReturns} returns used. A further negative review stops the workflow.</p></>}
      <button className="danger" disabled={locked} onClick={() => { edit(f => { f.edges = f.edges.filter(e => e.id !== edge.id); }); onClose(); }}><Trash2 />Delete connection</button>
    </div></aside>;
  if (!node) return null;
  return <aside className="workflow-inspector"><header><h3>{node.title || 'Untitled card'}</h3><button aria-label="Close inspector" onClick={onClose}><X /></button></header>
    <nav className="workflow-tabs" aria-label="Task details">{[['settings', 'Settings'], ['input', 'Inputs'], ['result', 'Result'], ['history', 'History'], ['responses', 'Responses']].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    <div className="workflow-inspector-content">
      {tab === 'settings' && <><fieldset disabled={locked}>
        {node.kind==='agent'&&<label>Task preset<WorkflowPicker label="Task preset" value="" disabled={locked}
          options={[{value:'',label:'Choose a preset…'},...TASK_PRESETS.filter(p=>p.kind===node.kind).map(p=>({value:p.id,label:p.label}))]}
          onChange={value=>{if(!value)return;const preset=taskPreset(value as TaskPreset);edit(f=>{const n=f.nodes.find(n=>n.id===node.id)!;Object.assign(n,preset);});}} /><small>Replaces the task text or publication mode. Agent, model and branches stay as selected.</small></label>}
        {node.kind!=='publication'&&<label>Title<input value={node.title} onChange={e => update('title', e.target.value)} /></label>}
        {node.kind === 'agent' ? <>
          <div className="workflow-agent-fields"><label>Agent<WorkflowPicker label="Agent" value={node.agent} disabled={locked}
            options={[{value:'opencode',label:'OpenCode'},{value:'codex',label:'Codex'},{value:'claude',label:'Claude Code'}]}
            onChange={value => { update('agent', value); update('model', ''); }} /></label>
            <label>Model<WorkflowPicker key={`${node.id}:${node.agent}`} label="Model" value={node.model} disabled={locked} allowCustom
              options={[{value:'',label:'Agent default'},...models[node.agent].map(value=>({value,label:value}))]}
              onChange={value => update('model', value)} /></label></div>
          <label>Task<textarea aria-label="Task" rows={8} value={node.task} onChange={e => update('task', e.target.value)} placeholder="Describe what this card must do…" /></label>
          <label>Expected result<WorkflowPicker label="Expected result" value={node.resultKind} disabled={locked}
            options={[{value:'text',label:'Text'},{value:'files',label:'Files'},{value:'code',label:'Code changes'},{value:'review',label:'Review verdict'}]}
            onChange={value => update('resultKind', value)} /></label>
          <label>Output files <small>One path per line, relative to the working folder</small><textarea aria-label="Output files" rows={3} value={node.outputFiles.join('\n')} onChange={e => update('outputFiles', e.target.value.split('\n'))} /></label>
          <label>Completion condition<textarea aria-label="Completion condition" rows={3} value={node.completion} onChange={e => update('completion', e.target.value)} placeholder="What must be ready before moving on?" /></label>
          {node.resultKind === 'review' && <p>A review returns an explicit verdict. Connect Approved to the next step and Changes requested to an earlier agent.</p>}
        </> : node.kind === 'publication' ? <>
          <p>Commit changed files and push the workflow branch.</p>
          <label>Branch<WorkflowPicker label="Branch" value={flow.branch} disabled={locked} allowCustom customValueName="branch"
            options={[{value:'',label:'Choose a branch…'},...branches.map(value=>({value,label:value}))]}
            onChange={value=>edit(f=>{f.branch=value;})} />
            <small>Used by all tasks. A missing local branch is created from the current HEAD at Start.</small></label>
          <p className="workflow-publication-destination">Push to <strong>{node.remote}/{flow.branch||'choose a branch'}</strong>. Create the MR/PR yourself after the push.</p>
          <details className="workflow-publish-options"><summary>Options · {node.remote}</summary>
            <label>Remote<WorkflowPicker label="Remote" value={node.remote} disabled={locked}
              options={[...new Set([node.remote,...remotes])].filter(Boolean).map(value=>({value,label:value}))}
              onChange={value=>update('remote',value)} /></label>
            <label>Commit message (optional)<input aria-label="Commit message (optional)" maxLength={200} value={node.requestTitle}
              placeholder={publicationCommitMessage(flow,{...node,requestTitle:''})} onChange={e=>update('requestTitle',e.target.value)} /></label>
            <label>Card title<input value={node.title} onChange={e=>update('title',e.target.value)} /></label>
          </details>
        </> : <p>Review the pushed branch and create the MR/PR in your Git hosting service. Accept completes this run locally.</p>}
      </fieldset>
      {locked && <p className="workflow-notice">Execution settings are fixed for this run. Card positions can still be changed.</p>}
      <button className="danger" disabled={locked} onClick={() => { edit(f => { f.nodes = f.nodes.filter(n => n.id !== node.id); f.edges = f.edges.filter(e => e.from !== node.id && e.to !== node.id); }); onClose(); }}><Trash2 />Delete card</button></>}
      {tab === 'input' && <><h4>Input to this attempt</h4><pre>{attempt?.input || (node.kind === 'agent' ? 'The card receives its task, current earlier results, file paths, working folder, branch and latest feedback when it starts.' : 'This service card uses the current run results.')}</pre></>}
      {tab === 'result' && <>
        <div className="workflow-result-heading"><span className={`workflow-status ${attempt?.status ?? 'pending'}`}>{statusLabel(attempt?.status ?? 'pending')}</span><span>Attempt {attempt?.number ?? 0}</span></div>
        {attempt && current?.id !== attempt.id && <p className="workflow-notice">Historical attempt — this result is no longer current.</p>}
        {attempt?.error && <p role="alert" className="workflow-error">{attempt.error}</p>}
        {attempt?.result ? <><AgentResponse text={attempt.result.text} review={attempt.result.review} />
          {attempt.result.files.map(path => <button key={path} onClick={() => notifyNativeFileAction('open', path)}><FileText />{path}</button>)}
          {attempt.result.publication?.url && <a className="workflow-link" href={attempt.result.publication.url} target="_blank" rel="noreferrer"><ExternalLink />Open MR/PR</a>}
        </> : <p>{node.kind === 'human' ? 'Review the current results and changes, then accept or return to an agent with a comment.' : 'No result yet. A completed process alone does not complete a card.'}</p>}
        {run?.workspace.root && <button onClick={onGit}><GitBranch />Open changes in Git</button>}

      </>}
      {tab === 'history' && <><h4>All attempts in this run</h4>{attempts.length ? [...attempts].reverse().map(a => <button className="workflow-history-row" key={a.id} onClick={() => { setHistoryId(a.id); setTab('result'); }}><span>Attempt {a.number} · {statusLabel(a.status)}</span><small title={new Date(a.startedAt).toLocaleString()}>{formatWorkflowTimestamp(a.startedAt)}{a.id === current?.id ? ' · Current' : ' · History'}</small></button>) : <p>No attempts yet.</p>}</>}
      {tab === 'responses' && <>
        <div className="workflow-result-heading"><span>{node.kind==='agent'?'Agent responses':'Service task'}</span><span>Attempt {attempt?.number??0}</span></div>
        {responseError&&<p role="alert" className="workflow-error">{responseError}</p>}
        {responses.truncated&&<small>Showing the most recent responses. The final result is available in Result.</small>}
        {responses.messages.map((text,index)=><article className="workflow-response" key={index}><AgentResponse text={text} /></article>)}
        {!responses.messages.length&&<p>{attempt?.status==='running'?'The agent is working. Its text responses will appear here.':node.kind==='agent'?'No agent responses for this attempt.':'This task runs without an agent. Its outcome is in Result.'}</p>}
      </>}
    </div>
  </aside>;
}
