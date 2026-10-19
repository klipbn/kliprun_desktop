import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute, relative } from 'node:path';
import { gitAction, gitRoot, gitStatus } from '../git';
import { runGit } from '../gitProcess';
import { currentResult } from '@shared/workflow';
import type { PublicationNode, ReviewedState, StepResult, WorkflowDefinition, WorkflowRun, WorkspaceState } from '@shared/workflow';
import { command } from './process';

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
  if ((writes || flow.branch && flow.branch !== status.branch) && status.files.length) throw Error('Start requires a clean working copy. Commit your changes or choose a separate folder/worktree.');
  if (flow.branch && flow.branch !== status.branch) {
    await gitAction(root, { action: flow.createBranch ? 'create-branch' : 'switch-branch', branch: flow.branch }, { branch: status.branch, head: status.head });
    status = await gitStatus(root);
  }
  if (!status.branch || !status.head) throw Error('Choose a branch with an initial commit before starting a Git workflow.');
  const remotes = await pushRemotes(root, status.remotes);
  for (const node of flow.nodes) if (node.kind === 'publication') {
    if (!remotes[node.remote]) throw Error(`Remote ${node.remote} is not configured.`);
    if (node.mode === 'request') requestRepository(remotes[node.remote], node.provider);
  }
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

export interface RequestRepository { provider: 'github' | 'gitlab'; host: string; project: string }
export function requestRepository(remote: string, provider: PublicationNode['provider']): RequestRepository {
  const scp = remote.match(/^(?:[^@/]+@)?([^/:]+):([^/].*)$/);
  let host: string, project: string;
  if (!remote.includes('://') && scp) { host = scp[1]; project = scp[2]; }
  else {
    let url: URL; try { url = new URL(remote); } catch { throw Error('MR/PR requires an SSH or HTTPS hosting remote.'); }
    if (!['ssh:', 'https:'].includes(url.protocol)) throw Error('MR/PR requires an SSH or HTTPS hosting remote.');
    host = url.hostname; project = url.pathname.slice(1);
  }
  project = project.replace(/\.git$/, '').replace(/\/$/, '');
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+$/.test(project)) throw Error('Unsupported repository remote.');
  const detected = /github/i.test(host) ? 'github' : /gitlab/i.test(host) ? 'gitlab' : null;
  if (provider === 'auto' && !detected) throw Error('Select GitHub or GitLab explicitly for this remote provider.');
  return { provider: provider === 'auto' ? detected! : provider, host, project };
}
export type HostingAPI = (repo: RequestRepository, method: string, path: string, body?: Record<string, unknown>) => Promise<unknown>;
export const hostingAPI: HostingAPI = async (repo, method, path, body) => {
  const cli = repo.provider === 'github' ? 'gh' : 'glab';
  const args = [cli, 'api', '--hostname', repo.host, '--method', method, path, ...(body ? ['--input', '-'] : [])];
  try { return JSON.parse(await command(args, { input: body ? JSON.stringify(body) : undefined, timeout: 60_000 })); }
  catch (error) { throw Error(`${repo.provider === 'github' ? 'GitHub' : 'GitLab'} access failed for ${repo.host}. Sign in using ${cli} auth login for this host. ${error instanceof Error ? error.message : error}`); }
};
export async function upsertRequest(repo: RequestRepository, source: string, node: PublicationNode, description: string, api: HostingAPI = hostingAPI): Promise<string> {
  const github = repo.provider === 'github';
  const base = github ? `repos/${repo.project}/pulls` : `projects/${encodeURIComponent(repo.project)}/merge_requests`;
  const query = github ? new URLSearchParams({ state: 'all', head: `${repo.project.split('/')[0]}:${source}`, base: node.targetBranch, per_page: '100' })
    : new URLSearchParams({ state: 'all', source_branch: source, target_branch: node.targetBranch, per_page: '100' });
  const values = await api(repo, 'GET', `${base}?${query}`);
  if (!Array.isArray(values)) throw Error('Hosting service returned an invalid request list.');
  const matches = values.filter(v => github ? v.head?.ref === source && v.base?.ref === node.targetBranch : v.source_branch === source && v.target_branch === node.targetBranch);
  if (matches.length > 1) throw Error('Multiple MR/PRs match the source and target branches. Resolve them before retrying.');
  const existing = matches[0];
  if (existing && !['open', 'opened'].includes(existing.state)) throw Error('The matching MR/PR is closed or merged. Review it in the hosting service before starting another run.');
  const body = github ? { title: node.requestTitle, body: description } : { title: node.requestTitle, description };
  const result = (existing ? await api(repo, github ? 'PATCH' : 'PUT', `${base}/${github ? existing.number : existing.iid}`, body)
    : await api(repo, 'POST', base, { ...body, ...(github ? { head: source, base: node.targetBranch } : { source_branch: source, target_branch: node.targetBranch }) })) as Record<string, unknown>;
  const value = result?.[github ? 'html_url' : 'web_url'];
  if (typeof value !== 'string') throw Error('Hosting service did not confirm an MR/PR URL. Retry to reconcile.');
  const url = new URL(value); if (url.protocol !== 'https:' || url.hostname !== repo.host) throw Error('Hosting service returned an unexpected MR/PR URL.');
  return url.href;
}

export async function publishWorkflow(run: WorkflowRun, node: PublicationNode, signal: AbortSignal, persist: () => void): Promise<StepResult> {
  if (!run.publicationAuthorized) throw Error('Publication is not authorized for this run.');
  const root = run.workspace.root; if (!root) throw Error('Publication requires a Git working tree.');
  const frozenRemote = run.workspace.remotes[node.remote];
  const remote = (await runGit(root, ['remote', 'get-url', '--push', '--all', node.remote])).out.trim();
  if (!frozenRemote || remote !== frozenRemote) throw Error('The selected remote changed. Start a new run to authorize the new destination.');
  const current = (await inspectWorkspace(run))!, reviewed = run.reviewed;
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
    await runGit(root, ['commit', '--file=-'], { input: node.requestTitle, timeout: 60_000 });
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
  if (node.mode === 'request') {
    signal.throwIfAborted();
    const results = run.snapshot.nodes.flatMap(n => { const a = currentResult(run, n.id); return a?.result ? [`## ${n.title}\n${a.result.text}`] : []; }).join('\n\n');
    receipt.url = await upsertRequest(requestRepository(remote, node.provider), run.workspace.branch, node, node.description.replaceAll('{{results}}', results)); persist();
  }
  return { text: `Published ${receipt.sha} to ${node.remote}/${run.workspace.branch}${receipt.url ? `\n${receipt.url}` : ''}`, files: [], publication: { sha: receipt.sha!, remote: node.remote, branch: run.workspace.branch, ...(receipt.url ? { url: receipt.url } : {}) } };
}
