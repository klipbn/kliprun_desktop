import AppKit

@MainActor public final class TerminalHostView: NSView {
    private weak var displayed: NSView?

    @discardableResult public func show(_ terminal: NSView) -> Bool {
        guard displayed !== terminal else { return false }
        displayed?.removeFromSuperview()
        terminal.removeFromSuperview()
        terminal.frame = bounds
        terminal.autoresizingMask = [.width, .height]
        addSubview(terminal)
        displayed = terminal
        return true
    }
}
