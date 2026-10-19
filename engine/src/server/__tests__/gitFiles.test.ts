import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import type { GitFileBase, GitFileContent, GitFileList } from "@shared/git";
import { registerGitRoutes } from "../routes/git";

const homes: string[] = [];
afterEach(() => { for (const path of homes.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kliprun-files-"))); homes.push(root);
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", "-C", root, ...args]);
    if (result.exitCode) throw new Error(result.stderr.toString());
  };
  git("init", "-q");
  const app = new Hono(); registerGitRoutes(app);
  const get = (route: string, path?: string) => app.request(`/api/git/${route}?${new URLSearchParams({ directory: root, ...(path ? { path } : {}) })}`);
  const save = (body: Record<string, unknown>, headers = {}) => app.request("/api/git/file", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ directory: root, ...body }) });
  const action = (body: Record<string, unknown>, headers = {}) => app.request("/api/git/file-action", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ directory: root, ...body }) });
  return { root, app, git, get, save, action };
}

test("file browser includes ignored roots without scanning their contents", async () => {
  const { root, git, get } = fixture();
  writeFileSync(join(root, ".gitignore"), "ignored/\n");
  mkdirSync(join(root, "src")); mkdirSync(join(root, "ignored"));
  writeFileSync(join(root, "src", "query.sql"), "select 1;\n");
  writeFileSync(join(root, "read me.md"), "# Read me\n");
  writeFileSync(join(root, "ignored", "secret"), "ignored");
  git("add", "src/query.sql");
  const result = await get("files");
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ root, files: [".gitignore", "read me.md", "src/query.sql"], directories: ["ignored"], ignored: ["ignored"], truncated: false });
});

test("reading and saving UTF-8 text preserves content, returns a new revision and leaves staging alone", async () => {
  const { root, git, get, save } = fixture();
  const path = "sample.py", original = "\ufeffprint('привет')\r\n", edited = "\ufeffprint('updated')\r\n";
  writeFileSync(join(root, path), original, { mode: 0o755 }); git("add", path);
  const response = await get("file", path);
  expect(response.status).toBe(200);
  const file = await response.json() as GitFileContent;
  expect(file).toMatchObject({ root, path, content: original });
  expect(file.revision).toMatch(/^[a-f0-9]{64}$/);
  const saved = await save({ path, content: edited, revision: file.revision });
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({ root, path, content: edited });
  expect(readFileSync(join(root, path), "utf8")).toBe(edited);
  expect(statSync(join(root, path)).mode & 0o777).toBe(0o755);
  const staged = Bun.spawnSync(["git", "-C", root, "show", ":sample.py"]).stdout.toString();
  expect(staged).toBe(original);
  expect((await (await get("file", path)).json() as GitFileContent).revision).not.toBe(file.revision);
});

test("notebooks with saved outputs above the text limit open and save, with a bounded notebook limit", async () => {
  const { root, get, save } = fixture();
  const path = "analysis.IPYNB";
  const content = JSON.stringify({ nbformat: 4, cells: [{ cell_type: "code", source: "print('saved')", outputs: [
    { output_type: "stream", name: "stdout", text: "x".repeat(5 * 1024 * 1024) },
  ] }] });
  writeFileSync(join(root, path), content);
  const response = await get("file", path);
  expect(response.status).toBe(200);
  const file = await response.json() as GitFileContent;
  expect(file.content).toBe(content);
  const edited = content + "\n";
  expect((await save({ path, content: edited, revision: file.revision })).status).toBe(200);
  expect(readFileSync(join(root, path), "utf8")).toBe(edited);
  writeFileSync(join(root, path), "x".repeat(10 * 1024 * 1024 + 1));
  expect((await get("file", path)).status).toBe(413);
  expect((await save({ path, content: "x".repeat(10 * 1024 * 1024 + 1), revision: file.revision })).status).toBe(413);
});

