import { lstat, open, readdir, realpath, rename, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import type { GitFileAction, GitFileBase, GitFileContent, GitFileList } from "@shared/git";
import { gitPath, gitRoot } from "./git";
import { GitError, runGit } from "./gitProcess";

const FILE_LIMIT = 512 * 1024;
const MB = 1024 * 1024;
const fileLimit = (path: string) => /\.html?$/i.test(path) ? 40 * MB : /\.ipynb$/i.test(path) ? 10 * MB : FILE_LIMIT;
function checkFileSize(path: string, size: number) {
  if (size > fileLimit(path)) throw new GitError(`File exceeds the ${/\.html?$/i.test(path) ? "40 MB HTML" : /\.ipynb$/i.test(path) ? "10 MB notebook" : "512 KB editor"} limit.`, 413);
}
const saves = new Set<string>();
const fileActions = new Set<string>();
const revision = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function ignoredPaths(root: string, paths: string[], includeTracked = false) {
  if (!paths.length) return new Set<string>();
  // check-ignore reads literal stdin names, but rejects Git's literal pathspec mode.
  const result = await runGit(root, ["--no-literal-pathspecs", "check-ignore", ...(includeTracked ? ["--no-index"] : []), "-z", "--stdin"], { allowFailure: true, input: paths.join("\0") + "\0" });
  if (result.code > 1) throw new GitError("Unable to read Git ignore rules.");
  return new Set(result.out.split("\0").filter(Boolean));
}

async function moveWithoutReplacing(source: string, destination: string) {
  // Checking existence before fs.rename is insufficient when an agent creates the destination concurrently.
  const { dlopen, ptr } = await import("bun:ffi");
  const from = Buffer.from(`${source}\0`), to = Buffer.from(`${destination}\0`);
  const library = dlopen("/usr/lib/libSystem.B.dylib", { renamex_np: { args: ["cstring", "cstring", "u32"], returns: "i32" } });
  try {
    const RENAME_EXCL = 4;
    if (library.symbols.renamex_np(ptr(from), ptr(to), RENAME_EXCL) !== 0) throw new GitError("Unable to move. The destination may already exist or the folder may not be writable.");
  } finally { library.close(); }
}

async function filePath(root: string, path: string) {
  const absolute = resolve(root, gitPath(path));
  try {
    if (await realpath(absolute) !== absolute || !(await lstat(absolute)).isFile()) throw new GitError("Symbolic links and directories cannot be edited.", 400);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new GitError("File no longer exists. Refresh the file list.", 404);
    throw error;
  }
  const listed = await runGit(root, ["ls-files", "--cached", "--others", "-z", "--", path]);
  if (!listed.out.split("\0").includes(path) || await gitRoot(dirname(absolute)) !== root) throw new GitError("File does not belong to the selected repository's file list.", 400);
  return absolute;
}

export async function gitFile(root: string, path: string): Promise<GitFileContent> {
  const absolute = await filePath(root, path);
  const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new GitError("Only regular text files can be opened.", 400);
    checkFileSize(path, info.size);
    // One byte past the reported size detects growth while reading without allocating the whole limit.
    const buffer = Buffer.allocUnsafe(Math.min(fileLimit(path), info.size) + 1), { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    checkFileSize(path, bytesRead);
    if (bytesRead > info.size) throw new GitError("File changed while it was being read. Try again.", 409);
    const bytes = buffer.subarray(0, bytesRead);
    let content: string;
    try {
      if (bytes.includes(0)) throw new Error("binary");
      content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch { throw new GitError("Only UTF-8 text files can be opened in the editor.", 400); }
    return { root, path, content, revision: revision(bytes) };
  } finally { await handle.close(); }
}

export async function gitFileBase(root: string, path: string): Promise<GitFileBase> {
  await filePath(root, path);
  if ((await ignoredPaths(root, [path])).has(path)) return { content: null, notice: "Ignored by Git" };
  try {
    const head = await runGit(root, ["rev-parse", "--verify", "HEAD"], { allowFailure: true });
    if (head.code) return { content: "" };
    const revision = head.out.trim();
    let original = await runGit(root, ["show", `${revision}:${path}`], { allowFailure: true });
    if (original.code) {
      const changes = await runGit(root, ["diff", "--no-ext-diff", "--no-textconv", "--cached", "--find-renames", "--name-status", "-z", revision]);
      const parts = changes.out.split("\0");
      let renamedFrom: string | undefined;
      for (let i = 0; i < parts.length;) {
        const status = parts[i++], before = parts[i++];
        if (/^[RC]/.test(status ?? "")) { const after = parts[i++]; if (after === path) renamedFrom = before; }
      }
      if (!renamedFrom) return { content: "" };
      original = await runGit(root, ["show", `${revision}:${gitPath(renamedFrom)}`], { allowFailure: true });
    }
    if (original.code) return { content: null, notice: "Unable to read the committed file" };
    if (Buffer.byteLength(original.out, "utf8") > FILE_LIMIT) return { content: null, notice: "Git baseline exceeds the 512 KB diff limit" };
    if (/[\0\ufffd]/.test(original.out)) return { content: null, notice: "Git baseline is not UTF-8 text" };
    return { content: original.out };
  } catch (error) {
    if (error instanceof GitError) return { content: null, notice: error.status === 413 ? "Git baseline is too large to display" : "Git baseline is unavailable" };
    throw error;
  }
}

export async function saveGitFile(root: string, path: string, content: unknown, expected: unknown): Promise<GitFileContent> {
  if (fileActions.has(root)) throw new GitError("Another file operation is in progress. Try again.");
  if (typeof content !== "string" || content.includes("\0") || typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) throw new GitError("Invalid file content or revision.", 400);
  const bytes = Buffer.from(content, "utf8");
  checkFileSize(path, bytes.length);
  if (bytes.toString("utf8") !== content) throw new GitError("File contains invalid Unicode text.", 400);
  const absolute = await filePath(root, path);
  if (saves.has(absolute)) throw new GitError("Another save is in progress. Try again.");
  saves.add(absolute);
  const temporary = join(dirname(absolute), `.kliprun-save-${randomUUID()}`);
  try {
    if ((await gitFile(root, path)).revision !== expected) throw new GitError("File changed on disk. Reopen it before saving; your edits have not been written.");
    const info = await lstat(absolute);
    const handle = await open(temporary, "wx", info.mode & 0o777);
    try { await handle.chmod(info.mode & 0o777); await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    // Recheck after preparing the replacement so concurrent agent edits are preserved.
    if ((await gitFile(root, path)).revision !== expected) throw new GitError("File changed on disk. Reopen it before saving; your edits have not been written.");
    await rename(temporary, absolute);
    return { root, path, content, revision: revision(bytes) };
  } finally { saves.delete(absolute); await unlink(temporary).catch(() => {}); }
}

export async function gitFiles(root: string, path?: string, options: { offset?: number; search?: string; includeIgnored?: boolean } = {}): Promise<GitFileList> {
  const limit = 500, offset = options.offset ?? 0, query = options.search?.trim().normalize("NFKC").toLowerCase();
  if (!Number.isSafeInteger(offset) || offset < 0 || options.search !== undefined && (!query || options.search.length > 200 || /[\x00-\x1f\x7f]/.test(options.search) || path !== undefined)) throw new GitError("Invalid file listing or search.", 400);
  let candidates: string[], nextOffset: number | undefined;
  if (query) {
    let matched = 0;
    const result = await runGit(root, ["ls-files", "--cached", "--others", "--deduplicate", ...(options.includeIgnored === false ? ["--exclude-standard"] : []), "-z"], {
      // Stream all names but retain one page, including matches after Git's normal output limit.
      readStdout: async stream => {
        const page: string[] = [], decoder = new TextDecoder();
        let pending = "";
        for await (const chunk of stream) {
          pending += decoder.decode(chunk, { stream: true });
          let end: number;
          while ((end = pending.indexOf("\0")) !== -1) {
            const name = pending.slice(0, end); pending = pending.slice(end + 1);
            if (!name || name.endsWith("/") || !name.normalize("NFKC").toLowerCase().includes(query)) continue;
            if (matched++ >= offset && page.length < limit) page.push(name);
          }
        }
        return page.join("\0");
      },
    });
    candidates = result.out.split("\0").filter(Boolean);
    if (matched > offset + limit) nextOffset = offset + limit;
  } else {
    const parent = path === undefined ? { absolute: root, info: await lstat(root) } : await repositoryEntry(root, path);
    if (!parent.info.isDirectory()) throw new GitError("Choose a repository folder.", 400);
    const entries = (await readdir(parent.absolute)).map(name => path === undefined ? name : `${path}/${name}`).sort();
    candidates = entries.slice(offset, offset + limit);
    if (entries.length > offset + limit) nextOffset = offset + limit;
  }
  const ignored = await ignoredPaths(root, candidates.filter(path => !path.split("/").some(part => part.toLowerCase() === ".git")));
  const files: string[] = [];
  const folders: string[] = [];
  const directories = new Map<string, Promise<boolean>>();
  function belongsToRepository(directory: string): Promise<boolean> {
    if (directory === root) return Promise.resolve(true);
    let result = directories.get(directory);
    if (!result) {
      result = lstat(join(directory, ".git")).then(() => false, error => {
        if (error.code !== "ENOENT") return false;
        return belongsToRepository(dirname(directory));
      });
      directories.set(directory, result);
    }
    return result;
  }
  for (let i = 0; i < candidates.length; i += 32) {
    await Promise.all(candidates.slice(i, i + 32).map(async path => {
      try {
        const absolute = resolve(root, gitPath(path));
        const info = await lstat(absolute);
        if (await realpath(absolute) !== absolute || !await belongsToRepository(info.isDirectory() ? absolute : dirname(absolute))) return;
        if (info.isFile()) files.push(path);
        else if (info.isDirectory()) folders.push(path);
        else return;
      } catch { /* Deleted files and links are not editable. */ }
    }));
  }
  const ignoredFolders = await ignoredPaths(root, folders, true);
  const visibleIgnored = [...files.filter(path => ignored.has(path)), ...ignoredFolders];
  const trackedDirectories = folders.filter(path => ignoredFolders.has(path) && !ignored.has(path));
  return { root, files: files.sort(), directories: folders.sort(), ignored: visibleIgnored.sort(), ...(trackedDirectories.length ? { trackedDirectories: trackedDirectories.sort() } : {}), ...(nextOffset !== undefined ? { nextOffset } : {}), truncated: false };
}

function actionPath(value: unknown): string {
  const path = gitPath(value);
  if (path.split("/").some(part => !part || part === ".")) throw new GitError("Invalid repository file path.", 400);
  return path;
}

async function repositoryEntry(root: string, path: string) {
  const absolute = resolve(root, actionPath(path));
  const info = await lstat(absolute).catch(() => { throw new GitError("File or folder no longer exists. Refresh the file list.", 404); });
  if (await realpath(absolute) !== absolute || (!info.isFile() && !info.isDirectory()) || await gitRoot(info.isDirectory() ? absolute : dirname(absolute)) !== root) throw new GitError("Choose a regular file or folder in this repository.", 400);
  return { absolute, info };
}

async function checkNestedRepositories(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.toLowerCase() === ".git") throw new GitError("Folders containing nested repositories cannot be moved.", 400);
    if (entry.isDirectory()) await checkNestedRepositories(join(directory, entry.name));
  }
}

export async function gitFileAction(root: string, input: unknown): Promise<GitFileAction> {
  if (!input || typeof input !== "object") throw new GitError("Invalid file action.", 400);
  const body = input as Record<string, unknown>;
  if (body.action !== "move" && body.action !== "ignore") throw new GitError("Unknown file action.", 400);
  const path = actionPath(body.path);
  if (fileActions.has(root)) throw new GitError("Another file operation is in progress. Try again.");
  if ([...saves].some(absolute => absolute === resolve(root, path) || absolute.startsWith(`${resolve(root, path)}/`))) throw new GitError("A file in this folder is being saved. Try again.");
  fileActions.add(root);
  try {
    const source = await repositoryEntry(root, path);
    if (body.action === "move") {
      const destination = actionPath(body.destination), target = resolve(root, destination);
      if (target === source.absolute || target.startsWith(`${source.absolute}/`)) throw new GitError("A folder cannot be moved into itself.", 400);
      const parent = dirname(target);
      if (await realpath(parent) !== parent || await gitRoot(parent) !== root) throw new GitError("Choose a destination folder in this repository.", 400);
      if (source.info.isDirectory()) await checkNestedRepositories(source.absolute);
      if (await lstat(target).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; })) throw new GitError("A file or folder already exists at the destination.");
      await moveWithoutReplacing(source.absolute, target);
      return { action: "move", path, destination };
    }
    if (/[\r\n]/.test(path)) throw new GitError("Paths containing line breaks cannot be added to .gitignore.", 400);
    const ignorePath = join(root, ".gitignore");
    if (saves.has(ignorePath)) throw new GitError("Another save is in progress. Try again.");
    saves.add(ignorePath);
    try {
      const handle = await open(ignorePath, constants.O_RDWR | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o644);
      try {
        const info = await handle.stat();
        if (!info.isFile()) throw new GitError(".gitignore must be a regular text file.", 400);
        checkFileSize(".gitignore", info.size);
        const buffer = Buffer.alloc(FILE_LIMIT + 1), { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        checkFileSize(".gitignore", bytesRead);
        let content: string;
        try { content = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead)); }
        catch { throw new GitError(".gitignore must contain UTF-8 text.", 400); }
        if (content.includes("\0")) throw new GitError(".gitignore must contain UTF-8 text.", 400);
        const pattern = `/${path.replace(/[\\*?\[\]!# ]/g, "\\$&")}${source.info.isDirectory() ? "/" : ""}`;
        const lastRule = content.split(/\r?\n/).filter(line => line && !line.startsWith("#")).at(-1);
        if (lastRule !== pattern) {
          const newline = content.includes("\r\n") ? "\r\n" : "\n";
          const addition = `${content && !content.endsWith("\n") ? newline : ""}${pattern}${newline}`;
          checkFileSize(".gitignore", info.size + Buffer.byteLength(addition));
          await handle.writeFile(addition); await handle.sync();
        }
      } finally { await handle.close(); }
    } finally { saves.delete(ignorePath); }
    return { action: "ignore", path };
  } finally { fileActions.delete(root); }
}
