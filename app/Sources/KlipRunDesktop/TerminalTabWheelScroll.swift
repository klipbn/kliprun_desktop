import AppKit
import SwiftUI

/// Adds vertical-wheel scrolling without replacing SwiftUI's tab selection and scrolling.
struct TerminalTabWheelScroll: NSViewRepresentable {
    func makeNSView(context: Context) -> TerminalTabWheelScrollView {
        TerminalTabWheelScrollView()
    }

    func updateNSView(_ nsView: TerminalTabWheelScrollView, context: Context) {}

    static func dismantleNSView(_ nsView: TerminalTabWheelScrollView, coordinator: ()) {
        nsView.stopMonitoring()
    }
}

final class TerminalTabWheelScrollView: NSView {
    private var monitor: Any?

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        stopMonitoring()
        guard window != nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
            guard let self, let window = self.window, event.window === window,
                  !self.isHiddenOrHasHiddenAncestor,
                  self.visibleRect.contains(self.convert(event.locationInWindow, from: nil)),
                  self.handleScrollWheel(event) else { return event }
            return nil
        }
    }

    func stopMonitoring() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
    }

    @discardableResult
    func handleScrollWheel(_ event: NSEvent) -> Bool {
        guard event.scrollingDeltaX == 0, event.scrollingDeltaY.isFinite,
              event.scrollingDeltaY != 0,
              event.modifierFlags.intersection([.shift, .command, .option, .control]).isEmpty,
              let scroll = enclosingScrollView else { return false }
        let clip = scroll.contentView
        let minimum = clip.documentRect.minX
        let maximum = clip.documentRect.maxX - clip.bounds.width
        guard maximum > minimum else { return false }
        let scale = event.hasPreciseScrollingDeltas ? 1 : max(1, scroll.horizontalLineScroll)
        let x = min(maximum, max(minimum, clip.bounds.minX - event.scrollingDeltaY * scale))
        clip.scroll(to: NSPoint(x: x, y: clip.bounds.minY))
        scroll.reflectScrolledClipView(clip)
        return true
    }
}
