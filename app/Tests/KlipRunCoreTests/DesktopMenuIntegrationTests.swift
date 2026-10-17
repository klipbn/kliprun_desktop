import AppKit
import WebKit
import Testing
import KlipRunCore
@testable import KlipRunDesktop

@MainActor @Test func nativeMenusRouteWebCommandsAndKeepTextFieldUndoNative() async throws {
    let suite = "local.kliprun.menus.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults)
    let container = NSView(frame: NSRect(x: 0, y: 0, width: 640, height: 400))
    let web = WKWebView(frame: NSRect(x: 0, y: 70, width: 640, height: 330))
    let field = NSTextField(frame: NSRect(x: 20, y: 20, width: 300, height: 24))
    container.addSubview(web); container.addSubview(field); store.webView = web
    let window = NSWindow(contentRect: container.bounds, styleMask: [.titled], backing: .buffered, defer: false)
    window.contentView = container; window.makeKeyAndOrderFront(nil)
    defer { window.orderOut(nil) }
    web.loadHTMLString("<html><body><input aria-label='Example'><script>window.received=[];window.addEventListener('kliprun:menu-command',e=>window.received.push(e.detail));</script></body></html>", baseURL: nil)
    for _ in 0..<100 {
        if (try? await web.evaluateJavaScript("Array.isArray(window.received)")) as? Bool == true { break }
        try await Task.sleep(for: .milliseconds(20))
    }
    window.makeKeyAndOrderFront(nil); window.makeFirstResponder(web)
    store.menu.webState.commands = [.saveFile, .undo, .closeFile]
    store.menu.webState.editorFocused = true
    store.menu.updateFocus()
    #expect(store.menu.focus == .web)
    #expect(store.menu.closeTarget == .file)
    store.menu.run(.saveFile); store.menu.undo()
    let actions = try await web.evaluateJavaScript("window.received") as? [String]
    #expect(actions == ["save-file", "undo"])
    window.makeKeyAndOrderFront(nil); window.makeFirstResponder(field)
    let editor = try #require(window.firstResponder as? NSTextView)
    editor.allowsUndo = true
    editor.insertText("menu text", replacementRange: NSRange(location: 0, length: 0))
    store.menu.updateFocus()
    #expect(store.menu.focus == .native)
    #expect(store.menu.canUndo)
    store.menu.undo()
    #expect(editor.string.isEmpty)
    #expect(try await web.evaluateJavaScript("window.received.length") as? Int == 2)
    store.showingSettings = true
    store.menu.closeActive()
    #expect(!store.showingSettings)
    #expect(window.isVisible)
}
