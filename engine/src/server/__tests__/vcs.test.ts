import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { branchOf, repositoryOf } from "../vcs";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "kliprun-vcs-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("branchOf", () => {
  test("reads HEAD of a plain repo", () => {
    const root = tempDir();
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    expect(branchOf(root)).toBe("main");
  });

  test("walks up from a nested directory", () => {
    const root = tempDir();
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/TRG-233968\n");
    const nested = join(root, "task", "subdir");
    mkdirSync(nested, { recursive: true });
    expect(branchOf(nested)).toBe("TRG-233968");
  });

  test("worktree .git file resolves gitdir HEAD", () => {
    const root = tempDir();
    const gitdir = join(root, "repo.git", "worktrees", "wt1");
    mkdirSync(gitdir, { recursive: true });
    writeFileSync(join(gitdir, "HEAD"), "ref: refs/heads/feature-x\n");
    const worktree = join(root, "wt");
    mkdirSync(worktree);
    writeFileSync(join(worktree, ".git"), `gitdir: ${gitdir}\n`);
    expect(branchOf(worktree)).toBe("feature-x");
  });

  test("detached HEAD yields null", () => {
    const root = tempDir();
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".git", "HEAD"), "1a2b3c4d5e6f\n");
    expect(branchOf(root)).toBeNull();
  });

  test("directory without a repo yields null", () => {
    const root = tempDir();
    expect(branchOf(root)).toBeNull();
  });

  test("reads the current branch immediately after HEAD changes", () => {
    const root = tempDir();
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    expect(branchOf(root)).toBe("main");
    writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/other\n");
    expect(branchOf(root)).toBe("other");
  });
});

test("links to the current GitHub branch without exposing remote credentials", () => {
  const root = tempDir();
  Bun.spawnSync(["git", "init", "-q", root]);
  writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/feature/new-ui\n");
  Bun.spawnSync(["git", "-C", root, "config", "remote.origin.url", "https://user:private-key@github.com/demo/project.git"]);
  expect(repositoryOf(root)).toEqual({ branch: "feature/new-ui", url: "https://github.com/demo/project/tree/feature%2Fnew-ui" });
  writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/other\n");
  expect(repositoryOf(root).url).toBe("https://github.com/demo/project/tree/other");
});

test("uses the branch's tracking remote and supports GitLab SSH remotes in a relative worktree", () => {
  const root = tempDir();
  Bun.spawnSync(["git", "init", "-q", root]);
  Bun.spawnSync(["git", "-C", root, "config", "remote.origin.url", "git@github.com:demo/other.git"]);
  Bun.spawnSync(["git", "-C", root, "config", "remote.upstream.url", "ssh://git@gitlab.example.com:2222/team/project.git"]);
  Bun.spawnSync(["git", "-C", root, "config", "branch.feature/new-ui.remote", "upstream"]);
  const gitdir = join(root, ".git", "worktrees", "demo");
  mkdirSync(gitdir, { recursive: true });
  writeFileSync(join(gitdir, "HEAD"), "ref: refs/heads/feature/new-ui\n");
  writeFileSync(join(gitdir, "commondir"), "../..\n");
  const worktree = join(root, "demo"); mkdirSync(worktree);
  writeFileSync(join(worktree, ".git"), "gitdir: ../.git/worktrees/demo\n");
  expect(repositoryOf(worktree)).toEqual({ branch: "feature/new-ui", url: "https://gitlab.example.com/team/project/-/tree/feature%2Fnew-ui" });
});

test("does not create browser links for local or unsafe remotes", () => {
  const root = tempDir(); Bun.spawnSync(["git", "init", "-q", root]);
  for (const remote of ["/tmp/project.git", "file:///tmp/project.git", "javascript:alert(1)"]) {
    Bun.spawnSync(["git", "-C", root, "config", "remote.origin.url", remote]);
    expect(repositoryOf(root).url).toBeNull();
  }
});
