import Testing
@testable import KlipRunCore

@Test func closeMenuUsesFocusedPaneRatherThanVisibleTerminal() {
    var state = DesktopMenuState()
    state.commands = [.closeFile, .closeDetails]
    #expect(state.closeTarget(focus: .web, settings: false, terminalVisible: true) == .file)
    #expect(state.closeTarget(focus: .terminal, settings: false, terminalVisible: true) == .terminal)
    #expect(state.closeTarget(focus: .web, settings: true, terminalVisible: true) == .settings)
    state.commands = [.closeDetails]
    #expect(state.closeTarget(focus: .web, settings: false, terminalVisible: true) == .details)
    state.commands = [.cancelDialog]
    #expect(state.closeTarget(focus: .web, settings: false, terminalVisible: true) == .dialog)
    state.commands = []
    #expect(state.closeTarget(focus: .web, settings: false, terminalVisible: true) == .window)
}

@Test func webMenuStateRejectsUnknownCommandsAndInvalidFocusFlags() {
    #expect(DesktopMenuState(message: ["commands": ["save-file", "undo"], "editorFocused": true])?.commands == [.saveFile, .undo])
    #expect(DesktopMenuState(message: ["commands": ["arbitrary-script"], "editorFocused": true]) == nil)
    #expect(DesktopMenuState(message: ["commands": [], "editorFocused": "yes"]) == nil)
}
