import Foundation
import Testing
@testable import KlipRunCore

@Test func opencodeLaunchPreservesCredentialsAndFindsUserBinary() {
    let launch = AgentLaunch.make(source: "opencode", home: "/Users/test", inherited: ["PATH": "/usr/bin", "CODEX_HOME": "/private/codex"])
    #expect(launch?.arguments == ["-lic", "exec opencode"])
    #expect(launch?.environment["CODEX_HOME"] == "/private/codex")
    #expect(launch?.environment["PATH"]?.contains("/Users/test/.opencode/bin") == true)
    #expect(launch?.environment["TERM"] == "xterm-256color")
}

@Test func codexLaunchUsesConfiguredWrapperWhenAvailable() {
    let launch = AgentLaunch.make(source: "codex", home: "/Users/test", inherited: [:],
                                  isExecutable: { $0 == "/Users/test/.local/bin/codex-vk" })
    #expect(launch?.arguments == ["-lic", "exec codex-vk -c 'tui.terminal_title=[\"session-id\"]'"])
    #expect(AgentLaunch.make(source: "unknown", home: "/Users/test", inherited: [:]) == nil)
}

@Test func newTerminalStartsAnInteractiveShellWithTheInheritedEnvironment() {
    let launch = AgentLaunch.make(source: "terminal", home: "/Users/test", inherited: ["PATH": "/usr/bin", "MY_SETTING": "yes"])
    #expect(launch?.arguments == ["-l", "-i"])
    #expect(launch?.environment["MY_SETTING"] == "yes")
    #expect(launch?.environment["TERM"] == "xterm-256color")
}

@Test func embeddedTerminalsDoNotInheritTheLaunchersNoColorFlag() throws {
    let inherited = ["NO_COLOR": "1", "TERM": "dumb", "MY_SETTING": "preserved"]
    for source in ["terminal", "codex", "claude", "opencode"] {
        let launch = try #require(AgentLaunch.make(source: source, home: "/Users/test", inherited: inherited))
        #expect(launch.environment["NO_COLOR"] == nil)
        #expect(launch.environment["TERM"] == "xterm-256color")
        #expect(launch.environment["COLORTERM"] == "truecolor")
        #expect(launch.environment["MY_SETTING"] == "preserved")
    }
    for source in ["claude", "codex"] {
        let launch = try #require(AgentLaunch.workflow(source: source, argv: [source], promptFile: "/tmp/task.md", home: "/Users/test", inherited: inherited))
        #expect(launch.environment["NO_COLOR"] == nil)
        #expect(launch.environment["COLORTERM"] == "truecolor")
    }
}

@Test func resumeUsesTheOriginalHarnessAndExactSession() {
    let id = "01900000-0000-7000-8000-000000000001"
    let codex = AgentLaunch.make(source: "codex", home: "/Users/test", inherited: [:], sessionID: "codex:\(id)", isExecutable: { _ in true })
    #expect(codex?.arguments == ["-lic", "exec codex-vk -c 'tui.terminal_title=[\"session-id\"]' resume \(id)"])
    let opencode = AgentLaunch.make(source: "opencode", home: "/Users/test", inherited: [:], sessionID: "ses_abc-123")
    #expect(opencode?.arguments == ["-lic", "exec opencode --session ses_abc-123"])
}

@Test func resumeRejectsMismatchedOrUnsafeSessionIDs() {
    for (source, id) in [("codex", "ses_abc"), ("opencode", "ses_a;touch /tmp/oops"), ("terminal", "ses_a"), ("codex", "codex:--last"), ("claude", "codex:01900000-0000-7000-8000-000000000001"), ("claude", "claude:--continue")] {
        #expect(AgentLaunch.make(source: source, home: "/Users/test", inherited: [:], sessionID: id) == nil)
    }
}

@Test func claudeLaunchAndResumeUseTheExactSessionWithoutNestingAnotherAgent() {
    let environment = ["CLAUDECODE": "1", "CLAUDE_CODE_ENTRYPOINT": "cli", "ANTHROPIC_API_KEY": "test-credential", "CLAUDE_CONFIG_DIR": "/private/claude"]
    let launch = AgentLaunch.make(source: "claude", home: "/Users/test", inherited: environment)
    #expect(launch?.arguments == ["-lic", "exec claude"])
    #expect(launch?.environment["ANTHROPIC_API_KEY"] == "test-credential")
    #expect(launch?.environment["CLAUDE_CONFIG_DIR"] == "/private/claude")
    #expect(launch?.environment["CLAUDECODE"] == nil)
    let id = "01900000-0000-7000-8000-000000000001"
    let resume = AgentLaunch.make(source: "claude", home: "/Users/test", inherited: [:], sessionID: "claude:\(id)")
    #expect(resume?.arguments == ["-lic", "exec claude --resume \(id)"])
}
