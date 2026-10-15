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
    #expect(launch?.arguments == ["-lic", "exec codex-vk"])
    #expect(AgentLaunch.make(source: "unknown", home: "/Users/test", inherited: [:]) == nil)
}

@Test func newTerminalStartsAnInteractiveShellWithTheInheritedEnvironment() {
    let launch = AgentLaunch.make(source: "terminal", home: "/Users/test", inherited: ["PATH": "/usr/bin", "MY_SETTING": "yes"])
    #expect(launch?.arguments == ["-l", "-i"])
    #expect(launch?.environment["MY_SETTING"] == "yes")
    #expect(launch?.environment["TERM"] == "xterm-256color")
}

@Test func resumeUsesTheOriginalHarnessAndExactSession() {
    let id = "01900000-0000-7000-8000-000000000001"
    let codex = AgentLaunch.make(source: "codex", home: "/Users/test", inherited: [:], sessionID: "codex:\(id)", isExecutable: { _ in true })
    #expect(codex?.arguments == ["-lic", "exec codex-vk resume \(id)"])
    let opencode = AgentLaunch.make(source: "opencode", home: "/Users/test", inherited: [:], sessionID: "ses_abc-123")
    #expect(opencode?.arguments == ["-lic", "exec opencode --session ses_abc-123"])
}

@Test func resumeRejectsMismatchedOrUnsafeSessionIDs() {
    for (source, id) in [("codex", "ses_abc"), ("opencode", "ses_a;touch /tmp/oops"), ("terminal", "ses_a"), ("codex", "codex:--last")] {
        #expect(AgentLaunch.make(source: source, home: "/Users/test", inherited: [:], sessionID: id) == nil)
    }
}
