import AppKit
import SwiftUI

/// Closes a terminal tab on a middle click, like browser tabs, without taking other clicks from SwiftUI.
struct TerminalTabMiddleClick: NSViewRepresentable {
    let action: () -> Void

    func makeNSView(context: Context) -> TerminalTabMiddleClickView {
        let view = TerminalTabMiddleClickView()
        view.action = action
        return view
    }

    func updateNSView(_ nsView: TerminalTabMiddleClickView, context: Context) {
        nsView.action = action
    }

    static func dismantleNSView(_ nsView: TerminalTabMiddleClickView, coordinator: ()) {
        nsView.stopMonitoring()
    }
}

final class TerminalTabMiddleClickView: NSView {
    var action: () -> Void = {}
    private var monitor: Any?
    private var pressed = false

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        stopMonitoring()
        guard window != nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.otherMouseDown, .otherMouseUp]) { [weak self] event in
            guard let self, event.window === self.window,
                  self.handleMiddleClick(event.type, button: event.buttonNumber, at: event.locationInWindow) else { return event }
            return nil
        }
    }

    func stopMonitoring() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
    }

    /// A press and release of the middle button inside the tab closes it once.
    @discardableResult
    func handleMiddleClick(_ type: NSEvent.EventType, button: Int, at locationInWindow: NSPoint) -> Bool {
        let inside = button == 2 && !isHiddenOrHasHiddenAncestor
            && visibleRect.contains(convert(locationInWindow, from: nil))
        if type == .otherMouseDown {
            pressed = inside
            return inside
        }
        guard type == .otherMouseUp, button == 2 else { return false }
        defer { pressed = false }
        guard inside, pressed else { return false }
        // The close confirmation is modal; show it after the event monitor returns.
        DispatchQueue.main.async { [action] in action() }
        return true
    }
}
