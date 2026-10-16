import SwiftUI

enum SettingsStyle {
    static let background = Color(red: 13 / 255, green: 17 / 255, blue: 23 / 255)
    static let surface = Color(red: 22 / 255, green: 27 / 255, blue: 34 / 255)
    static let border = Color(red: 48 / 255, green: 54 / 255, blue: 61 / 255)
    static let accent = Color(red: 88 / 255, green: 166 / 255, blue: 1)
}

struct SettingsButtonStyle: ButtonStyle {
    var primary = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .medium))
            .padding(.horizontal, 12).padding(.vertical, 8)
            .foregroundStyle(primary ? SettingsStyle.accent : Color.primary)
            .background(primary ? SettingsStyle.accent.opacity(configuration.isPressed ? 0.25 : 0.12) : Color.white.opacity(configuration.isPressed ? 0.10 : 0.04),
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
