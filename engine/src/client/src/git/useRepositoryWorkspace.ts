import { useState } from "react";
import { loadRepositoryWorkspace, saveRepositoryWorkspace, type RepositoryWorkspace } from "./workspaceState";

export function useRepositoryWorkspace(directory: string) {
  const [state, setState] = useState(() => ({ directory, value: loadRepositoryWorkspace(directory) }));
  const value = state.directory === directory ? state.value : loadRepositoryWorkspace(directory);
  function update(patch: Partial<RepositoryWorkspace> | ((previous: RepositoryWorkspace) => Partial<RepositoryWorkspace>)) {
    setState({ directory, value: saveRepositoryWorkspace(directory, patch) });
  }
  return [value, update] as const;
}
