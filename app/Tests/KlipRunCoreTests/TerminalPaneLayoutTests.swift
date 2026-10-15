import Testing
@testable import KlipRunCore

@Test func terminalHeightStaysUsableAndCanFillTheWindow() {
    #expect(TerminalPaneLayout.height(preferred: 330, available: 800, expanded: false) == 330)
    #expect(TerminalPaneLayout.height(preferred: 50, available: 800, expanded: false) == 220)
    #expect(TerminalPaneLayout.height(preferred: 700, available: 660, expanded: false) == 480)
    #expect(TerminalPaneLayout.height(preferred: 330, available: 800, expanded: true) == 800)
    #expect(TerminalPaneLayout.dragged(start: 330, translationY: -120, available: 800) == 450)
}

@Test func leftTerminalWidthPreservesRoomForTheDashboardAndCanExpand() {
    #expect(TerminalPaneLayout.width(preferred: 460, available: 1440, expanded: false) == 460)
    #expect(TerminalPaneLayout.width(preferred: 100, available: 980, expanded: false) == 360)
    #expect(TerminalPaneLayout.width(preferred: 900, available: 980, expanded: false) == 460)
    #expect(TerminalPaneLayout.width(preferred: .nan, available: 1440, expanded: false) == 460)
    #expect(TerminalPaneLayout.width(preferred: 460, available: 1440, expanded: true) == 1440)
    #expect(TerminalPaneLayout.width(preferred: 460, available: 200, expanded: false) == 200)
    #expect(TerminalPaneLayout.width(preferred: 460, available: -1, expanded: false) == 0)
}
