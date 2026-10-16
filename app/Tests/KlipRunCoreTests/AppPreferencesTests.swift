import Foundation
import Testing
@testable import KlipRunCore

@Test func settingsRoundTripAndInvalidValuesRecoverSafely() {
    let suite = "local.kliprun.tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    var settings = AppPreferences(defaults: defaults)
    settings.wheelSensitivity = 8
    settings.smoothSensitivity = 2
    settings.terminalFontSize = 18
    settings.interfaceZoomPercent = 120
    settings.terminalPosition = "left"
    settings.startupPage = "/office"
    settings.detailTab = "agent"
    settings.reduceMotion = true
    settings.save(to: defaults)
    #expect(AppPreferences(defaults: defaults) == settings)
    defaults.set(Double.nan, forKey: "terminal.wheelSensitivity")
    defaults.set(500, forKey: "terminal.fontSize")
    defaults.set("javascript:bad", forKey: "appearance.startupPage")
    defaults.set("all", forKey: "appearance.detailTab")
    let restored = AppPreferences(defaults: defaults)
    #expect(restored.wheelSensitivity == 5)
    #expect(restored.terminalFontSize == 24)
    #expect(restored.startupPage == "/")
    #expect(restored.detailTab == "agent-text")
    #expect(restored.smoothSensitivity == 2)
}