test("ignored text files can be opened and saved while nested repositories stay isolated", async () => {
  const { root, get, save } = fixture();
  writeFileSync(join(root, ".gitignore"), "private.txt\n"); writeFileSync(join(root, "private.txt"), "private");
  const nested = join(root, "nested"); mkdirSync(nested);
  Bun.spawnSync(["git", "-C", nested, "init", "-q"]);
  writeFileSync(join(nested, "other.py"), "other repository");
  const file = await (await get("file", "private.txt")).json() as GitFileContent;
  expect(file.content).toBe("private");
  expect((await save({ path: "private.txt", content: "edited ignored file", revision: file.revision })).status).toBe(200);
  expect(readFileSync(join(root, "private.txt"), "utf8")).toBe("edited ignored file");
  for (const path of ["nested/other.py"]) {
    expect((await get("file", path)).status).toBe(400);
    expect((await save({ path, content: "replacement", revision: "0".repeat(64) })).status).toBe(400);
  }
  expect(await (await get("files")).json()).toMatchObject({ files: [".gitignore", "private.txt"], ignored: ["private.txt"] });
  expect(readFileSync(join(nested, "other.py"), "utf8")).toBe("other repository");
});

test("ignored folders load one level at a time, including empty directories and literal names", async () => {
  const { root, get, git } = fixture();
  writeFileSync(join(root, ".gitignore"), "cache dir/\nempty/\n");
  mkdirSync(join(root, "cache dir/deep"), { recursive: true }); mkdirSync(join(root, "empty"));
  writeFileSync(join(root, "cache dir/[name].txt"), "ignored text");
  writeFileSync(join(root, "cache dir/tracked.txt"), "tracked exception"); git("add", "-f", "cache dir/tracked.txt");
  writeFileSync(join(root, "cache dir/deep/child.txt"), "lazy grandchild");
  const top = await (await get("files")).json() as GitFileList;
  expect(top.files).toContain("cache dir/tracked.txt");
  expect(top.files).not.toContain("cache dir/[name].txt");
  expect(top).toMatchObject({ directories: ["cache dir", "empty"], ignored: ["cache dir", "empty"] });
  const children = await (await get("files", "cache dir")).json();
  expect(children).toEqual({ root, files: ["cache dir/[name].txt", "cache dir/tracked.txt"], directories: ["cache dir/deep"], ignored: ["cache dir/[name].txt", "cache dir/deep"], truncated: false });
  expect((await (await get("files", "cache dir/deep")).json() as GitFileList).files).toEqual(["cache dir/deep/child.txt"]);
  expect((await (await get("files", "empty")).json() as GitFileList).files).toEqual([]);
});

test("file change baselines use HEAD rather than staged or working-tree text and follow renames", async () => {
  const { root, git, get } = fixture();
  git("config", "user.name", "Demo"); git("config", "user.email", "demo@example.invalid"); git("config", "commit.gpgsign", "false");
  writeFileSync(join(root, "file [demo].py"), "first\noriginal\nlast\n");
  git("add", "."); git("commit", "-qm", "Base");
  writeFileSync(join(root, "file [demo].py"), "first\nstaged\nlast\n"); git("add", ".");
  writeFileSync(join(root, "file [demo].py"), "first\nstaged\nlast\nworking\n");
  const response = await get("file-base", "file [demo].py");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ content: "first\noriginal\nlast\n" });
  git("mv", "file [demo].py", "renamed.py");
  expect(await (await get("file-base", "renamed.py")).json()).toEqual({ content: "first\noriginal\nlast\n" });
  expect(readFileSync(join(root, "renamed.py"), "utf8")).toBe("first\nstaged\nlast\nworking\n");
});

