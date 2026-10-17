import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DiffView, parseDiff } from "../git/DiffView";
import { FileTree } from "../git/FileTree";

const patch = "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -2,2 +2,3 @@\n same\n-old\n+new\n+<script>alert(1)</script>\n";
test("diff line numbers follow hunks and escape repository content", () => {
  const rows = parseDiff(patch).filter(row => ["context", "add", "delete"].includes(row.kind));
  expect(rows.map(row => [row.oldLine, row.newLine, row.kind])).toEqual([[2, 2, "context"], [3, null, "delete"], [null, 3, "add"], [null, 4, "add"]]);
  const html = renderToStaticMarkup(<DiffView diff={{ patch, binary: false, truncated: false }} />);
  expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
});
test("file tree preserves the full selection path and exposes staging controls", () => {
  const html = renderToStaticMarkup(<FileTree files={[{ path: "src/nested/file.ts", status: "M", additions: 2, deletions: 1 }]}
    selected="src/nested/file.ts" onSelect={() => {}} onAction={() => {}} actionLabel="Stage" disabled={false} />);
  expect(html).toContain("src"); expect(html).toContain("nested"); expect(html).toContain("file.ts");
  expect(html).toContain('aria-pressed="true"'); expect(html).toContain('aria-label="Stage src/nested/file.ts"');
});
test("binary and truncated previews explain their limits", () => {
  expect(renderToStaticMarkup(<DiffView diff={{ patch: "", binary: true, truncated: false }} />)).toContain("Binary file");
  expect(renderToStaticMarkup(<DiffView diff={{ patch: "", binary: false, truncated: true }} />)).toContain("Preview truncated");
});

test("flat file lists sort by name and retain parent paths without changing input files", () => {
  const files = [{ path: "a/zebra.ts", status: "M", additions: 2, deletions: 1 }, { path: "z/alpha.ts", status: "M", additions: 1, deletions: 0 }];
  const html = renderToStaticMarkup(<FileTree files={files} selected={null} onSelect={() => {}} disabled={false} view="list" sortBy="name" />);
  expect(html.indexOf('title="z/alpha.ts"')).toBeLessThan(html.indexOf('title="a/zebra.ts"'));
  expect(html).not.toContain("<details");
  expect(html).toContain('class="git-file-directory">z</small>');
  expect(files.map(file => file.path)).toEqual(["a/zebra.ts", "z/alpha.ts"]);
});

test("a partially staged file keeps separate staging controls and selection in a mixed list", () => {
  const files = ["staged", "unstaged"].map(mode => ({ path: "src/shared.ts", mode: mode as "staged" | "unstaged", status: "M", additions: 1, deletions: 0 }));
  const html = renderToStaticMarkup(<FileTree files={files} selected="src/shared.ts" selectedMode="unstaged" onSelect={() => {}}
    onAction={() => {}} disabled={false} view="list" showMode />);
  expect(html).toContain('aria-label="Unstage src/shared.ts"');
  expect(html).toContain('aria-label="Stage src/shared.ts"');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(html).toContain("Staged"); expect(html).toContain("Unstaged");
});
