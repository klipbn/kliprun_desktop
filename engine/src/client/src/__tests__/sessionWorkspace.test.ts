import { expect, test } from "bun:test";
import { emptyWorkspace, createProject, createGroup, moveSessions, projectFor, groupFor, validateWorkspace, loadWorkspace, saveWorkspace, sortSessions } from "../sessions/model";

test("workspace restores sidebar width without changing projects and rejects unusable widths", () => {
  const state = { ...createProject(emptyWorkspace(), "project", "Research"), sidebarWidth: 280 };
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  saveWorkspace(state, storage, {});
  expect(loadWorkspace(storage, {})).toEqual(state);
  for (const width of [0, 117, 481, Infinity, "280"]) expect(validateWorkspace({ ...state, sidebarWidth: width })).toBeNull();
});

test("workspace moves keep group membership scoped to the destination project", () => {
  let state = createProject(emptyWorkspace(), "p1", "Research");
  state = createProject(state, "p2", "Work");
  state = createGroup(state, "p1", "g1", "Reading");
  state = moveSessions(state, ["ses_a", "ses_b"], "p1", "g1");
  expect(groupFor(state, "ses_a")?.name).toBe("Reading");
  const moved = moveSessions(state, ["ses_a"], "p2", null);
  expect(projectFor(moved, "ses_a")?.name).toBe("Work");
  expect(groupFor(moved, "ses_a")).toBeUndefined();
  expect(groupFor(moved, "ses_b")?.name).toBe("Reading");
  expect(() => moveSessions(state, ["ses_a"], "p2", "g1")).toThrow();
  expect(projectFor(moveSessions(moved, ["ses_a"], null, null), "ses_a")).toBeUndefined();
  expect(() => createGroup(state, "p1", "g2", "reading")).toThrow();
  expect(createGroup(state, "p2", "g2", "Reading").projects[1].groups).toHaveLength(1);
});

test("native workspace survives origin changes and malformed saved state is rejected", () => {
  const state = moveSessions(createProject(emptyWorkspace(), "p", "A \"project\""), ["ses_a"], "p", null);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const host = { kliprunSessionWorkspace: state };
  saveWorkspace(state, storage, host);
  expect(loadWorkspace({ getItem: () => null }, host)).toEqual(state);
  expect(loadWorkspace(storage, {})).toEqual(state);
  expect(validateWorkspace({ ...state, assignments: { ses_a: { projectId: "missing", groupId: null } } })).toBeNull();
});

test("all sessions put assigned projects before newer unassigned sessions", () => {
  const state = moveSessions(createProject(emptyWorkspace(), "p", "Project"), ["old"], "p", null);
  expect(sortSessions([{ id: "new", updated_at: 20 }, { id: "old", updated_at: 1 }], state).map(s => s.id)).toEqual(["old", "new"]);
});
