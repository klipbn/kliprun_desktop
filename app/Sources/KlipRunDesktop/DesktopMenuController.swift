import AppKit
import Combine
import KlipRunCore
import WebKit

@MainActor final class DesktopMenuController: ObservableObject {
    unowned let store: DesktopStore
    @Published var webState = DesktopMenuState()
    @Published private(set) var focus: DesktopMenuFocus = .native
    @Published private(set) var nativeCanUndo = false
    @Published private(set) var nativeCanRedo = false
    @Published private(set) var hasWindow = false
    @Published private(set) var isFullScreen = false
    private var observation: AnyCancellable?

    init(store: DesktopStore) {
        self.store = store
        observation = NotificationCenter.default.publisher(for: NSWindow.didUpdateNotification)
            .sink { [weak self] _ in self?.updateFocus() }
    }
    private var targetWindow: NSWindow? { NSApp.keyWindow ?? store.webView?.window }
    func updateFocus() {
        let responder = targetWindow?.firstResponder
        let view = responder as? NSView
        let terminal = store.terminal(for: store.selectedTerminalID)?.view
        let target: DesktopMenuFocus
        if let view, let terminal, view === terminal || view.isDescendant(of: terminal) { target = .terminal }
        else if let view, let web = store.webView, view === web || view.isDescendant(of: web) { target = .web }
        else { target = .native }
        if focus != target { focus = target }
        let undo = responder?.undoManager?.canUndo == true, redo = responder?.undoManager?.canRedo == true
        if nativeCanUndo != undo { nativeCanUndo = undo }
        if nativeCanRedo != redo { nativeCanRedo = redo }
        let window = targetWindow != nil
        if hasWindow != window { hasWindow = window }
        let fullScreen = targetWindow?.styleMask.contains(.fullScreen) == true
        if isFullScreen != fullScreen { isFullScreen = fullScreen }
    }
    var blocked: Bool { NSApp.modalWindow != nil || NSApp.keyWindow?.attachedSheet != nil || store.updater.isPresented }
    func canRun(_ command: WebMenuCommand) -> Bool { !store.showingSettings && !blocked && store.webView != nil && webState.commands.contains(command) }
    func run(_ command: WebMenuCommand) {
        guard canRun(command), let data = try? JSONEncoder().encode(command.rawValue), let literal = String(data: data, encoding: .utf8) else { return }
        if [.newProject, .findSession, .shortcuts].contains(command) { focusWorkspace() }
        store.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('kliprun:menu-command', {detail: \(literal)}));")
    }
    var canUndo: Bool { focus == .web && webState.editorFocused ? canRun(.undo) : nativeCanUndo }
    var canRedo: Bool { focus == .web && webState.editorFocused ? canRun(.redo) : nativeCanRedo }
    func undo() { if focus == .web && webState.editorFocused { run(.undo) } else { targetWindow?.firstResponder?.undoManager?.undo() } }
    func redo() { if focus == .web && webState.editorFocused { run(.redo) } else { targetWindow?.firstResponder?.undoManager?.redo() } }
    var canFind: Bool { !store.showingSettings && !blocked && (focus == .terminal || focus == .web && canRun(.find)) }
    func canFindMatch(_ next: Bool) -> Bool { canFind && (focus == .terminal || canRun(next ? .findNext : .findPrevious)) }
    func find(_ command: WebMenuCommand) {
        guard canFind else { return }
        if focus == .terminal {
            let item = NSMenuItem()
            item.tag = Int((command == .findNext ? NSFindPanelAction.next : command == .findPrevious ? .previous : .showFindPanel).rawValue)
            store.terminal(for: store.selectedTerminalID)?.view.performFindPanelAction(item)
        } else { run(command) }
    }
    var closeTarget: DesktopCloseTarget { webState.closeTarget(focus: focus, settings: store.showingSettings, terminalVisible: store.selectedTerminalID != nil) }
    var closeTitle: String {
        switch closeTarget {
        case .file: "Close File"
        case .diff: "Close Diff"
        case .details: "Close Details"
        case .terminal: "Close Terminal"
        case .settings: "Close Settings"
        case .dialog: "Close Dialog"
        case .window: "Close"
        }
    }
    func closeActive() {
        updateFocus()
        guard !blocked else { return }
        switch closeTarget {
        case .file: run(.closeFile)
        case .diff: run(.closeDiff)
        case .details: run(.closeDetails)
        case .dialog: run(.cancelDialog)
        case .terminal: if let id = store.selectedTerminalID { store.closeTerminal(id) }
        case .settings: store.showingSettings = false
        case .window: closeWindow()
        }
    }
    /// Keep cached file drafts available until the user saves or discards them in Git.
    func allowWindowClose() -> Bool {
        guard webState.hasUnsavedFiles else { return true }
        let alert = NSAlert()
        alert.messageText = "Unsaved file edits"
        alert.informativeText = "Save or discard your edited files in Git before closing KlipRun."
        alert.addButton(withTitle: "Keep Editing")
        alert.runModal()
        store.showingSettings = false
        store.updater.isPresented = false
        store.showPage("/git")
        return false
    }
    func closeWindow() { guard !blocked, allowWindowClose() else { return }; (store.webView?.window ?? NSApp.keyWindow)?.performClose(nil) }
    func cycleTerminal(_ offset: Int) {
        guard !store.terminals.isEmpty else { return }
        let index = store.terminals.firstIndex(where: { $0.id == store.selectedTerminalID }) ?? (offset > 0 ? -1 : 0)
        store.selectTerminalTab(store.terminals[(index + offset + store.terminals.count) % store.terminals.count].id)
    }
    func focusWorkspace() {
        store.terminalExpanded = false
        if let web = store.webView { DispatchQueue.main.async { web.window?.makeFirstResponder(web) } }
    }
    func toggleFullScreen() { targetWindow?.toggleFullScreen(nil) }
    func showDataFolder() { NSWorkspace.shared.open(store.runtime.stateDirectory) }
    func copyDiagnostics() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(store.diagnostics, forType: .string)
    }
}
