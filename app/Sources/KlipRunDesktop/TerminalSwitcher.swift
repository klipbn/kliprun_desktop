import SwiftUI

struct TerminalSwitcher: View {
    @ObservedObject var store: DesktopStore
    @State private var showing = false

    var body: some View {
        Button { showing.toggle() } label: {
            Image(systemName: "terminal").modifier(TerminalControlHighlight())
        }
        .buttonStyle(.plain)
        .disabled(store.terminals.isEmpty)
        .accessibilityIdentifier("terminal-switcher")
        .accessibilityLabel("Switch terminal tab")
        .help("Switch terminal tab (⌘1–9)")
        .popover(isPresented: $showing, arrowEdge: .top) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Terminal tabs").font(.system(size: 13, weight: .semibold))
                    Spacer()
                    Text("\(store.terminals.count)").foregroundStyle(.secondary)
                }.padding(.horizontal, 8)
                ScrollView {
                    VStack(spacing: 2) {
                        ForEach(Array(store.terminals.enumerated()), id: \.element.id) { item in
                            TerminalSwitcherRow(terminal: item.element, number: item.offset + 1,
                                                selected: store.selectedTerminalID == item.element.id,
                                                pinned: store.pinnedTerminalIDs.contains(item.element.id)) {
                                showing = false
                                store.selectTerminalTab(item.element.id)
                            }
                        }
                    }
                }
                .frame(height: min(348, max(0, CGFloat(store.terminals.count) * 50 - 2)))
            }
            .padding(10).frame(width: 360)
            .background(SettingsStyle.surface)
            .preferredColorScheme(["daybreak", "paper"].contains(store.preferences.theme) ? .light : .dark)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("terminal-switcher-list")
            .onExitCommand { showing = false }
        }
        .onChange(of: store.selectedTerminalID) { _ in showing = false }
    }
}

private struct TerminalSwitcherRow: View {
    @ObservedObject var terminal: TerminalSession
    let number: Int
    let selected: Bool
    let pinned: Bool
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text("\(number)").monospacedDigit().foregroundStyle(.secondary).frame(minWidth: 20)
                Circle().fill(terminal.isRunning ? .green : .gray).frame(width: 6, height: 6)
                VStack(alignment: .leading, spacing: 3) {
                    Text(terminal.title).font(.system(size: 12, weight: .medium)).lineLimit(1)
                    Text((terminal.directory as NSString).lastPathComponent).font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 4)
                if pinned { Image(systemName: "pin.fill").font(.system(size: 10)).foregroundStyle(.secondary) }
                if number <= 9 { Text("⌘\(number)").monospacedDigit().foregroundStyle(.secondary) }
                Image(systemName: "checkmark").foregroundStyle(SettingsStyle.accent).opacity(selected ? 1 : 0).frame(width: 12)
            }
            .font(.system(size: 11)).foregroundStyle(.primary)
            .padding(.horizontal, 8).frame(height: 48)
            .background(selected || hovered ? SettingsStyle.accent.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 6))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain).onHover { hovered = $0 }
        .accessibilityIdentifier("terminal-switcher-row-\(terminal.id)")
        .accessibilityLabel("\(number). \(terminal.title)\(number <= 9 ? ", ⌘\(number)" : "")")
        .accessibilityAddTraits(selected ? .isSelected : [])
        .help("\(terminal.title)\n\(terminal.directory)")
    }
}
