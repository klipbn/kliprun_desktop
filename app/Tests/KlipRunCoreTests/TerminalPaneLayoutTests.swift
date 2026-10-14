import Testing
@testable import KlipRunCore

@Test func terminalHeightStaysUsableAndCanFillTheWindow() {
    #expect(TerminalPaneLayout.height(preferred: 330, available: 800, expanded: false) == 330)
    #expect(TerminalPaneLayout.height(preferred: 50, available: 800, expanded: false) == 220)
    #expect(TerminalPaneLayout.height(preferred: 700, available: 660, expanded: false) == 480)
    #expect(TerminalPaneLayout.height(preferred: 330, available: 800, expanded: true) == 800)
    #expect(TerminalPaneLayout.dragged(start: 330, translationY: -120, available: 800) == 450)
}
