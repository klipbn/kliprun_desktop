import AppKit
import SwiftUI

/// Foundation parses the Markdown; paragraph intents supply the layout that SwiftUI Text omits.
struct ReleaseNotesView: NSViewRepresentable {
    let markdown: String

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView()
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        let text = NSTextView()
        text.isEditable = false
        text.isSelectable = true
        text.drawsBackground = false
        text.textContainerInset = NSSize(width: 14, height: 12)
        text.isHorizontallyResizable = false
        text.isVerticallyResizable = true
        text.autoresizingMask = [.width]
        text.textContainer?.widthTracksTextView = true
        text.linkTextAttributes = [.foregroundColor: NSColor(srgbRed: 0.35, green: 0.65, blue: 1, alpha: 1)]
        scroll.documentView = text
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        guard let text = scroll.documentView as? NSTextView, context.coordinator.markdown != markdown else { return }
        context.coordinator.markdown = markdown
        text.textStorage?.setAttributedString(Self.render(markdown))
        text.setAccessibilityLabel("What's New")
    }

    func makeCoordinator() -> Coordinator { Coordinator() }
    final class Coordinator { var markdown: String? }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSScrollView, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? 480, height: proposal.height ?? 240)
    }

    static func render(_ markdown: String) -> NSAttributedString {
        let parsed = (try? AttributedString(markdown: markdown)) ?? AttributedString(markdown)
        let result = NSMutableAttributedString()
        var previousBlock: Int?
        var previousItem: Int?
        for run in parsed.runs {
            let components = run.presentationIntent?.components ?? []
            let block = components.first?.identity
            var size: CGFloat = 13
            var weight: NSFont.Weight = .regular
            var code = false
            var quote = false
            var listDepth = 0
            var item: Int?
            var ordinal: Int?
            var ordered = false
            for component in components {
                switch component.kind {
                case .header(let level): size = CGFloat(max(14, 24 - level * 2)); weight = .semibold
                case .codeBlock: code = true
                case .blockQuote: quote = true
                case .orderedList: if listDepth == 0 { ordered = true }; listDepth += 1
                case .unorderedList: listDepth += 1
                case .listItem(let number): if item == nil { item = component.identity; ordinal = number }
                default: break
                }
            }
            let paragraph = NSMutableParagraphStyle()
            paragraph.lineSpacing = 4
            paragraph.paragraphSpacing = listDepth > 0 ? 5 : 12
            paragraph.headIndent = CGFloat(listDepth * 20 + (quote ? 12 : 0))
            paragraph.firstLineHeadIndent = CGFloat(max(0, listDepth - 1) * 20 + (quote ? 12 : 0))
            if block != previousBlock && result.length > 0 { result.append(NSAttributedString(string: "\n")) }
            let inline = run.inlinePresentationIntent ?? []
            if inline.contains(.stronglyEmphasized) { weight = .bold }
            let mono = code || inline.contains(.code)
            var font = mono ? NSFont.monospacedSystemFont(ofSize: 12, weight: weight) : NSFont.systemFont(ofSize: size, weight: weight)
            if inline.contains(.emphasized) { font = NSFontManager.shared.convert(font, toHaveTrait: .italicFontMask) }
            var attributes: [NSAttributedString.Key: Any] = [
                .font: font, .paragraphStyle: paragraph,
                .foregroundColor: quote ? NSColor.secondaryLabelColor : NSColor(srgbRed: 0.90, green: 0.93, blue: 0.95, alpha: 1)
            ]
            if mono { attributes[.backgroundColor] = NSColor(srgbRed: 0.05, green: 0.07, blue: 0.09, alpha: 1) }
            if inline.contains(.strikethrough) { attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
            if let link = run.link, ["https", "http"].contains(link.scheme?.lowercased() ?? "") { attributes[.link] = link }
            if let item, item != previousItem {
                result.append(NSAttributedString(string: ordered ? "\(ordinal ?? 1). " : "• ", attributes: attributes))
            }
            result.append(NSAttributedString(string: String(parsed[run.range].characters), attributes: attributes))
            previousBlock = block
            previousItem = item
        }
        return result
    }
}
