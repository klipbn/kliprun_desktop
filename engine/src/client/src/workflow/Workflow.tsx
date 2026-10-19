import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { ExternalLink, FolderOpen, GitBranch, Pause, Play, Plus, Save, Square, Trash2, PanelLeftClose, PanelLeftOpen, Activity, Workflow as WorkflowIcon, X } from 'lucide-react';
import { currentResult, newAgentNode, validateWorkflow, workflowOrder, workflowTemplate } from '@shared/workflow';
import type { WorkflowAgent, WorkflowDefinition, WorkflowNode } from '@shared/workflow';
import type { GitStatus } from '@shared/git';
import { hasDesktopBridge, notifyNativeSelection, notifyWorkflowAction, saveGitRepository } from '../nativeBridge';
import { WorkflowCanvas, statusLabel } from './WorkflowCanvas';
import { WorkflowInspector } from './WorkflowInspector';
import { useWorkflows, workflowAPI } from './useWorkflows';
import './workflow.css';
import { WorkflowSidebar, WorkflowPaneResizer, WorkflowAgents } from './WorkflowSidebar';
import { TASK_PRESETS, taskPreset, workflowRunSelection, formatWorkflowTimestamp, type TaskPreset, type WorkflowRunChoice, type WorkflowManagementAction, type WorkflowSummary } from '@shared/workflowPresentation';
import { useNow } from '../hooks/useBoard';

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="workflow-dialog" onCancel={e => { e.preventDefault(); onClose(); }}><header><h2>{title}</h2><button aria-label="Close dialog" onClick={onClose}><X /></button></header>{children}</dialog>;
}
export default function Workflow({ directories, onGit }: { directories: string[]; onGit: () => void }) {
  const state = useWorkflows();
  const now=useNow(), container=useRef<HTMLDivElement>(null);
  const [availableWidth,setAvailableWidth]=useState(1400),[sidebarWidth,setSidebarWidth]=useState(220),[inspectorWidth,setInspectorWidth]=useState(345),[showAgents,setShowAgents]=useState(true);
  useEffect(()=>{const element=container.current;if(!element)return;const observer=new ResizeObserver(()=>setAvailableWidth(element.clientWidth));observer.observe(element);setAvailableWidth(element.clientWidth);return()=>observer.disconnect();},[]);
  useEffect(()=>{setSidebarWidth(state.layout.sidebarWidth??220);setInspectorWidth(state.layout.inspectorWidth??345);},[state.layout.sidebarWidth,state.layout.inspectorWidth]);
  const narrow=availableWidth<900, sidebarMax=Math.min(420,narrow?availableWidth-40:Math.max(160,availableWidth-550));
  const leftWidth=Math.min(sidebarWidth,sidebarMax),rightMax=Math.min(800,Math.max(260,availableWidth-((state.layout.sidebarHidden||narrow)?0:leftWidth)-286));
  const rightWidth=Math.min(inspectorWidth,rightMax);
  const [edgeId, setEdgeId] = useState(''), [busy, setBusy] = useState(false), [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState(''), [newFolder, setNewFolder] = useState(''), [template, setTemplate] = useState(true);
  const [workspace, setWorkspace] = useState<{ directory: string; git: GitStatus | null } | null>(null);
  const [workspaceError, setWorkspaceError] = useState('');
  const [models, setModels] = useState<Record<WorkflowAgent, string[]>>({ codex: [], opencode: [], claude: [] });
  const [startOpen, setStartOpen] = useState(false), [authorized, setAuthorized] = useState(false);
  const [input, setInput] = useState(''), [returnTarget, setReturnTarget] = useState(''), [historyChoice, setHistoryChoice] = useState<WorkflowRunChoice|null>(null);
  const setHistoryRun=(runId:string)=>setHistoryChoice(runId?{workflowId:state.selected,runId}:null);
  const [management,setManagement]=useState<{item:WorkflowSummary;action:'rename'|'delete'}|null>(null),[rename,setRename]=useState('');
  const handledNotice=useRef<object|null>(null);
  useEffect(()=>{setHistoryRun('');setEdgeId('');setReturnTarget('');setInput('');},[state.selected]);
  useEffect(()=>{const notice=state.notificationTarget;if(notice&&notice!==handledNotice.current&&notice.workflowId===state.selected){handledNotice.current=notice;setHistoryRun(notice.runId??'');setEdgeId('');}},[state.notificationTarget,state.selected]);
  const doc = state.documents.find(d => d.definition.id === state.selected);
  const {runs,active,run,historical,runId:historyRun}=workflowRunSelection(doc,historyChoice);
  const flow = historical ? run?.snapshot : state.draft;
  const locked = !!active || busy || state.managing || historical;
  const issues = flow ? validateWorkflow(flow) : [];
  const folder = newOpen ? newFolder : state.draft?.directory;
  useEffect(() => {
    void workflowAPI<{ models: Record<WorkflowAgent, string[]> }>('/models').then(v => setModels(v.models)).catch(e => state.setError(e.message));
  }, []);
  useEffect(() => {
    let live = true; setWorkspace(null); setWorkspaceError('');
    if (!folder) return;
    const timer = setTimeout(() => { void workflowAPI<{ directory: string; git: GitStatus | null }>(`/workspace?directory=${encodeURIComponent(folder)}`).then(v => { if (live) setWorkspace(v); }).catch(e => { if (live) setWorkspaceError(e.message); }); }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [folder, newOpen]);
  useEffect(() => {
    const listener = (event: Event) => setNewFolder((event as CustomEvent<string>).detail);
    window.addEventListener('kliprun:workflow-directory', listener); return () => window.removeEventListener('kliprun:workflow-directory', listener);
  }, []);
  const handle = (operation: () => Promise<unknown>) => { void operation().catch(e => state.setError(e.message)); };
  const requestManagement=(id:string,action:WorkflowManagementAction)=>{
    const item=state.summaries.find(w=>w.id===id);if(!item)return;
    if(action==='rename'||action==='delete'){setManagement({item,action});setRename(item.name);}else handle(()=>state.manage(id,action));
  };
  const submitManagement=async()=>{
    if(!management)return;
    state.setError('');
    try{await state.manage(management.item.id,management.action,management.action==='rename'?rename:undefined);setManagement(null);}
    catch(error){state.setError((error as Error).message);}
  };
  const action = async (name: string, extra: Record<string, unknown> = {}) => {
    if (!flow || busy) return;
    setBusy(true); state.setError('');
    try {
      await state.save();
      await workflowAPI('/action', { id: flow.id, runId: active?.id, action: name, ...extra });
      setStartOpen(false); setHistoryRun(''); await state.refresh();
      if (name === 'delete') await state.select('');
      setInput('');
    } catch (error) { state.setError((error as Error).message); }
    finally { setBusy(false); }
  };
  const add = (kind: WorkflowNode['kind'], preset?:TaskPreset) => {
    if (!flow) return;
    const previous = flow.nodes.find(n => n.id === state.nodeId) ?? flow.nodes.at(-1);
    const id = crypto.randomUUID(), x = previous ? previous.x + 320 : (100 - flow.viewport.x) / flow.viewport.zoom, y = previous?.y ?? (70 - flow.viewport.y) / flow.viewport.zoom;
    const node: WorkflowNode = kind === 'agent' ? newAgentNode(id, 'Agent', x, y) : kind === 'human' ? { id, kind, title: 'Human review', x, y }
      : { id, kind, title: 'Publish', x, y, remote: workspace?.git?.remote ?? 'origin', provider: 'auto', mode: 'push', targetBranch: '', requestTitle: flow.name, description: '{{results}}' };
    if(preset)Object.assign(node,taskPreset(preset));
    state.edit(f => { f.nodes.push(node); }); state.chooseNode(id); setEdgeId('');
  };
  const openGit = () => { const directory = run?.workspace.root ?? flow?.directory; if (directory) saveGitRepository(directory); onGit(); };
  const returnNodes = flow?.nodes.filter(n => n.kind === 'agent' && (!run || workflowOrder(flow).indexOf(n.id) < workflowOrder(flow).indexOf(run.currentNodeId!))) ?? [];
  const publicationLinks = [...new Set(run?.snapshot.nodes.flatMap(n => { const a = currentResult(run, n.id); return a?.status === 'done' && a.result?.publication?.url ? [a.result.publication.url] : []; }) ?? [])];
  return <section className="workflow-view" data-testid="workflow-view">
    <div className="workflow-header"><div className="workflow-heading"><WorkflowIcon /><h1>Workflow</h1></div>
      <button aria-label={state.layout.sidebarHidden?'Show workflow list':'Hide workflow list'} aria-expanded={!state.layout.sidebarHidden} onClick={()=>state.updateLayout({sidebarHidden:!state.layout.sidebarHidden})}>{state.layout.sidebarHidden?<PanelLeftOpen/>:<PanelLeftClose/>}</button>
      <button aria-label="Active agents" aria-expanded={showAgents} onClick={()=>setShowAgents(v=>!v)}><Activity/>Agents {state.agents.length}</button>
      <button onClick={() => { setNewName(''); setNewFolder(''); setNewOpen(true); }} disabled={busy}><Plus />New workflow</button>
      {flow && <><button title="Save workflow" aria-label="Save workflow" disabled={state.saving || busy} onClick={() => handle(state.save)}><Save />{state.saving ? 'Saving…' : 'Save'}</button>
        <span className="workflow-header-spacer" />
        {active ? <><span className={`workflow-status ${active.status}`}>{statusLabel(active.status)}</span>
          {active.status === 'running' ? <button disabled={busy} onClick={() => void action('pause')}><Pause />Pause</button>
            : active.status !== 'human_review' && <button className="primary" disabled={busy} onClick={() => void action('resume', { input })}><Play />{active.status === 'needs_attention' ? 'Retry / Continue' : 'Resume'}</button>}
          <button disabled={busy} onClick={() => void action('stop')}><Square />Stop</button></>
          : <><button className="primary" disabled={busy || historical || !!issues.length} onClick={() => { if (flow.nodes.some(n => n.kind === 'publication')) { setAuthorized(false); setStartOpen(true); } else void action('start'); }}><Play />Start</button><button aria-label="Delete workflow" title="Delete workflow" disabled={busy||state.managing} onClick={() => requestManagement(state.selected,'delete')}><Trash2 /></button></>}
      </>}
    </div>
    <div ref={container} className={`workflow-layout ${narrow?'is-narrow':''}`} style={{'--workflow-sidebar-width':`${leftWidth}px`,'--workflow-inspector-width':`${rightWidth}px`} as CSSProperties}>
      {!state.layout.sidebarHidden&&<><WorkflowSidebar onAction={requestManagement} busy={state.managing||busy} workflows={state.summaries} selected={state.selected} onSelect={id=>handle(async()=>{await state.select(id);setHistoryRun('');setEdgeId('');})}/><div className="workflow-sidebar-handle"><WorkflowPaneResizer label="Resize workflow list" width={leftWidth} minimum={160} maximum={sidebarMax} direction={1} onResize={(width,save)=>{setSidebarWidth(width);if(save)state.updateLayout({sidebarWidth:width});}}/></div></>}
      <div className="workflow-main">
      {doc?.hidden&&<div className="workflow-hidden-notice">This workflow is hidden from the list.<button disabled={state.managing} onClick={()=>requestManagement(doc.definition.id,'show')}>Show workflow</button></div>}
      {showAgents&&<WorkflowAgents agents={state.agents} now={now} onSelect={(id,node)=>handle(async()=>{await state.select(id,node);setHistoryRun('');setEdgeId('');})}/>}
    {state.error && <div className="workflow-error" role="alert"><span>{state.error}</span><button aria-label="Dismiss error" onClick={() => state.setError('')}><X /></button></div>}
    {flow ? <>
      <div className="workflow-project-row"><label>Name<input disabled={locked} value={flow.name} onChange={e => state.edit(f => { f.name = e.target.value; })} /></label>
        <label className="workflow-folder">Working folder<input disabled={locked} list="workflow-folders" value={flow.directory} onChange={e => state.edit(f => { f.directory = e.target.value; })} /></label>
        {(workspace?.git || flow.branch || active?.workspace.root) && <><label>Working / source branch<input list="workflow-branches" disabled={locked} value={flow.branch || active?.workspace.branch || ''} placeholder={workspace?.git?.branch ?? 'Choose branch'} onChange={e => state.edit(f => { f.branch = e.target.value; })} /></label>
          <datalist id="workflow-branches">{workspace?.git?.branches.filter(b => !b.remote).map(b => <option key={b.name} value={b.name} />)}</datalist>
          {!locked && <label className="workflow-check"><input type="checkbox" checked={flow.createBranch} onChange={e => state.edit(f => { f.createBranch = e.target.checked; })} />Create branch at Start</label>}</>}
        {!workspace?.git && workspace && <span className="workflow-muted">Folder workflow · no Git</span>}
      </div>
      {workspaceError && <p className="workflow-error">{workspaceError}</p>}
      {workspace?.git && !active && <div className="workflow-repository-info"><GitBranch size={13} />Current branch: {workspace.git.branch ?? 'Detached HEAD'}{workspace.git.files.length ? ` · ${workspace.git.files.length} uncommitted files` : ' · Clean working copy'}</div>}
      <div className="workflow-add-row"><button disabled={locked} onClick={() => add('agent')}><Plus />Agent</button><button disabled={locked} onClick={() => add('publication')}><Plus />Git publication</button><button disabled={locked} onClick={() => add('human')}><Plus />Human review</button>
        <select aria-label="Add preset task" value="" disabled={locked} onChange={e=>{const p=TASK_PRESETS.find(p=>p.id===e.target.value);if(p)add(p.kind,p.id);}}><option value="">Add preset task…</option>{TASK_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <span className="workflow-header-spacer" /><label className="workflow-run-history" key={state.selected}><span title={doc?.definition.name}>Run history · {doc?.definition.name}</span><select aria-label="Run history" value={historyRun} disabled={!runs.length} onChange={e=>setHistoryRun(e.target.value)}><option value="">{runs.length?'Current / latest':'No runs yet'}</option>{runs.map((r,i)=><option value={r.id} key={r.id}>Run {runs.length-i} · {statusLabel(r.status)} · {formatWorkflowTimestamp(r.startedAt)}</option>)}</select></label>
      </div>
      {!active && issues.length > 0 && <details className="workflow-validation" open={issues.length <= 2}><summary>{issues.length} item{issues.length === 1 ? '' : 's'} to fix before Start</summary>{issues.map((issue, i) => <button key={i} onClick={() => { state.chooseNode(issue.nodeId ?? ''); setEdgeId(issue.edgeId ?? ''); }}>{issue.message}</button>)}</details>}
      {active?.reason && <div className={`workflow-run-notice ${active.status === 'needs_attention' ? 'attention' : ''}`}><strong>{statusLabel(active.status)}</strong><span>{active.reason}</span></div>}
      {active && ['human_review', 'needs_attention', 'paused', 'interrupted'].includes(active.status) && <div className="workflow-review-controls">
        <label>{active.status === 'human_review' ? 'Review comment' : 'Additional input / feedback'}<textarea rows={2} value={input} onChange={e => setInput(e.target.value)} placeholder="Describe the required changes or supply missing information…" /></label>
        {(active.status === 'human_review' || active.status === 'needs_attention') && <><label>Return to<select value={returnTarget} onChange={e => setReturnTarget(e.target.value)}><option value="">Choose agent card</option>{returnNodes.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label><button disabled={busy || !input.trim() || !returnTarget} onClick={() => void action('rework', { target: returnTarget, input })}>Return for rework</button></>}
        {publicationLinks.map(url => <a key={url} className="workflow-link" href={url} target="_blank" rel="noreferrer"><ExternalLink />Open MR/PR</a>)}
        {active.status === 'human_review' && <><button onClick={openGit} disabled={!active.workspace.root}><GitBranch />View changes</button><button className="primary" disabled={busy} onClick={() => void action('accept')}>Accept result</button><small>Completes this run. Merge in GitHub/GitLab.</small></>}
      </div>}
      {active?.status === 'human_review' && <div className="workflow-human-results">{active.snapshot.nodes.filter(n => currentResult(active, n.id)?.result).map(n => <button key={n.id} onClick={() => state.chooseNode(n.id)}>{n.title} · View result</button>)}</div>}
      <div className="workflow-body"><WorkflowCanvas flow={flow} run={run} runs={runs} now={now} historical={historical} locked={locked} issues={active ? [] : issues} selected={state.nodeId} edgeId={edgeId} onSelect={id => { state.chooseNode(id); const attempt = run && currentResult(run, id); if (attempt?.sessionId) notifyNativeSelection(attempt.sessionId); }} onEdge={setEdgeId} edit={historical ? () => {} : state.edit} />
        <WorkflowPaneResizer label="Resize task details" width={rightWidth} minimum={260} maximum={rightMax} direction={-1} onResize={(width,save)=>{setInspectorWidth(width);if(save)state.updateLayout({inspectorWidth:width});}}/>
        <WorkflowInspector flow={flow} node={flow.nodes.find(n => n.id === state.nodeId)} edge={flow.edges.find(e => e.id === edgeId)} run={run} locked={locked} models={models} edit={state.edit} onSelect={id=>{state.chooseNode(id);setEdgeId('');}} onClose={() => { state.chooseNode(''); setEdgeId(''); }} onGit={openGit} />
      </div>
    </> : <div className="workflow-welcome"><WorkflowIcon /><h2>Connect tasks. Keep the context.</h2><p>Give each card its own agent, model and task. Connect results into a sequence, review changes and keep the final decision.</p><button className="primary" onClick={() => setNewOpen(true)}><Plus />New workflow</button></div>}
      </div>
    </div>
    <datalist id="workflow-folders">{directories.map(d => <option key={d} value={d} />)}</datalist>
    {management&&<Dialog title={management.action==='rename'?'Rename workflow':'Delete workflow'} onClose={()=>{if(!state.managing)setManagement(null);}}>
      <form onSubmit={e=>{e.preventDefault();void submitManagement();}}>
        {management.action==='rename'?<label>Workflow name<input aria-label="Workflow name" autoFocus required maxLength={200} value={rename} disabled={state.managing} onChange={e=>setRename(e.target.value)}/></label>:<p>Delete <strong>{management.item.name}</strong> and its {management.item.runCount} saved run{management.item.runCount===1?'':'s'}? This cannot be undone. Project files are kept.</p>}
        {state.error&&<p className="workflow-error" role="alert">{state.error}</p>}
        <footer><button type="button" disabled={state.managing} onClick={()=>setManagement(null)}>Cancel</button><button className={management.action==='delete'?'danger':'primary'} disabled={state.managing||(management.action==='rename'&&!rename.trim())}>{state.managing?'Saving…':management.action==='rename'?'Rename':'Delete workflow'}</button></footer>
      </form>
    </Dialog>}
    {newOpen && <Dialog title="New workflow" onClose={() => setNewOpen(false)}><form onSubmit={e => { e.preventDefault(); handle(async () => {
      if (!workspace) throw Error(workspaceError || 'Wait for the working folder check.');
      const definition: WorkflowDefinition = workflowTemplate(newName.trim(), workspace.directory, template); definition.branch = workspace.git?.branch ?? '';
      await state.create(definition); setNewOpen(false); setHistoryRun('');
    }); }}>
      <label>Name<input autoFocus required maxLength={200} value={newName} onChange={e => setNewName(e.target.value)} placeholder="My workflow" /></label>
      <label>Working folder<div className="workflow-folder-input"><input required list="workflow-folders" value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="/path/to/project" />{hasDesktopBridge() && <button type="button" onClick={() => notifyWorkflowAction({ action: 'choose-directory' })}><FolderOpen />Choose…</button>}</div></label>
      {workspaceError ? <p className="workflow-error">{workspaceError}</p> : <p>{workspace ? workspace.git ? `Current branch: ${workspace.git.branch ?? 'Detached HEAD'}. You can choose or create another branch before Start.` : 'This folder can run text and file workflows without Git.' : 'Choose a folder to check its workspace.'}</p>}
      <div className="workflow-template-options"><label><input type="radio" name="template" checked={!template} onChange={() => setTemplate(false)} /><strong>Empty canvas</strong><span>Start with your own sequence.</span></label><label><input type="radio" name="template" checked={template} onChange={() => setTemplate(true)} /><strong>Plan → Implement → Review → Publish → Human</strong><span>Editable tasks with a review return limited to 3 reworks.</span></label></div>
      <footer><button type="button" onClick={() => setNewOpen(false)}>Cancel</button><button className="primary" disabled={!workspace || !newName.trim()}>Create workflow</button></footer>
    </form></Dialog>}
    {startOpen && flow && <Dialog title="Start workflow" onClose={() => setStartOpen(false)}><p>All cards will use <strong>{flow.directory}</strong> on <strong>{flow.branch || workspace?.git?.branch}</strong>.</p>
      {flow.nodes.filter(n => n.kind === 'publication').map(n => n.kind === 'publication' && <div className="workflow-publication-scope" key={n.id}><strong>{n.title}: {n.mode === 'push' ? 'Commit & Push' : 'Create / Update MR or PR'}</strong><p>Remote: {n.remote}<br />Source: {flow.branch}<br />{n.mode === 'request' && <>Target: {n.targetBranch}<br /></>}Title: {n.requestTitle}</p></div>)}
      <label className="workflow-check"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} />Authorize these publications for this run and its rework passes.</label><p>Only the reviewed version is published. No automatic merge.</p>
      <footer><button onClick={() => setStartOpen(false)}>Cancel</button><button className="primary" disabled={!authorized || busy} onClick={() => void action('start', { publicationAuthorized: true })}>Authorize & Start</button></footer>
    </Dialog>}
  </section>;
}
