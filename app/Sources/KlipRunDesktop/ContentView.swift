import SwiftUI
import KlipRunCore

struct ContentView: View {
    @ObservedObject var store: DesktopStore
    @ObservedObject var runtime: EngineRuntime
    @AppStorage("terminal.position") private var terminalPosition = "bottom"
    @AppStorage("terminal.height") private var preferredTerminalHeight = 330.0
    @AppStorage("terminal.width") private var preferredTerminalWidth = 460.0
    @State private var dragStartExtent: Double?
    private var terminalOnLeft: Bool { terminalPosition == "left" }

    init(store: DesktopStore) {
        self.store = store
        self.runtime = store.runtime
    }

    var body: some View {
        GeometryReader { geometry in
            let visible = store.selectedTerminalID != nil
            let dockExtent = visible ? (terminalOnLeft
                ? TerminalPaneLayout.width(preferred: preferredTerminalWidth, available: geometry.size.width, expanded: store.terminalExpanded)
                : TerminalPaneLayout.height(preferred: preferredTerminalHeight, available: geometry.size.height, expanded: store.terminalExpanded)) : 0
            let divider = visible && !store.terminalExpanded ? 10.0 : 0
            // Keep both hosted views in the same hierarchy when the dock moves.
            ZStack(alignment: .topLeading) {
                if runtime.baseURL != nil {
                    KlipRunWebView(store: store, runtime: runtime)
                        .frame(width: max(0, geometry.size.width - (terminalOnLeft ? dockExtent : 0)),
                               height: max(0, geometry.size.height - (terminalOnLeft ? 0 : dockExtent)))
                        .offset(x: terminalOnLeft ? dockExtent : 0)
                        .opacity(store.terminalExpanded ? 0 : 1)
                        .allowsHitTesting(!store.terminalExpanded)
                        .accessibilityHidden(store.terminalExpanded)
                    if visible {
                        terminalDock
                            .frame(width: terminalOnLeft ? max(0, dockExtent - divider) : geometry.size.width,
                                   height: terminalOnLeft ? geometry.size.height : max(0, dockExtent - divider))
                            .offset(y: terminalOnLeft ? 0 : geometry.size.height - dockExtent + divider)
                        if !store.terminalExpanded {
                            resizeHandle(available: terminalOnLeft ? geometry.size.width : geometry.size.height)
                                .frame(width: terminalOnLeft ? divider : geometry.size.width,
                                       height: terminalOnLeft ? geometry.size.height : divider)
                                .offset(x: terminalOnLeft ? dockExtent - divider : 0,
                                        y: terminalOnLeft ? 0 : geometry.size.height - dockExtent)
                        }
                    }
                } else {
                    VStack(spacing: 10) {
                        ProgressView()
                        Text(runtime.error ?? "Starting KlipRun…").foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }.frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
        }
        .frame(minWidth: 980, minHeight: 660)
        .background(Color(red: 13 / 255, green: 17 / 255, blue: 23 / 255))
        .preferredColorScheme(.dark)
        .onChange(of: terminalPosition) { _ in
            dragStartExtent = nil
            store.terminalExpanded = false
        }
        .sheet(isPresented: $store.showingNotificationSettings) {
            NotificationSettingsView(store: store, notifications: store.notifications)
        }
    }

    private func resizeHandle(available: Double) -> some View {
        TerminalResizeHandle(axis: terminalOnLeft ? .horizontal : .vertical, onDrag: { delta in
            if dragStartExtent == nil {
                dragStartExtent = terminalOnLeft
                    ? TerminalPaneLayout.width(preferred: preferredTerminalWidth, available: available, expanded: false)
                    : TerminalPaneLayout.height(preferred: preferredTerminalHeight, available: available, expanded: false)
            }
            let preferred = (dragStartExtent ?? 0) + Double(delta)
            if terminalOnLeft {
                preferredTerminalWidth = TerminalPaneLayout.width(preferred: preferred, available: available, expanded: false)
            } else {
                preferredTerminalHeight = TerminalPaneLayout.height(preferred: preferred, available: available, expanded: false)
            }
        }, onEnd: {
            dragStartExtent = nil
        })
            .accessibilityLabel(terminalOnLeft ? "Resize terminal width" : "Resize terminal height")
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
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .frame(width: 28)
                .help("New terminal tab")
                Button { terminalPosition = terminalOnLeft ? "bottom" : "left" } label: {
                    Image(systemName: terminalOnLeft ? "rectangle.bottomthird.inset.filled" : "sidebar.left")
                        .frame(width: 22, height: 22)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("terminal-position-toggle")
                .accessibilityLabel(terminalOnLeft ? "Move terminal to bottom" : "Move terminal to left")
                .help(terminalOnLeft ? "Move terminal to bottom" : "Move terminal to left")
                Button { store.toggleTerminalExpanded() } label: {
                    if terminalOnLeft {
                        Image(systemName: store.terminalExpanded ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                    } else {
                        Label(store.terminalExpanded ? "Restore" : "Expand",
                          systemImage: store.terminalExpanded ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(store.terminalExpanded ? "Restore terminal" : "Expand terminal")
                .help(store.terminalExpanded ? "Restore terminal panel (⌘↩)" : "Fill the window with the terminal (⌘↩)")
                Button { store.hideTerminal() } label: {
                    Image(systemName: terminalOnLeft ? "chevron.left" : "chevron.down")
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
