import AppKit
import SwiftUI
import KlipRunCore

struct HermesSettingsView: View {
    @ObservedObject var store: DesktopStore
    @StateObject private var monitor: HermesMonitor
    @State private var copied = false
    @State private var expandedDetails = Set<HermesKind>()

    init(store: DesktopStore, monitor: HermesMonitor = HermesMonitor()) {
        self.store = store
        _monitor = StateObject(wrappedValue: monitor)
    }

    var body: some View {
        SettingsCard(title: "Hermes integrations", subtitle: "", compact: true) {
            HStack(spacing: 12) {
                Button { Task { await monitor.refresh() } } label: { Label("Refresh", systemImage: "arrow.clockwise") }
                    .disabled(monitor.busy).accessibilityLabel("Refresh Hermes status")
                Button(copied ? "Copied" : "Diagnostics") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(monitor.diagnostics, forType: .string)
                    copied = true
                }.disabled(monitor.statuses.isEmpty)
                if monitor.busy { ProgressView().controlSize(.small) }
                Spacer(minLength: 0)
                if let checked = monitor.lastChecked {
                    Text(checked.formatted(date: .omitted, time: .shortened)).foregroundStyle(.secondary)
                }
            }
            .font(.system(size: 10)).buttonStyle(.plain).foregroundStyle(SettingsStyle.accent)
            ForEach(monitor.statuses, id: \.kind) { status in
                Divider().overlay(SettingsStyle.border)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(status.kind.label).font(.system(size: 11, weight: .semibold))
                        Spacer(minLength: 4)
                        Label(status.state.rawValue, systemImage: "circle.fill")
                            .font(.system(size: 10)).foregroundStyle(color(status.state))
                        primaryAction(status)
                    }
                    HStack(spacing: 4) {
                        Text("\(status.runningVersions.first ?? status.installedVersion ?? "Version unknown") · \(status.processIDs.count) active")
                        if let heartbeat = status.heartbeatAt { Text("· Heartbeat"); Text(heartbeat, style: .relative) }
                    }
                    .foregroundStyle(.secondary)
                    ForEach(status.details.filter { $0.contains("unavailable") || $0.contains("failures") }, id: \.self) { detail in
                        Text(detail).foregroundStyle(.orange)
                    }
                    Button {
                        if !expandedDetails.insert(status.kind).inserted { expandedDetails.remove(status.kind) }
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: expandedDetails.contains(status.kind) ? "chevron.down" : "chevron.right")
                            Text("Details")
                            Spacer(minLength: 0)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 3)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain).foregroundStyle(.secondary)
                    .accessibilityLabel("\(status.kind.label) details")
                    .accessibilityValue(expandedDetails.contains(status.kind) ? "Expanded" : "Collapsed")
                    .accessibilityIdentifier("hermes-\(status.kind.rawValue)-details")
                    if expandedDetails.contains(status.kind) { details(status) }
                }
                .font(.system(size: 10))
                .fixedSize(horizontal: false, vertical: true)
            }
            if let error = monitor.error { Text(error).foregroundStyle(.orange).font(.system(size: 11)).fixedSize(horizontal: false, vertical: true) }
            if let message = monitor.message { Text(message).foregroundStyle(.secondary).font(.system(size: 11)).fixedSize(horizontal: false, vertical: true) }
        }
        .task {
            while !Task.isCancelled {
                await monitor.refresh()
                do { try await Task.sleep(for: .seconds(10)) } catch { break }
            }
        }
    }

    private func color(_ state: HermesStatus.State) -> Color {
        switch state { case .running: .green; case .stale, .unavailable: .orange; default: .secondary }
    }

    private func primaryAction(_ status: HermesStatus) -> some View {
        Group {
            if status.kind == .codex {
                Button("Restart") { Task { await monitor.restartCodexWatcher() } }
                    .disabled(monitor.busy || !monitor.codexServiceLoaded)
                    .accessibilityLabel("Restart Codex Hermes").accessibilityIdentifier("hermes-codex-restart")
                    .help("Restart the Codex Hermes watcher")
            } else {
                Button("Restart") { store.launch(source: "opencode") }
                    .disabled(!FileManager.default.fileExists(atPath: status.scriptURL.path))
                    .accessibilityLabel("Restart OpenCode Hermes").accessibilityIdentifier("hermes-opencode-restart")
                    .help("Reload OpenCode Hermes in a new OpenCode terminal while existing agents keep running.")
            }
        }
        .buttonStyle(.plain).font(.system(size: 10, weight: .medium))
        .foregroundStyle(SettingsStyle.accent).padding(.horizontal, 7).padding(.vertical, 4)
        .background(SettingsStyle.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 4))
    }

    private func details(_ status: HermesStatus) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Installed: \(status.installedVersion ?? "unknown") · Running: \(status.runningVersions.isEmpty ? "none" : status.runningVersions.joined(separator: ", "))")
            Text("PID: \(status.processIDs.isEmpty ? "none" : status.processIDs.map(String.init).joined(separator: ", "))")
            ForEach(status.details, id: \.self) { Text($0) }
            Text(status.scriptURL.path).font(.system(size: 10, design: .monospaced)).textSelection(.enabled)
            if status.kind == .codex && !monitor.codexServiceLoaded {
                Text("Restart requires the existing Codex Hermes LaunchAgent to be loaded.")
            }
            if status.kind == .opencode {
                Text("Restart reloads this plugin in a new OpenCode terminal.")
            }
            HStack(spacing: 12) {
                openButton("Logs", url: status.logsURL)
                openButton("State folder", url: status.stateDirectory)
                openButton("Plugin folder", url: status.scriptURL.deletingLastPathComponent())
            }
            .foregroundStyle(SettingsStyle.accent)
        }
        .font(.system(size: 10)).foregroundStyle(.secondary).padding(.vertical, 4)
    }

    private func openButton(_ title: String, url: URL) -> some View {
        Button(title) { NSWorkspace.shared.open(url) }
            .buttonStyle(.plain).padding(.vertical, 3)
            .disabled(!FileManager.default.fileExists(atPath: url.path))
    }
}
