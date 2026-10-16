import { lstat, open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { GitAction, GitCommitDetail, GitCounts, GitDiff, GitExpectation, GitHistory, GitStatus, GitFile } from "@shared/git";

import { GitError, runGit as run } from "./gitProcess";
export { GitError } from "./gitProcess";

const PREVIEW_LIMIT = 512 * 1024;
const EMPTY_COUNTS: GitCounts = { additions: 0, deletions: 0 };
const mutations = new Set<string>();

export async function gitRoot(directory: unknown): Promise<string> {
  if (typeof directory !== "string" || !isAbsolute(directory) || directory.length > 4096 || directory.includes("\0")) throw new GitError("Choose a valid repository directory.", 400);
  const result = await run(directory, ["rev-parse", "--show-toplevel"], { allowFailure: true });
  if (result.code) throw new GitError("This directory is not a Git working tree.", 404);
  return realpath(result.out.trim());
}

export function gitPath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 4096 || value.includes("\0") || isAbsolute(value) || value.split("/").some(part => part === ".." || part.toLowerCase() === ".git") || value === ".") throw new GitError("Invalid repository file path.", 400);
  return value;
}
function revision(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(value)) throw new GitError("Invalid commit revision.", 400);
  return value;
}

function numstat(output: string): Map<string, GitCounts> {
  const result = new Map<string, GitCounts>(), parts = output.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]; if (!entry) continue;
    const first = entry.indexOf("\t"), second = entry.indexOf("\t", first + 1);
    if (first < 0 || second < 0) continue;
    let path = entry.slice(second + 1);
    if (!path) { i++; path = parts[++i]; }
    result.set(path, { additions: entry.slice(0, first) === "-" ? null : Number(entry.slice(0, first)), deletions: entry.slice(first + 1, second) === "-" ? null : Number(entry.slice(first + 1, second)) });
  }
  return result;
}
const diffOptions = ["--no-ext-diff", "--no-textconv", "--find-renames", "--no-color"];

export async function gitStatus(root: string): Promise<GitStatus> {
  const [status, branch, head, upstream, remoteList, branches, staged, unstaged] = await Promise.all([
    run(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true }),
    run(root, ["rev-parse", "--verify", "HEAD"], { allowFailure: true }),
    run(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { allowFailure: true }),
    run(root, ["remote"]),
    run(root, ["for-each-ref", "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(refname)%00%(authorname)%00%(committerdate:unix)%00%(contents:subject)", "refs/heads", "refs/remotes"]),
    run(root, ["diff", ...diffOptions, "--cached", "--numstat", "-z"]), run(root, ["diff", ...diffOptions, "--numstat", "-z"]),
  ]);
  const indexStats = numstat(staged.out), worktreeStats = numstat(unstaged.out), files: GitFile[] = [], entries = status.out.split("\0");
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]; if (!entry) continue;
    const index = entry[0], worktree = entry[1], path = entry.slice(3);
    const originalPath = /[RC]/.test(index + worktree) ? entries[++i] : undefined;
    files.push({ path, ...(originalPath ? { originalPath } : {}), index, worktree, staged: indexStats.get(path) ?? EMPTY_COUNTS, unstaged: worktreeStats.get(path) ?? EMPTY_COUNTS });
  }
  let ahead = 0, behind = 0;
  if (!upstream.code && !head.code) {
    const divergence = await run(root, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { allowFailure: true });
    if (!divergence.code) [ahead, behind] = divergence.out.trim().split(/\s+/).map(Number);
  }
  const remotes = remoteList.out.trim().split("\n").filter(Boolean);
  const branchName = branch.code ? null : branch.out.trim();
  const configured = branchName ? (await run(root, ["config", "--get", `branch.${branchName}.remote`], { allowFailure: true })).out.trim() : "";
  const remote = remotes.includes(configured) ? configured : remotes.includes("origin") ? "origin" : remotes[0] ?? null;
  return { root, branch: branchName, head: head.code ? null : head.out.trim(), unborn: !!head.code,
    upstream: upstream.code ? null : upstream.out.trim(), ahead, behind, remote, remotes, files,
    branches: branches.out.trim().split("\n").filter(Boolean).filter(row => !row.split("\0")[0].endsWith("/HEAD")).map(row => {
      const [name, current, tracking, ref, author, date, subject] = row.split("\0");
      return { name, current: current === "*", upstream: tracking || null, remote: ref.startsWith("refs/remotes/"), author: author || null, date: Number(date) ? Number(date) * 1000 : null, subject: subject || null };
    }) };
}

