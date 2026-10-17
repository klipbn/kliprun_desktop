import SwiftUI
import KlipRunCore

enum SettingsStyle {
    private static var colors: (UInt32, UInt32, UInt32, UInt32) {
        switch AppPreferences().theme {
        case "ember": (0x0d1016, 0x1f2127, 0x3f4043, 0x5ac1fe)
        case "dusk": (0x242835, 0x353944, 0x53565d, 0x72cffe)
        case "graphite": (0x282c33, 0x2f343e, 0x464b57, 0x74ade8)
        case "daybreak": (0xfcfcfc, 0xececed, 0xcfd1d2, 0x3b9ee5)
        case "paper": (0xfafafa, 0xebebec, 0xc9c9ca, 0x5c78e2)
        default: (0x0d1117, 0x161b22, 0x30363d, 0x58a6ff)
        }
    }

    private static func color(_ hex: UInt32) -> Color {
        Color(red: Double((hex >> 16) & 0xff) / 255,
              green: Double((hex >> 8) & 0xff) / 255,
              blue: Double(hex & 0xff) / 255)
    }

    static var background: Color { color(colors.0) }
    static var surface: Color { color(colors.1) }
    static var border: Color { color(colors.2) }
    static var accent: Color { color(colors.3) }
}

struct SettingsButtonStyle: ButtonStyle {
    var primary = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .medium))
            .padding(.horizontal, 12).padding(.vertical, 8)
            .foregroundStyle(primary ? SettingsStyle.accent : Color.primary)
            .background(primary ? SettingsStyle.accent.opacity(configuration.isPressed ? 0.25 : 0.12) : Color.primary.opacity(configuration.isPressed ? 0.10 : 0.04),
                        in: RoundedRectangle(cornerRadius: 7))
            .overlay(RoundedRectangle(cornerRadius: 7).stroke(primary ? SettingsStyle.accent.opacity(0.45) : SettingsStyle.border))
            .opacity(enabled ? 1 : 0.4)
            .contentShape(RoundedRectangle(cornerRadius: 7))
    }
}

struct SettingsToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(spacing: 12) {
                configuration.label.foregroundStyle(.primary)
                Spacer(minLength: 8)
                Capsule().fill(configuration.isOn ? SettingsStyle.accent : SettingsStyle.border)
                    .frame(width: 30, height: 18)
                    .overlay(Circle().fill(.white).frame(width: 12, height: 12).offset(x: configuration.isOn ? 6 : -6))
            }.contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(configuration.isOn ? "On" : "Off")
        .accessibilityAddTraits(configuration.isOn ? .isSelected : [])
    }
}

struct SettingsCard<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.system(size: 13, weight: .semibold))
                Text(subtitle).font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(SettingsStyle.surface, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(SettingsStyle.border))
    }
}
