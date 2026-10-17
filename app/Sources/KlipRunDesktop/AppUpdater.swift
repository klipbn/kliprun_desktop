import AppKit
import SwiftUI
import KlipRunCore

@MainActor
final class AppUpdater: ObservableObject {
    enum Phase {
        case idle, checking, available(AppUpdate), downloading, preparing, ready, installed(String, String), upToDate, failed(String)
    }

    @Published var isPresented = false
    @Published private(set) var phase = Phase.idle
    @Published private(set) var availableVersion: String?
    @Published private(set) var downloadProgress = AppUpdateProgress.downloading(received: 0, total: nil)
    private(set) var installation: AppInstallation?
    private(set) var installOnExit = false
    private var downloadedUpdate: AppUpdate?
    private let applicationURL: URL
    private let defaults: UserDefaults
    private static let pendingKey = "kliprun.pending-update"
    private struct Pending: Codable {
        let installation: AppInstallation
        let version: String
        let notes: String
    }
    let installedVersion: String
    private let client: AppUpdateClient
    private var backgroundChecks: Task<Void, Never>?

    init(client: AppUpdateClient = AppUpdateClient(),
         installedVersion: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
         applicationURL: URL = Bundle.main.bundleURL, defaults: UserDefaults = .standard) {
        self.client = client
        self.installedVersion = installedVersion
        self.applicationURL = applicationURL
        self.defaults = defaults
    }

    var isBusy: Bool {
        switch phase {
        case .checking, .downloading, .preparing: true
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
        if case .installed = phase { return }
        Task { await check() }
    }

    func check(background: Bool = false) async {
        guard !isBusy else { return }
        if case .ready = phase { return }
        if case .installed = phase { return }
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
            let downloads = directory ?? FileManager.default.temporaryDirectory
            let archive = try await client.download(update, to: downloads) { [weak self] progress in
                guard let self, case .downloading = self.phase else { return }
                if case .verifying = self.downloadProgress { return }
                self.downloadProgress = progress
            }
            defer { try? FileManager.default.removeItem(at: archive.deletingLastPathComponent()) }
            phase = .preparing
            let destination = applicationURL
            let prepared = try await Task.detached(priority: .userInitiated) {
                try AppInstallation.prepare(archive: archive, destination: destination, version: update.version)
            }.value
            installation = prepared
            downloadedUpdate = update
            phase = .ready
        } catch { phase = .failed(error.localizedDescription) }
    }

    func prepareToQuit() -> Bool {
        guard case .ready = phase, installation != nil else { return false }
        installOnExit = true
        isPresented = false
        return true
    }

    func cancelQuit() { installOnExit = false }

    @discardableResult
    func installAfterExit(after pid: Int32 = ProcessInfo.processInfo.processIdentifier, relaunch: [String]? = nil) throws -> Process? {
        guard installOnExit else {
            if let installation { try? FileManager.default.removeItem(at: installation.directory) }
            installation = nil
            return nil
        }
        guard let installation, let update = downloadedUpdate else { return nil }
        let pending = Pending(installation: installation, version: update.version, notes: update.releaseNotes)
        defaults.set(try JSONEncoder().encode(pending), forKey: Self.pendingKey)
        defaults.synchronize()
        do {
            let helper = try installation.launch(after: pid, relaunch: relaunch)
            installOnExit = false
            return helper
        } catch {
            defaults.removeObject(forKey: Self.pendingKey)
            throw error
        }
    }

    func restoreAfterUpdate() {
        guard let data = defaults.data(forKey: Self.pendingKey),
              let pending = try? JSONDecoder().decode(Pending.self, from: data),
              pending.installation.destination == applicationURL.resolvingSymlinksInPath() else { return }
        let outcome = try? String(contentsOf: pending.installation.result, encoding: .utf8)
        if pending.version == installedVersion && outcome?.trimmingCharacters(in: .whitespacesAndNewlines) == "installed" {
            phase = .installed(pending.version, pending.notes)
            try? FileManager.default.removeItem(at: pending.installation.directory)
        } else {
            phase = .failed("The update did not finish. KlipRun is still running version \(installedVersion). Try downloading the update again.")
            // Preserve the previous app if an interrupted rollback still needs recovery.
            if !FileManager.default.fileExists(atPath: pending.installation.backup.path) {
                try? FileManager.default.removeItem(at: pending.installation.directory)
            }
        }
        defaults.removeObject(forKey: Self.pendingKey)
        isPresented = true
    }

    func dismissInstalledNotes() {
        if case .installed = phase { phase = .idle }
    }
}
