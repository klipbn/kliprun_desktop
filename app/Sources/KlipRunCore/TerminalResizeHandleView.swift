import AppKit

@MainActor public final class TerminalResizeHandleView: NSView {
    public enum Axis { case horizontal, vertical }
    public var axis: Axis = .vertical {
        didSet {
            guard axis != oldValue else { return }
            startScreenPoint = nil
            window?.invalidateCursorRects(for: self)
            needsDisplay = true
        }
    }
    public var onDrag: (CGFloat) -> Void = { _ in }
    public var onEnd: () -> Void = {}
    private var startScreenPoint: NSPoint?
    private var hovered = false
    private var tracking: NSTrackingArea?

    public override var mouseDownCanMoveWindow: Bool { false }
    public override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: axis == .horizontal ? .resizeLeftRight : .resizeUpDown)
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
        startScreenPoint = window.convertPoint(toScreen: event.locationInWindow)
        needsDisplay = true
    }

    public override func mouseDragged(with event: NSEvent) {
        guard let window, let startScreenPoint else { return }
        let point = window.convertPoint(toScreen: event.locationInWindow)
        onDrag(axis == .horizontal ? point.x - startScreenPoint.x : point.y - startScreenPoint.y)
    }

    public override func mouseUp(with event: NSEvent) {
        guard startScreenPoint != nil else { return }
        startScreenPoint = nil
        needsDisplay = true
        onEnd()
    }

    public override func draw(_ dirtyRect: NSRect) {
        let active = hovered || startScreenPoint != nil
        if active {
            NSColor.controlAccentColor.withAlphaComponent(0.10).setFill()
            bounds.fill()
        }
        (active ? NSColor.controlAccentColor : NSColor(srgbRed: 48 / 255, green: 54 / 255, blue: 61 / 255, alpha: 1)).setFill()
        if axis == .horizontal {
            NSRect(x: (bounds.width - 2) / 2, y: 0, width: 2, height: bounds.height).fill()
        } else {
            NSRect(x: 0, y: (bounds.height - 2) / 2, width: bounds.width, height: 2).fill()
        }
    }
}
