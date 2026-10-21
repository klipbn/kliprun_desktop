import AppKit
import Testing
@testable import KlipRunDesktop

@MainActor @Test func terminalTabMiddleClickClosesOnlyForAMiddleClickInsideTheTab() async throws {
    let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 400, height: 60), styleMask: [.titled], backing: .buffered, defer: false)
    let tab = TerminalTabMiddleClickView(frame: NSRect(x: 10, y: 10, width: 120, height: 28))
    window.contentView?.addSubview(tab)
    defer { window.orderOut(nil) }
    var closed = 0
    tab.action = { closed += 1 }
    let inside = NSPoint(x: 50, y: 20), outside = NSPoint(x: 300, y: 20)

    #expect(tab.handleMiddleClick(.otherMouseDown, button: 2, at: inside))
    #expect(tab.handleMiddleClick(.otherMouseUp, button: 2, at: inside))
    // Pressing outside and releasing inside, or the other way round, is not a click on the tab.
    #expect(!tab.handleMiddleClick(.otherMouseDown, button: 2, at: outside))
    #expect(!tab.handleMiddleClick(.otherMouseUp, button: 2, at: inside))
    #expect(tab.handleMiddleClick(.otherMouseDown, button: 2, at: inside))
    #expect(!tab.handleMiddleClick(.otherMouseUp, button: 2, at: outside))
    // Other buttons (back/forward) are left alone, and the view never takes ordinary clicks.
    #expect(!tab.handleMiddleClick(.otherMouseDown, button: 3, at: inside))
    #expect(!tab.handleMiddleClick(.otherMouseUp, button: 3, at: inside))
    #expect(tab.hitTest(inside) == nil)
    tab.isHidden = true
    #expect(!tab.handleMiddleClick(.otherMouseDown, button: 2, at: inside))

    for _ in 0..<20 where closed == 0 { try await Task.sleep(for: .milliseconds(10)) }
    #expect(closed == 1)
}
