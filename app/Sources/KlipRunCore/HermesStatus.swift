import Foundation
import Darwin

public enum HermesKind: String, CaseIterable, Sendable {
    case codex, opencode
    public var label: String { self == .codex ? "Codex Hermes" : "OpenCode Hermes" }
}

public struct HermesStatus: Sendable {
    public enum State: String, Sendable { case running = "Running", stale = "Stale heartbeat", inactive = "Not running", notInstalled = "Not installed", unavailable = "Status unavailable" }
    public let kind: HermesKind
    public let state: State
    public let installedVersion: String?
    public let runningVersions: [String]
    public let processIDs: [Int32]
    public let heartbeatAt: Date?
    public let details: [String]
    public let scriptURL: URL
    public let stateDirectory: URL
    public let logsURL: URL
    public let launchAgentURL: URL

    public var diagnostics: String {
        (["\(kind.label): \(state.rawValue)", "Installed version: \(installedVersion ?? "unknown")",
          "Running versions: \(runningVersions.joined(separator: ", "))", "PIDs: \(processIDs.map(String.init).joined(separator: ", "))",
          "Heartbeat: \(heartbeatAt.map { ISO8601DateFormatter().string(from: $0) } ?? "none")"] + details).joined(separator: "\n")
    }

    public static func read(_ kind: HermesKind, home: URL = FileManager.default.homeDirectoryForCurrentUser,
                            environment: [String: String] = ProcessInfo.processInfo.environment, now: Date = Date(),
                            isAlive: (Int32) -> Bool = { kill($0, 0) == 0 || errno == EPERM }) -> Self {
        let files = FileManager.default
        let launchAgent = home.appendingPathComponent("Library/LaunchAgents/local.codex-hermes.watch.plist")
        let plist = boundedData(launchAgent).flatMap { try? PropertyListSerialization.propertyList(from: $0, format: nil) as? [String: Any] }
        let serviceEnvironment = plist?["EnvironmentVariables"] as? [String: String] ?? [:]
        let configuredBase = kind == .codex ? serviceEnvironment["CODEX_HERMES_BASE_DIR"] ?? environment["CODEX_HERMES_BASE_DIR"] : environment["OPENCODE_HERMES_BASE_DIR"]
        let base = configuredBase.map { URL(fileURLWithPath: $0, isDirectory: true) } ?? home.appendingPathComponent(".cache/\(kind.rawValue)-hermes")
        let configuredScript = (plist?["ProgramArguments"] as? [String])?.first { $0.hasPrefix("/") && URL(fileURLWithPath: $0).lastPathComponent == "codex-watch.ts" }
        let script: URL
        if kind == .codex {
            script = configuredScript.map { URL(fileURLWithPath: $0) } ?? home.appendingPathComponent(".local/share/codex-hermes/codex-watch.ts")
        } else {
            let config = environment["OPENCODE_CONFIG_DIR"].map { URL(fileURLWithPath: $0) }
                ?? environment["XDG_CONFIG_HOME"].map { URL(fileURLWithPath: $0).appendingPathComponent("opencode") }
                ?? home.appendingPathComponent(".config/opencode")
            script = config.appendingPathComponent("plugins/hermes-watch.ts")
        }
        let installed = files.fileExists(atPath: script.path)
        let source = boundedData(script, limit: 1_048_576).flatMap { String(data: $0, encoding: .utf8) } ?? ""
        let pattern = #"WATCHER_VERSION\s*=\s*["']([0-9A-Za-z.+_-]{1,40})["']"#
        let match = source.range(of: pattern, options: .regularExpression).map { String(source[$0]) }
        let installedVersion = match?.split(whereSeparator: { $0 == "\"" || $0 == "'" }).dropFirst().first.map(String.init)
        let urls = kind == .codex ? [base.appendingPathComponent("watcher.json")]
            : ((try? files.contentsOfDirectory(at: base.appendingPathComponent("instances"), includingPropertiesForKeys: nil)) ?? [])
                .filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }.prefix(2000).map { $0 }
        let decoder = JSONDecoder()
        let records = urls.compactMap { url -> Record? in
            guard let data = boundedData(url), let record = try? decoder.decode(Record.self, from: data),
                  let pid = record.pid, pid > 1, date(record.heartbeatAt) != nil else { return nil }
            return record
        }
        let fresh = records.filter { record in
            guard let pid = record.pid, pid > 1, let date = date(record.heartbeatAt) else { return false }
            return (-5...(kind == .codex ? 120.0 : 35.0)).contains(now.timeIntervalSince(date)) && isAlive(pid)
        }
        let latest = fresh.max { (date($0.heartbeatAt) ?? .distantPast) < (date($1.heartbeatAt) ?? .distantPast) }
        let state: State = !fresh.isEmpty ? .running : !records.isEmpty ? .stale
            : urls.contains(where: { files.fileExists(atPath: $0.path) }) ? .unavailable : installed ? .inactive : .notInstalled
        var details: [String] = []
        if kind == .codex, let latest {
            if latest.daemon?.connected == false && latest.local?.available == true {
                details.append("Daemon: not connected (local CLI discovery active)")
            } else {
                details.append("Daemon: \(latest.daemon?.connected.map { $0 ? "available" : "unavailable" } ?? "unknown")")
            }
            details.append("Local CLI discovery: \(latest.local?.available.map { $0 ? "available" : "unavailable" } ?? "unknown")")
            details.append("Telegram delivery: \(latest.sendEnabled.map { $0 ? "enabled" : "disabled" } ?? "unknown")")
            if let failures = latest.deliveryFailures, failures > 0 { details.append("Recent delivery failures: \(failures)") }
        }
        if let until = date(latest?.muteUntil), until > now { details.append("Notifications muted until \(ISO8601DateFormatter().string(from: until))") }
        if records.count < urls.filter({ files.fileExists(atPath: $0.path) }).count { details.append("Some heartbeat files could not be read.") }
        let versions = Set(fresh.compactMap { $0.version ?? $0.watcherVersion }.filter { $0.range(of: #"^[0-9][0-9A-Za-z.+_-]{0,39}$"#, options: .regularExpression) != nil })
        if let installedVersion, versions.contains(where: { $0 != installedVersion }) { details.append("Restart to load the installed watcher version.") }
        let logs = kind == .codex ? (plist?["StandardErrorPath"] as? String).map { URL(fileURLWithPath: $0) } ?? base.appendingPathComponent("logs")
            : home.appendingPathComponent(".local/share/opencode/log")
        return Self(kind: kind, state: state, installedVersion: installedVersion, runningVersions: versions.sorted(),
                    processIDs: Array(Set(fresh.compactMap(\.pid))).sorted(), heartbeatAt: records.compactMap { date($0.heartbeatAt) }.max(),
                    details: details, scriptURL: script, stateDirectory: base, logsURL: logs, launchAgentURL: launchAgent)
    }

    private static func boundedData(_ url: URL, limit: Int = 262_144) -> Data? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        guard let data = try? handle.read(upToCount: limit + 1), data.count <= limit else { return nil }
        return data
    }

    private static func date(_ value: String?) -> Date? {
        guard let value else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private struct Record: Decodable {
        let pid: Int32?; let heartbeatAt: String?; let version: String?; let watcherVersion: String?
        let sendEnabled: Bool?; let muteUntil: String?; let deliveryFailures: Int?
        let daemon: Daemon?; let local: Local?
        struct Daemon: Decodable { let connected: Bool? }
        struct Local: Decodable { let available: Bool? }
    }
}
