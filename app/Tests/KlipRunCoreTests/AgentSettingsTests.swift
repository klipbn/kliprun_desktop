import Foundation
import Testing
@testable import KlipRunCore

@Test func agentSettingsPersistIndependentlyAndResetToAutomaticLaunch() {
    let suite = "KlipRun-agent-settings-\(UUID().uuidString)", defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    for source in AgentSettings.sources {
        let settings = AgentSettings(model: "\(source)-model", cliPath: "/demo/\(source)", arguments: "--profile 'work profile'")
        settings.save(source: source, to: defaults)
    }
    for source in AgentSettings.sources {
        #expect(AgentSettings(source: source, defaults: defaults).model == "\(source)-model")
        #expect(AgentSettings(source: source, defaults: defaults).cliPath == "/demo/\(source)")
    }
    AgentSettings().save(source: "codex", to: defaults)
    #expect(AgentSettings(source: "codex", defaults: defaults) == AgentSettings())
    #expect(AgentSettings(source: "claude", defaults: defaults).model == "claude-model")
}

@Test func agentArgumentsPreserveQuotedValuesAndRejectIncompleteInput() {
    #expect(AgentSettings(arguments: #"--profile 'two words' --empty "" --path some\ folder --json '{"a":"b"}' --regex "\d+""#).parsedArguments == ["--profile", "two words", "--empty", "", "--path", "some folder", "--json", "{\"a\":\"b\"}", "--regex", "\\d+"])
    for value in ["'unfinished", "\"unfinished", "trailing\\"] {
        #expect(AgentSettings(arguments: value).validationMessage != nil)
    }
    #expect(AgentSettings(model: "model\0").validationMessage != nil)
    #expect(AgentSettings(cliPath: "-c").validationMessage != nil)
    #expect(AgentSettings(arguments: "\\\n").parsedArguments == [])
}

@Test func invalidAgentSettingsCannotLaunchAndLeaveStandaloneTerminalsUnaffected() {
    let invalid = AgentSettings(arguments: "--profile 'unfinished")
    for source in AgentSettings.sources {
        #expect(AgentLaunch.make(source: source, home: "/demo", inherited: [:], settings: invalid) == nil)
    }
    #expect(AgentLaunch.make(source: "terminal", home: "/demo", inherited: [:], settings: invalid)?.arguments == ["-l", "-i"])
}

@Test func configuredAgentLaunchPassesExactArgumentsThroughTheShellForNewAndResumedSessions() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("KlipRun-agent-argv-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let executable = directory.appendingPathComponent("agent's CLI")
    try "#!/bin/sh\nprintf '%s\\0' \"$@\"\n".write(to: executable, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: executable.path)
    let id = "01900000-0000-7000-8000-000000000001"
    let settings = AgentSettings(model: "model's name", cliPath: "~/agent's CLI", arguments: #"--label "two words" --literal '$(echo expanded)' --empty ''"#)
    for source in AgentSettings.sources {
        for resumed in [false, true] {
            let session = resumed ? source == "opencode" ? "ses_demo" : "\(source):\(id)" : nil
            let launch = try #require(AgentLaunch.make(source: source, home: directory.path, inherited: ["ZDOTDIR": directory.path], sessionID: session, settings: settings, isExecutable: { _ in true }))
            let child = Process(), output = Pipe()
            child.executableURL = URL(fileURLWithPath: "/bin/zsh"); child.arguments = launch.arguments
            child.environment = launch.environment; child.standardOutput = output
            try child.run()
            let data = output.fileHandleForReading.readDataToEndOfFile(); child.waitUntilExit()
            #expect(child.terminationStatus == 0)
            let values = String(decoding: data, as: UTF8.self).split(separator: "\0", omittingEmptySubsequences: false).dropLast().map(String.init)
            var expected = source == "codex" ? ["-c", "tui.terminal_title=[\"session-id\"]"] : []
            if resumed { expected += source == "codex" ? ["resume", id] : source == "claude" ? ["--resume", id] : ["--session", "ses_demo"] }
            expected += ["--model", "model's name", "--label", "two words", "--literal", "$(echo expanded)", "--empty", ""]
            #expect(values == expected)
        }
    }
}
