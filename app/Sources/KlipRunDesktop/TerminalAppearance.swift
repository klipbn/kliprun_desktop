import AppKit
import SwiftUI
import SwiftTerm
import KlipRunCore

extension TerminalView {
    func applyPalette(_ palette: TerminalPalette, notify: Bool = false) {
        func color(_ hex: UInt32) -> NSColor {
            NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255,
                    green: CGFloat((hex >> 8) & 0xff) / 255,
                    blue: CGFloat(hex & 0xff) / 255, alpha: 1)
        }
        nativeBackgroundColor = color(palette.background)
        nativeForegroundColor = color(palette.foreground)
        installColors(palette.ansi.map { SwiftTerm.Color(nsColor: color($0)) })
        updateColorScheme(palette.isLight ? .light : .dark, notify: notify)
    }
}

struct TerminalAppearancePreview: View {
    let theme: String
    let fontSize: Double

    private func color(_ hex: UInt32) -> SwiftUI.Color {
        SwiftUI.Color(red: Double((hex >> 16) & 0xff) / 255,
                      green: Double((hex >> 8) & 0xff) / 255,
                      blue: Double(hex & 0xff) / 255)
    }

    var body: some View {
        let palette = TerminalPalette(theme: theme)
        VStack(alignment: .leading, spacing: 6) {
            Text("$ agent")
            HStack(spacing: 0) {
                Text("Ready").foregroundStyle(color(palette.ansi[2]))
                Text(" for your next idea")
            }
            HStack(spacing: 0) {
                Text("Plan").foregroundStyle(color(palette.ansi[4]))
                Text(" · ")
                Text("Review").foregroundStyle(color(palette.ansi[3]))
                Text(" · ")
                Text("Build").foregroundStyle(color(palette.ansi[5]))
            }
        }
        .font(.system(size: fontSize, design: .monospaced))
        .foregroundStyle(color(palette.foreground))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(12)
        .background(color(palette.background))
    }
}
