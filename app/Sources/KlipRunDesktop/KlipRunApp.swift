import AppKit
import SwiftUI

@MainActor
final class DesktopAppDelegate: NSObject, NSApplicationDelegate {
    let store = DesktopStore()

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let url = Bundle.main.url(forResource: "KlipRun", withExtension: "icns"), let icon = NSImage(contentsOf: url) {
            NSApp.applicationIconImage = icon
        }
        store.start()
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag, let window = sender.windows.first(where: { $0.canBecomeKey && $0.title == "KlipRun" }) {
            window.makeKeyAndOrderFront(nil)
            sender.activate(ignoringOtherApps: true)
            return false
        }
        return true
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        let activeCount = store.activeTerminalCount
        if activeCount > 0 {
            sender.activate(ignoringOtherApps: true)
            let alert = NSAlert()
            alert.messageText = "End \(activeCount) active terminal sessions?"
            alert.informativeText = "Quitting KlipRun ends agents started in this app."
            alert.addButton(withTitle: "End Sessions and Quit"); alert.addButton(withTitle: "Cancel")
            if alert.runModal() != .alertFirstButtonReturn { return .terminateCancel }
        }
        store.stop()
        return .terminateNow
    }
}

@main
struct KlipRunApp: App {
    @NSApplicationDelegateAdaptor(DesktopAppDelegate.self) private var delegate
    var body: some Scene {
        WindowGroup("KlipRun") { ContentView(store: delegate.store) }
            .commands {
                CommandGroup(replacing: .newItem) {}
                CommandGroup(after: .toolbar) {
                    Button("Zoom In") { delegate.store.zoomIn() }
                        .keyboardShortcut("+", modifiers: [.command])
                    Button("Zoom Out") { delegate.store.zoomOut() }
                        .keyboardShortcut("-", modifiers: [.command])
                    Button("Actual Size") { delegate.store.resetZoom() }
                        .keyboardShortcut("0", modifiers: [.command])
                }
                CommandMenu("Navigate") {
                    Button("Kanban Board") { delegate.store.showPage("/") }
                        .keyboardShortcut("1", modifiers: [.control])
                    Button("Statistics") { delegate.store.showPage("/stats") }
                        .keyboardShortcut("2", modifiers: [.control])
                    Button("Office") { delegate.store.showPage("/office") }
                        .keyboardShortcut("3", modifiers: [.control])
                }
                CommandMenu("Agents") {
                    Button("New Terminal") { delegate.store.chooseNewTerminal() }
                        .keyboardShortcut("t", modifiers: [.command])
                    Button("New OpenCode") { delegate.store.launch(source: "opencode") }
                        .keyboardShortcut("o", modifiers: [.command, .shift])
                    Button("New Codex") { delegate.store.launch(source: "codex") }
                        .keyboardShortcut("c", modifiers: [.command, .shift])
                    Button("Toggle Terminal") { delegate.store.toggleTerminal() }
                        .keyboardShortcut("j", modifiers: [.command])
                    Button("Expand/Restore Terminal") { delegate.store.toggleTerminalExpanded() }
                        .keyboardShortcut(.return, modifiers: [.command])
                    Divider()
                    ForEach(1...9, id: \.self) { number in
                        Button("Terminal Tab \(number)") { delegate.store.selectTerminalTab(number: number) }
                            .keyboardShortcut(KeyEquivalent(Character(String(number))), modifiers: [.command])
                    }
                    Button("Rename Terminal Tab") { delegate.store.renameSelectedTerminal() }
                        .keyboardShortcut("r", modifiers: [.command])
                    Divider()
                    Button("Open in iTerm2") { delegate.store.openSelectedInITerm() }
                    Button("Quit Legacy Notifications") {
                        for app in NSRunningApplication.runningApplications(withBundleIdentifier: "local.kliprun.notifications") { app.terminate() }
                    }
                }
            }
    }
}
