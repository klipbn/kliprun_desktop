import type { StepResult, WorkflowAgent } from '@shared/workflow';
import { WorkflowInputRequired } from '@shared/workflow';

export class AgentProtocol {
  private text = '';
  private complete = false;
  private error?: string;
  private needsInput = false;
  private messages: string[] = [];
  private truncated = false;
  updatedAt = 0;
  sessionId?: string;
  constructor(private source: WorkflowAgent) {}
  private response(text: string) {
    if (!text.trim() || this.messages.at(-1) === text) return;
    if (text.length > 65536) { text = text.slice(-65536); this.truncated = true; }
    this.messages.push(text);
    while (this.messages.length > 64 || this.messages.reduce((n, t) => n + t.length, 0) > 65536) { this.messages.shift(); this.truncated = true; }
  }
  snapshot() {
    if (this.text.length > 262144) { this.text = ''; this.error = 'Agent response exceeds 256 KiB. Write large results to output files.'; }
    return { text: this.text, complete: this.complete, error: this.error?.slice(0, 4000), needsInput: this.needsInput, sessionId: this.sessionId, messages: this.messages, truncated: this.truncated, updatedAt: this.updatedAt };
  }
  static restore(source: WorkflowAgent, value: unknown): AgentProtocol {
    const v = value as ReturnType<AgentProtocol['snapshot']>;
    if (!v || typeof v.text !== 'string' || v.text.length > 262144 || typeof v.complete !== 'boolean' || !Array.isArray(v.messages) || !v.messages.every(t => typeof t === 'string') || v.messages.join('').length > 65536) throw Error('Invalid saved agent response.');
    const p = new AgentProtocol(source);
    p.text = v.text; p.complete = v.complete; p.error = typeof v.error === 'string' ? v.error : undefined; p.needsInput = v.needsInput === true;
    p.sessionId = typeof v.sessionId === 'string' ? v.sessionId : undefined; p.messages = v.messages; p.truncated = v.truncated; p.updatedAt = v.updatedAt;
    return p;
  }
  feed(value: unknown) {
    if (!value || typeof value !== 'object') throw Error('Agent emitted an invalid event.');
    const event = value as Record<string, any>;
    this.updatedAt = Date.now();
    if (this.source === 'codex') {
      if (event.type === 'thread.started' && typeof event.thread_id === 'string') this.sessionId = `codex:${event.thread_id}`;
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') { this.text = event.item.text; this.response(this.text); }
      if (event.type === 'turn.completed') this.complete = true;
      if (event.type === 'turn.failed' || event.type === 'error') this.error = event.error?.message || event.message || 'Codex failed.';
    } else if (this.source === 'opencode') {
      if (typeof event.sessionID === 'string') this.sessionId = event.sessionID;
      if (event.type === 'text' && typeof event.part?.text === 'string') { this.text += event.part.text; this.response(event.part.text); }
      if (event.type === 'step_start') { this.complete = false; this.text = ''; }
      if (event.type === 'step_finish' && ['stop', 'end_turn'].includes(event.part?.reason)) this.complete = true;
      if (event.type === 'error') this.error = event.error?.data?.message || event.error?.message || 'OpenCode failed.';
      if (/permission|question/.test(String(event.type))) { this.error = 'Agent requires permission or input.'; this.needsInput = true; }
    } else {
      if (event.type === 'assistant' && Array.isArray(event.message?.content)) for (const part of event.message.content) if (part.type === 'text' && typeof part.text === 'string') this.response(part.text);
      if (typeof event.session_id === 'string') this.sessionId = `claude:${event.session_id}`;
      if (event.type === 'result') {
        this.complete = event.subtype === 'success' && event.is_error !== true;
        if (typeof event.result === 'string') { this.text = event.result; this.response(this.text); }
        if (!this.complete) this.error = event.errors?.join('\n') || 'Claude did not complete successfully.';
        if (event.permission_denials?.length) { this.error = 'Claude needs permission for tools. Review its response and provide input before retrying.'; this.needsInput = true; }
      }
    }
  }
  result(exitCode: number): StepResult {
    if (this.text.length > 262144) throw Error('Agent response exceeds 256 KiB. Write large results to output files.');
    if (this.error) throw this.needsInput ? new WorkflowInputRequired(this.error) : Error(this.error);
    if (exitCode !== 0) throw Error(`Agent exited with code ${exitCode}.`);
    if (!this.complete) throw Error('Agent did not confirm completion through its structured protocol.');
    if (!this.text.trim()) throw Error('Agent completed without a result.');
    return { text: this.text.trim(), files: [], ...(this.sessionId ? { sessionId: this.sessionId } : {}) };
  }
}
