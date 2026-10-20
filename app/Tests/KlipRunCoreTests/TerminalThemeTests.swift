import AppKit
import SwiftUI
import SwiftTerm
import Testing
import KlipRunCore
@testable import KlipRunDesktop

@Test func terminalThemePersistsIndependentlyAndCanFollowTheApp() {
    let suite = "local.kliprun.terminal-theme.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    var preferences = AppPreferences(defaults: defaults)
    preferences.theme = "paper"
    #expect(preferences.resolvedTerminalTheme == "paper")
    for theme in ["graphite", "dracula", "nord", "solarized-dark", "solarized-light"] {
        preferences.terminalTheme = theme
        preferences.save(to: defaults)
        let restored = AppPreferences(defaults: defaults)
        #expect(restored.resolvedTerminalTheme == theme)
        #expect(restored.theme == "paper")
        #expect(restored.webScript.contains("theme: 'paper'"))
    }
    defaults.set("invalid", forKey: "terminal.theme")
    #expect(AppPreferences(defaults: defaults).resolvedTerminalTheme == "paper")
    preferences.terminalTheme = "app"
    preferences.save(to: defaults)
    #expect(AppPreferences(defaults: defaults).resolvedTerminalTheme == "paper")
}

@MainActor @Test func terminalThemePickerUpdatesPreviewAndSavesInNormalAndSmallSettings() async throws {
    let suite = "local.kliprun.terminal-settings.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults)
    let host = NSHostingView(rootView: SettingsView(store: store))
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 850), styleMask: [.titled], backing: .buffered, defer: false)
    window.contentView = host
    window.makeKeyAndOrderFront(nil)
    defer { window.orderOut(nil) }
    func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
    try await Task.sleep(for: .milliseconds(80))
    host.layoutSubtreeIfNeeded()
    let picker = try #require(descendants(host).compactMap { $0 as? NSPopUpButton }.first)
    let initial = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
    host.cacheDisplay(in: host.bounds, to: initial)
    try #require(initial.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: "/private/tmp/kliprun-terminal-settings-initial.png"))
    try #require(picker.menu).performActionForItem(at: picker.indexOfItem(withTitle: "Dracula"))
    try await Task.sleep(for: .milliseconds(50))
    #expect(store.preferences.terminalTheme == "dracula")
    #expect(AppPreferences(defaults: defaults).terminalTheme == "dracula")
    for (width, height, theme) in [(560.0, 850.0, "dracula"), (500.0, 660.0, "solarized-light")] {
        window.setContentSize(NSSize(width: width, height: height))
        store.updatePreferences { $0.terminalTheme = theme }
        try await Task.sleep(for: .milliseconds(50))
        host.layoutSubtreeIfNeeded()
        #expect(picker.bounds.width < width - 60)
        let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
        host.cacheDisplay(in: host.bounds, to: bitmap)
        try #require(bitmap.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: "/private/tmp/kliprun-terminal-settings-\(theme).png"))
    }
}

@MainActor @Test func terminalThemesAndScrollSpeedsApplyToEveryOpenTerminal() throws {
    let suite = "local.kliprun.terminal-live-theme.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults)
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    store.terminals = try (1...2).map { id in
        try #require(TerminalSession(id: id, source: "terminal", directory: directory.path))
    }
    defer { store.stop() }
    for (theme, red, green, blue) in [("dracula", 40.0, 42.0, 54.0), ("solarized-light", 253.0, 246.0, 227.0)] {
        store.updatePreferences { $0.terminalTheme = theme; $0.wheelSensitivity = 9; $0.smoothSensitivity = 7 }
        for terminal in store.terminals {
            let background = try #require(terminal.view.nativeBackgroundColor.usingColorSpace(.sRGB))
            #expect(abs(background.redComponent * 255 - red) < 1)
            #expect(abs(background.greenComponent * 255 - green) < 1)
            #expect(abs(background.blueComponent * 255 - blue) < 1)
            #expect(terminal.view.scrollSensitivity == 9)
            #expect(terminal.view.preciseScrollSensitivity == 7)
        }
    }
    store.updatePreferences { $0.theme = "graphite" }
    #expect(store.preferences.resolvedTerminalTheme == "solarized-light")
    store.updatePreferences { $0.terminalTheme = "app" }
    #expect(store.preferences.resolvedTerminalTheme == "graphite")
    for terminal in store.terminals {
        let background = try #require(terminal.view.nativeBackgroundColor.usingColorSpace(.sRGB))
        #expect(abs(background.blueComponent * 255 - 52) < 1)
    }
}
