import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import type { GitFileContent, GitFileList } from "@shared/git";
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
  return { root, app, git, get, save };
}

test("file browser lists tracked and untracked files only from the selected repository", async () => {
  const { root, git, get } = fixture();
  writeFileSync(join(root, ".gitignore"), "ignored/\n");
  mkdirSync(join(root, "src")); mkdirSync(join(root, "ignored"));
  writeFileSync(join(root, "src", "query.sql"), "select 1;\n");
  writeFileSync(join(root, "read me.md"), "# Read me\n");
  writeFileSync(join(root, "ignored", "secret"), "ignored");
  git("add", "src/query.sql");
  const result = await get("files");
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ root, files: [".gitignore", "read me.md", "src/query.sql"], truncated: false });
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

test("file reads and saves cannot access ignored files or a nested repository", async () => {
  const { root, get, save } = fixture();
  writeFileSync(join(root, ".gitignore"), "private.txt\n"); writeFileSync(join(root, "private.txt"), "private");
  const nested = join(root, "nested"); mkdirSync(nested);
  Bun.spawnSync(["git", "-C", nested, "init", "-q"]);
  writeFileSync(join(nested, "other.py"), "other repository");
  for (const path of ["private.txt", "nested/other.py"]) {
    expect((await get("file", path)).status).toBe(400);
    expect((await save({ path, content: "replacement", revision: "0".repeat(64) })).status).toBe(400);
  }
  expect((await (await get("files")).json() as GitFileList).files).toEqual([".gitignore"]);
  expect(readFileSync(join(nested, "other.py"), "utf8")).toBe("other repository");
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
