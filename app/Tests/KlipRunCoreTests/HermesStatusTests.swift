import Foundation
import Testing
@testable import KlipRunCore

@Test func hermesStatusRequiresFreshHeartbeatsAndLiveProcesses() throws {
    let home = FileManager.default.temporaryDirectory.appendingPathComponent("hermes-status-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: home) }
    let script = home.appendingPathComponent(".local/share/codex-hermes/codex-watch.ts")
    let state = home.appendingPathComponent(".cache/codex-hermes/watcher.json")
    try FileManager.default.createDirectory(at: script.deletingLastPathComponent(), withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: state.deletingLastPathComponent(), withIntermediateDirectories: true)
    try "export const WATCHER_VERSION = '1.4.0';".write(to: script, atomically: true, encoding: .utf8)
    let now = Date(timeIntervalSince1970: 1_790_000_000)
    let stamp = ISO8601DateFormatter().string(from: now)
    try Data(#"{"pid":123,"heartbeatAt":"\#(stamp)","version":"1.3.0","sendEnabled":true,"daemon":{"connected":false},"local":{"available":true},"secret":"DO_NOT_COPY","title":"PRIVATE_TASK"}"#.utf8).write(to: state)
    let running = HermesStatus.read(.codex, home: home, environment: [:], now: now, isAlive: { $0 == 123 })
    #expect(running.state == .running)
    #expect(running.installedVersion == "1.4.0")
    #expect(running.runningVersions == ["1.3.0"])
    #expect(running.processIDs == [123])
    #expect(!running.details.contains { $0.hasPrefix("Daemon:") && $0.contains("unavailable") })
    #expect(running.details.contains("Local CLI discovery: available"))
    #expect(!running.diagnostics.contains("DO_NOT_COPY"))
    #expect(!running.diagnostics.contains("PRIVATE_TASK"))
    #expect(HermesStatus.read(.codex, home: home, environment: [:], now: now, isAlive: { _ in false }).state == .stale)
    #expect(HermesStatus.read(.codex, home: home, environment: [:], now: now.addingTimeInterval(121), isAlive: { _ in true }).state == .stale)
    #expect(HermesStatus.read(.codex, home: home, environment: [:], now: now.addingTimeInterval(-60), isAlive: { _ in true }).state == .stale)
    try Data(#"{"pid":123,"heartbeatAt":"\#(stamp)","daemon":{"connected":false},"local":{"available":false}}"#.utf8).write(to: state)
    let disconnected = HermesStatus.read(.codex, home: home, environment: [:], now: now, isAlive: { _ in true })
    #expect(disconnected.details.contains("Daemon: unavailable"))
    #expect(disconnected.details.contains("Local CLI discovery: unavailable"))
}

@Test func opencodeHermesCountsFreshInstancesAndReportsUnreadableMetadata() throws {
    let home = FileManager.default.temporaryDirectory.appendingPathComponent("hermes-opencode-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: home) }
    let plugin = home.appendingPathComponent("config/plugins/hermes-watch.ts")
    let instances = home.appendingPathComponent("state/instances")
    try FileManager.default.createDirectory(at: plugin.deletingLastPathComponent(), withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: instances, withIntermediateDirectories: true)
    try #"const WATCHER_VERSION = "3.12.0""#.write(to: plugin, atomically: true, encoding: .utf8)
    let environment = ["OPENCODE_CONFIG_DIR": home.appendingPathComponent("config").path, "OPENCODE_HERMES_BASE_DIR": home.appendingPathComponent("state").path]
    let now = Date(timeIntervalSince1970: 1_790_000_000)
    let stamp = ISO8601DateFormatter().string(from: now)
    for pid in [101, 102, 103] {
        try Data(#"{"pid":\#(pid),"heartbeatAt":"\#(stamp)","watcherVersion":"3.12.0"}"#.utf8).write(to: instances.appendingPathComponent("\(pid).json"))
    }
    let running = HermesStatus.read(.opencode, home: home, environment: environment, now: now, isAlive: { $0 != 103 })
    #expect(running.state == .running)
    #expect(running.processIDs == [101, 102])
    #expect(running.runningVersions == ["3.12.0"])
    #expect(running.scriptURL == plugin)
    #expect(HermesStatus.read(.opencode, home: home, environment: environment, now: now.addingTimeInterval(36), isAlive: { _ in true }).state == .stale)
    try FileManager.default.removeItem(at: instances)
    try FileManager.default.createDirectory(at: instances, withIntermediateDirectories: true)
    try Data(#"{"title":"PRIVATE_TITLE_WITHOUT_HEARTBEAT"}"#.utf8).write(to: instances.appendingPathComponent("broken.json"))
    let broken = HermesStatus.read(.opencode, home: home, environment: environment, now: now)
    #expect(broken.state == .unavailable)
    #expect(!broken.diagnostics.contains("PRIVATE_TITLE"))
}
