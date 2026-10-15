import AppKit
import Testing
@testable import SwiftTerm

@MainActor private final class ScrollOutput: TerminalViewDelegate {
    var writes: [[UInt8]] = []
    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {}
    func setTerminalTitle(source: TerminalView, title: String) {}
    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}
    func send(source: TerminalView, data: ArraySlice<UInt8>) { writes.append(Array(data)) }
    func scrolled(source: TerminalView, position: Double) {}
    func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
}

@MainActor @Test func smoothScrollingHasAnIndependentSpeed() async throws {
    let view = TerminalView(frame: CGRect(x: 0, y: 0, width: 400, height: 200))
    let output = ScrollOutput()
    view.terminalDelegate = output
    view.feed(text: "\u{1b}[?1000h")
    view.scrollSensitivity = 10
    view.preciseScrollSensitivity = 1
    let height = try #require(view.cellDimension?.height)
    let cg = try #require(CGEvent(scrollWheelEvent2Source: nil, units: .pixel,
                                 wheelCount: 1, wheel1: Int32(ceil(height * 2)), wheel2: 0, wheel3: 0))
    cg.location = CGPoint(x: 10, y: 10)
    view.scrollWheel(with: try #require(NSEvent(cgEvent: cg)))
    await withCheckedContinuation { continuation in DispatchQueue.main.async { continuation.resume() } }
    #expect(output.writes.count == 2)
}

@Test func fasterWheelStillBoundsBurstsAndRefillsByTime() {
    var budget = WheelReportBudget(nowNanoseconds: 0, maximumBurst: 10)
    #expect(budget.grant(50, nowNanoseconds: 0) == 10)
    #expect(budget.grant(50, nowNanoseconds: 0) == 0)
    #expect(budget.grant(50, nowNanoseconds: 10_000_000) == 1)
    #expect(budget.grant(50, nowNanoseconds: 1_000_000_000) == 10)
}

@MainActor @Test func wheelSpeedAlsoScalesLocalScrollback() throws {
    let view = TerminalView(frame: CGRect(x: 0, y: 0, width: 400, height: 200))
    view.feed(text: (0..<400).map { "line \($0)\r\n" }.joined())
    let cg = try #require(CGEvent(scrollWheelEvent2Source: nil, units: .line,
                                 wheelCount: 1, wheel1: 1, wheel2: 0, wheel3: 0))
    let event = try #require(NSEvent(cgEvent: cg))
    let start = view.terminal.displayBuffer.yDisp
    view.scrollSensitivity = 1
    view.scrollWheel(with: event)
    let atNormal = view.terminal.displayBuffer.yDisp
    view.scrollSensitivity = 5
    view.scrollWheel(with: event)
    let atFast = view.terminal.displayBuffer.yDisp
    #expect(start > atNormal)
    #expect(atNormal - atFast == 5 * (start - atNormal))
}

@MainActor @Test func wheelSpeedChangesReportsReceivedByTheAgent() async throws {
    let view = TerminalView(frame: CGRect(x: 0, y: 0, width: 400, height: 200))
    let output = ScrollOutput()
    view.terminalDelegate = output
    view.feed(text: "\u{1b}[?1000h")
    for speed in [1, 5, 10] {
        view.scrollSensitivity = CGFloat(speed)
        for direction: Int32 in [1, -1] {
            try await Task.sleep(for: .milliseconds(120))
            output.writes = []
            let cg = try #require(CGEvent(scrollWheelEvent2Source: nil, units: .line,
                                         wheelCount: 1, wheel1: direction, wheel2: 0, wheel3: 0))
            cg.location = CGPoint(x: 10, y: 10)
            view.scrollWheel(with: try #require(NSEvent(cgEvent: cg)))
            await withCheckedContinuation { continuation in
                DispatchQueue.main.async { continuation.resume() }
            }
            #expect(output.writes.count == speed)
            #expect(output.writes.allSatisfy { $0 == output.writes.first })
        }
    }
}
