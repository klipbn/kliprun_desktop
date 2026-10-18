import AppKit
import SwiftUI
import Testing
@testable import KlipRunDesktop

@MainActor @Test func terminalSwitcherListsAllTabsInShortcutOrderAndSelectsTheirSessions() async throws {
    let suite = "local.kliprun.terminal-switcher-\(UUID().uuidString)", defaults = UserDefaults(suiteName: suite)!
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(suite)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let store = DesktopStore(defaults: defaults)
    defer { store.stop(); defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: directory) }
    for number in 1...10 {
        let terminal = try #require(TerminalSession(id: number, source: "terminal", directory: directory.path))
        terminal.rename("Demo terminal \(number)"); terminal.sessionID = "ses_demo_\(number)"
        store.terminals.append(terminal)
    }
    store.toggleTerminalPin(10)
    store.moveTerminal(2, to: 3)
    store.selectTerminalTab(1)
    let pids = store.terminals.map(\.pid)
    let host = NSHostingView(rootView: HStack { TerminalSwitcher(store: store); Spacer() }.padding(10))
    let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 460, height: 100), styleMask: [.titled], backing: .buffered, defer: false)
    window.contentView = host; window.makeKeyAndOrderFront(nil)
    defer { window.orderOut(nil) }
    host.layoutSubtreeIfNeeded()
    try await Task.sleep(for: .milliseconds(50))
    func click(_ target: NSWindow, point: NSPoint) throws {
        target.makeKeyAndOrderFront(nil)
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            NSApp.sendEvent(try #require(NSEvent.mouseEvent(with: type, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                windowNumber: target.windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: type == .leftMouseDown ? 1 : 0)))
        }
    }
    try click(window, point: host.convert(NSPoint(x: 27, y: host.bounds.midY), to: nil))
    func popup() -> NSWindow? {
        NSApp.windows.first { $0.isVisible && String(describing: type(of: $0)).contains("Popover") }
    }
    for _ in 0..<50 where popup() == nil { try await Task.sleep(for: .milliseconds(20)) }
    let panel = try #require(popup()), content = try #require(panel.contentView)
    func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
    let scroll = try #require(descendants(content).compactMap { $0 as? NSScrollView }.first)
    let document = try #require(scroll.documentView)
    func capture(_ name: String) throws {
        content.layoutSubtreeIfNeeded()
        let bitmap = try #require(content.bitmapImageRepForCachingDisplay(in: content.bounds))
        content.cacheDisplay(in: content.bounds, to: bitmap)
        try #require(bitmap.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: "/private/tmp/kliprun-terminal-switcher-\(name).png"))
    }
    try capture("normal")
    window.setContentSize(NSSize(width: 320, height: 100))
    host.layoutSubtreeIfNeeded()
    try await Task.sleep(for: .milliseconds(50))
    #expect(panel.frame.width <= 400)
    let screen = try #require(panel.screen?.visibleFrame)
    #expect(screen.insetBy(dx: -1, dy: -1).contains(panel.frame))
    try capture("small")
    scroll.contentView.scroll(to: NSPoint(x: 0, y: max(0, document.bounds.height - scroll.contentView.bounds.height)))
    scroll.reflectScrolledClipView(scroll.contentView)
    try await Task.sleep(for: .milliseconds(30))
    try capture("bottom")
    let lastRowY = document.isFlipped ? document.bounds.height - 24 : 24
    try click(panel, point: document.convert(NSPoint(x: 100, y: lastRowY), to: nil))
    for _ in 0..<50 where store.selectedTerminalID != 9 { try await Task.sleep(for: .milliseconds(20)) }
    #expect(store.selectedTerminalID == 9)
    #expect(store.selectedID == "ses_demo_9")
    #expect(store.terminals.map(\.pid) == pids)
    for _ in 0..<50 where popup() != nil { try await Task.sleep(for: .milliseconds(20)) }
    #expect(popup() == nil)
    store.selectTerminalTab(number: 1)
    #expect(store.selectedTerminalID == 10)
}
