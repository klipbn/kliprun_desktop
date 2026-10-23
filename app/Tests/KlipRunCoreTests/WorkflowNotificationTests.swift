import Foundation
import Testing
@testable import KlipRunCore

@Test func workflowNotificationsAreDeduplicatedAndIncludeFastNewRuns() throws {
    func notice(_ id: String, _ status: String) throws -> WorkflowNotice {
        let data = try JSONSerialization.data(withJSONObject: ["id":id,"workflowId":"flow","runId":"run","name":"Review a report","status":status,"revision":1000,"nodeId":"review"])
        return try JSONDecoder().decode(WorkflowNotice.self, from: data)
    }
    var tracker = WorkflowNotificationTracker()
    #expect(tracker.observe([try notice("old", "completed")]).isEmpty)
    let ready = try notice("new", "human_review")
    #expect(tracker.observe([ready]).map(\.id) == ["new"])
    #expect(tracker.observe([ready]).isEmpty)
    #expect(ready.notification.actionLabel == "Open workflow")
    #expect(ready.notification.message.contains("human review"))
    #expect(tracker.observe([try notice("again", "needs_attention")]).first?.notification.kind == .input)
    #expect(tracker.observe([try notice("done", "completed")]).first?.notification.kind == .finished)
}

@Test func workflowLaunchDecodesEngineRequestsAndOldEnginesWithoutLaunches() throws {
    let json = #"{"notices":[],"launches":[{"attemptId":"a1","runId":"r1","workflowName":"Ship","title":"Plan","source":"claude","directory":"/tmp/project","argv":["claude","--session-id","x"],"promptFile":"/tmp/state/prompt.md"}]}"#
    let snapshot = try JSONDecoder().decode(WorkflowStatusSnapshot.self, from: Data(json.utf8))
    #expect(snapshot.launches.first?.tabName == "Ship · Plan")
    #expect(try JSONDecoder().decode(WorkflowStatusSnapshot.self, from: Data(#"{"notices":[]}"#.utf8)).launches.isEmpty)
}

@Test func workflowTerminalReadsTheLongPromptFromAFileInsteadOfTheCommandLine() throws {
    let launch = try #require(AgentLaunch.workflow(source: "claude", argv: ["claude", "--settings", #"{"a":"it's"}"#], promptFile: "/tmp/Application Support/prompt.md",
                                                   home: "/Users/test", inherited: ["PATH": "/usr/bin", "CLAUDECODE": "1"]))
    #expect(launch.arguments[0] == "-lic")
    #expect(launch.arguments[1] == #"exec claude --settings '{"a":"it'\''s"}' 'Read the full Workflow task from /tmp/Application Support/prompt.md. Follow all its instructions and complete the task.'"#)
    #expect(launch.environment["CLAUDECODE"] == nil)
    #expect(launch.environment["TERM"] == "xterm-256color")
    #expect(AgentLaunch.workflow(source: "opencode", argv: ["opencode"], promptFile: "/tmp/p", home: "", inherited: [:]) == nil)
    #expect(AgentLaunch.workflow(source: "claude", argv: [], promptFile: "/tmp/p", home: "", inherited: [:]) == nil)
    #expect(AgentLaunch.workflow(source: "claude", argv: ["claude"], promptFile: "relative.md", home: "", inherited: [:]) == nil)
}

@Test func workflowStatusListsTerminalsThatNeedAttention() throws {
    let snapshot = try JSONDecoder().decode(WorkflowStatusSnapshot.self, from: Data(#"{"notices":[],"attention":["a1"]}"#.utf8))
    #expect(snapshot.attention == ["a1"])
    #expect(try JSONDecoder().decode(WorkflowStatusSnapshot.self, from: Data(#"{"notices":[]}"#.utf8)).attention.isEmpty)
}

@Test func workflowTerminalStartsWithATaskLargerThanTheExecArgumentLimit() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("workflow-long-prompt-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let prompt = directory.appendingPathComponent("task with spaces.md")
    let captured = directory.appendingPathComponent("argument.txt")
    let cli = directory.appendingPathComponent("fake-cli.sh")
    try String(repeating: "A large task with Unicode: проверка.\n", count: 30_000).write(to: prompt, atomically: true, encoding: .utf8)
    try "#!/bin/sh\nprintf '%s' \"$2\" > \"$1\"\n".write(to: cli, atomically: true, encoding: .utf8)
    let launch = try #require(AgentLaunch.workflow(source: "codex", argv: ["/bin/sh", cli.path, captured.path], promptFile: prompt.path, home: directory.path, inherited: [:]))
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/zsh")
    process.arguments = launch.arguments
    process.environment = launch.environment
    process.standardError = Pipe()
    try process.run()
    process.waitUntilExit()
    #expect(process.terminationStatus == 0)
    #expect(FileManager.default.fileExists(atPath: captured.path))
    if FileManager.default.fileExists(atPath: captured.path) {
        #expect(try String(contentsOf: captured, encoding: .utf8).contains(prompt.path))
    }
}
