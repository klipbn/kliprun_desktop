import Testing
@testable import KlipRunCore

@Test func cardSelectionRemembersTabWithoutOpeningAClosedDock() {
    var dock = TerminalDockState()
    dock.show(1)
    dock.hide()
    dock.selectCard(2)
    #expect(dock.visibleID == nil)
    #expect(dock.preferredID == 2)
    let reopened = dock.toggle(availableIDs: [1, 2])
    #expect(reopened)
    #expect(dock.visibleID == 2)
}

@Test func openDockSwitchesToTheMatchingCardAndTopButtonTogglesIt() {
    var dock = TerminalDockState()
    dock.show(1)
    dock.selectCard(2)
    #expect(dock.visibleID == 2)
    dock.selectCard(nil)
    #expect(dock.visibleID == 2)
    let hidden = dock.toggle(availableIDs: [1, 2])
    #expect(hidden)
    #expect(dock.visibleID == nil)
    let shown = dock.toggle(availableIDs: [1, 2])
    #expect(shown)
    #expect(dock.visibleID == 2)
}

@Test func closingATabKeepsTheDockStatePredictable() {
    var dock = TerminalDockState()
    dock.show(1)
    dock.show(2)
    dock.remove(2, availableIDs: [1])
    #expect(dock.visibleID == 1)
    dock.hide()
    dock.remove(1, availableIDs: [])
    #expect(dock.visibleID == nil)
    #expect(dock.preferredID == nil)
}
