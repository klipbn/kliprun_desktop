import Foundation
import Testing
@testable import KlipRunDesktop

@MainActor @Test func exitingTheShellClosesItsTabAndHidesTheLastTerminal() async throws {
    let store = DesktopStore()
    store.newTerminal()
    store.newTerminal()
    store.terminalExpanded = true
    let first = try #require(store.terminals.first)
    let last = try #require(store.terminals.last)
    defer { store.stop() }
    store.toggleTerminalPin(last.id)
    last.view.send(txt: "exit\r")
    for _ in 0..<100 where store.terminals.count == 2 {
        try await Task.sleep(for: .milliseconds(50))
    }
    #expect(store.terminals.map(\.id) == [first.id])
    #expect(!store.pinnedTerminalIDs.contains(last.id))
    #expect(store.selectedTerminalID == first.id)
    #expect(store.terminalExpanded)
    first.view.send(txt: "exit\r")
    for _ in 0..<100 where !store.terminals.isEmpty {
        try await Task.sleep(for: .milliseconds(50))
    }
    #expect(store.terminals.isEmpty)
    #expect(store.selectedTerminalID == nil)
    #expect(!store.terminalExpanded)
}
