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
