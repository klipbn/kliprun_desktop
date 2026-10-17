import AppKit
import SwiftUI

@MainActor
final class DesktopAppDelegate: NSObject, NSApplicationDelegate {
    let store = DesktopStore()

    func applicationDidFinishLaunching(_ notification: Notification) {
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
        guard store.menu.allowWindowClose() else { store.updater.cancelQuit(); return .terminateCancel }
        let activeCount = store.activeTerminalCount
        if activeCount > 0 {
            sender.activate(ignoringOtherApps: true)
            let alert = NSAlert()
            alert.messageText = "End \(activeCount) active terminal sessions?"
            alert.informativeText = "Quitting KlipRun ends agents started in this app."
            alert.addButton(withTitle: "End Sessions and Quit"); alert.addButton(withTitle: "Cancel")
            if alert.runModal() != .alertFirstButtonReturn {
                store.updater.cancelQuit()
                return .terminateCancel
            }
        }
        do { try store.updater.installAfterExit() }
        catch {
            store.updater.cancelQuit()
            NSAlert(error: error).runModal()
            return .terminateCancel
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
            .commands { DesktopCommands(store: delegate.store) }
    }
}
