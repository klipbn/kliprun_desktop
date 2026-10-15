import Foundation
import Testing
@testable import KlipRunCore

@Test func sessionPrioritiesSurviveNewInstancesAndClearing() {
    let suite = "KlipRun-priorities-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let preferences = SessionPriorities(defaults: defaults)
    #expect(preferences.values.isEmpty)
    #expect(preferences.set(["demo": "critical", "codex:demo": "low"]))
    #expect(SessionPriorities(defaults: defaults).values == ["demo": "critical", "codex:demo": "low"])
    #expect(!preferences.set(["demo": "invalid"]))
    #expect(preferences.values["demo"] == "critical")
    #expect(preferences.set([:]))
    #expect(SessionPriorities(defaults: defaults).values.isEmpty)
}
