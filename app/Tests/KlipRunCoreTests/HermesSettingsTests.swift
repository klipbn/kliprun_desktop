import AppKit
import SwiftUI
import Testing
import KlipRunCore
@testable import KlipRunDesktop

@MainActor @Test func hermesSettingsShowBothWatchersAndFitSmallLayouts() async throws {
    let home = FileManager.default.temporaryDirectory.appendingPathComponent("hermes-settings-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: home) }
    let now = ISO8601DateFormatter().string(from: Date())
    let pid = ProcessInfo.processInfo.processIdentifier
    for (path, value) in [
        (".local/share/codex-hermes/codex-watch.ts", "export const WATCHER_VERSION = '1.4.0'"),
        (".config/opencode/plugins/hermes-watch.ts", "const WATCHER_VERSION = '3.12.0'"),
        (".cache/codex-hermes/watcher.json", #"{"pid":\#(pid),"version":"1.4.0","heartbeatAt":"\#(now)","daemon":{"connected":false},"local":{"available":true},"sendEnabled":false,"secret":"PRIVATE_PAYLOAD"}"#),
        (".cache/opencode-hermes/instances/demo.json", #"{"pid":\#(pid),"watcherVersion":"3.12.0","heartbeatAt":"\#(now)"}"#)
    ] {
        let url = home.appendingPathComponent(path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try value.write(to: url, atomically: true, encoding: .utf8)
    }
    let monitor = HermesMonitor(home: home, environment: [:], service: HermesLaunchAgent(executable: URL(fileURLWithPath: "/usr/bin/true")))
    await monitor.refresh()
    #expect(monitor.statuses.count == 2)
    #expect(monitor.statuses.allSatisfy { $0.state == .running })
    #expect(!monitor.diagnostics.contains("PRIVATE_PAYLOAD"))
    await monitor.restartCodexWatcher()
    #expect(monitor.error == nil)
    #expect(monitor.message != nil)
    let suite = "local.kliprun.hermes-settings.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults)
    let host = NSHostingView(rootView: ScrollView { HermesSettingsView(store: store, monitor: monitor).padding(20) }.frame(width: 560, height: 850))
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 850), styleMask: [.titled], backing: .buffered, defer: false)
    window.contentView = host
    window.makeKeyAndOrderFront(nil)
    defer { window.orderOut(nil) }
    func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
    for (width, height, name) in [(560.0, 850.0, "normal"), (500.0, 660.0, "small")] {
        host.rootView = ScrollView { HermesSettingsView(store: store, monitor: monitor).padding(20) }.frame(width: width, height: height)
        window.setContentSize(NSSize(width: width, height: height))
        try await Task.sleep(for: .milliseconds(120))
        host.layoutSubtreeIfNeeded()
        let scroll = try #require(descendants(host).compactMap { $0 as? NSScrollView }.first)
        let document = try #require(scroll.documentView)
        #expect(document.bounds.width <= scroll.contentView.bounds.width + 1)
        #expect(document.bounds.height <= 480)
        let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
        host.cacheDisplay(in: host.bounds, to: bitmap)
        try #require(bitmap.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: "/private/tmp/kliprun-hermes-settings-\(name).png"))
    }
    let scroll = try #require(descendants(host).compactMap { $0 as? NSScrollView }.first)
    let document = try #require(scroll.documentView)
    for _ in 0..<50 where monitor.busy { try await Task.sleep(for: .milliseconds(20)) }
    host.layoutSubtreeIfNeeded()
    let collapsedHeight = document.bounds.height
    func clickDetailsText(top: CGFloat = 135) async throws {
        window.makeKeyAndOrderFront(nil)
        // Click the label, away from the disclosure arrow.
        let point = NSPoint(x: 60, y: host.bounds.height - top)
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            NSApplication.shared.sendEvent(try #require(NSEvent.mouseEvent(with: type, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                windowNumber: window.windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: type == .leftMouseDown ? 1 : 0)))
        }
        try await Task.sleep(for: .milliseconds(100))
        host.layoutSubtreeIfNeeded()
    }
    try await clickDetailsText()
    #expect(document.bounds.height > collapsedHeight + 70)
    await monitor.refresh()
    host.layoutSubtreeIfNeeded()
    #expect(document.bounds.height > collapsedHeight + 70)
    let expanded = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
    host.cacheDisplay(in: host.bounds, to: expanded)
    try #require(expanded.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: "/private/tmp/kliprun-hermes-details-expanded.png"))
    try await clickDetailsText()
    #expect(abs(document.bounds.height - collapsedHeight) < 2)
    try await clickDetailsText(top: 215)
    #expect(document.bounds.height > collapsedHeight + 70)
    await monitor.refresh()
    host.layoutSubtreeIfNeeded()
    #expect(document.bounds.height > collapsedHeight + 70)
    try await clickDetailsText(top: 215)
    #expect(abs(document.bounds.height - collapsedHeight) < 2)
}
