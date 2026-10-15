import Foundation
import Testing
@testable import KlipRunDesktop

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
    #expect(DesktopStore(defaults: defaults).preferences == store.preferences)
    store.stop()
    for _ in 0..<50 where store.terminals.contains(where: \.isRunning) {
        try await Task.sleep(for: .milliseconds(20))
    }
}
