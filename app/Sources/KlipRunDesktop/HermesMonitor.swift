import Foundation
import KlipRunCore

@MainActor
final class HermesMonitor: ObservableObject {
    @Published private(set) var statuses: [HermesStatus] = []
    @Published private(set) var busy = false
    @Published private(set) var codexServiceLoaded = false
    @Published private(set) var lastChecked: Date?
    @Published private(set) var message: String?
    @Published private(set) var error: String?
    private let home: URL
    private let environment: [String: String]
    private let service: HermesLaunchAgent

    init(home: URL = FileManager.default.homeDirectoryForCurrentUser,
         environment: [String: String] = ProcessInfo.processInfo.environment, service: HermesLaunchAgent = HermesLaunchAgent()) {
        self.home = home; self.environment = environment; self.service = service
    }

    func refresh() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        let home = self.home, environment = self.environment
        statuses = await Task.detached {
            HermesKind.allCases.map { HermesStatus.read($0, home: home, environment: environment) }
        }.value
        do { codexServiceLoaded = try await service.isLoaded() }
        catch { codexServiceLoaded = false; self.error = error.localizedDescription }
        lastChecked = Date()
    }

    func restartCodexWatcher() async {
        guard !busy else { return }
        busy = true; error = nil; message = nil
        do {
            try await service.restart()
            message = "Codex Hermes watcher restart requested."
        } catch { self.error = error.localizedDescription }
        busy = false
        await refresh()
    }

    var diagnostics: String {
        (["Codex Hermes LaunchAgent: \(codexServiceLoaded ? "loaded" : "not loaded")"] + statuses.map(\.diagnostics)).joined(separator: "\n\n")
    }
}
