import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkflowDefinition, WorkflowDocument } from '@shared/workflow';
import { workflowSummary, type WorkflowSummary, type WorkflowAgentActivity, type WorkflowUI, type WorkflowManagementAction } from '@shared/workflowPresentation';

export async function workflowAPI<T>(path = '', body?: unknown): Promise<T> {
  const response = await fetch(`/api/workflows${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw Error(value.error ?? 'Workflow request failed.');
  return value as T;
}
type WorkflowNavigation = { workflowId: string; nodeId?: string; runId?: string };
const nativeHost = () => window as Window & { kliprunPendingWorkflow?: WorkflowNavigation };
export function useWorkflows() {
  const [documents, setDocuments] = useState<WorkflowDocument[]>([]), [summaries, setSummaries] = useState<WorkflowSummary[]>([]);
  const [agents, setAgents] = useState<WorkflowAgentActivity[]>([]), [layout, setLayout] = useState<WorkflowUI>({});
  const [selected, setSelected] = useState(''), [draft, setDraft] = useState<WorkflowDefinition | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [nodeId, setNodeId] = useState('');
  const [notificationTarget, setNotificationTarget] = useState<WorkflowNavigation | null>(null);
  const [managing,setManaging]=useState(false);
  const managingRef=useRef(false), selectionVersion=useRef(0);
  const selectedRef = useRef(''), refreshing = useRef(false), initialized = useRef(false), selecting = useRef(false);
  const ref = useRef<{ draft: WorkflowDefinition | null; revision: number; edit: number; saved: number; request?: Promise<void> }>({ draft: null, revision: 0, edit: 0, saved: 0 });
  const refresh = useCallback(async () => {
    if (refreshing.current || selecting.current || managingRef.current) return;
    refreshing.current = true;
    try {
      const data = await workflowAPI<{ workflows: WorkflowSummary[]; agents: WorkflowAgentActivity[]; selection: WorkflowUI }>('/status');
      if(managingRef.current)return;
      setSummaries(data.workflows); setAgents(data.agents);
      const initial = !initialized.current;
      if (initial) {
        initialized.current = true; setLayout(data.selection);
        const pending = nativeHost().kliprunPendingWorkflow; delete nativeHost().kliprunPendingWorkflow;
        if (pending) setNotificationTarget(pending);
        const desired = pending?.workflowId ?? data.selection.workflowId;
        selectedRef.current = data.workflows.find(d => d.id === desired)?.id ?? data.workflows.find(d=>!d.hidden)?.id ?? '';
        setSelected(selectedRef.current); setNodeId(pending?.nodeId ?? data.selection.nodeId ?? '');
      }
      const id = selectedRef.current;
      const version=selectionVersion.current;
      if (selecting.current) return;
      if (!id) { setDocuments([]); return; }
      const doc = await workflowAPI<WorkflowDocument>(`/document?id=${encodeURIComponent(id)}`);
      if (selectedRef.current !== id || selectionVersion.current!==version || selecting.current || managingRef.current) return;
      setDocuments([doc]);
      if (initial || !ref.current.draft) { setDraft(doc.definition); ref.current = { draft: doc.definition, revision: doc.revision, edit: 0, saved: 0 }; }
    } finally { refreshing.current = false; }
  }, []);
  useEffect(() => {
    void refresh().catch(e => setError(e.message));
    const timer = setInterval(() => { void refresh().catch(e => setError(e.message)); }, 1500);
    return () => clearInterval(timer);
  }, [refresh]);
  const save = useCallback(async () => {
    if (ref.current.request) await ref.current.request;
    const state = ref.current;
    if (!state.draft || state.edit === state.saved) return;
    const version = state.edit, definition = structuredClone(state.draft);
    setSaving(true);
    const request = (async () => {
      const doc = await workflowAPI<WorkflowDocument>('/save', { definition, revision: state.revision || undefined });
      state.revision = doc.revision; state.saved = version;
      if (selectedRef.current === doc.definition.id) setDocuments([doc]);
      setSummaries(rows => [...rows.filter(d => d.id !== doc.definition.id), workflowSummary(doc)]);
    })();
    state.request = request;
    try { await request; } finally { state.request = undefined; setSaving(false); }
  }, []);
  useEffect(() => () => { void save().catch(() => {}); }, [save]);
  useEffect(() => { const timer = setTimeout(() => { void save().catch(e => setError(e.message)); }, 600); return () => clearTimeout(timer); }, [draft, save, saving]);
  const edit = (change: (flow: WorkflowDefinition) => void) => {
    if (!ref.current.draft || managingRef.current) return;
    const next = structuredClone(ref.current.draft); change(next); ref.current.draft = next; ref.current.edit++; setDraft(next);
  };
  const select = useCallback(async (id: string, task = '') => {
    const version=++selectionVersion.current;
    selecting.current=true;
    try {
      await save(); if(version!==selectionVersion.current)return;
      selectedRef.current = id; setSelected(id); setNodeId(task); setDraft(null); setDocuments([]);
      const doc = id ? await workflowAPI<WorkflowDocument>(`/document?id=${encodeURIComponent(id)}`) : null;
      if (selectedRef.current !== id || version!==selectionVersion.current) return;
      setDocuments(doc ? [doc] : []); setDraft(doc?.definition ?? null);
      ref.current = { draft: doc?.definition ?? null, revision: doc?.revision ?? 0, edit: 0, saved: 0 };
      await workflowAPI('/selection', { workflowId: id || undefined, nodeId: task || undefined });
    } finally { if (version===selectionVersion.current) selecting.current = false; }
  }, [save]);
  const manage = async (id:string, action:WorkflowManagementAction, name?:string) => {
    if(managingRef.current)throw Error('A workflow update is already in progress.');
    managingRef.current=true;setManaging(true);
    try {
      await save();
      const previous=await workflowAPI<WorkflowDocument>(`/document?id=${encodeURIComponent(id)}`);
      const updated=await workflowAPI<WorkflowDocument>('/manage',{id,action,name,revision:previous.revision});
      const wasSelected=selectedRef.current===id;
      if(wasSelected){
        if(action==='delete'){
          selectionVersion.current++;selectedRef.current='';setSelected('');setNodeId('');setDraft(null);setDocuments([]);
          ref.current={draft:null,revision:0,edit:0,saved:0};
        }else{
          setDocuments([updated]);setDraft(updated.definition);
          ref.current={draft:updated.definition,revision:updated.revision,edit:0,saved:0};
        }
      }
      const status=await workflowAPI<{workflows:WorkflowSummary[];agents:WorkflowAgentActivity[]}>('/status');
      setSummaries(status.workflows);setAgents(status.agents);
      if(wasSelected && (action==='hide'||action==='delete'))await select(status.workflows.find(w=>!w.hidden&&w.id!==id)?.id??'');
    }finally{managingRef.current=false;setManaging(false);}
  };
  useEffect(() => {
    const listener = (event: Event) => {
      const value = (event as CustomEvent<WorkflowNavigation>).detail;
      if (!value?.workflowId) return;
      if (!initialized.current) { nativeHost().kliprunPendingWorkflow = value; return; }
      delete nativeHost().kliprunPendingWorkflow;
      setNotificationTarget(value);
      void select(value.workflowId, value.nodeId).catch(e => setError(e.message));
    };
    window.addEventListener('kliprun:workflow', listener); return () => window.removeEventListener('kliprun:workflow', listener);
  }, [select]);
  const create = async (definition: WorkflowDefinition) => { await save(); await workflowAPI('/save', { definition }); await select(definition.id); await refresh(); };
  const chooseNode = (id: string) => { setNodeId(id); void workflowAPI('/selection', { workflowId: selectedRef.current, nodeId: id || undefined }).catch(e => setError(e.message)); };
  const updateLayout = (patch: WorkflowUI) => { setLayout(current => ({ ...current, ...patch })); void workflowAPI('/layout', patch).catch(e => setError(e.message)); };
  return { documents, summaries, agents, layout, updateLayout, notificationTarget, managing, manage, selected, draft, edit, select, create, save, refresh, error, setError, saving, nodeId, chooseNode };
}
