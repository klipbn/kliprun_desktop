import AppKit
import SwiftUI
import Testing
import KlipRunCore
@testable import KlipRunDesktop

@MainActor @Test func notificationArtworkSelectsOneStableVariantFromTheSkinStrip() throws {
    let bitmap = try #require(NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 16, pixelsHigh: 4, bitsPerSample: 8, samplesPerPixel: 4,
        hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0))
    let colors: [[UInt8]] = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255]]
    let data = try #require(bitmap.bitmapData)
    for x in 0..<16 { for y in 0..<4 {
        for channel in 0..<4 { data[y * bitmap.bytesPerRow + x * 4 + channel] = colors[x / 4][channel] }
    } }
    let strip = NSImage(cgImage: try #require(bitmap.cgImage), size: NSSize(width: 16, height: 4))
    for (session, expected) in [("d", [1.0, 0, 0]), ("a", [0.0, 1, 0]), ("b", [0.0, 0, 1]), ("c", [1.0, 1, 0])] {
        let portrait = try #require(NotificationSkinArtwork.portrait(from: strip, sessionID: session))
        let pixels = NSBitmapImageRep(cgImage: try #require(portrait.cgImage(forProposedRect: nil, context: nil, hints: nil)))
        #expect(pixels.pixelsWide == 4)
        #expect(pixels.pixelsHigh == 4)
        let pixel = try #require(pixels.colorAt(x: 2, y: 2)?.usingColorSpace(.deviceRGB))
        #expect(abs(pixel.redComponent - expected[0]) < 0.01)
        #expect(abs(pixel.greenComponent - expected[1]) < 0.01)
        #expect(abs(pixel.blueComponent - expected[2]) < 0.01)
    }
}

@MainActor @Test func notificationSkinCardsPersistAndUpdateTheVisiblePreview() async throws {
    let suite = "local.kliprun.notification-skins.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    defaults.set("wizard", forKey: "appearance.klopikSkin")
    let notifications = PopupNotifications(defaults: defaults)
    _ = notifications.setDisplaySeconds(0)
    let host = NSHostingView(rootView: NotificationSkinPicker(notifications: notifications).frame(width: 480, height: 220))
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 480, height: 220), styleMask: [.titled], backing: .buffered, defer: false)
    window.contentView = host
    window.makeKeyAndOrderFront(nil)
    defer { notifications.setPaused(true); window.orderOut(nil) }
    notifications.preview(open: {})
    let preview = try #require(NSApp.windows.compactMap { $0.contentView as? NSHostingView<NotificationView> }.first)
    host.layoutSubtreeIfNeeded()
    try await Task.sleep(for: .milliseconds(80))
    let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
    host.cacheDisplay(in: host.bounds, to: bitmap)
    try #require(bitmap.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: "/private/tmp/kliprun-notification-picker.png"))
    for (index, skin) in KlopikSkin.allCases.enumerated() {
        host.layoutSubtreeIfNeeded()
        try await Task.sleep(for: .milliseconds(40))
        window.makeKeyAndOrderFront(nil)
        let location = NSPoint(x: CGFloat(80 + 160 * (index % 3)), y: index < 3 ? 160 : 50)
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            NSApplication.shared.sendEvent(try #require(NSEvent.mouseEvent(with: type, location: location, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                windowNumber: window.windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: type == .leftMouseDown ? 1 : 0)))
        }
        try await Task.sleep(for: .milliseconds(30))
        #expect(NotificationPreferences(defaults: defaults).klopikSkin == skin)
        #expect(PopupNotifications(defaults: defaults).klopikSkin == skin)
        #expect(preview.rootView.klopikSkin == skin)
        #expect(defaults.string(forKey: "appearance.klopikSkin") == "wizard")
    }
}

@MainActor @Test func notificationSkinSettingsFitNormalAndSmallWindows() async throws {
    let suite = "local.kliprun.notification-skins-layout.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults)
    let host = NSHostingView(rootView: SettingsView(store: store).frame(width: 560, height: 850))
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 850), styleMask: [.titled], backing: .buffered, defer: false)
    window.contentView = host
    window.makeKeyAndOrderFront(nil)
    defer { window.orderOut(nil) }
    host.layoutSubtreeIfNeeded()
    try await Task.sleep(for: .milliseconds(80))
    for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
        NSApplication.shared.sendEvent(try #require(NSEvent.mouseEvent(with: type, location: NSPoint(x: 205, y: 740), modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
            windowNumber: window.windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: type == .leftMouseDown ? 1 : 0)))
    }
    func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
    for (width, height, name) in [(560.0, 850.0, "normal"), (500.0, 660.0, "small")] {
        host.rootView = SettingsView(store: store).frame(width: width, height: height)
        window.setContentSize(NSSize(width: width, height: height))
        try await Task.sleep(for: .milliseconds(80))
        host.layoutSubtreeIfNeeded()
        let scroll = try #require(descendants(host).compactMap { $0 as? NSScrollView }.first)
        let document = try #require(scroll.documentView)
        scroll.contentView.scroll(to: NSPoint(x: 0, y: max(0, document.bounds.height - scroll.contentView.bounds.height)))
        scroll.reflectScrolledClipView(scroll.contentView)
        try await Task.sleep(for: .milliseconds(40))
        host.layoutSubtreeIfNeeded()
        #expect(document.bounds.width <= scroll.contentView.bounds.width + 1)
        let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
        host.cacheDisplay(in: host.bounds, to: bitmap)
        try #require(bitmap.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: "/private/tmp/kliprun-notification-settings-\(name).png"))
    }
}
