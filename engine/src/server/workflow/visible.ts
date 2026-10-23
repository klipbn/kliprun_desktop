/** Launch requests for Workflow agents that run in the desktop app's terminal tabs. */
export const VISIBLE_SOURCES = ['claude', 'codex'] as const;
export type VisibleSource = typeof VISIBLE_SOURCES[number];
export interface VisibleLaunch {
  attemptId: string; runId: string; workflowId: string; workflowName: string; title: string;
  source: VisibleSource; directory: string; argv: string[]; promptFile: string;
}

export class VisibleAgents {
  private pending = new Map<string, VisibleLaunch>();
  private waiters = new Map<string, { claim(pid: number): void; reject(reason: string): void }>();
  private seenAt = 0;
  constructor(readonly claimTimeout = 20_000, readonly appWait = 120_000) {}
  /** The desktop app polls Workflow status; while it does, a terminal is worth waiting for. */
  heartbeat() { this.seenAt = Date.now(); }
  private appPresent() { return Date.now() - this.seenAt < this.claimTimeout; }
  /** Requests the desktop app has not accepted yet. */
  list(): VisibleLaunch[] { return [...this.pending.values()]; }
  claim(attemptId: string, pid: number): boolean {
    const waiter = this.waiters.get(attemptId);
    if (!waiter || !Number.isInteger(pid) || pid <= 1) return false;
    waiter.claim(pid); return true;
  }
  reject(attemptId: string, reason: string): boolean {
    const waiter = this.waiters.get(attemptId);
    if (!waiter) return false;
    waiter.reject(reason); return true;
  }
  /** Resolves with the terminal's process ID, or undefined when no app is there to open one. Rejects if the app cannot. */
  request(launch: VisibleLaunch, signal: AbortSignal): Promise<number | undefined> {
    return new Promise((resolve, reject) => {
      const id = launch.attemptId, started = Date.now();
      let timer: ReturnType<typeof setTimeout>;
      const done = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); this.pending.delete(id); this.waiters.delete(id); };
      const abort = () => { done(); resolve(undefined); };
      // Never fall back to a hidden headless run while the app is alive: that is the failure the terminal exists to prevent.
      const expire = () => {
        if (!this.appPresent()) { done(); resolve(undefined); return; }
        if (Date.now() - started < this.appWait) { timer = setTimeout(expire, 1000); return; }
        done(); reject(Error('The desktop app did not open a terminal for this agent. Resume to try again.'));
      };
      timer = setTimeout(expire, this.claimTimeout);
      signal.addEventListener('abort', abort, { once: true });
      this.pending.set(id, launch);
      this.waiters.set(id, { claim: pid => { done(); resolve(pid); }, reject: reason => { done(); reject(Error(`The terminal could not be opened: ${reason}`)); } });
      if (signal.aborted) abort();
    });
  }
}
