import AppKit
import SwiftUI
import KlipRunCore

@MainActor
final class PopupNotifications: NSObject, ObservableObject, NSWindowDelegate {
    @Published private(set) var paused: Bool
    @Published private(set) var responseReady: Bool
    @Published private(set) var needsInput: Bool
    @Published private(set) var displaySeconds: Double
    @Published private(set) var soundName: String?
    @Published private(set) var klopikSkin: KlopikSkin
    static let systemSoundNames: [String] = ((try? FileManager.default.contentsOfDirectory(atPath: "/System/Library/Sounds")) ?? [])
        .filter { ($0 as NSString).pathExtension.lowercased() == "aiff" }
        .map { ($0 as NSString).deletingPathExtension }
        .sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    private var playingSound: NSSound?
    private let preferences: NotificationPreferences
    private var panel: NSPanel?
    private var queue: [(AgentNotification, () -> Void)] = []
    private var timer: Timer?
    private var dragging = false

    init(defaults: UserDefaults = .standard) {
        let preferences = NotificationPreferences(defaults: defaults)
        self.preferences = preferences
        paused = !preferences.enabled
        responseReady = preferences.responseReady
        needsInput = preferences.needsInput
        displaySeconds = preferences.displaySeconds
        soundName = preferences.soundName.flatMap { Self.systemSoundNames.contains($0) ? $0 : nil }
        klopikSkin = preferences.klopikSkin
        super.init()
    }

    func show(_ event: AgentNotification, open: @escaping () -> Void) {
        guard preferences.allows(event.kind) else { return }
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
        preferences.setEnabled(!value)
        if value { queue.removeAll(); hideCurrent(); playingSound?.stop() }
    }

    func setResponseReady(_ value: Bool) {
        responseReady = value
        preferences.setResponseReady(value)
        queue.removeAll { !preferences.allows($0.0.kind) }
    }

    func setNeedsInput(_ value: Bool) {
        needsInput = value
        preferences.setNeedsInput(value)
        queue.removeAll { !preferences.allows($0.0.kind) }
    }

    func setSoundName(_ name: String?) {
        if let name, !Self.systemSoundNames.contains(name) { return }
        playingSound?.stop()
        soundName = name
        preferences.setSoundName(name)
    }

    func previewSound() {
        playingSound?.stop()
        guard let soundName else { return }
        playingSound = NSSound(contentsOfFile: "/System/Library/Sounds/\(soundName).aiff", byReference: true)
        playingSound?.play()
    }

    func setKlopikSkin(_ skin: KlopikSkin) {
        klopikSkin = skin
        preferences.setKlopikSkin(skin)
        if let content = panel?.contentView as? NSHostingView<NotificationView> {
            content.rootView.klopikSkin = skin
        }
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
        guard preferences.allows(event.kind) || event.sessionID == "ses_preview" else { return }
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
        }, klopikSkin: klopikSkin))
        window.contentView = content
        window.setContentSize(content.fittingSize)
        position(window)
        panel = window
        window.delegate = self
        window.orderFrontRegardless()
        previewSound()
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
