import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RecentSessions } from "../components/RecentSessions";
import type { UsageSession } from "@shared/usage";

const sessions: UsageSession[] = [{ id: "ses_example", source: "opencode", parent_id: null,
  title: "Review migration", directory: "/demo/project", created_at: 1, updated_at: 2 }];

test("recent sessions offer details and continuation in the original harness", () => {
  const html = renderToStaticMarkup(<RecentSessions sessions={sessions} collapsed={false} onToggle={() => {}}
    onSelect={() => {}} onResume={() => {}} selectedId={null} pending={false} error={null} />);
  expect(html).toContain("Review migration");
  expect(html).toContain("Resume in OpenCode");
  expect(html).toContain('aria-expanded="true"');
});

test("collapsed history leaves an accessible control without rendering session rows", () => {
  const html = renderToStaticMarkup(<RecentSessions sessions={sessions} collapsed onToggle={() => {}}
    onSelect={() => {}} selectedId={null} pending={false} error={null} />);
  expect(html).not.toContain("Review migration");
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("Show recent sessions");
});
