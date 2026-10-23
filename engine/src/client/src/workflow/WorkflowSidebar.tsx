import { Fragment, useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Eye, EyeOff, Trash2, Search, X, SquareTerminal } from 'lucide-react';
import { formatWorkflowDuration, formatWorkflowTimestamp, type WorkflowSummary, type WorkflowAgentActivity, type WorkflowManagementAction } from '@shared/workflowPresentation';
import { statusLabel } from './WorkflowCanvas';
import { HarnessIcon } from '../components/HarnessIcon';
import { hasDesktopBridge, notifyWorkflowAction } from '../nativeBridge';

export function WorkflowSidebar({ workflows, selected, onSelect, onAction, busy }: {
  workflows:WorkflowSummary[];selected:string;onSelect:(id:string)=>void;onAction:(id:string,action:WorkflowManagementAction)=>void;busy:boolean;
}) {
  const [query,setQuery]=useState(''),[showHidden,setShowHidden]=useState(false);
  const [menu,setMenu]=useState<{id:string;x:number;y:number}|null>(null),menuRef=useRef<HTMLDivElement>(null);
  const hidden=workflows.filter(w=>w.hidden).length;
  const rows=workflows.filter(w=>(!w.hidden||showHidden||w.id===selected)&&w.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>(b.date??0)-(a.date??0));
  const item=workflows.find(w=>w.id===menu?.id);
  const openMenu=(id:string,x:number,y:number)=>setMenu({id,x:Math.max(8,Math.min(window.innerWidth-188,x)),y:Math.max(8,Math.min(window.innerHeight-150,y))});
  useEffect(()=>{
    if(!menu)return;
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const close=(e:PointerEvent)=>{if(!menuRef.current?.contains(e.target as Node)&&!(e.target as Element).closest('.workflow-actions'))setMenu(null);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setMenu(null);document.querySelector<HTMLButtonElement>(`[data-workflow-id="${menu.id}"] .workflow-actions`)?.focus();}};
    window.addEventListener('pointerdown',close);window.addEventListener('keydown',escape);
    return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',escape);};
  },[menu]);
  const act=(action:WorkflowManagementAction)=>{if(!item)return;setMenu(null);onAction(item.id,action);};
  return <aside className="workflow-sidebar" aria-label="Workflow list"><header><strong>Workflows</strong><span>{workflows.length}</span></header>
    <div className="workflow-list-search"><Search size={13}/><input aria-label="Search workflows" placeholder="Search workflows…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="Clear workflow search" onClick={()=>setQuery('')}><X size={12}/></button>}</div>
    <div className="workflow-list">{rows.map(w=><div key={w.id} data-workflow-id={w.id} className={`workflow-list-row ${selected===w.id?'selected':''} ${w.hidden?'hidden-workflow':''}`} onContextMenu={e=>{e.preventDefault();openMenu(w.id,e.clientX,e.clientY);}}>
      <button className="workflow-list-item" aria-current={selected===w.id?'page':undefined} disabled={busy} onClick={()=>{setMenu(null);onSelect(w.id);}}>
        <strong>{w.hidden&&<EyeOff size={12} aria-label="Hidden"/>}{w.name}</strong>
        <span><time title={w.date!==null?`${w.runCount?'Last run':'Created'}: ${new Date(w.date).toLocaleString()}`:undefined}>{formatWorkflowTimestamp(w.date)}</time><span className={`workflow-status ${w.status}`}>{w.status==='never_run'?'Never run':statusLabel(w.status)}</span></span>
      </button>
      <button className="workflow-actions" aria-label={`Actions for ${w.name}`} aria-haspopup="menu" aria-expanded={menu?.id===w.id} disabled={busy} onClick={e=>{if(menu?.id===w.id){setMenu(null);return;}const r=e.currentTarget.getBoundingClientRect();openMenu(w.id,r.right-180,r.bottom+4);}}><MoreHorizontal size={14}/></button>
    </div>)}{!rows.length&&<p>{query?'No matching workflows.':hidden?'All workflows are hidden.':'Create your first workflow.'}</p>}</div>
    {hidden>0&&<button className="workflow-hidden-toggle" aria-label={showHidden?'Hide hidden workflows':'Show hidden workflows'} aria-pressed={showHidden} onClick={()=>setShowHidden(v=>!v)}>{showHidden?<EyeOff/>:<Eye/>}Hidden ({hidden})</button>}
    {menu&&item&&<div ref={menuRef} role="menu" aria-label="Workflow actions" className="workflow-context-menu" style={{left:menu.x,top:menu.y}} onKeyDown={e=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;e.preventDefault();const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(index+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}}>
      <button role="menuitem" onClick={()=>act('rename')}><Pencil/>Rename</button>
      <button role="menuitem" onClick={()=>act(item.hidden?'show':'hide')}>{item.hidden?<Eye/>:<EyeOff/>}{item.hidden?'Show workflow':'Hide workflow'}</button>
      <button role="menuitem" className="danger" disabled={item.active} title={item.active?'Stop this workflow before deleting it.':undefined} onClick={()=>act('delete')}><Trash2/>Delete…</button>
    </div>}
  </aside>;
}
export function WorkflowPaneResizer({label,width,minimum,maximum,direction,onResize}: {label:string;width:number;minimum:number;maximum:number;direction:1|-1;onResize:(width:number,save:boolean)=>void}) {
  const drag=useRef<{x:number;width:number;current:number}|null>(null);
  const clamp=(n:number)=>Math.round(Math.max(minimum,Math.min(maximum,n)));
  const finish=()=>{if(drag.current){onResize(drag.current.current,true);drag.current=null;}};
  return <div role="separator" tabIndex={0} className="workflow-pane-resizer" aria-label={label} aria-orientation="vertical" aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={width}
    onPointerDown={e=>{if(e.button!==0)return;drag.current={x:e.clientX,width,current:width};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}}
    onPointerMove={e=>{if(!drag.current)return;const next=clamp(drag.current.width+(e.clientX-drag.current.x)*direction);drag.current.current=next;onResize(next,false);}}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();onResize(e.key==='Home'?minimum:e.key==='End'?maximum:clamp(width+(e.key==='ArrowRight'?20:-20)*direction),true);}} />;
}
export function WorkflowAgents({agents,now,onSelect}: {agents:WorkflowAgentActivity[];now:number;onSelect:(workflow:string,node:string)=>void}) {
  return <div className="workflow-agents" aria-label="Active workflow agents">{agents.length?agents.map(a=><Fragment key={a.attemptId}><button onClick={()=>onSelect(a.workflowId,a.nodeId)}>
    <HarnessIcon source={a.agent as 'codex'|'opencode'|'claude'} /><span><strong>{a.title}</strong><small>{a.workflowName} · {a.model||'Agent default'}</small></span>
    <span><span className={`workflow-status ${a.status}`}>{statusLabel(a.status)}</span><small>{a.status==='running'?formatWorkflowDuration(Math.max(0,now-a.startedAt)):'Check before Resume'}{a.pid?` · PID ${a.pid}`:''}</small>
    {a.lastActivityAt&&<small>Last activity {formatWorkflowDuration(Math.max(0,now-a.lastActivityAt))} ago</small>}</span>
  </button>{a.terminal&&hasDesktopBridge()&&<button className="workflow-agent-terminal" title="Show this agent's terminal tab. Approve tool permissions there." onClick={()=>notifyWorkflowAction({action:'show-terminal',attemptId:a.attemptId})}><SquareTerminal />Terminal</button>}</Fragment>):<p>No active workflow agents.</p>}</div>;
}
