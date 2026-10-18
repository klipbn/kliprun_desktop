import AppKit
import SwiftUI
import Testing
@testable import KlipRunDesktop

@MainActor @Test func pinnedTerminalLabelIsSquareAndDoesNotExpandWithItsTitle() throws {
    let terminal = try #require(TerminalSession(id: 707, source: "terminal", directory: FileManager.default.temporaryDirectory.path))
    defer { terminal.terminate() }
    terminal.rename("A very long session title in the Aurora project")
    let pinned = NSHostingView(rootView: TerminalTabLabel(terminal: terminal, pinned: true, onClose: {}))
    let normal = NSHostingView(rootView: TerminalTabLabel(terminal: terminal, pinned: false, onClose: {}))
    let size = pinned.fittingSize
    #expect(abs(size.width - size.height) < 1)
    #expect(size.width <= 32)
    #expect(normal.fittingSize.width > size.width + 50)
}
