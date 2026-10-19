import AppKit
import SwiftUI
import Testing
import KlipRunCore
@testable import KlipRunDesktop

@MainActor @Test func usageSettingsControlsToggleAndReorderProviders() async throws {
    let suite = "local.kliprun.usage-settings.\(UUID().uuidString)", defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults)
    let host = NSHostingView(rootView: SettingsView(store: store))
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 850), styleMask: [.titled], backing: .buffered, defer: false)
    window.contentView = host; window.makeKeyAndOrderFront(nil)
    defer { window.orderOut(nil) }
    func click(_ x: CGFloat, _ y: CGFloat) async throws {
        window.makeKeyAndOrderFront(nil);host.layoutSubtreeIfNeeded()
        for type in [NSEvent.EventType.leftMouseDown,.leftMouseUp] {
            NSApplication.shared.sendEvent(try #require(NSEvent.mouseEvent(with:type,location:NSPoint(x:x,y:host.bounds.height-y),modifierFlags:[],timestamp:ProcessInfo.processInfo.systemUptime,windowNumber:window.windowNumber,context:nil,eventNumber:1,clickCount:1,pressure:type == .leftMouseDown ? 1 : 0)))
        }
        try await Task.sleep(for:.milliseconds(40))
    }
    try await Task.sleep(for:.milliseconds(50))
    try await click(356,110) // Usage tab.
    let before = try #require(host.bitmapImageRepForCachingDisplay(in:host.bounds));host.cacheDisplay(in:host.bounds,to:before)
    try #require(before.representation(using:.png,properties:[:])).write(to:URL(fileURLWithPath:"/private/tmp/kliprun-usage-settings-before.png"))
    try await click(180,523) // Disable all.
    #expect(store.preferences.usageEnabledProviders.isEmpty)
    try await click(200,372) // Claude.
    try await click(200,323) // Codex.
    try await click(481,372) // Move Claude above Codex.
    #expect(store.preferences.usageEnabledProviders == ["claude", "codex"])
    #expect(AppPreferences(defaults: defaults).usageEnabledProviders == ["claude", "codex"])
    for (width, height, name) in [(560.0,850.0,"normal"),(500.0,660.0,"small")] {
        window.setContentSize(NSSize(width:width,height:height));host.layoutSubtreeIfNeeded()
        try await Task.sleep(for:.milliseconds(40))
        let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in:host.bounds));host.cacheDisplay(in:host.bounds,to:bitmap)
        try #require(bitmap.representation(using:.png,properties:[:])).write(to:URL(fileURLWithPath:"/private/tmp/kliprun-usage-settings-\(name).png"))
    }
}
