import { gitRequest } from "./useGitRequest";

const endpoint = "/api/git/repositories";
const maxURLLength = 6000;

export function repositoryRequestURLs(directories: string[]): string[] {
  const urls: string[] = [];
  let query = "";
  for (const directory of directories) {
    const parameter = new URLSearchParams({ directory }).toString();
    // Real macOS paths fit this budget; corrupt history entries must not block the other projects.
    if (endpoint.length + 1 + parameter.length > maxURLLength) continue;
    const next = query ? `${query}&${parameter}` : parameter;
    if (query && endpoint.length + 1 + next.length > maxURLLength) {
      urls.push(`${endpoint}?${query}`); query = parameter;
    } else query = next;
  }
  if (query) urls.push(`${endpoint}?${query}`);
  return urls.length ? urls : [endpoint];
}

export async function loadGitRepositories(url: string, init?: RequestInit): Promise<{ repositories: string[] }> {
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  const directories = new URLSearchParams(query).getAll("directory");
  const roots = new Set<string>();
  for (const batch of repositoryRequestURLs(directories)) {
    const result = await gitRequest<{ repositories: string[] }>(batch, init);
    for (const root of result.repositories) roots.add(root);
  }
  return { repositories: [...roots].sort() };
}
