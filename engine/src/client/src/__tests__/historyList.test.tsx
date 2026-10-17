import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { GitCommit } from "@shared/git";
import { filterHistoryCommits, HistoryList } from "../git/HistoryList";

const commits: GitCommit[] = [
  { hash: "0123456789abcdef0123456789abcdef01234567", subject: "Fix SQL preview", author: "Avery Chen", date: Date.UTC(2026, 9, 17, 12), refs: ["HEAD -> main", "origin/main"] },
  { hash: "fedcba9876543210fedcba9876543210fedcba98", subject: "Add Python editor <script>", author: "Morgan Lee", date: Date.UTC(2026, 9, 16, 9), refs: ["tag: v0.1"] },
];

test("loaded commit search matches subject, author, short or full hash, and refs without reordering", () => {
  expect(filterHistoryCommits(commits, "  PREVIEW ").map(commit => commit.hash)).toEqual([commits[0].hash]);
  expect(filterHistoryCommits(commits, "morgan").map(commit => commit.hash)).toEqual([commits[1].hash]);
  expect(filterHistoryCommits(commits, "0123456").map(commit => commit.hash)).toEqual([commits[0].hash]);
  expect(filterHistoryCommits(commits, commits[1].hash.toUpperCase()).map(commit => commit.hash)).toEqual([commits[1].hash]);
  expect(filterHistoryCommits(commits, "origin/MAIN").map(commit => commit.hash)).toEqual([commits[0].hash]);
  expect(filterHistoryCommits(commits, "   ")).toEqual(commits);
  expect(filterHistoryCommits(commits, "unloaded commit")).toEqual([]);
});

test("history rows retain real metadata, chronology, selected state and escaped subjects", () => {
  const html = renderToStaticMarkup(<HistoryList commits={commits} selected={commits[1].hash} onSelect={() => {}} />);
  expect(html).toContain('aria-label="Search commits"');
  expect(html).toContain('placeholder="Search loaded commits"');
  expect(html).toContain('class="git-history-row is-selected"');
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('Avery Chen');
  expect(html).toContain('0123456');
  expect(html).toContain('origin/main');
  expect(html.indexOf('Fix SQL preview')).toBeLessThan(html.indexOf('Add Python editor'));
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('2 commits');
});

test("an empty loaded history leaves the repository empty state to the caller", () => {
  const html = renderToStaticMarkup(<HistoryList commits={[]} selected={null} onSelect={() => {}} />);
  expect(html).toContain('0 commits');
  expect(html).not.toContain('No matching commits');
  expect(html).not.toContain('git-history-row');
});
