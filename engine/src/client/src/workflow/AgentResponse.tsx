import Markdown from 'react-markdown';
import { memo } from 'react';
import remarkGfm from 'remark-gfm';
import { parseReview, type ReviewResult } from '@shared/workflow';

export const AgentResponse = memo(function AgentResponse({text,review}: {text:string;review?:ReviewResult}) {
  let verdict=review;
  if(!verdict && /^\s*(\{|```json)/.test(text)) {try{verdict=parseReview(text);}catch{/* Ordinary answers may contain JSON examples. */}}
  return <div className="workflow-markdown">{verdict?<div className="workflow-readable-review">
    <strong className={`workflow-status ${verdict.verdict==='approved'?'done':'needs_input'}`}>{verdict.verdict==='approved'?'Approved':verdict.verdict==='changes_requested'?'Changes requested':'Needs input'}</strong>
    <Markdown remarkPlugins={[remarkGfm]}>{verdict.summary}</Markdown>
    {verdict.findings.length>0&&<ol>{verdict.findings.map(f=><li key={f.id}><strong>{f.id}</strong><Markdown remarkPlugins={[remarkGfm]}>{f.message}</Markdown></li>)}</ol>}
  </div>:<Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>}</div>;
});
