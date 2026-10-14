import AppKit

@MainActor public final class TerminalResizeHandleView: NSView {
    public var onDrag: (CGFloat) -> Void = { _ in }
    public var onEnd: () -> Void = {}
    private var startScreenY: CGFloat?
    private var hovered = false
    private var tracking: NSTrackingArea?

    public override var mouseDownCanMoveWindow: Bool { false }
    public override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: .resizeUpDown)
    }

    public override func updateTrackingAreas() {
        if let tracking { removeTrackingArea(tracking) }
        tracking = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
                                  owner: self, userInfo: nil)
        addTrackingArea(tracking!)
        super.updateTrackingAreas()
    }

    public override func mouseEntered(with event: NSEvent) { hovered = true; needsDisplay = true }
    public override func mouseExited(with event: NSEvent) { hovered = false; needsDisplay = true }

    public override func mouseDown(with event: NSEvent) {
        guard let window else { return }
        startScreenY = window.convertPoint(toScreen: event.locationInWindow).y
        needsDisplay = true
    }

    public override func mouseDragged(with event: NSEvent) {
        guard let window, let startScreenY else { return }
        onDrag(window.convertPoint(toScreen: event.locationInWindow).y - startScreenY)
    }

    public override func mouseUp(with event: NSEvent) {
        guard startScreenY != nil else { return }
        startScreenY = nil
        needsDisplay = true
        onEnd()
    }

    public override func draw(_ dirtyRect: NSRect) {
        let active = hovered || startScreenY != nil
        if active {
            NSColor.controlAccentColor.withAlphaComponent(0.10).setFill()
            bounds.fill()
        }
        (active ? NSColor.controlAccentColor : NSColor(srgbRed: 48 / 255, green: 54 / 255, blue: 61 / 255, alpha: 1)).setFill()
        NSRect(x: 0, y: (bounds.height - 2) / 2, width: bounds.width, height: 2).fill()
    }
}
