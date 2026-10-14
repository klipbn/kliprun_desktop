import Darwin
import Foundation
import SwiftTerm
import Testing
@testable import KlipRunCore

private final class PTYCollector: LocalProcessDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var received = ""
    var output: String { lock.lock(); defer { lock.unlock() }; return received }
    func getWindowSize() -> winsize { winsize(ws_row: 24, ws_col: 80, ws_xpixel: 0, ws_ypixel: 0) }
    func dataReceived(slice: ArraySlice<UInt8>) {
        lock.lock(); received += String(decoding: slice, as: UTF8.self); lock.unlock()
    }
    func processTerminated(_ source: LocalProcess, exitCode: Int32?) {}
}

@Test func embeddedPTYAcceptsInputAndReturnsProcessOutput() async throws {
    let collector = PTYCollector()
    let process = LocalProcess(delegate: collector, dispatchQueue: DispatchQueue(label: "kliprun.pty.test"))
    let environment = ["TERM=xterm-256color", "PATH=/usr/bin:/bin", "HOME=/private/tmp"]
    switch process.startProcessChecked(executable: "/bin/sh", args: ["-c", "read line; printf 'ACK:%s\\n' \"$line\""],
                                       environment: environment, currentDirectory: "/private/tmp") {
    case .success: break
    case .failure(let error): Issue.record("PTY launch failed: \(error)"); return
    }
    process.send(data: Array("ping\n".utf8)[...])
    for _ in 0..<100 where !collector.output.contains("ACK:ping") {
        try await Task.sleep(for: .milliseconds(50))
    }
    #expect(collector.output.contains("ACK:ping"))
    process.terminate()
}

@Test func newTerminalShellAcceptsCommands() async throws {
    let collector = PTYCollector()
    let process = LocalProcess(delegate: collector, dispatchQueue: DispatchQueue(label: "kliprun.shell.test"))
    let launch = try #require(AgentLaunch.make(source: "terminal", home: "/private/tmp",
                                                inherited: ["PATH": "/usr/bin:/bin", "ZDOTDIR": "/private/tmp"]))
    switch process.startProcessChecked(executable: "/bin/zsh", args: launch.arguments,
                                       environment: launch.environment.map { "\($0.key)=\($0.value)" },
                                       currentDirectory: "/private/tmp") {
    case .success: break
    case .failure(let error): Issue.record("Shell launch failed: \(error)"); return
    }
    process.send(data: Array("printf 'SHELL_READY\\n'\nexit\n".utf8)[...])
    for _ in 0..<100 where !collector.output.contains("SHELL_READY") {
        try await Task.sleep(for: .milliseconds(50))
    }
    #expect(collector.output.contains("SHELL_READY"))
    process.terminate()
}