test("new and unborn files have an empty baseline while ignored files have no Git baseline", async () => {
  const { root, get } = fixture();
  writeFileSync(join(root, ".gitignore"), "ignored.txt\n");
  writeFileSync(join(root, "new.py"), "new file\n"); writeFileSync(join(root, "ignored.txt"), "ignored\n");
  expect(await (await get("file-base", "new.py")).json()).toEqual({ content: "" });
  expect(await (await get("file-base", "ignored.txt")).json()).toEqual({ content: null, notice: "Ignored by Git" });
});

test("unavailable binary and oversized Git baselines do not prevent opening the current text", async () => {
  const { root, git, get } = fixture();
  git("config", "user.name", "Demo"); git("config", "user.email", "demo@example.invalid"); git("config", "commit.gpgsign", "false");
  writeFileSync(join(root, "large.txt"), "x".repeat(512 * 1024 + 1)); writeFileSync(join(root, "binary.txt"), Buffer.from([0, 1, 2]));
  git("add", "."); git("commit", "-qm", "Base");
  for (const path of ["large.txt", "binary.txt"]) {
    writeFileSync(join(root, path), "current text\n");
    const baseline = await (await get("file-base", path)).json() as GitFileBase;
    expect(baseline).toMatchObject({ content: null });
    expect(baseline.notice).toBeTruthy();
    expect((await get("file", path)).status).toBe(200);
  }
});

test("Git baseline reads retain the file browser's metadata, symlink and repository boundaries", async () => {
  const { root, get } = fixture(), outside = fixture().root;
  writeFileSync(join(outside, "private.py"), "outside"); symlinkSync(join(outside, "private.py"), join(root, "link.py"));
  mkdirSync(join(root, "nested")); Bun.spawnSync(["git", "-C", join(root, "nested"), "init", "-q"]);
  writeFileSync(join(root, "nested/other.py"), "nested");
  for (const path of ["../private.py", ".git/config", "link.py", "nested/other.py"]) expect((await get("file-base", path)).status).toBe(400);
});

test("lazy folder listing rejects metadata, links, traversal and nested repositories", async () => {
  const { root, get } = fixture(), outside = fixture().root;
  writeFileSync(join(root, ".gitignore"), "cache/\n"); mkdirSync(join(root, "cache/nested"), { recursive: true });
  Bun.spawnSync(["git", "-C", join(root, "cache/nested"), "init", "-q"]);
  writeFileSync(join(root, "cache/nested/private.txt"), "nested");
  symlinkSync(outside, join(root, "cache/link"));
  writeFileSync(join(root, "cache/plain.txt"), "visible");
  for (const path of ["../", ".git", ".GIT", "cache/link", "cache/nested", "cache/plain.txt"]) expect((await get("files", path)).status).toBe(400);
  expect(await (await get("files", "cache")).json()).toMatchObject({ files: ["cache/plain.txt"], directories: [], ignored: ["cache/plain.txt"] });
});

test("browser excludes tracked paths that now live in a nested repository", async () => {
  const { root, git, get } = fixture();
  mkdirSync(join(root, "nested")); writeFileSync(join(root, "nested", "file.py"), "print(1)");
  git("add", ".");
  Bun.spawnSync(["git", "-C", join(root, "nested"), "init", "-q"]);
  expect((await (await get("files")).json() as GitFileList).files).toEqual([]);
});

test("stale or simultaneous saves do not overwrite another writer", async () => {
  const { root, get, save } = fixture();
  const path = "query.sql"; writeFileSync(join(root, path), "select 1;\n");
  const original = await (await get("file", path)).json() as GitFileContent;
  writeFileSync(join(root, path), "select 2;\n");
  expect((await save({ path, content: "select 3;\n", revision: original.revision })).status).toBe(409);
  expect(readFileSync(join(root, path), "utf8")).toBe("select 2;\n");
  const current = await (await get("file", path)).json() as GitFileContent;
  const results = await Promise.all(["select 4;\n", "select 5;\n"].map(content => save({ path, content, revision: current.revision })));
  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  const successful = await results.find(result => result.status === 200)!.json() as GitFileContent;
  expect(readFileSync(join(root, path), "utf8")).toBe(successful.content);
});

