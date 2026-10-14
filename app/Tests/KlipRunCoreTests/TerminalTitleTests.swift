import Testing
@testable import KlipRunCore

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
