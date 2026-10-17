import { expect, test } from "bun:test";
import { repositoryRequestURLs } from "../git/repositoryDiscovery";

function directoriesIn(urls: string[]) {
  return urls.flatMap(url => new URL(url, "http://127.0.0.1").searchParams.getAll("directory"));
}
test("long project histories split into bounded discovery URLs without losing directories", () => {
  const directories = Array.from({ length: 100 }, (_, index) => `/Users/demo/Projects/${"project".repeat(20)}/${index}/worktree`);
  const urls = repositoryRequestURLs(directories);
  expect(urls.length).toBeGreaterThan(1);
  expect(urls.every(url => url.length <= 6000)).toBe(true);
  expect(directoriesIn(urls)).toEqual(directories);
});
test("discovery preserves Unicode and query characters while ignoring unusably long history paths", () => {
  const directories = ["/demo/Проект #1 + test?", "/demo/[worktree]", "/" + "invalid".repeat(2000), "/demo/other"];
  const urls = repositoryRequestURLs(directories);
  expect(urls.every(url => url.length <= 6000)).toBe(true);
  expect(directoriesIn(urls)).toEqual([directories[0], directories[1], directories[3]]);
});
test("an empty candidate list still discovers repositories without an oversized or malformed URL", () => {
  expect(repositoryRequestURLs([])).toEqual(["/api/git/repositories"]);
});
