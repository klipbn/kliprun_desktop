import Foundation
import Testing
@testable import KlipRunCore

@Test func sessionWorkspacePersistsGroupsAndRejectsCrossProjectAssignments() throws {
    let suite = "KlipRun-workspace-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = SessionWorkspace(defaults: defaults)
    var message: [String: Any] = ["version": 1, "projects": [["id": "p", "name": "Project", "groups": [["id": "g", "name": "Research"]]]],
        "assignments": ["ses_a": ["projectId": "p", "groupId": "g"]], "favorites": ["ses_a"], "collapsed": [], "sidebarCollapsed": false]
    #expect(store.set(message))
    let saved = SessionWorkspace(defaults: defaults).json
    let restored = try #require(try JSONSerialization.jsonObject(with: Data(saved.utf8)) as? [String: Any])
    #expect((restored["favorites"] as? [String]) == ["ses_a"])
    #expect(store.webScript.contains("window.kliprunSessionWorkspace = "))
    message["assignments"] = ["ses_a": ["projectId": "other", "groupId": "g"]]
    #expect(!store.set(message))
    #expect(store.json == saved)
    message["assignments"] = ["ses_a": ["projectId": "p", "groupId": "missing"]]
    #expect(!store.set(message))
}

@Test func sessionSidebarWidthSurvivesNativeStorageAndRejectsInvalidSizes() throws {
    let suite = "KlipRun-workspace-size-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = SessionWorkspace(defaults: defaults)
    var message: [String: Any] = ["version": 1, "projects": [], "assignments": [:], "favorites": [], "collapsed": [], "sidebarCollapsed": false, "sidebarWidth": 280]
    #expect(store.set(message))
    let saved = store.json
    #expect(saved.contains("\"sidebarWidth\":280"))
    message["sidebarWidth"] = 30
    #expect(!store.set(message))
    #expect(store.json == saved)
}
