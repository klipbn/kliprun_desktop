import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute, relative } from 'node:path';
import { gitAction, gitRoot, gitStatus } from '../git';
import { runGit } from '../gitProcess';
import { publicationCommitMessage } from '@shared/workflow';
import type { PublicationNode, ReviewedState, StepResult, WorkflowDefinition, WorkflowRun, WorkspaceState } from '@shared/workflow';

async function pushRemotes(root: string, remotes: string[]) {
  const result: Record<string, string> = {};
  for (const name of remotes) {
    const urls = (await runGit(root, ['remote', 'get-url', '--push', '--all', name])).out.trim().split('\n');
    if (urls.length !== 1) throw Error('Workflow publication requires one push URL per remote.');
    result[name] = urls[0];
  }
  return result;
}
export async function prepareWorkspace(flow: WorkflowDefinition, claim: (path: string) => void): Promise<WorkspaceState> {
  if (!isAbsolute(flow.directory)) throw Error('Choose an absolute working folder.');
  const directory = await realpath(flow.directory); if (!(await stat(directory)).isDirectory()) throw Error('Working folder is not a directory.');
  const check = await runGit(directory, ['rev-parse', '--is-inside-work-tree'], { allowFailure: true });
  if (check.code || check.out.trim() !== 'true') {
    claim(directory);
    if (flow.nodes.some(n => n.kind === 'publication')) throw Error('Git publication needs a Git working tree.');
    return { directory, branch: '', remotes: {} };
  }
  const root = await gitRoot(directory); claim(root);
  let status = await gitStatus(root);
  const writes = flow.nodes.some(n => n.kind === 'publication' || n.kind === 'agent' && n.resultKind === 'code');
  if ((writes || flow.branch && flow.branch !== status.branch) && status.files.length) throw Error('Start requires a clean working copy so only workflow changes are committed. Commit or stash existing changes, or choose a clean worktree, then start again.');
  const selectedRemotes = [...new Set(flow.nodes.flatMap(node => node.kind === 'publication' ? [node.remote] : []))];
  for (const name of selectedRemotes) if (!status.remotes.includes(name)) {
    throw Error(`Remote ${name} is not configured. Choose ${status.remotes.join(' or ') || 'a configured remote'} in Commit & Push options.`);
  }
  const remotes = await pushRemotes(root, selectedRemotes);
  if (flow.branch && flow.branch !== status.branch) {
    const publication = flow.nodes.some(n => n.kind === 'publication');
    const create = publication ? !status.branches.some(b => !b.remote && b.name === flow.branch) : flow.createBranch;
    await gitAction(root, { action: create ? 'create-branch' : 'switch-branch', branch: flow.branch }, { branch: status.branch, head: status.head });
    status = await gitStatus(root);
  }
  if (!status.branch || !status.head) throw Error('Choose a branch with an initial commit before starting a Git workflow.');
  return { directory, root, branch: status.branch, baseHead: status.head, remotes };
}

export async function inspectWorkspace(run: WorkflowRun): Promise<ReviewedState | null> {
  const root = run.workspace.root; if (!root) return null;
  const status = await gitStatus(root);
  if (status.branch !== run.workspace.branch) throw Error('Working branch changed during the run. Restore the selected branch before continuing.');
  if (!status.head) throw Error('The working branch has no HEAD.');
  const folder = await mkdtemp(join(tmpdir(), 'kliprun-workflow-index-')), indexFile = join(folder, 'index');
  try {
    await runGit(root, ['read-tree', 'HEAD'], { indexFile });
    await runGit(root, ['add', '--all', '--', '.'], { indexFile, timeout: 60_000 });
    const tree = (await runGit(root, ['write-tree'], { indexFile })).out.trim();
    return { head: status.head, tree, fingerprint: createHash('sha256').update(`${status.head}\n${tree}`).digest('hex'), paths: [...new Set(status.files.flatMap(f => f.originalPath ? [f.originalPath, f.path] : [f.path]))] };
  } finally { await rm(folder, { recursive: true, force: true }); }
}

