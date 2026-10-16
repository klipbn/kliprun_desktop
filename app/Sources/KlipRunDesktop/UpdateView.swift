import AppKit
import SwiftUI
import KlipRunCore

struct UpdateView: View {
    @ObservedObject var updater: AppUpdater
    var embedded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if !embedded {
                Label("KlipRun Updates", systemImage: "arrow.down.circle").font(.title2.bold())
            }
            HStack {
                Text("Installed \(updater.installedVersion)")
                Spacer()
                Text(AppUpdateClient.architecture == "arm64" ? "Apple Silicon" : "Intel")
            }.font(.system(size: 11)).foregroundStyle(.secondary)
            if embedded {
                ScrollView { content.frame(maxWidth: .infinity, alignment: .leading) }
            } else if case .ready = updater.phase {
                ScrollView { content.frame(maxWidth: .infinity, alignment: .leading) }.frame(height: 360)
            } else {
                content.frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack {
                if !embedded { Button("Close") { updater.isPresented = false }.keyboardShortcut(.cancelAction) }
                Spacer()
                actions
            }
        }
        .padding(embedded ? 0 : 24)
        .frame(width: embedded ? nil : 550)
        .font(.system(size: 13))
        .buttonStyle(SettingsButtonStyle())
        .tint(SettingsStyle.accent)
        .background(SettingsStyle.background)
        .preferredColorScheme(.dark)
    }

    @ViewBuilder private var actions: some View {
        switch updater.phase {
        case .available:
            Button { Task { await updater.download() } } label: { Label("Download Update", systemImage: "arrow.down") }
                .buttonStyle(SettingsButtonStyle(primary: true)).keyboardShortcut(.defaultAction)
        case .ready(let archive):
            Button("Show ZIP in Finder") { NSWorkspace.shared.activateFileViewerSelecting([archive]) }
            Button("Quit and Show Update") {
                if updater.prepareToQuit() {
                    updater.isPresented = false
                    NSApp.terminate(nil)
                }
            }.buttonStyle(SettingsButtonStyle(primary: true)).keyboardShortcut(.defaultAction)
        case .failed:
            Button("Try Again") { Task { await updater.check() } }.buttonStyle(SettingsButtonStyle(primary: true))
        case .idle, .upToDate:
            Button("Check for Updates") { Task { await updater.check() } }.buttonStyle(SettingsButtonStyle(primary: true))
        default: EmptyView()
        }
    }

    @ViewBuilder private var content: some View {
        switch updater.phase {
        case .idle:
            SettingsCard(title: "Stay up to date", subtitle: "Stable releases are checked at launch and every hour.") {
                Text("Check for a new version, read what's changed, and download a verified update.")
            }
        case .checking:
            HStack(spacing: 10) { ProgressView().controlSize(.small); Text("Checking for updates…") }.padding(.vertical, 24)
        case .available(let update):
            VStack(alignment: .leading, spacing: 12) {
                Label("KlipRun \(update.version) is available", systemImage: "sparkles")
                    .font(.headline).foregroundStyle(SettingsStyle.accent)
                Text("What's New").font(.system(size: 13, weight: .semibold))
                ReleaseNotesView(markdown: update.releaseNotes)
                    .frame(height: embedded ? 240 : 260)
                    .background(SettingsStyle.surface, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(SettingsStyle.border))
                    .accessibilityLabel("Release notes for KlipRun \(update.version)")
                Text("Download → Quit KlipRun → Unzip → Replace in Applications")
                    .font(.system(size: 11, weight: .medium)).foregroundStyle(SettingsStyle.accent)
                Text("Updates install manually. Downloading the ZIP does not replace the app. You can keep working while it downloads.")
                    .font(.system(size: 12)).foregroundStyle(.secondary)
            }
        case .downloading:
            SettingsCard(title: updater.downloadProgress == .verifying ? "Verifying your download" : "Downloading update",
                         subtitle: "You can close this panel and return to Updates later.") {
                if case .verifying = updater.downloadProgress {
                    HStack(spacing: 10) {
                        ProgressView().controlSize(.small)
                        Text("Checking SHA256 before saving the ZIP…")
                    }
                } else if case .downloading(let received, let total) = updater.downloadProgress {
                    HStack {
                        Text(total.map { "\(bytes(received)) of \(bytes($0))" } ?? "\(bytes(received)) downloaded")
                            .monospacedDigit()
                        Spacer()
                        if let fraction = updater.downloadProgress.fraction {
                            Text("\(Int(fraction * 100))%").monospacedDigit().foregroundStyle(SettingsStyle.accent)
                        }
                    }
                    if let fraction = updater.downloadProgress.fraction {
                        ProgressView(value: fraction).accessibilityLabel("Update download progress")
                    } else {
                        ProgressView().progressViewStyle(.linear).accessibilityLabel("Downloading update; total size unavailable")
                    }
                }
            }
        case .ready(let archive):
            VStack(alignment: .leading, spacing: 14) {
                Label("Download verified. Ready to install.", systemImage: "checkmark.shield.fill")
                    .font(.headline).foregroundStyle(.green)
                SettingsCard(title: "Install in four steps", subtitle: "The ZIP is downloaded. Finish these steps to use the new version.") {
                    installStep(1, "Quit KlipRun", "Use Quit and Show Update below. Finder will select the ZIP after KlipRun closes.")
                    installStep(2, "Unzip the download", "Double-click \(archive.lastPathComponent) in Finder.")
                    installStep(3, "Replace the app", "Drag the new KlipRun.app into Applications and choose Replace. Keep KlipRun closed.")
                    installStep(4, "Open KlipRun again", "Launch it from Applications. Your preferences and session history stay in place.")
                }
                Label("Quitting ends agents started in this app. Finish their work first.", systemImage: "exclamationmark.triangle")
                    .font(.system(size: 11)).foregroundStyle(.orange)
                Text("If macOS blocks the app: System Settings → Privacy & Security → Open Anyway.")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
                Text(archive.path).font(.system(size: 10)).foregroundStyle(.secondary).textSelection(.enabled)
                    .lineLimit(2).truncationMode(.middle)
            }
        case .upToDate:
            SettingsCard(title: "You're up to date", subtitle: "KlipRun \(updater.installedVersion) is the latest compatible stable version.") {
                Label("Automatic checks run at launch and every hour.", systemImage: "checkmark.circle").foregroundStyle(.green)
            }
        case .failed(let message):
            SettingsCard(title: "Could not update KlipRun", subtitle: message) {
                Text("Check your connection and try again. Your installed app has not been changed.").foregroundStyle(.secondary)
            }
        }
    }

    private func bytes(_ count: Int64) -> String { ByteCountFormatter.string(fromByteCount: count, countStyle: .file) }

    private func installStep(_ number: Int, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(number)").font(.system(size: 11, weight: .semibold)).foregroundStyle(SettingsStyle.accent)
                .frame(width: 22, height: 22).background(SettingsStyle.accent.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 12, weight: .semibold))
                Text(detail).font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