export async function gitHistory(root: string, skip = 0, limit = 50): Promise<GitHistory> {
  if (!Number.isSafeInteger(skip) || skip < 0 || skip > 100_000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new GitError("Invalid history page.", 400);
  const head = await run(root, ["rev-parse", "--verify", "HEAD"], { allowFailure: true });
  if (head.code) return { commits: [], hasMore: false };
  const result = await run(root, ["log", `--skip=${skip}`, `--max-count=${limit + 1}`, "--format=%H%x00%s%x00%an%x00%at%x00%D", "-z", "HEAD"]);
  const values = result.out.split("\0"), commits = [];
  for (let i = 0; i + 4 < values.length; i += 5) commits.push({ hash: values[i], subject: values[i + 1], author: values[i + 2], date: Number(values[i + 3]) * 1000, refs: values[i + 4].split(", ").filter(Boolean) });
  return { commits: commits.slice(0, limit), hasMore: commits.length > limit };
}

async function comparison(root: string, hash: string): Promise<string[]> {
  revision(hash);
  const parents = (await run(root, ["rev-list", "--parents", "--max-count=1", hash, "--"])).out.trim().split(" ");
  if (parents[0] !== hash) throw new GitError("Commit not found.", 404);
  return parents[1] ? ["diff", ...diffOptions, parents[1], hash] : ["diff-tree", "--root", "--no-commit-id", "-r", ...diffOptions, hash];
}

export async function gitCommit(root: string, hash: string): Promise<GitCommitDetail> {
  const args = await comparison(root, hash);
  const [names, stats, message] = await Promise.all([
    run(root, [...args, "--name-status", "-z"]), run(root, [...args, "--numstat", "-z"]), run(root, ["show", "--no-patch", "--format=%B", hash, "--"]),
  ]);
  const counts = numstat(stats.out), parts = names.out.split("\0"), files = [];
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i]; if (!status) continue;
    const first = parts[++i], rename = /^[RC]/.test(status), path = rename ? parts[++i] : first;
    files.push({ path, status: status[0], ...(rename ? { originalPath: first } : {}), ...(counts.get(path) ?? EMPTY_COUNTS) });
  }
  return { hash, message: message.out.trimEnd(), files };
}

export async function gitDiff(root: string, path: string, mode: string, hash?: string): Promise<GitDiff> {
  gitPath(path);
  if (!["staged", "unstaged", "commit"].includes(mode)) throw new GitError("Invalid diff mode.", 400);
  let args: string[], originalPath: string | undefined;
  if (mode === "commit") {
    const detail = await gitCommit(root, revision(hash));
    const file = detail.files.find(file => file.path === path);
    if (!file) throw new GitError("File is not part of this commit.", 404);
    originalPath = file.originalPath; args = [...await comparison(root, detail.hash), "-p"];
  } else {
    const status = await gitStatus(root), file = status.files.find(file => file.path === path);
    originalPath = file?.originalPath;
    if (mode === "unstaged" && file?.index === "?") {
      const absolute = resolve(root, path), info = await lstat(absolute);
      if (info.isSymbolicLink() || !info.isFile()) return { patch: "", binary: false, truncated: false, notice: "Symbolic link or directory. Preview is unavailable." };
      const actual = await realpath(absolute), rel = relative(root, actual);
      if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) throw new GitError("File is outside the repository.", 400);
      if (info.size > PREVIEW_LIMIT) return { patch: "", binary: false, truncated: true, notice: "File exceeds the 512 KB preview limit." };
      const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const bytes = Buffer.alloc(PREVIEW_LIMIT + 1), { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        if (bytesRead > PREVIEW_LIMIT) return { patch: "", binary: false, truncated: true };
        const content = bytes.subarray(0, bytesRead);
        if (content.includes(0)) return { patch: "", binary: true, truncated: false };
        const text = content.toString("utf8"), lines = text ? text.replace(/\n$/, "").split("\n") : [];
        return { patch: `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(line => `+${line}`).join("\n")}${text && !text.endsWith("\n") ? "\n\\ No newline at end of file" : ""}\n`, binary: false, truncated: false };
      } finally { await handle.close(); }
    }
    args = ["diff", ...diffOptions, ...(mode === "staged" ? ["--cached"] : [])];
  }
  const result = await run(root, [...args, "--", ...(originalPath ? [gitPath(originalPath)] : []), path]);
  const binary = /(^|\n)(Binary files |GIT binary patch)/.test(result.out), truncated = result.out.length > PREVIEW_LIMIT;
  return { patch: result.out.slice(0, PREVIEW_LIMIT), binary, truncated };
}

