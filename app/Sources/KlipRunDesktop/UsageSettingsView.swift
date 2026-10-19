import SwiftUI
import KlipRunCore

struct UsageSettingsView: View {
    @ObservedObject var store: DesktopStore
    private let labels = ["openai": "OpenAI · OpenCode", "codex": "OpenAI · Codex", "claude": "Claude Code", "zai": "Z.ai", "kimi": "Kimi"]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SettingsCard(title: "Subscription limits", subtitle: "Choose which providers appear in Usage and the status bar. Disabled providers are not checked.") {
                VStack(spacing: 0) {
                    ForEach(Array(store.preferences.usageProviderOrder.enumerated()), id: \.element) { index, provider in
                        HStack(spacing: 10) {
                            Text("\(index + 1)").font(.system(size: 10)).monospacedDigit().foregroundStyle(.secondary).frame(width: 14)
                            Toggle(labels[provider] ?? provider, isOn: Binding(
                                get: { store.preferences.usageEnabledProviders.contains(provider) },
                                set: { enabled in store.updatePreferences { value in
                                    if enabled { value.usageEnabledProviders.append(provider) }
                                    else { value.usageEnabledProviders.removeAll { $0 == provider } }
                                } }
                            ))
                            .accessibilityLabel("Show \(labels[provider] ?? provider) limits")
                            .accessibilityIdentifier("usage-provider-\(provider)")
                            HStack(spacing: 4) {
                                reorderButton(provider, direction: -1, disabled: index == 0)
                                reorderButton(provider, direction: 1, disabled: index == store.preferences.usageProviderOrder.count - 1)
                            }
                        }.padding(.vertical, 10)
                        if index < store.preferences.usageProviderOrder.count - 1 { Divider().overlay(SettingsStyle.border) }
                    }
                }
                HStack(spacing: 8) {
                    Button("Enable all") { store.updatePreferences { $0.usageEnabledProviders = AppPreferences.usageProviders } }
                    Button("Disable all") { store.updatePreferences { $0.usageEnabledProviders = [] } }
                    Spacer(minLength: 0)
                    Button("Reset order") { store.updatePreferences { $0.usageProviderOrder = AppPreferences.usageProviders } }
                }
                Text("Use the arrows to change the display order. Changes apply immediately.")
                    .font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Text("These settings affect subscription limits only. Token history in Usage and all Statistics data keep every provider and model.")
                .font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func reorderButton(_ provider: String, direction: Int, disabled: Bool) -> some View {
        Button {
            store.updatePreferences { value in
                guard let index = value.usageProviderOrder.firstIndex(of: provider), value.usageProviderOrder.indices.contains(index + direction) else { return }
                value.usageProviderOrder.swapAt(index, index + direction)
            }
        } label: {
            Image(systemName: direction < 0 ? "chevron.up" : "chevron.down")
                .font(.system(size: 10, weight: .semibold)).frame(width: 26, height: 28)
                .background(SettingsStyle.background, in: RoundedRectangle(cornerRadius: 5))
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(SettingsStyle.border))
        }
        .buttonStyle(.plain).disabled(disabled).opacity(disabled ? 0.35 : 1)
        .accessibilityLabel("Move \(labels[provider] ?? provider) \(direction < 0 ? "up" : "down")")
        .accessibilityIdentifier("usage-provider-\(provider)-\(direction < 0 ? "up" : "down")")
    }
}
