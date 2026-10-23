import Foundation
import KlipRunCore

@MainActor
final class EngineRuntime: ObservableObject {
    @Published private(set) var baseURL: URL?
    @Published private(set) var error: String?
    let token = UUID().uuidString + UUID().uuidString
    let stateDirectory = ProcessInfo.processInfo.environment["KLIPRUN_DESKTOP_STATE_HOME"].map { URL(fileURLWithPath: $0, isDirectory: true) }
        ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/KlipRun Desktop")
    private var process: Process?
    private var output: FileHandle?
    private var errorLog: FileHandle?
    private var pending = ""
    private var stopping = false

    func start() {
        guard process == nil else { return }
        let resources = Bundle.main.resourceURL ?? URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let engine = resources.appendingPathComponent("engine")
        let bundledBun = Bundle.main.executableURL?.deletingLastPathComponent().appendingPathComponent("bun")
        let bun = bundledBun.flatMap { FileManager.default.isExecutableFile(atPath: $0.path) ? $0.path : nil }
            ?? (ProcessInfo.processInfo.environment["KLIPRUN_DESKTOP_BUN"] ?? "")
        guard !bun.isEmpty, FileManager.default.fileExists(atPath: engine.appendingPathComponent("src/server/index.ts").path) else {
            error = "KlipRun engine is missing from the app bundle"; return
        }
        let support = stateDirectory
        do { try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true) }
        catch { self.error = error.localizedDescription; return }
        let child = Process()
        child.executableURL = URL(fileURLWithPath: bun)
        child.arguments = ["run", "src/server/index.ts", "--port", "0"]
        child.currentDirectoryURL = engine
        child.environment = EngineEnvironment.make(inherited: ProcessInfo.processInfo.environment,
                                                   token: token, statePath: support.path)
        let agentSettings = Dictionary(uniqueKeysWithValues: AgentSettings.sources.map { ($0, AgentSettings(source: $0, defaults: .standard)) })
        if let data = AgentSettings.workflowJSON(agentSettings) {
            child.environment?["KLIPRUN_AGENT_SETTINGS"] = String(decoding: data, as: UTF8.self)
        }
        child.environment?["KLIPRUN_VISIBLE_AGENTS"] = "1"
        let stdout = Pipe()
        child.standardOutput = stdout
        let logURL = support.appendingPathComponent("engine.log")
        if !FileManager.default.fileExists(atPath: logURL.path) { FileManager.default.createFile(atPath: logURL.path, contents: nil) }
        errorLog = try? FileHandle(forWritingTo: logURL)
        child.standardError = errorLog ?? FileHandle.nullDevice
        child.terminationHandler = { [weak self] process in
            Task { @MainActor in
                guard let self, !self.stopping else { return }
                self.baseURL = nil
                self.error = "KlipRun engine exited (code \(process.terminationStatus)). See engine.log"
            }
        }
        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let bytes = handle.availableData
            guard !bytes.isEmpty else { return }
            Task { @MainActor in self?.receive(String(decoding: bytes, as: UTF8.self)) }
        }
        do {
            try child.run()
            process = child
            output = stdout.fileHandleForReading
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    private func receive(_ chunk: String) {
        pending += chunk
        while let end = pending.firstIndex(of: "\n") {
            let line = String(pending[..<end]); pending = String(pending[pending.index(after: end)...])
            if let data = line.data(using: .utf8),
               let ready = try? JSONDecoder().decode(Ready.self, from: data), ready.ready,
               (1...65535).contains(ready.port) {
                baseURL = URL(string: "http://127.0.0.1:\(ready.port)")
            }
        }
    }

    func stop() {
        stopping = true
        output?.readabilityHandler = nil
        if process?.isRunning == true { process?.terminate() }
        process = nil; output = nil; baseURL = nil
        try? errorLog?.close(); errorLog = nil
    }

    func updateAgentSettings(_ settings: [String: AgentSettings]) async {
        guard let baseURL, let data = AgentSettings.workflowJSON(settings) else { return }
        var request = URLRequest(url: baseURL.appendingPathComponent("api/workflows/agent-settings"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = data
        _ = try? await URLSession.shared.data(for: request)
    }

    private struct Ready: Decodable { let ready: Bool; let port: Int }
}
