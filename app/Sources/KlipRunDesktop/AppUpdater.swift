import AppKit
import SwiftUI
import KlipRunCore

@MainActor
final class AppUpdater: ObservableObject {
    enum Phase {
        case idle, checking, available(AppUpdate), downloading, ready(URL), upToDate, failed(String)
    }

    @Published var isPresented = false
    @Published private(set) var phase = Phase.idle
    @Published private(set) var availableVersion: String?
    private(set) var archiveToReveal: URL?
    let installedVersion: String
    private let client: AppUpdateClient
    private var backgroundChecks: Task<Void, Never>?

    init(client: AppUpdateClient = AppUpdateClient(),
         installedVersion: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown") {
        self.client = client
        self.installedVersion = installedVersion
    }

    var isBusy: Bool {
        switch phase {
        case .checking, .downloading: true
        default: false
        }
    }

    func startBackgroundChecks(every interval: Duration = .seconds(3600)) {
        guard backgroundChecks == nil else { return }
        backgroundChecks = Task { [weak self] in
            while !Task.isCancelled {
                await self?.check(background: true)
                do { try await Task.sleep(for: interval) }
                catch { return }
            }
        }
    }

    func stopBackgroundChecks() {
        backgroundChecks?.cancel()
        backgroundChecks = nil
    }

    static func webScript(version: String?) -> String {
        let literal = (try? JSONEncoder().encode(version)).flatMap { String(data: $0, encoding: .utf8) } ?? "null"
        return "window.kliprunUpdateVersion = \(literal); window.dispatchEvent(new Event('kliprun:update'));"
    }

    func show() {
        isPresented = true
        if case .ready = phase { return }
        Task { await check() }
    }

    func check(background: Bool = false) async {
        guard !isBusy else { return }
        if case .ready = phase { return }
        if background && isPresented { return }
        let previousPhase = phase
        phase = .checking
        do {
            let update = try await client.check(currentVersion: installedVersion)
            try Task.checkCancellation()
            availableVersion = update?.version
            phase = update.map(Phase.available) ?? .upToDate
        } catch {
            phase = background && !isPresented ? previousPhase : .failed(error.localizedDescription)
        }
    }

    func download(to directory: URL? = nil) async {
        guard case .available(let update) = phase else { return }
        phase = .downloading
        do {
            let downloads = try directory ?? FileManager.default.url(for: .downloadsDirectory, in: .userDomainMask,
                                                                     appropriateFor: nil, create: true)
            let archive = try await client.download(update, to: downloads)
            phase = .ready(archive)
        } catch { phase = .failed(error.localizedDescription) }
    }

    func prepareToQuit() -> Bool {
        guard case .ready(let archive) = phase else { return false }
        archiveToReveal = archive
        return true
    }

    func cancelQuit() { archiveToReveal = nil }

    func revealAfterExit() throws {
        guard let archiveToReveal else { return }
        guard FileManager.default.fileExists(atPath: archiveToReveal.path) else { throw CocoaError(.fileReadNoSuchFile) }
        try UpdateHandoff.launch(after: ProcessInfo.processInfo.processIdentifier,
                                 command: ["/usr/bin/open", "-R", archiveToReveal.path])
        self.archiveToReveal = nil
    }
}

struct UpdateView: View {
    @ObservedObject var updater: AppUpdater

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Label("KlipRun Updates", systemImage: "arrow.down.circle").font(.title2.bold())
            Text("Installed version: \(updater.installedVersion)").foregroundStyle(.secondary)
            content.frame(maxWidth: .infinity, alignment: .leading)
            HStack {
                Button("Close") { updater.isPresented = false }.keyboardShortcut(.cancelAction)
                Spacer()
                switch updater.phase {
                case .available:
                    Button("Download Update") { Task { await updater.download() } }.keyboardShortcut(.defaultAction)
                case .ready:
                    Button("Quit and Show Update") {
                        if updater.prepareToQuit() {
                            updater.isPresented = false
                            NSApp.terminate(nil)
                        }
                    }.keyboardShortcut(.defaultAction)
                case .failed:
                    Button("Try Again") { Task { await updater.check() } }.keyboardShortcut(.defaultAction)
                default: EmptyView()
                }
            }
        }
        .padding(24)
        .frame(width: 460)
        .preferredColorScheme(.dark)
    }

    @ViewBuilder private var content: some View {
        switch updater.phase {
        case .idle, .checking:
            HStack { ProgressView().controlSize(.small); Text("Checking for updates…") }
        case .available(let update):
            VStack(alignment: .leading, spacing: 8) {
                Text("KlipRun \(update.version) is available.").font(.headline)
                Text("Download the latest stable release from GitHub. You can keep working while it downloads.")
            }
        case .downloading:
            VStack(alignment: .leading, spacing: 8) {
                HStack { ProgressView().controlSize(.small); Text("Downloading and verifying SHA256…") }
                Text("This may take a few minutes. You can close this window and return later.").foregroundStyle(.secondary)
            }
        case .ready(let archive):
            VStack(alignment: .leading, spacing: 8) {
                Text("Your update is ready.").font(.headline)
                Text("Quit KlipRun to reveal the verified ZIP in Finder. Unzip it, then replace KlipRun.app in Applications and open it again.")
                Text("Quitting ends agents started in this app. Keep KlipRun closed while replacing it.").foregroundStyle(.secondary)
                Text(archive.deletingLastPathComponent().path).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
            }
        case .upToDate:
            Text("KlipRun is up to date.").font(.headline)
        case .failed(let message):
            VStack(alignment: .leading, spacing: 8) {
                Text("Could not update KlipRun.").font(.headline)
                Text(message).foregroundStyle(.secondary)
            }
        }
    }
}
