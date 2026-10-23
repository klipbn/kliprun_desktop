import Foundation
import Testing
@testable import KlipRunCore

@Test func hermesRestartTargetsOnlyTheRegisteredWatcherAndReportsFailure() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("hermes-service-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let executable = directory.appendingPathComponent("launchctl")
    let captured = directory.appendingPathComponent("commands.txt")
    try "#!/bin/sh\nprintf '%s\\n' \"$@\" >> '\(captured.path)'\nexit 0\n".write(to: executable, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: executable.path)
    let service = HermesLaunchAgent(userID: 501, executable: executable)
    try await service.restart()
    #expect(try String(contentsOf: captured, encoding: .utf8) == "print\ngui/501/local.codex-hermes.watch\nkickstart\n-k\ngui/501/local.codex-hermes.watch\n")
    try "#!/bin/sh\nexit 113\n".write(to: executable, atomically: true, encoding: .utf8)
    #expect(try await !service.isLoaded())
    await #expect(throws: (any Error).self) { try await service.restart() }
}
