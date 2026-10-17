import AppKit
import Testing
@testable import KlipRunCore

@MainActor @Test func switchingTabsReplacesOnlyTheDisplayedTerminalView() {
    let host = TerminalHostView(frame: NSRect(x: 0, y: 0, width: 400, height: 200))
    let first = NSView(frame: .zero)
    let second = NSView(frame: .zero)
    #expect(host.show(first))
    #expect(host.subviews.first === first)
    #expect(!host.show(first))
    host.show(second)
    #expect(host.subviews.first === second)
    #expect(first.superview == nil)
    host.show(first)
    #expect(host.subviews.first === first)
}
