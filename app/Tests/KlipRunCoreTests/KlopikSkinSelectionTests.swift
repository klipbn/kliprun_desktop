import AppKit
import SwiftUI
import Testing
import KlipRunCore
@testable import KlipRunDesktop

@MainActor @Test func klopikSkinCardsSelectFromTheirEntireSurface() async throws {
    let suite = "local.kliprun.skin-selection.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults)
    let host = NSHostingView(rootView: KlopikSkinOption(skin: .default, selected: true, action: {}))
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 180, height: 100), styleMask: [.titled], backing: .buffered, defer: false)
    window.contentView = host
    defer { window.orderOut(nil) }
    for skin in KlopikSkin.allCases {
        host.rootView = KlopikSkinOption(skin: skin, selected: false) { store.updatePreferences { $0.klopikSkin = skin.rawValue } }
        window.makeKeyAndOrderFront(nil)
        host.layoutSubtreeIfNeeded()
        try await Task.sleep(for: .milliseconds(40))
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            let event = try #require(NSEvent.mouseEvent(with: type, location: NSPoint(x: 8, y: 50), modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                windowNumber: window.windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: type == .leftMouseDown ? 1 : 0))
            NSApplication.shared.sendEvent(event)
        }
        try await Task.sleep(for: .milliseconds(30))
        #expect(AppPreferences(defaults: defaults).klopikSkin == skin.rawValue)
    }
}
