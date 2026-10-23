import Foundation
import Darwin

/// Controls the Hermes watcher only; the shared Codex app-server is never a restart target.
public struct HermesLaunchAgent: Sendable {
    private let target: String
    private let executable: URL
    public init(userID: UInt32 = getuid(), executable: URL = URL(fileURLWithPath: "/bin/launchctl")) {
        target = "gui/\(userID)/local.codex-hermes.watch"
        self.executable = executable
    }

    public func isLoaded() async throws -> Bool { try await run(["print", target]).code == 0 }

    public func restart() async throws {
        guard try await isLoaded() else { throw ServiceError("The Codex Hermes LaunchAgent is not loaded. Load the existing LaunchAgent before restarting it.") }
        let result = try await run(["kickstart", "-k", target])
        guard result.code == 0 else { throw ServiceError("Could not restart the Codex Hermes watcher (launchctl exit \(result.code)). Check the watcher logs.") }
    }

    private func run(_ arguments: [String]) async throws -> Result {
        let executable = self.executable
        return try await Task.detached {
            let process = Process()
            process.executableURL = executable
            process.arguments = arguments
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            try process.run()
            let timer = DispatchSource.makeTimerSource(queue: .global())
            timer.schedule(deadline: .now() + 5)
            timer.setEventHandler { if process.isRunning { process.terminate() } }
            timer.resume()
            defer { timer.cancel() }
            process.waitUntilExit()
            guard process.terminationReason == .exit else { throw ServiceError("The Hermes service check timed out or was interrupted. Try again.") }
            return Result(code: process.terminationStatus)
        }.value
    }

    private struct Result: Sendable { let code: Int32 }
    private struct ServiceError: LocalizedError {
        let errorDescription: String?
        init(_ message: String) { errorDescription = message }
    }
}
