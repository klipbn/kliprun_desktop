import AppKit
import SwiftUI
import KlipRunCore

@MainActor
final class PopupNotifications: NSObject, ObservableObject, NSWindowDelegate {
    @Published private(set) var paused = false
    @Published private(set) var displaySeconds: Double
    private let preferences: NotificationPreferences
    private var panel: NSPanel?
    private var queue: [(AgentNotification, () -> Void)] = []
    private var timer: Timer?
    private var dragging = false

    override init() {
        let preferences = NotificationPreferences()
        self.preferences = preferences
        displaySeconds = preferences.displaySeconds
        super.init()
    }

    func show(_ event: AgentNotification, open: @escaping () -> Void) {
        guard !paused else { return }
        queue.append((event, open))
        presentNext()
    }

    func preview(open: @escaping () -> Void) {
        hideCurrent()
        queue.insert((AgentNotification(sessionID: "ses_preview", title: "Example: fixing a report",
                                        kind: .question, revision: 1), open), at: 0)
        presentNext()
    }

    func setPaused(_ value: Bool) {
        paused = value
        if value { queue.removeAll(); hideCurrent() }
    }

    @discardableResult func setDisplaySeconds(_ value: Double) -> Bool {
        guard preferences.setDisplaySeconds(value) else { return false }
        displaySeconds = value
        scheduleExpiration()
        return true
    }

    func resetPosition() {
        preferences.resetPosition()
        if let panel {
            panel.delegate = nil
            position(panel)
            panel.delegate = self
        }
    }

    private func presentNext() {
        guard panel == nil, !queue.isEmpty else { return }
        let (event, open) = queue.removeFirst()
        guard !paused || event.sessionID == "ses_preview" else { return }
        let window = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 420, height: 230),
                             styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        window.level = .statusBar
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        window.isOpaque = false; window.backgroundColor = .clear; window.hasShadow = false
        window.hidesOnDeactivate = false; window.isReleasedWhenClosed = false; window.isMovable = true
        let content = NSHostingView(rootView: NotificationView(event: event, open: { [weak self] in
            open(); self?.dismiss()
        }, dismiss: { [weak self] in self?.dismiss() }, dragging: { [weak self] active in
            self?.dragging = active
            self?.scheduleExpiration()
        }))
        window.contentView = content
        window.setContentSize(content.fittingSize)
        position(window)
        panel = window
        window.delegate = self
        window.orderFrontRegardless()
        scheduleExpiration()
    }

    private func position(_ window: NSWindow) {
        let screen = NSScreen.screens.first(where: { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) }) ?? NSScreen.main
        guard let frame = screen?.visibleFrame else { return }
        window.setFrameOrigin(preferences.origin(for: window.frame.size,
                                                screens: NSScreen.screens.map(\.visibleFrame), fallback: frame))
    }

    func windowDidMove(_ notification: Notification) {
        guard let window = notification.object as? NSWindow, window === panel else { return }
        preferences.saveTopLeft(CGPoint(x: window.frame.minX, y: window.frame.maxY))
    }

    private func scheduleExpiration() {
        timer?.invalidate(); timer = nil
        guard panel != nil, !dragging, displaySeconds > 0 else { return }
        timer = Timer.scheduledTimer(withTimeInterval: displaySeconds, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.dismiss() }
        }
    }

    private func hideCurrent() {
        timer?.invalidate(); timer = nil
        panel?.delegate = nil
        panel?.close(); panel = nil
        dragging = false
    }

    private func dismiss() {
        hideCurrent()
        presentNext()
    }
}