export async function validateOutputFiles(run: WorkflowRun, paths: string[]): Promise<string[]> {
  const root = await realpath(run.workspace.directory), files: string[] = [];
  for (const path of paths) {
    if (!path.trim()) continue;
    const resolved = await realpath(isAbsolute(path) ? path : join(root, path)).catch(() => { throw Error(`Output file is missing: ${path}`); });
    const rel = relative(root, resolved);
    if (rel === '..' || rel.startsWith('../') || isAbsolute(rel) || rel.split('/').includes('.git') || !(await stat(resolved)).isFile()) throw Error(`Output file must be a readable file within the working folder: ${path}`);
    const file = Bun.file(resolved); await file.slice(0, 1).arrayBuffer(); files.push(resolved);
  }
  return [...new Set(files)];
}

export async function publishWorkflow(run: WorkflowRun, node: PublicationNode, signal: AbortSignal, persist: () => void): Promise<StepResult> {
  if (!run.publicationAuthorized) throw Error('Publication is not authorized for this run.');
  const root = run.workspace.root; if (!root) throw Error('Publication requires a Git working tree.');
  const frozenRemote = run.workspace.remotes[node.remote];
  const remote = (await runGit(root, ['remote', 'get-url', '--push', '--all', node.remote])).out.trim();
  if (!frozenRemote || remote !== frozenRemote) throw Error('The selected remote changed. Start a new run to authorize the new destination.');
  const current = (await inspectWorkspace(run))!;
  if (!run.reviewed && !run.snapshot.nodes.some(n => n.kind === 'agent' && n.resultKind === 'review')) {
    run.reviewed = current; persist();
  }
  const reviewed = run.reviewed;
  if (!reviewed) throw Error('No approved version is available. Return to an agent/review card before publishing.');
  const receipt = run.publicationReceipts[node.id] ??= {};
  // A commit may have completed just before the engine lost its response.
  if (!receipt.sha && receipt.intendedTree === current.tree && receipt.baseHead && current.head !== receipt.baseHead) {
    const parent = (await runGit(root, ['rev-parse', 'HEAD^'])).out.trim();
    if (parent === receipt.baseHead && !current.paths.length) { receipt.sha = current.head; persist(); }
  }
  const committedRetry = receipt.sha === current.head && current.tree === reviewed.tree && !current.paths.length;
  if (current.fingerprint !== reviewed.fingerprint && !committedRetry) throw Error('Code changed since approval. Return to review before publishing.');
  signal.throwIfAborted();
  if (!committedRetry && current.paths.length) {
    receipt.intendedTree = reviewed.tree; receipt.baseHead = reviewed.head; receipt.sha = undefined; persist();
    await runGit(root, ['add', '--all', '--', ...reviewed.paths]);
    if ((await runGit(root, ['write-tree'])).out.trim() !== reviewed.tree) throw Error('Staged files changed after review. Repeat review before publishing.');
    signal.throwIfAborted();
    await runGit(root, ['commit', '--file=-'], { input: publicationCommitMessage(run.snapshot, node), timeout: 60_000 });
    receipt.sha = (await runGit(root, ['rev-parse', 'HEAD'])).out.trim(); persist();
  } else { receipt.sha = current.head; persist(); }
  const committed = (await inspectWorkspace(run))!;
  if (committed.tree !== reviewed.tree || committed.paths.length || committed.head !== receipt.sha) throw Error('Files changed during commit. Repeat review before publishing.');
  signal.throwIfAborted();
  const ref = `refs/heads/${run.workspace.branch}`;
  const remoteSHA = async () => (await runGit(root, ['ls-remote', '--refs', '--', node.remote, ref], { timeout: 60_000 })).out.split(/\s+/)[0];
  if (await remoteSHA() !== receipt.sha) {
    try { await runGit(root, ['push', '--', node.remote, `${receipt.sha}:${ref}`], { timeout: 60_000 }); }
    catch (error) { if (await remoteSHA() !== receipt.sha) throw error; }
    if (await remoteSHA() !== receipt.sha) throw Error('Push was not confirmed by the remote. Retry to reconcile.');
  }
  return { text: `Pushed ${node.remote}/${run.workspace.branch} (${receipt.sha!.slice(0, 12)}).\nCreate the MR/PR manually when you are ready.`, files: [], publication: { sha: receipt.sha!, remote: node.remote, branch: run.workspace.branch } };
}
