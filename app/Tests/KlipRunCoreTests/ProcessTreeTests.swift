import Testing
@testable import KlipRunCore

@Test func terminalOwnsItsExecedOrDescendantAgentProcess() {
    let parents = ProcessTree.parents(from: "100 1\n101 100\n102 101\n200 1\n")
    #expect(ProcessTree.owns(pid: 100, terminalPID: 100, parents: parents))
    #expect(ProcessTree.owns(pid: 102, terminalPID: 100, parents: parents))
    #expect(!ProcessTree.owns(pid: 200, terminalPID: 100, parents: parents))
}

@Test func quitGuardCountsTerminalAttachedChildrenEvenWithoutTabState() {
    let output = "100 42 ttys006 opencode\n101 42 ?? bun run server\n102 42 ttys007 node codex\n103 77 ttys008 opencode\n"
    #expect(ProcessTree.terminalChildren(of: 42, in: output) == 2)
}
