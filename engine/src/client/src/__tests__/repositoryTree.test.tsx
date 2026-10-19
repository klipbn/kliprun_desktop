import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RepositoryTree } from "../git/RepositoryTree";

test("repository tree groups folders, compacts single-child directories and retains exact file paths", () => {
  const html = renderToStaticMarkup(<RepositoryTree root="demo" files={["README.md", "src/jobs/run.py", "queries/report.sql"]} selected="src/jobs/run.py" onSelect={() => {}} disabled={false} />);
  expect(html).toContain("src / jobs");
  expect(html).toContain('aria-label="Open file src/jobs/run.py"');
  expect(html).toContain('aria-selected="true"');
  expect(html.indexOf("queries")).toBeLessThan(html.indexOf("README.md"));
  expect(html).toContain("demo");
});

test("repository tree uses directory-first natural ordering and accessible active rows", () => {
  const html = renderToStaticMarkup(<RepositoryTree root="demo" files={["file10.py", "file2.py", "Zebra.md", "alpha.md", "src/main.py"]} selected="file2.py" onSelect={() => {}} disabled={false} />);
  expect(html.indexOf('title="src"')).toBeLessThan(html.indexOf('title="alpha.md"'));
  expect(html.indexOf('title="file2.py"')).toBeLessThan(html.indexOf('title="file10.py"'));
  expect(html).toContain('role="tree"');
  expect(html).toContain('aria-label="Repository files"');
  expect(html).toMatch(/role="treeitem"[^>]*aria-selected="true"/);
  expect(html).toContain('aria-label="Filter files"');
  expect(html).toContain('aria-label="Collapse all folders"');
});

test("repository tree reveals selected descendants, colors only real Git states and blocks unavailable files", () => {
  const html = renderToStaticMarkup(<RepositoryTree root="demo" files={["src/a.py", "src/sub/file.sql", "README.md"]} selected="src/sub/file.sql" statuses={{ "src/a.py": "?", "src/sub/file.sql": "M" }} onSelect={() => {}} disabled />);
  expect(html).toContain('aria-label="Open file src/sub/file.sql"');
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain('data-git-status="added"');
  expect(html).toContain('data-git-status="modified"');
  expect(html).toContain('disabled=""');
  expect(html).not.toContain('diagnostic');
});

test("ignored files and empty folders are visible and muted without hiding tracked exceptions", () => {
  const html = renderToStaticMarkup(<RepositoryTree root="demo" files={["README.md", "cache/tracked.txt", "private.txt"]} directories={["cache", "empty"]}
    ignored={["cache", "empty", "private.txt"]} statuses={{ "cache/tracked.txt": "M" }} selected={null} onSelect={() => {}} disabled={false} />);
  expect(html).toContain('aria-label="Open file private.txt"');
  expect(html).toContain('aria-label="empty"');
  expect(html).toMatch(/title="private.txt[^\"]*"[^>]*data-git-ignored="true"/);
  expect(html).toContain('aria-label="Hide ignored files"');
  expect(html).toMatch(/aria-label="cache"[^>]*aria-expanded="false"/);
});

test("lazy folders stay collapsed, show descendant changes and offer the next root page", () => {
  const html = renderToStaticMarkup(<RepositoryTree root="demo" files={["README.md"]} directories={["src"]} nextOffset={500}
    statuses={{ "src/deep/hidden.py": "M" }} selected={null} onSelect={() => {}} disabled={false} />);
  expect(html).toMatch(/aria-label="src"[^>]*aria-expanded="false"/);
  expect(html).toMatch(/aria-label="src"[^>]*data-git-status="modified"/);
  expect(html).toContain('aria-label="Load more repository files"');
});