export function parseGitAction(body: unknown): GitAction {
  if (!body || typeof body !== "object") throw new GitError("Invalid Git action.", 400);
  const value = body as Record<string, unknown>;
  switch (value.action) {
    case "stage": case "unstage":
      if (!Array.isArray(value.paths) || !value.paths.length || value.paths.length > 5000) throw new GitError("Choose between 1 and 5000 files.", 400);
      return { action: value.action, paths: value.paths.map(gitPath) };
    case "commit":
      if (typeof value.message !== "string" || !value.message.trim() || value.message.length > 20_000 || value.message.includes("\0")) throw new GitError("Enter a commit message.", 400);
      return { action: "commit", message: value.message };
    case "create-branch": case "switch-branch":
      if (typeof value.branch !== "string" || !value.branch || value.branch.length > 256 || value.branch.startsWith("-") || /[\s\0]/.test(value.branch)) throw new GitError("Invalid branch name.", 400);
      return { action: value.action, branch: value.branch };
    case "fetch": case "pull": case "push":
      if (value.remote !== undefined && (typeof value.remote !== "string" || !/^[a-zA-Z0-9_.-]+$/.test(value.remote) || value.remote.startsWith("-"))) throw new GitError("Invalid remote.", 400);
      return { action: value.action, ...(value.remote ? { remote: value.remote as string } : {}) };
    default: throw new GitError("Unsupported Git action.", 400);
  }
}

export async function gitAction(root: string, action: GitAction, expected?: GitExpectation) {
  if (mutations.has(root)) throw new GitError("Another Git operation is running for this repository.");
  mutations.add(root);
  try {
    const status = await gitStatus(root);
    if (expected && (expected.branch !== status.branch || expected.head !== status.head)) throw new GitError("Repository HEAD changed. Refresh and review the current branch before trying again.");
    if (action.action === "stage" || action.action === "unstage") {
      const selected = status.files.filter(file => action.paths.includes(file.path));
      if (selected.length !== new Set(action.paths).size) throw new GitError("Files changed since the last refresh. Refresh and try again.");
      const paths = [...new Set(selected.flatMap(file => file.originalPath ? [file.originalPath, file.path] : [file.path]))];
      if (action.action === "stage") await run(root, ["add", "--all", "--", ...paths]);
      else if (status.unborn) await run(root, ["update-index", "--force-remove", "--", ...paths]);
      else await run(root, ["restore", "--staged", "--", ...paths]);
    } else if (action.action === "commit") {
      if (!status.files.some(file => file.index !== " " && file.index !== "?")) throw new GitError("Stage files before committing.");
      await run(root, ["commit", "--file=-"], { input: action.message, timeout: 60_000 });
    } else if (action.action === "create-branch") {
      await run(root, ["check-ref-format", "--branch", action.branch]); await run(root, ["switch", "-c", action.branch]);
    } else if (action.action === "switch-branch") {
      const target = status.branches.find(branch => branch.name === action.branch);
      if (!target) throw new GitError("Branch no longer exists. Refresh and try again.");
      await run(root, ["switch", ...(target.remote ? ["--track"] : []), action.branch]);
    } else if (action.action === "fetch" || action.action === "pull" || action.action === "push") {
      if ((action.action === "push" || action.action === "pull") && !status.branch) throw new GitError("Switch to a branch before synchronizing.");
      const configured = status.branch ? (await run(root, ["config", "--get", `branch.${status.branch}.remote`], { allowFailure: true })).out.trim() : "";
      const remote = action.remote ?? status.remote;
      if (!remote || !status.remotes.includes(remote)) throw new GitError("Configure a Git remote before synchronizing.");
      if (action.action === "fetch") await run(root, ["fetch", "--", remote], { timeout: 60_000 });
      else if (action.action === "pull") {
        if (!status.upstream) throw new GitError("Publish this branch to set its upstream before pulling.");
        await run(root, ["pull", "--ff-only"], { timeout: 60_000 });
      } else {
        const merge = (await run(root, ["config", "--get", `branch.${status.branch}.merge`], { allowFailure: true })).out.trim();
        const destination = status.upstream && remote === configured && merge.startsWith("refs/heads/") ? merge : `refs/heads/${status.branch}`;
        await run(root, ["push", ...(!status.upstream ? ["--set-upstream"] : []), "--", remote, `HEAD:${destination}`], { timeout: 60_000 });
      }
    }
    return { ok: true };
  } finally { mutations.delete(root); }
}
