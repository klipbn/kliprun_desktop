import Testing
@testable import KlipRunCore

@Test func codexTitleIdentifiesTheChatWithoutTreatingOtherTitlesAsSessionEvidence() {
    #expect(TerminalTitle.codexSessionPrefix("01a145de-db2d-77c3-8e0c-7cdb9... ⠧") == "01a145de-db2d-77c3-8e0c-7cdb9")
    #expect(TerminalTitle.codexSessionPrefix("01900000-0000-7000-8000-000000000001") == "01900000-0000-7000-8000-000000000001")
    for value in ["", "project", "01900000", "message 01a145de-db2d-77c3-8e0c-7cdb9...", "01a145de-db2d-77c3-8e0c-7cdb9... fake"] {
        #expect(TerminalTitle.codexSessionPrefix(value) == nil)
    }
}

@Test func manualTerminalNameSurvivesAgentTitleChangesAndCanBeCleared() {
    var title = TerminalTitle(automatic: "Codex · project")
    title.rename("  My agent  ")
    #expect(title.display == "My agent")
    title.updateAutomatic("Codex: new task")
    #expect(title.display == "My agent")
    title.rename("   ")
    #expect(title.display == "Codex: new task")
    title.updateAutomatic("")
    #expect(title.display == "Codex: new task")
}
