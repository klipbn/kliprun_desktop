import SwiftUI

struct TerminalControlHighlight: ViewModifier {
    var compact = false
    @State private var hovered = false
    @Environment(\.isEnabled) private var enabled

    func body(content: Content) -> some View {
        let active = hovered && enabled
        let accent = Color(red: 88 / 255, green: 166 / 255, blue: 1)
        content
            .frame(minWidth: compact ? 18 : 26, minHeight: compact ? 18 : 26)
            .padding(.horizontal, compact ? 1 : 4)
            .foregroundStyle(Color.white.opacity(enabled ? (active ? 1 : 0.8) : 0.35))
            .background(active ? accent.opacity(0.24) : .clear, in: RoundedRectangle(cornerRadius: 4))
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(active ? accent.opacity(0.55) : .clear))
            .contentShape(RoundedRectangle(cornerRadius: 4))
            .onHover { hovered = $0 }
    }
}
