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