test("file routes reject traversal, metadata, symlinks, binary data and oversized files", async () => {
  const { root, get, save } = fixture();
  const outside = fixture().root; writeFileSync(join(outside, "private.py"), "private");
  symlinkSync(join(outside, "private.py"), join(root, "link.py"));
  symlinkSync(outside, join(root, "linked-directory"));
  symlinkSync(join(root, ".git"), join(root, "metadata"));
  writeFileSync(join(root, "binary"), Buffer.from([0, 1, 2]));
  writeFileSync(join(root, "invalid-utf8"), Buffer.from([0xff, 0xfe]));
  writeFileSync(join(root, "large"), "x".repeat(512 * 1024 + 1));
  for (const path of ["../private.py", join(outside, "private.py"), ".git/config", ".GIT/config", "link.py", "linked-directory/private.py", "metadata/config", "binary", "invalid-utf8"]) {
    expect((await get("file", path)).status).toBe(400);
    expect((await save({ path, content: "changed", revision: "0".repeat(64) })).status).toBe(400);
  }
  expect((await get("file", "large")).status).toBe(413);
  expect((await save({ path: "large", content: "x".repeat(512 * 1024 + 1), revision: "0".repeat(64) })).status).toBe(413);
  expect((await get("file", "missing.py")).status).toBe(404);
  expect(readFileSync(join(outside, "private.py"), "utf8")).toBe("private");
  expect((await (await get("files")).json() as GitFileList).files).not.toContain("link.py");
});

test("file save rejects foreign origins and malformed bodies before writing", async () => {
  const { root, app, get, save } = fixture();
  const path = "file.md"; writeFileSync(join(root, path), "# Original\n");
  const original = await (await get("file", path)).json() as GitFileContent;
  for (const headers of [{ Origin: "https://evil.invalid" }, { "Sec-Fetch-Site": "cross-site" }]) {
    expect((await save({ path, content: "changed", revision: original.revision }, headers)).status).toBe(403);
  }
  for (const content of [null, 17, "nul\0byte", "bad\ud800unicode"]) {
    expect((await save({ path, content, revision: original.revision })).status).toBe(400);
  }
  expect((await save({ path, content: "changed", revision: "wrong" })).status).toBe(400);
  for (const body of ["null", "{", "[]", "42"]) {
    expect((await app.request("/api/git/file", { method: "POST", headers: { "Content-Type": "application/json" }, body })).status).toBe(400);
  }
  expect((await save({ path, content: "changed", revision: original.revision }, { "Content-Type": "text/plain" })).status).toBe(400);
  expect(readFileSync(join(root, path), "utf8")).toBe("# Original\n");
});

test("moving a folder preserves all contents and the index, and never replaces an existing destination", async () => {
  const { root, git, get, action } = fixture();
  mkdirSync(join(root, "src")); mkdirSync(join(root, "dest"));
  writeFileSync(join(root, "src", "run.py"), "original"); git("add", "src/run.py");
  writeFileSync(join(root, "src", "run.py"), "local edits");
  writeFileSync(join(root, "src", "untracked.txt"), "keep me");
  expect((await action({ action: "move", path: "src", destination: "dest/src" })).status).toBe(200);
  expect(readFileSync(join(root, "dest/src/run.py"), "utf8")).toBe("local edits");
  expect(readFileSync(join(root, "dest/src/untracked.txt"), "utf8")).toBe("keep me");
  expect(Bun.spawnSync(["git", "-C", root, "show", ":src/run.py"]).stdout.toString()).toBe("original");
  expect((await (await get("files")).json() as GitFileList).files).toEqual(["dest/src/run.py", "dest/src/untracked.txt"]);
  writeFileSync(join(root, "existing.txt"), "do not overwrite");
  expect((await action({ action: "move", path: "dest/src/run.py", destination: "existing.txt" })).status).toBe(409);
  expect(readFileSync(join(root, "existing.txt"), "utf8")).toBe("do not overwrite");
  expect((await action({ action: "move", path: "dest/src/run.py", destination: "dest/src/renamed.py" })).status).toBe(200);
  expect(readFileSync(join(root, "dest/src/renamed.py"), "utf8")).toBe("local edits");
});

