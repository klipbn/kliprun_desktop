import AppKit

@MainActor public final class TerminalHostView: NSView {
    private weak var displayed: NSView?

    public func show(_ terminal: NSView) {
        guard displayed !== terminal else { return }
        displayed?.removeFromSuperview()
        terminal.removeFromSuperview()
        terminal.frame = bounds
        terminal.autoresizingMask = [.width, .height]
        addSubview(terminal)
        displayed = terminal
    }
}
