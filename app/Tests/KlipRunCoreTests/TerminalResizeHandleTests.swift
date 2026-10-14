import AppKit
import Testing
@testable import KlipRunCore

@MainActor @Test func terminalDividerKeepsAbsoluteDragDistanceWhileItMoves() {
    let app = NSApplication.shared
    let window = NSPanel(contentRect: NSRect(x: 100, y: 100, width: 600, height: 400),
                         styleMask: [.borderless], backing: .buffered, defer: false)
    let handle = TerminalResizeHandleView(frame: NSRect(x: 0, y: 200, width: 600, height: 10))
    window.contentView?.addSubview(handle)
    window.orderFrontRegardless()
    var lastDelta: CGFloat = 0
    handle.onDrag = { delta in
        lastDelta = delta
        handle.frame.origin.y = 200 + delta
    }
    let start = window.convertPoint(toScreen: NSPoint(x: 300, y: 205))
    func send(_ type: NSEvent.EventType, _ point: NSPoint) {
        let event = NSEvent.mouseEvent(with: type, location: window.convertPoint(fromScreen: point),
                                       modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                       windowNumber: window.windowNumber, context: nil,
                                       eventNumber: 1, clickCount: 1, pressure: type == .leftMouseUp ? 0 : 1)!
        app.sendEvent(event)
    }
    send(.leftMouseDown, start)
    send(.leftMouseDragged, NSPoint(x: start.x, y: start.y + 40))
    send(.leftMouseDragged, NSPoint(x: start.x, y: start.y + 100))
    send(.leftMouseUp, NSPoint(x: start.x, y: start.y + 100))
    #expect(abs(lastDelta - 100) < 1)
    window.orderOut(nil)
}
