import Foundation
import Testing
@testable import KlipRunCore

@Test func gitWorkspaceSurvivesNewInstancesAndRejectsInvalidSnapshots() {
    let suite = "KlipRun-git-workspace-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let workspace = GitWorkspace(defaults: defaults)
    let value: [String: Any] = ["version": 1, "changeView": ["view": "tree"], "repositories": ["/demo": ["tab": "files", "expandedFiles": [], "files": [["path": "README.md", "pinned": true]]]]]
    #expect(workspace.set(value))
    let restored = GitWorkspace(defaults: defaults)
    #expect((restored.value["repositories"] as? [String: [String: Any]])?["/demo"]?["tab"] as? String == "files")
    #expect((restored.value["repositories"] as? [String: [String: Any]])?["/demo"]?["expandedFiles"] as? [String] == [])
    #expect(!workspace.set(["version": 2, "repositories": [:]]))
    #expect(!workspace.set(["version": 1, "repositories": ["relative": [:]]]))
    #expect(!workspace.set(["version": 1, "repositories": ["/demo": "invalid"]]))
    #expect(!workspace.set(["version": 1, "repositories": ["/demo": ["filter": String(repeating: "x", count: 4 * 1024 * 1024)]]]))
    #expect(GitWorkspace(defaults: defaults).webScript.contains("README.md"))
}
