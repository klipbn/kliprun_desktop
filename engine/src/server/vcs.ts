/**
 * Current git branch for a session directory: walk up to the repository root
 * (.git dir or worktree .git file), read HEAD on every refresh.
 * Containers without a repo (or detached HEAD) yield null — never guessed.
 */
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const MAX_DEPTH = 10;
const REF_PREFIX = "ref: refs/heads/";

export function branchOf(directory: string): string | null {
  return directory ? resolveBranch(directory) : null;
}

export function repositoryOf(directory: string): { branch: string | null; url: string | null } {
  const branch = branchOf(directory);
  if (!directory) return { branch, url: null };
  const config = (key: string) => {
    try {
      const result = Bun.spawnSync(["git", "-C", directory, "config", "--get", key], { stdout: "pipe", stderr: "ignore", timeout: 1000 });
      return result.exitCode === 0 ? result.stdout.toString().trim() : "";
    } catch { return ""; }
  };
  const remote = (branch && config(`branch.${branch}.remote`)) || "origin";
  const raw = config(`remote.${remote === "." ? "origin" : remote}.url`);
  try {
    const scp = raw.match(/^(?:[^@/:]+@)?([a-z0-9.-]+\.[a-z0-9.-]+):(.+)$/i);
    let url = new URL(!raw.includes("://") && scp ? `https://${scp[1]}/${scp[2]}` : raw);
    if (url.protocol === "ssh:") url = new URL(`https://${url.hostname}${url.pathname}`);
    if (!["https:", "http:"].includes(url.protocol)) return { branch, url: null };
    url.username = ""; url.password = ""; url.search = ""; url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "").replace(/\.git$/, "");
    if (branch) {
      if (/^github[.-]/i.test(url.hostname)) url.pathname += `/tree/${encodeURIComponent(branch)}`;
      else if (/gitlab/i.test(url.hostname) || /^git[.-]/i.test(url.hostname)) url.pathname += `/-/tree/${encodeURIComponent(branch)}`;
    }
    return { branch, url: url.href };
  } catch { return { branch, url: null }; }
}

function resolveBranch(startDir: string): string | null {
  let dir: string | null = startDir;
  for (let depth = 0; dir && depth < MAX_DEPTH; depth++) {
    const dotGit = join(dir, ".git");
    let isDir = false;
    try {
      isDir = statSync(dotGit).isDirectory();
    } catch {
      dir = parentOf(dir);
      continue;
    }
    const headPath = isDir ? join(dotGit, "HEAD") : worktreeHead(dotGit);
    if (headPath) {
      return readHeadBranch(headPath);
    }
    dir = parentOf(dir);
  }
  return null;
}

/** A worktree keeps `.git` as a file: "gitdir: <repo>/.git/worktrees/<name>". */
function worktreeHead(dotGitFile: string): string | null {
  try {
    const content = readFileSync(dotGitFile, "utf8").trim();
    if (!content.startsWith("gitdir:")) return null;
    return join(resolve(dirname(dotGitFile), content.slice("gitdir:".length).trim()), "HEAD");
  } catch {
    return null;
  }
}

function readHeadBranch(headPath: string): string | null {
  try {
    const content = readFileSync(headPath, "utf8").trim();
    if (content.startsWith(REF_PREFIX)) return content.slice(REF_PREFIX.length) || null;
    return null; // detached HEAD
  } catch {
    return null;
  }
}

function parentOf(dir: string): string | null {
  const parent = dirname(dir);
  return parent === dir ? null : parent;
}
