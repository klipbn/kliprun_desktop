import Foundation
import Testing
@testable import KlipRunCore

@Test func toolbarLabelsDefaultToCompactAndSurviveNativeStorage() {
    let suite = "local.kliprun.toolbar.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    #expect(AppPreferences(defaults: defaults).webScript.contains("toolbarExpanded: false"))
    for expanded in [true, false] {
        defaults.set(expanded, forKey: "appearance.toolbarExpanded")
        let preferences = AppPreferences(defaults: defaults)
        defaults.removeObject(forKey: "appearance.toolbarExpanded")
        preferences.save(to: defaults)
        #expect(defaults.bool(forKey: "appearance.toolbarExpanded") == expanded)
        #expect(AppPreferences(defaults: defaults).webScript.contains("toolbarExpanded: \(expanded)"))
    }
}

@Test func freshAppearanceUsesGraphiteAndLeftWhileExplicitChoicesSurvive() {
    let suite = "local.kliprun.appearance-defaults.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let fresh = AppPreferences(defaults: defaults)
    #expect(fresh.theme == "graphite")
    #expect(fresh.terminalPosition == "left")
    defaults.set("default", forKey: "appearance.theme")
    defaults.set("bottom", forKey: "terminal.position")
    let existing = AppPreferences(defaults: defaults)
    #expect(existing.theme == "default")
    #expect(existing.terminalPosition == "bottom")
    defaults.set("invalid", forKey: "terminal.position")
    #expect(AppPreferences(defaults: defaults).terminalPosition == "left")
}

@Test(arguments: ["default", "robot", "astronaut", "knight", "wizard", "explorer"])
func klopikSkinPersistsAndReachesTheWebView(_ skin: String) {
    let suite = "local.kliprun.skins.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    var preferences = AppPreferences(defaults: defaults)
    #expect(preferences.klopikSkin == "default")
    preferences.klopikSkin = skin
    preferences.save(to: defaults)
    let restored = AppPreferences(defaults: defaults)
    #expect(restored.klopikSkin == skin)
    #expect(restored.webScript.contains("klopikSkin: '\(skin)'"))
    defaults.set("bad'javascript", forKey: "appearance.klopikSkin")
    #expect(AppPreferences(defaults: defaults).klopikSkin == "default")
}

@Test func sessionsStartupIsSavedWithoutOverridingExistingKanbanChoice() {
    let suite = "local.kliprun.startup.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    #expect(AppPreferences(defaults: defaults).startupPage == "/sessions")
    defaults.set("/", forKey: "appearance.startupPage")
    #expect(AppPreferences(defaults: defaults).startupPage == "/")
    var preferences = AppPreferences(defaults: defaults)
    preferences.startupPage = "/sessions"
    preferences.save(to: defaults)
    #expect(AppPreferences(defaults: defaults).startupPage == "/sessions")
}

@Test(arguments: ["default", "ember", "dusk", "graphite", "daybreak", "paper"])
func themesPersistAndReachTheWebView(_ theme: String) {
    let suite = "local.kliprun.tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    var preferences = AppPreferences(defaults: defaults)
    preferences.theme = theme
    preferences.save(to: defaults)
    let restored = AppPreferences(defaults: defaults)
    #expect(restored.theme == theme)
    #expect(restored.webScript.contains("theme: '\(theme)'"))
}

@Test func invalidThemeFallsBackToGraphite() {
    let suite = "local.kliprun.tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    defaults.set("invalid'javascript", forKey: "appearance.theme")
    #expect(AppPreferences(defaults: defaults).theme == "graphite")
}

@Test(arguments: ["user", "agent-text", "agent", "models", "kanban"])
func everyDetailsTabCanBeSavedAsDefault(_ tab: String) {
    let suite = "local.kliprun.tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    var preferences = AppPreferences(defaults: defaults)
    preferences.detailTab = tab
    preferences.save(to: defaults)
    #expect(AppPreferences(defaults: defaults).detailTab == tab)
}

@Test func gitStartupPageSurvivesPreferenceValidation() {
    let suite = "local.kliprun.tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    var settings = AppPreferences(defaults: defaults)
    settings.startupPage = "/git"
    settings.save(to: defaults)
    #expect(AppPreferences(defaults: defaults).startupPage == "/git")
}

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
