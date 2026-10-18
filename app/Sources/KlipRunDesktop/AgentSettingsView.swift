import AppKit
import SwiftUI
import KlipRunCore

struct AgentSettingsView: View {
    @ObservedObject var store: DesktopStore
    private let agents = [("opencode", "OpenCode"), ("codex", "Codex"), ("claude", "Claude Code")]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Applies to new and resumed sessions. Running agents keep their current settings.")
                .font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            ForEach(agents, id: \.0) { source, name in
                SettingsCard(title: name, subtitle: "Leave fields blank to use the current automatic launch settings.") {
                    field("Model", name: name, source: source, key: \.model, identifier: "model", placeholder: source == "opencode" ? "provider/model" : "Agent default")
                    HStack(alignment: .bottom, spacing: 8) {
                        field("CLI path", name: name, source: source, key: \.cliPath, identifier: "cli-path", placeholder: source == "codex" ? "Automatic: codex-vk or codex" : "Automatic: \(source)")
                        Button("Choose…") { chooseCLI(source: source) }.accessibilityLabel("Choose \(name) CLI")
                    }
                    field("Launch arguments", name: name, source: source, key: \.arguments, identifier: "arguments", placeholder: "Optional CLI arguments")
                    Text("Use quotes for values with spaces. Shell expansions are not evaluated.")
                        .font(.system(size: 10)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    if let message = store.agentSettings[source]?.validationMessage {
                        Label(message, systemImage: "exclamationmark.triangle").font(.system(size: 11)).foregroundStyle(.orange)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Button("Reset \(name) settings") { store.updateAgentSettings(source: source) { $0 = AgentSettings() } }
                }
            }
        }
    }

    private func field(_ title: String, name: String, source: String, key: WritableKeyPath<AgentSettings, String>, identifier: String, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 11)).foregroundStyle(.secondary)
            TextField(placeholder, text: Binding(get: { store.agentSettings[source]?[keyPath: key] ?? "" },
                                                set: { value in store.updateAgentSettings(source: source) { $0[keyPath: key] = value } }))
                .textFieldStyle(.plain).font(.system(size: 12, design: .monospaced))
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(SettingsStyle.background, in: RoundedRectangle(cornerRadius: 5))
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(SettingsStyle.border))
                .accessibilityLabel("\(name) \(title)").accessibilityIdentifier("agent-\(source)-\(identifier)")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func chooseCLI(source: String) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true; panel.canChooseDirectories = false; panel.showsHiddenFiles = true
        panel.prompt = "Choose CLI"
        if panel.runModal() == .OK, let path = panel.url?.path {
            store.updateAgentSettings(source: source) { $0.cliPath = path }
        }
    }
}
