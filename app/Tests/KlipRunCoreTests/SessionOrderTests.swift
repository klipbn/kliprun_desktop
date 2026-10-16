import Foundation
import Testing
@testable import KlipRunCore

@Test func cardOrderSurvivesReloadsWithoutChangingOtherColumns() {
    let suite = "KlipRun-order-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let order = SessionOrder(defaults: defaults)
    #expect(order.set(["idle": ["b", "a"], "running": ["c"]]))
    #expect(SessionOrder(defaults: defaults).values == ["idle": ["b", "a"], "running": ["c"]])
    #expect(!order.set(["other": ["x"]]))
    #expect(order.values["idle"] == ["b", "a"])
}
