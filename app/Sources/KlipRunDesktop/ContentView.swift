import SwiftUI
import KlipRunCore

struct ContentView: View {
    @ObservedObject var store: DesktopStore
    @ObservedObject var runtime: EngineRuntime
    @State private var preferredTerminalHeight: Double = {
        let saved = UserDefaults.standard.double(forKey: "terminal.height")
        return saved > 0 ? saved : 330
    }()
    @State private var dragStartHeight: Double?

    init(store: DesktopStore) {
        self.store = store
        self.runtime = store.runtime
    }

    var body: some View {
        GeometryReader { geometry in
            let dockHeight = store.selectedTerminalID == nil ? 0
                : TerminalPaneLayout.height(preferred: preferredTerminalHeight,
                                            available: Double(geometry.size.height), expanded: store.terminalExpanded)
            VStack(spacing: 0) {
                if runtime.baseURL != nil {
                    KlipRunWebView(store: store, runtime: runtime)
                        .frame(height: max(0, geometry.size.height - CGFloat(dockHeight)))
                        .opacity(store.terminalExpanded ? 0 : 1)
                        .allowsHitTesting(!store.terminalExpanded)
                        .accessibilityHidden(store.terminalExpanded)
                    if store.selectedTerminalID != nil {
                        if !store.terminalExpanded { resizeHandle(available: Double(geometry.size.height)) }
                        terminalDock.frame(height: CGFloat(dockHeight) - (store.terminalExpanded ? 0 : 10))
                    }
                } else {
                    VStack(spacing: 10) {
                        ProgressView()
                        Text(runtime.error ?? "Starting KlipRun…").foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .frame(minWidth: 980, minHeight: 660)
        .background(Color(red: 13 / 255, green: 17 / 255, blue: 23 / 255))
        .preferredColorScheme(.dark)
        .sheet(isPresented: $store.showingNotificationSettings) {
            NotificationSettingsView(store: store, notifications: store.notifications)
        }
    }

    private func resizeHandle(available: Double) -> some View {
        TerminalResizeHandle(onDrag: { delta in
            if dragStartHeight == nil { dragStartHeight = preferredTerminalHeight }
            preferredTerminalHeight = TerminalPaneLayout.height(
                preferred: (dragStartHeight ?? preferredTerminalHeight) + Double(delta),
                available: available, expanded: false)
        }, onEnd: {
            dragStartHeight = nil
            UserDefaults.standard.set(preferredTerminalHeight, forKey: "terminal.height")
        })
            .frame(height: 10)
            .accessibilityLabel("Resize terminal panel")
    }

    private var terminalDock: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "terminal").foregroundStyle(Color(red: 88 / 255, green: 166 / 255, blue: 1))
                ScrollViewReader { reader in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 4) {
                            ForEach(store.terminals) { terminal in
                                terminalTab(terminal).id(terminal.id)
                            }
                        }
                    }
                    .onChange(of: store.selectedTerminalID) { id in
                        if let id { reader.scrollTo(id, anchor: .center) }
                    }
                }
                Menu {
                    Button("New Terminal") { store.newTerminal() }
                    Button("New OpenCode") { store.launch(source: "opencode") }
                    Button("New Codex") { store.launch(source: "codex") }
                } label: {
                    Image(systemName: "plus").frame(width: 22, height: 22)
                }.menuStyle(.borderlessButton).help("New terminal tab")
                Button { store.toggleTerminalExpanded() } label: {
                    Label(store.terminalExpanded ? "Restore" : "Expand",
                          systemImage: store.terminalExpanded ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                }
                .buttonStyle(.plain)
                .help(store.terminalExpanded ? "Show the board above the terminal (⌘↩)" : "Fill the window with the terminal (⌘↩)")
                Button { store.hideTerminal() } label: {
                    Image(systemName: "chevron.down")
                }.buttonStyle(.plain).help("Hide terminal")
            }
            .font(.system(size: CGFloat(11 * store.interfaceZoom.factor)))
            .padding(.horizontal, 10)
            .frame(height: 36)
            .background(Color(red: 22 / 255, green: 27 / 255, blue: 34 / 255))
            Divider()
            if let terminal = store.terminal(for: store.selectedTerminalID) {
                TerminalPane(session: terminal)
            }
        }
        .background(Color(red: 13 / 255, green: 17 / 255, blue: 23 / 255))
    }

    private func terminalTab(_ terminal: TerminalSession) -> some View {
        let selected = store.selectedTerminalID == terminal.id
        return HStack(spacing: 3) {
            Button {
                store.selectTerminalTab(terminal.id)
            } label: {
                HStack(spacing: 5) {
                    Circle().fill(terminal.isRunning ? .green : .gray).frame(width: 6, height: 6)
                    Text(terminal.title).lineLimit(1).frame(maxWidth: 190)
                }
                .foregroundStyle(selected ? .white : .secondary)
            }.buttonStyle(.plain).accessibilityLabel("Open tab \(terminal.title)")
            Button { store.closeTerminal(terminal.id) } label: {
                Image(systemName: "xmark").font(.system(size: 9))
            }.buttonStyle(.plain).help("Close \(terminal.title)")
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
        .background(selected ? Color.white.opacity(0.10) : Color.white.opacity(0.03), in: RoundedRectangle(cornerRadius: 5))
    }
}
