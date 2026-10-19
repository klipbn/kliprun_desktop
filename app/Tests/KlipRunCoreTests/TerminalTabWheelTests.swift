import AppKit
import SwiftUI
import Testing
@testable import KlipRunDesktop

@MainActor private func tabWheel(vertical: Int32, horizontal: Int32 = 0, precise: Bool = false, flags: CGEventFlags = []) throws -> NSEvent {
    let event = try #require(CGEvent(scrollWheelEvent2Source: nil, units: precise ? .pixel : .line,
                                    wheelCount: 2, wheel1: vertical, wheel2: horizontal, wheel3: 0))
    event.flags = flags
    return try #require(NSEvent(cgEvent: event))
}

@MainActor @Test func terminalTabWheelMovesHorizontallyAndClampsAtBothEnds() throws {
    let scroll = NSScrollView(frame: NSRect(x: 0, y: 0, width: 300, height: 36))
    scroll.hasHorizontalScroller = true
    scroll.horizontalLineScroll = 30
    let document = NSView(frame: NSRect(x: 0, y: 0, width: 1400, height: 28))
    let bridge = TerminalTabWheelScrollView(frame: document.bounds)
    document.addSubview(bridge); scroll.documentView = document
    #expect(bridge.enclosingScrollView === scroll)
    #expect(bridge.handleScrollWheel(try tabWheel(vertical: -2)))
    let right = scroll.contentView.bounds.minX
    #expect(right > 0)
    #expect(bridge.handleScrollWheel(try tabWheel(vertical: 1)))
    #expect(scroll.contentView.bounds.minX < right)
    _ = bridge.handleScrollWheel(try tabWheel(vertical: 10_000))
    #expect(scroll.contentView.bounds.minX == 0)
    _ = bridge.handleScrollWheel(try tabWheel(vertical: -10_000))
    let maximum = scroll.contentView.documentRect.maxX - scroll.contentView.bounds.width
    #expect(abs(scroll.contentView.bounds.minX - maximum) < 1)
    #expect(scroll.contentView.bounds.minY == 0)
}

@MainActor @Test func terminalTabWheelPreservesHorizontalInputAndModifiersAndUsesPrecisePixels() throws {
    let scroll = NSScrollView(frame: NSRect(x: 0, y: 0, width: 300, height: 36))
    scroll.documentView = NSView(frame: NSRect(x: 0, y: 0, width: 1400, height: 28))
    let bridge = TerminalTabWheelScrollView(frame: NSRect(x: 0, y: 0, width: 1400, height: 28))
    scroll.documentView?.addSubview(bridge)
    for event in [try tabWheel(vertical: 0), try tabWheel(vertical: -2, horizontal: -1),
                  try tabWheel(vertical: 0, horizontal: -15, precise: true),
                  try tabWheel(vertical: -2, flags: .maskShift), try tabWheel(vertical: -2, flags: .maskCommand)] {
        #expect(!bridge.handleScrollWheel(event))
        #expect(scroll.contentView.bounds.minX == 0)
    }
    #expect(bridge.handleScrollWheel(try tabWheel(vertical: -17, precise: true)))
    #expect(abs(scroll.contentView.bounds.minX - 17) < 1)
    #expect(bridge.hitTest(NSPoint(x: 5, y: 5)) == nil)
}

@MainActor @Test func terminalTabWheelBridgeAttachesToTheExistingSwiftUIScrollView() async throws {
    let host = NSHostingView(rootView: ScrollView(.horizontal, showsIndicators: false) {
        HStack { ForEach(0..<20) { number in Text("Terminal \(number)").frame(width: 100, height: 28) } }
            .background(TerminalTabWheelScroll())
    })
    let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 400, height: 60), styleMask: [.titled], backing: .buffered, defer: false)
    window.contentView = host
    host.layoutSubtreeIfNeeded()
    defer { window.orderOut(nil) }
    func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
    for _ in 0..<50 where !descendants(host).contains(where: { $0 is TerminalTabWheelScrollView }) {
        try await Task.sleep(for: .milliseconds(20)); host.layoutSubtreeIfNeeded()
    }
    let bridge = try #require(descendants(host).compactMap { $0 as? TerminalTabWheelScrollView }.first)
    let scroll = try #require(bridge.enclosingScrollView)
    #expect(bridge.handleScrollWheel(try tabWheel(vertical: -3)))
    #expect(scroll.contentView.bounds.minX > 0)
    window.setContentSize(NSSize(width: 240, height: 60)); host.layoutSubtreeIfNeeded()
    #expect(bridge.handleScrollWheel(try tabWheel(vertical: -3)))
    #expect(scroll.contentView.bounds.minX > 0)
}
