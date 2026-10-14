import SwiftUI
import KlipRunCore

struct TerminalResizeHandle: NSViewRepresentable {
    let onDrag: (CGFloat) -> Void
    let onEnd: () -> Void

    func makeNSView(context: Context) -> TerminalResizeHandleView {
        let view = TerminalResizeHandleView(frame: .zero)
        view.onDrag = onDrag
        view.onEnd = onEnd
        return view
    }

    func updateNSView(_ view: TerminalResizeHandleView, context: Context) {
        view.onDrag = onDrag
        view.onEnd = onEnd
    }
}
