import SwiftUI
import KlipRunCore

struct ContentView: View {
    @ObservedObject var store: DesktopStore
    @ObservedObject var runtime: EngineRuntime
    @ObservedObject var updater: AppUpdater
    private var terminalPosition: String { store.preferences.terminalPosition }
    @AppStorage("terminal.height") private var preferredTerminalHeight = 330.0
    @AppStorage("terminal.width") private var preferredTerminalWidth = 460.0
    @State private var dropTargetID: Int?
    @State private var dragStartExtent: Double?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var terminalOnLeft: Bool { terminalPosition == "left" }

    init(store: DesktopStore) {
        self.store = store
        self.runtime = store.runtime
        self.updater = store.updater
    }

    var body: some View {
        GeometryReader { geometry in
            let visible = store.selectedTerminalID != nil
            let dockExtent = visible ? (terminalOnLeft
                ? TerminalPaneLayout.width(preferred: preferredTerminalWidth, available: geometry.size.width, expanded: store.terminalExpanded)
                : TerminalPaneLayout.height(preferred: preferredTerminalHeight, available: geometry.size.height, expanded: store.terminalExpanded)) : 0
            let divider = visible && !store.terminalExpanded ? 10.0 : 0
            ZStack(alignment: .trailing) {
                workspace(geometry: geometry, visible: visible, dockExtent: dockExtent, divider: divider)
                    .disabled(store.showingSettings)
                    .accessibilityHidden(store.showingSettings)
                if store.showingSettings {
                    Button { store.showingSettings = false } label: { Color.black.opacity(0.35) }
                        .buttonStyle(.plain)
                        .accessibilityHidden(true)
                    SettingsView(store: store)
                        .frame(width: min(560, geometry.size.width), height: geometry.size.height)
                        .shadow(color: .black.opacity(0.4), radius: 24, x: -8)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            .animation(reduceMotion || store.preferences.reduceMotion ? nil : .easeOut(duration: 0.2), value: store.showingSettings)
            .sheet(isPresented: $updater.isPresented) {
                if case .available = updater.phase {
                    UpdateView(updater: updater).frame(height: geometry.size.height)
                } else {
                    UpdateView(updater: updater)
                }
            }
        }
        .frame(minWidth: 980, minHeight: 660)
        .background(Color(red: 13 / 255, green: 17 / 255, blue: 23 / 255))
        .preferredColorScheme(.dark)
        .onChange(of: terminalPosition) { _ in
            dragStartExtent = nil
            store.terminalExpanded = false
        }
    }

    private func workspace(geometry: GeometryProxy, visible: Bool, dockExtent: Double, divider: Double) -> some View {
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
                .modifier(TerminalControlHighlight())
                .accessibilityIdentifier("terminal-new-menu")
                .accessibilityLabel("New terminal tab")
                .help("New terminal tab")
                Button { store.updatePreferences { $0.terminalPosition = terminalOnLeft ? "bottom" : "left" } } label: {
                    Image(systemName: terminalOnLeft ? "rectangle.bottomthird.inset.filled" : "sidebar.left")
                        .modifier(TerminalControlHighlight())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("terminal-position-toggle")
                .accessibilityLabel(terminalOnLeft ? "Move terminal to bottom" : "Move terminal to left")
                .help(terminalOnLeft ? "Move terminal to bottom" : "Move terminal to left")
                Button { store.toggleTerminalExpanded() } label: {
                    Group {
                        if terminalOnLeft {
                            Image(systemName: store.terminalExpanded ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                        } else {
                            Label(store.terminalExpanded ? "Restore" : "Expand",
                              systemImage: store.terminalExpanded ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                        }
                    }.modifier(TerminalControlHighlight())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("terminal-expand-toggle")
                .accessibilityLabel(store.terminalExpanded ? "Restore terminal" : "Expand terminal")
                .help(store.terminalExpanded ? "Restore terminal panel (⌘↩)" : "Fill the window with the terminal (⌘↩)")
                Button { store.hideTerminal() } label: {
                    Image(systemName: terminalOnLeft ? "chevron.left" : "chevron.down")
                        .modifier(TerminalControlHighlight())
                }.buttonStyle(.plain).accessibilityIdentifier("terminal-hide")
                    .accessibilityLabel("Hide terminal").help("Hide terminal")
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
            HStack(spacing: 5) {
                Circle().fill(terminal.isRunning ? .green : .gray).frame(width: 6, height: 6)
                Text(terminal.title).lineLimit(1).frame(maxWidth: 190)
            }
            .foregroundStyle(.white)
            Button { store.closeTerminal(terminal.id) } label: {
                Image(systemName: "xmark").font(.system(size: 9))
                    .modifier(TerminalControlHighlight(compact: true))
            }.buttonStyle(.plain).accessibilityIdentifier("terminal-close-\(terminal.id)")
                .accessibilityLabel("Close \(terminal.title)").help("Close \(terminal.title)")
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
        .background(selected ? Color.white.opacity(0.10) : Color.white.opacity(0.03), in: RoundedRectangle(cornerRadius: 5))
        .overlay(RoundedRectangle(cornerRadius: 5).stroke(dropTargetID == terminal.id ? Color.accentColor : .clear, lineWidth: 2))
        .contentShape(Rectangle())
        .onTapGesture { store.selectTerminalTab(terminal.id) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Terminal tab \(terminal.title)")
        .accessibilityAction(named: "Open tab") { store.selectTerminalTab(terminal.id) }
        .draggable("kliprun-terminal:\(terminal.id)")
        .dropDestination(for: String.self) { items, _ in
            guard let value = items.first, value.hasPrefix("kliprun-terminal:"),
                  let id = Int(value.dropFirst("kliprun-terminal:".count)),
                  store.terminal(for: id) != nil else { return false }
            store.moveTerminal(id, to: terminal.id)
            dropTargetID = nil
            return true
        } isTargeted: { targeted in
            dropTargetID = targeted ? terminal.id : nil
        }
        .contextMenu {
            Button("Link to Selected Session") { store.linkTerminalToSelectedSession(terminal.id) }
                .disabled(store.selectedID == nil || !terminal.isRunning)
        }
        .help(terminal.directory)
    }
}
