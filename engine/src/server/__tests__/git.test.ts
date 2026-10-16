import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import type { GitStatus, GitDiff, GitHistory, GitCommitDetail } from "@shared/git";
import { registerGitRoutes } from "../routes/git";
import { runGit } from "../gitProcess";

const homes: string[] = [];
afterEach(() => { for (const path of homes.splice(0)) rmSync(path, { recursive: true, force: true }); });
function git(root: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
  if (result.exitCode) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kliprun-git-"))); homes.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Demo Author"); git(root, "config", "user.email", "demo@example.invalid");
  git(root, "config", "commit.gpgsign", "false"); git(root, "config", "core.hooksPath", "/dev/null");
  const app = new Hono(); registerGitRoutes(app);
  const get = async (path: string, extra: Record<string, string> = {}) => app.request(`/api/git/${path}?${new URLSearchParams({ directory: root, ...extra })}`);
  const action = async (body: Record<string, unknown>) => app.request("/api/git/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ directory: root, ...body }) });
  return { root, app, get, action };
}
test("Git routes identify unborn repositories and stage literal filenames without touching siblings", async () => {
  const { root, get, action } = fixture();
  writeFileSync(join(root, "[draft].txt"), "first\n"); writeFileSync(join(root, "d.txt"), "keep\n");
  const initial = await (await get("status")).json() as GitStatus;
  expect(initial).toMatchObject({ root, branch: "main", unborn: true, ahead: 0, behind: 0 });
  expect(initial.files).toHaveLength(2);
  expect((await action({ action: "stage", paths: ["[draft].txt"] })).status).toBe(200);
  expect(git(root, "diff", "--cached", "--name-only")).toBe("[draft].txt");
  expect((await action({ action: "unstage", paths: ["[draft].txt"] })).status).toBe(200);
  expect(git(root, "diff", "--cached", "--name-only")).toBe("");
});
test("staged and unstaged diffs remain separate and commits contain only staged data", async () => {
  const { root, get, action } = fixture();
  writeFileSync(join(root, "file.txt"), "one\n"); git(root, "add", "."); git(root, "commit", "-qm", "Initial");
  writeFileSync(join(root, "file.txt"), "two\n"); await action({ action: "stage", paths: ["file.txt"] });
  writeFileSync(join(root, "file.txt"), "three\n");
  expect(await (await get("diff", { path: "file.txt", mode: "staged" })).json()).toMatchObject({ binary: false, truncated: false });
  expect((await (await get("diff", { path: "file.txt", mode: "staged" })).json() as GitDiff).patch).toContain("+two");
  expect((await (await get("diff", { path: "file.txt", mode: "unstaged" })).json() as GitDiff).patch).toContain("+three");
  expect((await action({ action: "commit", message: "Update" })).status).toBe(200);
  expect(git(root, "show", "HEAD:file.txt")).toBe("two"); expect(readFileSync(join(root, "file.txt"), "utf8")).toBe("three\n");
  const history = await (await get("history", { skip: "0", limit: "1" })).json() as GitHistory;
  expect(history.commits[0]).toMatchObject({ subject: "Update", author: "Demo Author" }); expect(history.hasMore).toBe(true);
  const older = await (await get("history", { skip: "1", limit: "1" })).json() as GitHistory;
  expect(older.commits[0].subject).toBe("Initial");
  const commit = await (await get("commit", { revision: older.commits[0].hash })).json() as GitCommitDetail;
  expect(commit.files[0]).toMatchObject({ path: "file.txt", status: "A" });
  expect((await (await get("diff", { path: "file.txt", mode: "commit", revision: older.commits[0].hash })).json() as GitDiff).patch).toContain("+one");
});
test("renames, binary files, symlinks and oversized previews have explicit results", async () => {
  const { root, get } = fixture();
  writeFileSync(join(root, "old.txt"), "same\n"); git(root, "add", "."); git(root, "commit", "-qm", "Initial");
  git(root, "mv", "old.txt", "новый file.txt");
  const status = await (await get("status")).json() as GitStatus;
  expect(status.files.find((f: { path: string }) => f.path === "новый file.txt")).toMatchObject({ originalPath: "old.txt", index: "R" });
  expect((await (await get("diff", { path: "новый file.txt", mode: "staged" })).json() as GitDiff).patch).toContain("rename from old.txt");
  writeFileSync(join(root, "binary"), Buffer.from([0, 1, 2]));
  expect(await (await get("diff", { path: "binary", mode: "unstaged" })).json()).toMatchObject({ binary: true });
  symlinkSync("/etc/passwd", join(root, "outside"));
  const link = await (await get("diff", { path: "outside", mode: "unstaged" })).json();
  expect(JSON.stringify(link)).not.toContain("root:");
  writeFileSync(join(root, "large"), "x".repeat(600_000));
  expect(await (await get("diff", { path: "large", mode: "unstaged" })).json()).toMatchObject({ truncated: true });
});
test("branches support creation, worktrees and detached HEAD without discarding dirty files", async () => {
  const { root, get, action } = fixture();
  writeFileSync(join(root, "file"), "base"); git(root, "add", "."); git(root, "commit", "-qm", "Initial");
  expect((await action({ action: "create-branch", branch: "feature/demo" })).status).toBe(200);
  expect(git(root, "branch", "--show-current")).toBe("feature/demo");
  writeFileSync(join(root, "file"), "feature"); git(root, "commit", "-qam", "Feature");
  await action({ action: "switch-branch", branch: "main" }); writeFileSync(join(root, "file"), "local");
  expect((await action({ action: "switch-branch", branch: "feature/demo" })).status).toBe(409);
  expect(readFileSync(join(root, "file"), "utf8")).toBe("local");
  const tree = join(root, "worktree"); git(root, "worktree", "add", "-q", "-b", "other", tree);
  const response = await get("status", { directory: tree }); expect((await response.json() as GitStatus).root).toBe(tree);
  git(root, "checkout", "--detach", "-q"); expect(await (await get("status")).json()).toMatchObject({ branch: null, unborn: false });
});
test("fetch, publish, push and fast-forward pull use a local remote and reject divergence", async () => {
  const { root, get, action } = fixture();
  const bare = join(root, "remote.git"); mkdirSync(bare); git(bare, "init", "--bare", "-q", "-b", "main");
  git(root, "remote", "add", "origin", bare);
  writeFileSync(join(root, "file"), "base"); git(root, "add", "file"); git(root, "commit", "-qm", "Initial");
  expect((await action({ action: "push" })).status).toBe(200);
  expect(await (await get("status")).json()).toMatchObject({ upstream: "origin/main", ahead: 0, behind: 0 });
  const peer = join(root, "peer"); git(root, "clone", "-q", bare, peer);
  git(peer, "config", "user.name", "Peer"); git(peer, "config", "user.email", "peer@example.invalid"); git(peer, "config", "commit.gpgsign", "false");
  writeFileSync(join(peer, "file"), "remote"); git(peer, "commit", "-qam", "Remote update"); git(peer, "push", "-q");
  expect((await action({ action: "fetch" })).status).toBe(200);
  expect((await (await get("status")).json() as GitStatus).behind).toBe(1);
  expect((await action({ action: "pull" })).status).toBe(200); expect(readFileSync(join(root, "file"), "utf8")).toBe("remote");
  writeFileSync(join(root, "file"), "local"); git(root, "commit", "-qam", "Local");
  writeFileSync(join(peer, "file"), "diverged"); git(peer, "commit", "-qam", "Divergence"); git(peer, "push", "-q");
  expect((await action({ action: "pull" })).status).toBe(409);
  expect(readFileSync(join(root, "file"), "utf8")).toBe("local");
});
test("Git API rejects foreign origins, malformed actions, path escape and revisions", async () => {
  const { root, app, get, action } = fixture();
  expect((await action({ action: "stage", paths: ["../outside"] })).status).toBe(400);
  expect((await action({ action: "stage", paths: [".git/config"] })).status).toBe(400);
  expect((await action({ action: "commit", message: " " })).status).toBe(400);
  expect((await action({ action: "reset" })).status).toBe(400);
  expect((await get("diff", { path: "../outside", mode: "unstaged" })).status).toBe(400);
  expect((await get("commit", { revision: "--help" })).status).toBe(400);
  expect((await get("history", { skip: "-1" })).status).toBe(400);
  const foreign = await app.request("/api/git/action", { method: "POST", headers: { Origin: "https://evil.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ directory: root, action: "fetch" }) });
  expect(foreign.status).toBe(403);
  expect((await app.request("/api/git/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status).toBe(400);
});

test("unstaging an unborn file preserves edits made after staging", async () => {
  const { root, action } = fixture();
  writeFileSync(join(root, "file"), "staged\n"); await action({ action: "stage", paths: ["file"] });
  writeFileSync(join(root, "file"), "newer working contents\n");
  expect((await action({ action: "unstage", paths: ["file"] })).status).toBe(200);
  expect(git(root, "ls-files")).toBe("");
  expect(readFileSync(join(root, "file"), "utf8")).toBe("newer working contents\n");
});

test("repository discovery deduplicates subdirectories and aliases but preserves worktrees", async () => {
  const { root, app } = fixture();
  mkdirSync(join(root, "nested")); symlinkSync(root, join(root, "alias"));
  writeFileSync(join(root, "file"), "demo"); git(root, "add", "file"); git(root, "commit", "-qm", "Initial");
  const tree = join(root, "worktree"); git(root, "worktree", "add", "-q", "-b", "other", tree);
  const query = new URLSearchParams([root, join(root, "nested"), join(root, "alias"), tree, join(root, "missing")].map(directory => ["directory", directory] as [string, string]));
  expect(await (await app.request(`/api/git/repositories?${query}`)).json()).toEqual({ repositories: [root, tree].sort() });
});

test("deletions and merge commits show changes against the first parent", async () => {
  const { root, get, action } = fixture();
  writeFileSync(join(root, "deleted"), "remove me\n"); git(root, "add", "deleted"); git(root, "commit", "-qm", "Initial");
  git(root, "switch", "-qc", "feature"); writeFileSync(join(root, "feature"), "added\n"); git(root, "add", "feature"); git(root, "commit", "-qm", "Feature");
  git(root, "switch", "-q", "main"); writeFileSync(join(root, "main"), "main\n"); git(root, "add", "main"); git(root, "commit", "-qm", "Main");
  git(root, "merge", "--no-ff", "-qm", "Merge", "feature");
  const hash = git(root, "rev-parse", "HEAD");
  const merged = await (await get("commit", { revision: hash })).json() as GitCommitDetail;
  expect(merged.files.map(file => file.path)).toEqual(["feature"]);
  git(root, "rm", "-q", "deleted");
  expect((await (await get("diff", { path: "deleted", mode: "staged" })).json() as GitDiff).patch).toContain("-remove me");
  await action({ action: "unstage", paths: ["deleted"] });
  expect((await (await get("status")).json() as GitStatus).files.find(file => file.path === "deleted")).toMatchObject({ index: " ", worktree: "D" });
});

test("large tracked diffs fail within the output bound without running configured external diff", async () => {
  const { root, get } = fixture();
  writeFileSync(join(root, "file"), "old\n"); git(root, "add", "file"); git(root, "commit", "-qm", "Initial");
  git(root, "config", "diff.external", "false"); writeFileSync(join(root, "file"), "new\n");
  expect((await get("diff", { path: "file", mode: "unstaged" })).status).toBe(200);
  writeFileSync(join(root, "file"), "large line\n".repeat(450_000));
  expect((await get("diff", { path: "file", mode: "unstaged" })).status).toBe(413);
});

test("Git process deadlines terminate slow children and leave other requests usable", async () => {
  const { root } = fixture();
  const started = Date.now();
  await expect(runGit(root, ["-c", "alias.slow=!sleep 10", "slow"], { timeout: 50 })).rejects.toMatchObject({ status: 504 });
  expect(Date.now() - started).toBeLessThan(1500);
  expect((await runGit(root, ["status", "--porcelain"])).code).toBe(0);
});

test("Git errors remove credential-bearing remote URLs", async () => {
  const { root } = fixture();
  for (const protocol of ["https", "ssh"]) {
    const failure = runGit(root, ["-c", `alias.fail=!echo ${protocol}://demo:fake-password@example.invalid/private.git >&2; exit 1`, "fail"]);
    await expect(failure).rejects.toThrow(`${protocol}://[redacted]@example.invalid`);
  }
});

test("remote-tracking selection creates a local branch and default remote prefers origin", async () => {
  const { root, get, action } = fixture();
  writeFileSync(join(root, "file"), "base\n"); git(root, "add", "file"); git(root, "commit", "-qm", "Initial");
  git(root, "remote", "add", "backup", "/demo/unused"); git(root, "remote", "add", "origin", "/demo/unused");
  git(root, "update-ref", "refs/remotes/origin/topic", "HEAD");
  git(root, "config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");
  expect((await (await get("status")).json() as GitStatus).remote).toBe("origin");
  expect((await action({ action: "switch-branch", branch: "origin/topic" })).status).toBe(200);
  expect(await (await get("status")).json()).toMatchObject({ branch: "topic", upstream: "origin/topic" });
});

test("branch choices expose their own latest commit metadata", async () => {
  const { root, get } = fixture();
  writeFileSync(join(root, "file"), "base\n"); git(root, "add", "file"); git(root, "commit", "-qm", "Initial branch commit");
  const firstDate = Number(git(root, "log", "-1", "--format=%ct")) * 1000;
  git(root, "switch", "-qc", "feature/metadata");
  writeFileSync(join(root, "file"), "updated\n"); git(root, "commit", "-qam", "Branch details\n\nA separate body.");
  git(root, "update-ref", "refs/remotes/origin/demo", "HEAD");
  const status = await (await get("status")).json() as GitStatus;
  expect(status.branches.find(branch => branch.name === "main")).toMatchObject({ current: false, author: "Demo Author", date: firstDate, subject: "Initial branch commit" });
  expect(status.branches.find(branch => branch.name === "feature/metadata")).toMatchObject({ current: true, author: "Demo Author", subject: "Branch details" });
  expect(status.branches.find(branch => branch.name === "origin/demo")).toMatchObject({ remote: true, author: "Demo Author", subject: "Branch details" });
});

test("confirmed actions reject a branch changed by another process", async () => {
  const { root, action } = fixture();
  writeFileSync(join(root, "file"), "base\n"); git(root, "add", "file"); git(root, "commit", "-qm", "Initial");
  const head = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "file"), "pending\n"); git(root, "add", "file");
  git(root, "switch", "-qc", "other");
  expect((await action({ action: "commit", message: "Must not land on other", expected: { branch: "main", head } })).status).toBe(409);
  expect(git(root, "log", "-1", "--format=%s")).toBe("Initial");
});
