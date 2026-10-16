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
    @Published private(set) var downloadProgress = AppUpdateProgress.downloading(received: 0, total: nil)
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
        downloadProgress = .downloading(received: 0, total: nil)
        phase = .downloading
        do {
            let downloads = try directory ?? FileManager.default.url(for: .downloadsDirectory, in: .userDomainMask,
                                                                     appropriateFor: nil, create: true)
            let archive = try await client.download(update, to: downloads) { [weak self] progress in
                guard let self, case .downloading = self.phase else { return }
                if case .verifying = self.downloadProgress { return }
                self.downloadProgress = progress
            }
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
