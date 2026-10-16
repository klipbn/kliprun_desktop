import { identifiedCliSessions, type CliProcess } from "./codex/liveness";

export interface TerminalLink { session_id: string; pid: number }
export interface LinkCandidate { id: string; rollout_path: string }

/** Exact evidence only: a shared daemon or common working directory is not a PID link. */
export function exactTerminalLinks(openCode: Map<string, string>, processes: CliProcess[], candidates: LinkCandidate[]): TerminalLink[] {
  const links: TerminalLink[] = [];
  for (const [session_id, rawPid] of openCode) {
    const pid = Number(rawPid);
    if (Number.isSafeInteger(pid) && pid > 0) links.push({ session_id, pid });
  }
  const direct = processes.map(process => ({ process, rows: identifiedCliSessions(process, candidates) }));
  const counts = new Map<string, number>();
  for (const { rows } of direct) if (rows.length === 1) counts.set(rows[0].id, (counts.get(rows[0].id) ?? 0) + 1);
  for (const { process, rows } of direct) {
    if (rows.length !== 1 || counts.get(rows[0].id) !== 1) continue;
    const pid = Number(process.pid);
    if (Number.isSafeInteger(pid) && pid > 0) links.push({ session_id: `codex:${rows[0].id}`, pid });
  }
  return links;
}
