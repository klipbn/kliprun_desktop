import AppKit
import SwiftUI
import KlipRunCore

struct DesktopCommands: Commands {
    @ObservedObject var store: DesktopStore
    @ObservedObject var menu: DesktopMenuController
    init(store: DesktopStore) { self.store = store; menu = store.menu }

    var body: some Commands {
        CommandGroup(replacing: .appSettings) {
            Button("Settings…") { store.showSettings() }.keyboardShortcut(",", modifiers: .command)
            Button("Check for Updates…") { store.checkForUpdates() }
        }
        CommandGroup(replacing: .newItem) {
            Button("New OpenCode Session…") { store.launch(source: "opencode") }.keyboardShortcut("o", modifiers: [.command, .shift]).disabled(menu.blocked)
            Button("New Codex Session…") { store.launch(source: "codex") }.keyboardShortcut("c", modifiers: [.command, .shift]).disabled(menu.blocked)
            Button("New Terminal…") { store.chooseNewTerminal() }.keyboardShortcut("t", modifiers: .command).disabled(menu.blocked)
            Divider()
            Button("New Project…") { menu.run(.newProject) }.keyboardShortcut("n", modifiers: [.command, .shift]).disabled(!menu.canRun(.newProject))
            Button("Open Repository…") { store.openRepository() }.keyboardShortcut("o", modifiers: .command).disabled(menu.blocked)
        }
        CommandGroup(replacing: .saveItem) {
            Button("Save File") { menu.run(.saveFile) }.keyboardShortcut("s", modifiers: .command).disabled(!menu.canRun(.saveFile) || menu.focus != .web)
            Divider()
            Button(menu.closeTitle) { menu.closeActive() }.keyboardShortcut("w", modifiers: .command).disabled(!menu.hasWindow || menu.blocked)
            Button("Close Window") { menu.closeWindow() }.keyboardShortcut("w", modifiers: [.command, .shift]).disabled(!menu.hasWindow || menu.blocked)
        }
        CommandGroup(replacing: .undoRedo) {
            Button("Undo") { menu.undo() }.keyboardShortcut("z", modifiers: .command).disabled(!menu.canUndo)
            Button("Redo") { menu.redo() }.keyboardShortcut("z", modifiers: [.command, .shift]).disabled(!menu.canRedo)
        }
        // Keep the standard Cut/Copy/Paste/Select All items and their responder-chain validation.
        CommandGroup(after: .pasteboard) {
            Divider()
            Menu("Find") {
                Button("Find…") { menu.find(.find) }.keyboardShortcut("f", modifiers: .command).disabled(!menu.canFind)
                Button("Find Next") { menu.find(.findNext) }.keyboardShortcut("g", modifiers: .command).disabled(!menu.canFindMatch(true))
                Button("Find Previous") { menu.find(.findPrevious) }.keyboardShortcut("g", modifiers: [.command, .shift]).disabled(!menu.canFindMatch(false))
            }
        }
        CommandGroup(replacing: .toolbar) {
            Button(store.selectedTerminalID == nil ? "Show Terminal" : "Hide Terminal") { store.toggleTerminal() }.keyboardShortcut("j", modifiers: .command).disabled(menu.blocked)
            Button(store.terminalExpanded ? "Restore Terminal" : "Expand Terminal") { store.toggleTerminalExpanded() }.keyboardShortcut(.return, modifiers: .command).disabled(store.terminals.isEmpty || menu.blocked)
            Picker("Terminal Position", selection: Binding(get: { store.preferences.terminalPosition }, set: { position in store.updatePreferences { $0.terminalPosition = position } })) {
                Text("Left").tag("left"); Text("Bottom").tag("bottom")
            }
            Button("Focus Workspace") { menu.focusWorkspace() }.disabled(store.webView == nil || store.showingSettings)
            Divider()
            Button("Zoom In") { store.zoomIn() }.keyboardShortcut("+", modifiers: .command)
            Button("Zoom Out") { store.zoomOut() }.keyboardShortcut("-", modifiers: .command)
            Button("Actual Size") { store.resetZoom() }.keyboardShortcut("0", modifiers: .command)
            Button(menu.isFullScreen ? "Exit Full Screen" : "Enter Full Screen") { menu.toggleFullScreen() }.keyboardShortcut("f", modifiers: [.command, .control]).disabled(!menu.hasWindow || menu.blocked)
            Divider()
            Button("Refresh Data") { menu.run(.refresh) }.keyboardShortcut("r", modifiers: [.command, .shift]).disabled(!menu.canRun(.refresh))
        }
        CommandMenu("Navigate") {
            Button("Sessions") { store.showPage("/sessions") }.keyboardShortcut("1", modifiers: .control)
            Button("Kanban") { store.showPage("/") }.keyboardShortcut("2", modifiers: .control)
            Button("Office") { store.showPage("/office") }.keyboardShortcut("3", modifiers: .control)
            Button("Git") { store.showPage("/git") }.keyboardShortcut("4", modifiers: .control)
            Button("Usage") { store.showPage("/usage") }.keyboardShortcut("5", modifiers: .control)
            Button("Statistics") { store.showPage("/stats") }.keyboardShortcut("6", modifiers: .control)
            Divider()
            Button("Find Session…") { menu.run(.findSession) }.keyboardShortcut("f", modifiers: [.command, .shift]).disabled(!menu.canRun(.findSession))
        }
        CommandMenu("Terminal") {
            Button("Next Tab") { menu.cycleTerminal(1) }.keyboardShortcut(.tab, modifiers: .control).disabled(store.terminals.count < 2)
            Button("Previous Tab") { menu.cycleTerminal(-1) }.keyboardShortcut(.tab, modifiers: [.control, .shift]).disabled(store.terminals.count < 2)
            Menu("Select Tab") {
                ForEach(Array(store.terminals.prefix(9).enumerated()), id: \.element.id) { item in
                    Button("\(item.offset + 1): \(item.element.title)") { store.selectTerminalTab(item.element.id) }
                        .keyboardShortcut(KeyEquivalent(Character(String(item.offset + 1))), modifiers: .command)
                }
            }.disabled(store.terminals.isEmpty)
            Divider()
            Button("Rename Tab…") { store.renameSelectedTerminal() }.keyboardShortcut("r", modifiers: .command).disabled(store.selectedTerminalID == nil || menu.blocked)
            Button("Close Terminal…") { if let id = store.selectedTerminalID { store.closeTerminal(id) } }.disabled(store.selectedTerminalID == nil || menu.blocked)
            Divider()
            Button("Open Selected Session in iTerm2") { store.openSelectedInITerm() }.disabled(store.selectedID == nil || menu.blocked)
        }
        CommandGroup(replacing: .help) {
            Button("Keyboard Shortcuts") { menu.run(.shortcuts) }.disabled(!menu.canRun(.shortcuts))
            Link("KlipRun Help", destination: URL(string: "https://github.com/klipbn/kliprun_desktop#readme")!)
            Link("Report an Issue…", destination: URL(string: "https://github.com/klipbn/kliprun_desktop/issues/new")!)
            Divider()
            Button("Copy Diagnostics") { menu.copyDiagnostics() }
            Button("Show App Data Folder") { menu.showDataFolder() }
        }
    }
}
