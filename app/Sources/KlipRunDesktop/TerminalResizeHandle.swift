import SwiftUI
import KlipRunCore

struct TerminalResizeHandle: NSViewRepresentable {
    var axis: TerminalResizeHandleView.Axis = .vertical
    let onDrag: (CGFloat) -> Void
    let onEnd: () -> Void

    func makeNSView(context: Context) -> TerminalResizeHandleView {
        let view = TerminalResizeHandleView(frame: .zero)
        view.axis = axis
        view.onDrag = onDrag
        view.onEnd = onEnd
        return view
    }

    func updateNSView(_ view: TerminalResizeHandleView, context: Context) {
        view.axis = axis
        view.onDrag = onDrag
        view.onEnd = onEnd
    }
}
