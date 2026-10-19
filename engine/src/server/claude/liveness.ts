import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { canonicalPath } from "../codex/liveness";
import { CLAUDE_ID, claudeHome } from "./journal";
import { record } from "../usage/normalize";

export interface ClaudeProcess { pid: string; cwd: string; sessionId?: string; startedAt?: string; status?: string; statusUpdatedAt?: number; name?: string }

export function parseClaudeProcesses(output: string): string[] {
  return output.split("\n").flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\S+)\s+(.+)$/);
    if (!match || ["??", "?", "-"].includes(match[2])) return [];
    const args = match[3].match(/"[^"]*"|'[^']*'|\S+/g)?.map(s => s.replace(/^(['"])(.*)\1$/, "$2")) ?? [];
    if (basename(args[0] ?? "") === "node" && /\/@anthropic-ai\/claude-code\/cli\.js$/.test(args[1] ?? "")) args.splice(0, 2, "claude");
    if (basename(args[0]) !== "claude" || args.some(arg => ["-p", "--print", "--version", "-v", "--help", "-h"].includes(arg) || arg.startsWith("--print=")) ||
      ["mcp", "auth", "update", "install", "doctor", "remote-control"].includes(args[1])) return [];
    return [match[1]];
  });
}

export function parseClaudeFiles(output: string, pids: string[], home: string): ClaudeProcess[] {
  const processes: ClaudeProcess[] = [];
  let current: ClaudeProcess | undefined, fd = "";
  const sessions = new Map<string, Set<string>>();
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) { current = pids.includes(line.slice(1)) ? { pid: line.slice(1), cwd: "" } : undefined; fd = ""; if (current) processes.push(current); }
    else if (line.startsWith("f")) fd = line.slice(1);
    else if (current && line.startsWith("n/")) {
      const path = canonicalPath(line.slice(1));
      if (fd === "cwd") current.cwd = path;
      else if (dirname(dirname(path)) === canonicalPath(join(home, "projects")) && path.endsWith(".jsonl") && CLAUDE_ID.test(basename(path, ".jsonl"))) {
        const ids = sessions.get(current.pid) ?? new Set<string>(); ids.add(basename(path, ".jsonl")); sessions.set(current.pid, ids);
      }
    }
  }
  return processes.filter(p => p.cwd).map(p => ({ ...p, ...(sessions.get(p.pid)?.size === 1 ? { sessionId: [...sessions.get(p.pid)!][0] } : {}) }));
}

/** A PID file is evidence only for the same live process generation and project. /clear and /resume start a new session later in the same process. */
export function claudeSessionRecord(process: ClaudeProcess, startedAt: string, value: unknown): ClaudeProcess | null {
  const data = record(value), birth = Date.parse(startedAt);
  if (data.pid !== Number(process.pid) || typeof data.startedAt !== "number" || !Number.isFinite(data.startedAt) || !Number.isFinite(birth) ||
    data.startedAt < birth - 1000 || typeof data.cwd !== "string" || canonicalPath(data.cwd) !== process.cwd ||
    typeof data.sessionId !== "string" || !CLAUDE_ID.test(data.sessionId)) return null;
  return { ...process, startedAt, sessionId: data.sessionId, status: typeof data.status === "string" ? data.status : undefined,
    statusUpdatedAt: typeof data.statusUpdatedAt === "number" ? data.statusUpdatedAt : undefined, name: typeof data.name === "string" ? data.name : undefined };
}

async function command(args: string[]): Promise<string> {
  const process = Bun.spawn(args, { stdout: "pipe", stderr: "ignore" });
  const timer = setTimeout(() => process.kill(), 2500);
  try {
    const output = await new Response(process.stdout).text();
    const code = await process.exited;
    if (code !== 0 && !(args[0] === "lsof" && code === 1)) throw new Error("Claude CLI process scan unavailable");
    return output;
  } finally { clearTimeout(timer); }
}

export async function scanClaudeCli(home = claudeHome()): Promise<ClaudeProcess[]> {
  const pids = parseClaudeProcesses(await command(["ps", "-axo", "pid=,tty=,command="])).slice(0, 100);
  if (!pids.length) return [];
  const starts = await command(["ps", "-p", pids.join(","), "-o", "pid=,lstart="]);
  const generations = new Map(starts.split("\n").flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/); return match ? [[match[1], match[2]]] : [];
  }));
  const files = parseClaudeFiles(await command(["lsof", "-a", "-p", pids.join(","), "-Fpnf"]), pids, home);
  return files.filter(p => generations.has(p.pid)).map(p => {
    const startedAt = generations.get(p.pid)!;
    try {
      const data = JSON.parse(readFileSync(join(home, "sessions", `${p.pid}.json`), "utf8"));
      const confirmed = claudeSessionRecord(p, startedAt, data);
      if (confirmed) return confirmed;
    } catch { /* Older Claude versions only expose open transcript descriptors. */ }
    return { ...p, startedAt };
  });
}
