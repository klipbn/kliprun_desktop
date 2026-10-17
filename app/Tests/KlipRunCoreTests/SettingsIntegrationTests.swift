import Foundation
import Testing
import AppKit
import SwiftUI
@testable import KlipRunDesktop

@MainActor @Test func settingsChoicesRespondToClicksAwayFromTheirText() async throws {
    let suite = "local.kliprun.tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults)
    let host = NSHostingView(rootView: SettingsView(store: store))
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 850),
                          styleMask: [.titled], backing: .buffered, defer: false)
    window.contentView = host
    window.makeKeyAndOrderFront(nil)
    host.layoutSubtreeIfNeeded()
    defer { window.orderOut(nil) }
    try await Task.sleep(for: .milliseconds(50))
    // Points near the control edges deliberately avoid the text and icons.
    func click(_ x: CGFloat, _ yFromTop: CGFloat) async throws {
        window.makeKeyAndOrderFront(nil)
        let location = NSPoint(x: x, y: host.bounds.height - yFromTop)
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            let event = try #require(NSEvent.mouseEvent(with: type, location: location, modifierFlags: [],
                timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
                context: nil, eventNumber: 1, clickCount: 1, pressure: type == .leftMouseDown ? 1 : 0))
            NSApplication.shared.sendEvent(event)
        }
        try await Task.sleep(for: .milliseconds(30))
    }
    try await click(495, 650)
    #expect(store.preferences.terminalPosition == "left")
    try await click(50, 650)
    #expect(store.preferences.terminalPosition == "bottom")
    window.setContentSize(NSSize(width: 560, height: 660))
    host.layoutSubtreeIfNeeded()
    func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
    let scroll = try #require(descendants(host).compactMap { $0 as? NSScrollView }.first)
    scroll.contentView.scroll(to: NSPoint(x: 0, y: 160))
    scroll.reflectScrolledClipView(scroll.contentView)
    try await Task.sleep(for: .milliseconds(30))
    try await click(495, 490)
    #expect(store.preferences.terminalPosition == "left")
    try await click(50, 490)
    #expect(store.preferences.terminalPosition == "bottom")
    window.setContentSize(NSSize(width: 560, height: 850))
    try await click(174, 110) // Appearance
    try await click(145, 332)
    #expect(store.preferences.interfaceZoomPercent == 80)
    try await click(168, 480)
    #expect(store.preferences.startupPage == "/git")
    try await click(315, 480)
    #expect(store.preferences.startupPage == "/office")
    for (x, tab) in [(60.0, "user"), (175.0, "agent-text"), (280.0, "agent"), (390.0, "models"), (480.0, "kanban")] {
        try await click(x, 555)
        #expect(store.preferences.detailTab == tab)
    }
}

@MainActor @Test func settingsOverlayKeepsTerminalControlsEnabled() async throws {
    let suite = "local.kliprun.tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults)
    store.showingSettings = true
    let host = NSHostingView(rootView: ContentView(store: store))
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 980, height: 660),
                          styleMask: [.titled], backing: .buffered, defer: false)
    window.contentView = host
    window.makeKeyAndOrderFront(nil)
    host.layoutSubtreeIfNeeded()
    defer { window.orderOut(nil) }
    func descendants(_ view: NSView) -> [NSView] {
        [view] + view.subviews.flatMap(descendants)
    }
    func sliders() -> [NSSlider] {
        descendants(host).compactMap { $0 as? NSSlider }
    }
    for _ in 0..<100 where sliders().count < 2 { try await Task.sleep(for: .milliseconds(20)) }
    let slider = try #require(sliders().first)
    #expect(slider.isEnabled)
    slider.doubleValue = slider.minValue + (slider.maxValue - slider.minValue) * 7 / 9
    slider.sendAction(slider.action, to: slider.target)
    #expect(store.preferences.wheelSensitivity == 8 || store.preferences.smoothSensitivity == 8)
}

@MainActor @Test func diagnosticsExcludeCredentialsAndSessionContent() {
    let suite = "local.kliprun.tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults, updater: AppUpdater(installedVersion: "0.0.12"))
    store.selectedID = "private-session-title"
    store.updatePreferences { $0.interfaceZoomPercent = 120 }
    #expect(store.diagnostics.contains("KlipRun 0.0.12"))
    #expect(store.diagnostics.contains("Interface scale: 120%"))
    #expect(!store.diagnostics.contains(store.runtime.token))
    #expect(!store.diagnostics.contains("private-session-title"))
    #expect(!store.diagnostics.contains(FileManager.default.homeDirectoryForCurrentUser.path))
}

@MainActor @Test func settingsApplyToOpenAndNewTerminalsWithoutCouplingFontToZoom() async throws {
    let suite = "local.kliprun.tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(suite)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let store = DesktopStore(defaults: defaults)
    defer {
        store.stop()
        defaults.removePersistentDomain(forName: suite)
        try? FileManager.default.removeItem(at: directory)
    }
    let terminal = try #require(TerminalSession(id: 100, source: "terminal", directory: directory.path))
    store.terminals = [terminal]
    store.selectTerminalTab(terminal.id)
    let originalPID = terminal.pid
    store.updatePreferences {
        $0.wheelSensitivity = 8
        $0.smoothSensitivity = 2
        $0.terminalFontSize = 18
    }
    #expect(terminal.view.scrollSensitivity == 8)
    #expect(terminal.view.preciseScrollSensitivity == 2)
    #expect(terminal.view.font.pointSize == 18)
    #expect(terminal.pid == originalPID)
    store.updatePreferences { $0.theme = "paper" }
    #expect(terminal.view.nativeBackgroundColor.redComponent > 0.9)
    store.zoomIn()
    #expect(store.interfaceZoom.percent == 110)
    #expect(terminal.view.font.pointSize == 18)
    store.newTerminal()
    let newTerminal = try #require(store.terminals.last)
    #expect(newTerminal.id != terminal.id)
    #expect(newTerminal.directory == directory.path)
    #expect(newTerminal.view.scrollSensitivity == 8)
    #expect(newTerminal.view.preciseScrollSensitivity == 2)
    #expect(newTerminal.view.font.pointSize == 18)
    #expect(newTerminal.view.nativeBackgroundColor.redComponent > 0.9)
    #expect(DesktopStore(defaults: defaults).preferences == store.preferences)
    store.stop()
    for _ in 0..<50 where store.terminals.contains(where: \.isRunning) {
        try await Task.sleep(for: .milliseconds(20))
    }
}
