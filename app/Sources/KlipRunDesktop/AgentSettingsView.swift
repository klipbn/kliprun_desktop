import AppKit
import SwiftUI
import KlipRunCore

struct AgentSettingsView: View {
    @ObservedObject var store: DesktopStore
    private let agents = [("opencode", "OpenCode"), ("codex", "Codex"), ("claude", "Claude Code")]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("New and resumed sessions · Blank fields use automatic defaults.")
                .font(.system(size: 10)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            ForEach(agents, id: \.0) { source, name in
                SettingsCard(title: name, subtitle: "", compact: true) {
                    HStack(spacing: 8) {
                        field("Model", name: name, source: source, key: \.model, identifier: "model", placeholder: source == "opencode" ? "provider/model" : "Default")
                            .frame(width: 150)
                        field("CLI path", name: name, source: source, key: \.cliPath, identifier: "cli-path", placeholder: source == "codex" ? "Automatic: codex-vk or codex" : "Automatic: \(source)")
                        Button { chooseCLI(source: source) } label: { Image(systemName: "folder").frame(width: 24, height: 24) }
                            .buttonStyle(.plain).foregroundStyle(SettingsStyle.accent)
                            .accessibilityLabel("Choose \(name) CLI").help("Choose \(name) CLI")
                    }
                    HStack(spacing: 8) {
                        field("Launch arguments", name: name, source: source, key: \.arguments, identifier: "arguments", placeholder: "Optional arguments")
                        Button { store.updateAgentSettings(source: source) { $0 = AgentSettings() } } label: {
                            Image(systemName: "arrow.counterclockwise").frame(width: 24, height: 24)
                        }
                        .buttonStyle(.plain).foregroundStyle(.secondary)
                        .accessibilityLabel("Reset \(name) settings").help("Reset \(name) settings")
                    }
                    if let message = store.agentSettings[source]?.validationMessage {
                        Label(message, systemImage: "exclamationmark.triangle").font(.system(size: 11)).foregroundStyle(.orange)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            HermesSettingsView(store: store)
        }
    }

    private func field(_ title: String, name: String, source: String, key: WritableKeyPath<AgentSettings, String>, identifier: String, placeholder: String) -> some View {
        HStack(spacing: 6) {
            Text(title == "CLI path" ? "CLI" : title == "Launch arguments" ? "Args" : title)
                .font(.system(size: 10)).foregroundStyle(.secondary).frame(width: 30, alignment: .leading)
            TextField(placeholder, text: Binding(get: { store.agentSettings[source]?[keyPath: key] ?? "" },
                                                set: { value in store.updateAgentSettings(source: source) { $0[keyPath: key] = value } }))
                .textFieldStyle(.plain).font(.system(size: 11, design: .monospaced))
                .padding(.horizontal, 7).padding(.vertical, 5)
                .background(SettingsStyle.background, in: RoundedRectangle(cornerRadius: 5))
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(SettingsStyle.border))
                .accessibilityLabel("\(name) \(title)").accessibilityIdentifier("agent-\(source)-\(identifier)")
                .help(identifier == "arguments" ? "Quote values with spaces. Shell expansions are not evaluated." : "\(name) \(title)")
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
