export interface GitCounts { additions: number | null; deletions: number | null }
export interface GitFile {
  path: string; originalPath?: string; index: string; worktree: string;
  staged: GitCounts; unstaged: GitCounts;
}
export interface GitBranch {
  name: string; remote: boolean; current: boolean; upstream: string | null;
  author: string | null; date: number | null; subject: string | null;
}
export interface GitStatus {
  root: string; branch: string | null; head: string | null; unborn: boolean;
  upstream: string | null; ahead: number; behind: number; remote: string | null; remotes: string[];
  branches: GitBranch[]; files: GitFile[];
}
export interface GitCommit { hash: string; subject: string; author: string; date: number; refs: string[] }
export interface GitCommitFile extends GitCounts { path: string; originalPath?: string; status: string }
export interface GitCommitDetail { hash: string; message: string; files: GitCommitFile[] }
export interface GitHistory { commits: GitCommit[]; hasMore: boolean }
export type GitDiffMode = "staged" | "unstaged" | "commit";
export interface GitDiff { patch: string; binary: boolean; truncated: boolean; notice?: string }
export interface GitFileList { root: string; files: string[]; truncated: boolean }
export interface GitFileContent { root: string; path: string; content: string; revision: string }
export type GitFileAction = { action: "move"; path: string; destination: string } | { action: "ignore"; path: string };
export interface GitExpectation { branch: string | null; head: string | null }
export type GitAction =
  | { action: "stage" | "unstage"; paths: string[] }
  | { action: "commit"; message: string }
  | { action: "create-branch" | "switch-branch"; branch: string }
  | { action: "fetch" | "pull" | "push"; remote?: string };
