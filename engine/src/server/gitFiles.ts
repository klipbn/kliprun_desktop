import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import type { GitFileContent, GitFileList } from "@shared/git";
import { gitPath, gitRoot } from "./git";
import { GitError, runGit } from "./gitProcess";

const FILE_LIMIT = 512 * 1024;
const fileLimit = (path: string) => /\.ipynb$/i.test(path) ? 10 * 1024 * 1024 : FILE_LIMIT;
function checkFileSize(path: string, size: number) {
  if (size > fileLimit(path)) throw new GitError(`File exceeds the ${/\.ipynb$/i.test(path) ? "10 MB notebook" : "512 KB editor"} limit.`, 413);
}
const saves = new Set<string>();
const revision = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function filePath(root: string, path: string) {
  const absolute = resolve(root, gitPath(path));
  try {
    if (await realpath(absolute) !== absolute || !(await lstat(absolute)).isFile()) throw new GitError("Symbolic links and directories cannot be edited.", 400);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new GitError("File no longer exists. Refresh the file list.", 404);
    throw error;
  }
  const listed = await runGit(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", path]);
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
    const buffer = Buffer.alloc(fileLimit(path) + 1), { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    checkFileSize(path, bytesRead);
    const bytes = buffer.subarray(0, bytesRead);
    let content: string;
    try {
      if (bytes.includes(0)) throw new Error("binary");
      content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch { throw new GitError("Only UTF-8 text files can be opened in the editor.", 400); }
    return { root, path, content, revision: revision(bytes) };
  } finally { await handle.close(); }
}

export async function saveGitFile(root: string, path: string, content: unknown, expected: unknown): Promise<GitFileContent> {
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

export async function gitFiles(root: string): Promise<GitFileList> {
  const result = await runGit(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  const candidates = [...new Set(result.out.split("\0").filter(Boolean))].sort();
  const files: string[] = [];
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
  for (let i = 0; i < Math.min(candidates.length, 10_000); i += 32) {
    await Promise.all(candidates.slice(i, Math.min(i + 32, 10_000)).map(async path => {
      try {
        const absolute = resolve(root, gitPath(path));
        const info = await lstat(absolute);
        if (info.isFile() && await realpath(absolute) === absolute && await belongsToRepository(dirname(absolute))) files.push(path);
      } catch { /* Deleted files and links are not editable. */ }
    }));
  }
  return { root, files: files.sort(), truncated: candidates.length > 10_000 };
}
