import Testing
@testable import KlipRunCore

@Test func zoomUsesBrowserStyleStepsAndBounds() {
    var zoom = InterfaceZoom(percent: 100)
    zoom.increase()
    #expect(zoom.percent == 110)
    zoom.decrease()
    #expect(zoom.percent == 100)
    zoom.reset()
    #expect(zoom.factor == 1)
    for _ in 0..<20 { zoom.decrease() }
    #expect(zoom.percent == 70)
    for _ in 0..<20 { zoom.increase() }
    #expect(zoom.percent == 200)
    #expect(InterfaceZoom(percent: 250).percent == 200)
}
