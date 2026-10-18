import Foundation
import Testing
@testable import KlipRunDesktop

@MainActor @Test func movingTerminalTabsPreservesSelectionAndKeyboardOrder() throws {
    let store = DesktopStore()
    let directory = FileManager.default.temporaryDirectory.path
    let a = try #require(TerminalSession(id: 101, source: "terminal", directory: directory))
    let b = try #require(TerminalSession(id: 102, source: "terminal", directory: directory))
    let c = try #require(TerminalSession(id: 103, source: "terminal", directory: directory))
    defer { store.stop() }
    store.terminals = [a,b,c]
    store.selectTerminalTab(102)
    store.moveTerminal(101, to: 103)
    #expect(store.terminals.map(\.id) == [102,103,101])
    #expect(store.selectedTerminalID == 102)
    store.selectTerminalTab(number: 3)
    #expect(store.selectedTerminalID == 101)
    store.moveTerminal(101, to: 102)
    #expect(store.terminals.map(\.id) == [101,102,103])
    store.selectTerminalTab(103)
    store.menu.cycleTerminal(1)
    #expect(store.selectedTerminalID == 101)
    store.menu.cycleTerminal(-1)
    #expect(store.selectedTerminalID == 103)
}

@MainActor @Test func pinnedTerminalTabsKeepTheirPrefixAndSelectionAcrossPinningAndDragging() throws {
    let store = DesktopStore()
    let directory = FileManager.default.temporaryDirectory.path
    let a = try #require(TerminalSession(id: 101, source: "terminal", directory: directory))
    let b = try #require(TerminalSession(id: 102, source: "terminal", directory: directory))
    let c = try #require(TerminalSession(id: 103, source: "terminal", directory: directory))
    defer { store.stop() }
    store.terminals = [a, b, c]
    store.selectTerminalTab(101)
    let pids = [a.pid, b.pid, c.pid]
    store.toggleTerminalPin(103)
    store.toggleTerminalPin(102)
    #expect(store.terminals.map(\.id) == [103, 102, 101])
    #expect(store.pinnedTerminalIDs == [102, 103])
    #expect(store.selectedTerminalID == 101)
    store.moveTerminal(101, to: 103)
    #expect(store.terminals.map(\.id) == [103, 102, 101])
    store.moveTerminal(102, to: 103)
    #expect(store.terminals.map(\.id) == [102, 103, 101])
    store.toggleTerminalPin(102)
    #expect(store.terminals.map(\.id) == [103, 102, 101])
    #expect(store.pinnedTerminalIDs == [103])
    #expect([a.pid, b.pid, c.pid] == pids)
    store.selectTerminalTab(number: 1)
    #expect(store.selectedTerminalID == 103)
}

@MainActor @Test func explicitTerminalLinkSwitchesCardsWithoutOpeningHiddenDock() throws {
    let store = DesktopStore()
    let directory = FileManager.default.temporaryDirectory.path
    let id = "codex:01234567-1234-1234-1234-123456789abc"
    // A shell stands in for a launched agent; do not start a real user session.
    let a = try #require(TerminalSession(id: 101, source: "terminal", directory: directory))
    let b = try #require(TerminalSession(id: 102, source: "terminal", directory: directory))
    defer { store.stop() }
    store.terminals = [a,b]
    store.selectedID = id
    store.linkTerminalToSelectedSession(102)
    b.updateSessionLink(observed: [])
    store.selectTerminalTab(101)
    store.selectWebSession(id)
    #expect(store.selectedTerminalID == 102)
    store.hideTerminal()
    store.selectWebSession(id)
    #expect(store.selectedTerminalID == nil)
}

@MainActor @Test func processEvidenceOverridesOldExplicitLinksAndRejectsAmbiguity() throws {
    let terminal = try #require(TerminalSession(id: 104, source: "terminal", directory: FileManager.default.temporaryDirectory.path))
    defer { terminal.terminate() }
    terminal.explicitSessionID = "codex:old"
    terminal.updateSessionLink(observed: ["codex:new"])
    #expect(terminal.sessionID == "codex:new")
    #expect(terminal.explicitSessionID == nil)
    terminal.updateSessionLink(observed: [])
    #expect(terminal.sessionID == nil)
    terminal.updateSessionLink(observed: ["codex:a", "codex:b"])
    #expect(terminal.sessionID == nil)
}