test("ignore appends literal root-relative rules without changing existing content or tracked files", async () => {
  const { root, git, action, get } = fixture();
  writeFileSync(join(root, ".gitignore"), "# keep this\r\nexisting");
  const path = "report [draft]*?.txt";
  writeFileSync(join(root, path), "private");
  writeFileSync(join(root, "report d0.txt"), "visible");
  mkdirSync(join(root, "data")); writeFileSync(join(root, "data/file.csv"), "tracked"); git("add", "data/file.csv");
  writeFileSync(join(root, ".git/info/exclude"), "/data/\n");
  expect((await action({ action: "ignore", path })).status).toBe(200);
  expect((await action({ action: "ignore", path: "data" })).status).toBe(200);
  expect((await action({ action: "ignore", path: "data" })).status).toBe(200);
  const ignore = readFileSync(join(root, ".gitignore"), "utf8");
  expect(ignore.startsWith("# keep this\r\nexisting\r\n")).toBe(true);
  expect(ignore).toContain("/report\\ \\[draft\\]\\*\\?.txt\r\n");
  expect(ignore.match(/^\/data\/$/gm)?.length).toBe(1);
  expect((await (await get("files")).json() as GitFileList).files).toEqual([".gitignore", "data/file.csv", "report [draft]*?.txt", "report d0.txt"]);
  expect(Bun.spawnSync(["git", "-C", root, "show", ":data/file.csv"]).stdout.toString()).toBe("tracked");
});

test("file actions reject unsafe paths, nested repositories, foreign origins and symlinked ignore files", async () => {
  const { root, action, app } = fixture();
  const outside = fixture().root;
  writeFileSync(join(root, "file.txt"), "keep");
  writeFileSync(join(outside, "private"), "private");
  mkdirSync(join(root, "folder")); mkdirSync(join(root, "folder/nested"));
  Bun.spawnSync(["git", "-C", join(root, "folder/nested"), "init", "-q"]);
  symlinkSync(outside, join(root, "link"));
  for (const path of ["../file.txt", ".git/config", ".GIT/config", "folder/../file.txt", "./file.txt", "link/private", "folder/nested"]) {
    expect((await action({ action: "ignore", path })).status).toBe(400);
  }
  for (const destination of ["../escape", ".git/config", "link/escape", "folder/nested/file.txt"]) {
    expect((await action({ action: "move", path: "file.txt", destination })).status).toBe(400);
  }
  expect((await action({ action: "move", path: "folder", destination: "moved" })).status).toBe(400);
  expect((await action({ action: "move", path: "folder", destination: "folder/inside" })).status).toBe(400);
  expect((await action({ action: "ignore", path: "file.txt" }, { Origin: "https://evil.invalid" })).status).toBe(403);
  expect((await action({ action: "ignore", path: "file.txt" }, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
  expect((await action({ action: "ignore", path: "file.txt" }, { "Content-Type": "text/plain" })).status).toBe(400);
  for (const body of ["null", "{", "42", "[]"]) expect((await app.request("/api/git/file-action", { method: "POST", headers: { "Content-Type": "application/json" }, body })).status).toBe(400);
  symlinkSync(join(outside, "private"), join(root, ".gitignore"));
  expect((await action({ action: "ignore", path: "file.txt" })).ok).toBe(false);
  expect(readFileSync(join(outside, "private"), "utf8")).toBe("private");
  expect(readFileSync(join(root, "file.txt"), "utf8")).toBe("keep");
});
