import SwiftUI

struct TerminalTabLabel: View {
    @ObservedObject var terminal: TerminalSession
    let pinned: Bool
    let onClose: () -> Void

    var body: some View {
        Group {
            if pinned {
                Image(systemName: "terminal").font(.system(size: 13, weight: .medium))
                    .frame(width: 28, height: 28)
                    .overlay(alignment: .bottomTrailing) {
                        Circle().fill(terminal.isRunning ? .green : .gray).frame(width: 5, height: 5).padding(3)
                    }
                    .accessibilityLabel(terminal.title)
            } else {
                HStack(spacing: 3) {
                    HStack(spacing: 5) {
                        Circle().fill(terminal.isRunning ? .green : .gray).frame(width: 6, height: 6)
                        Text(terminal.title).lineLimit(1).frame(maxWidth: 190)
                    }.foregroundStyle(.primary)
                    Button(action: onClose) {
                        Image(systemName: "xmark").font(.system(size: 9)).modifier(TerminalControlHighlight(compact: true))
                    }.buttonStyle(.plain).accessibilityIdentifier("terminal-close-\(terminal.id)")
                        .accessibilityLabel("Close \(terminal.title)").help("Close \(terminal.title)")
                }.padding(.horizontal, 8).padding(.vertical, 6)
            }
        }
        .help("\(terminal.title)\n\(terminal.directory)")
    }
}
