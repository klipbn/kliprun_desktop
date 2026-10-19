import AppKit
import WebKit
import Testing
import KlipRunCore
@testable import KlipRunDesktop

@MainActor @Test func toolbarLabelActionPersistsAndReachesFreshWebDocuments() async throws {
    let suite = "local.kliprun.toolbar-bridge.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults)
    let coordinator = KlipRunWebView.Coordinator(store: store)
    let origin = URL(string: "http://127.0.0.1:18987")!
    coordinator.loadedBaseURL = origin
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.userContentController.add(coordinator, name: "desktopAction")
    configuration.userContentController.addUserScript(WKUserScript(source: store.preferences.webScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 980, height: 660), configuration: configuration)
    web.navigationDelegate = coordinator
    store.webView = web
    defer { configuration.userContentController.removeScriptMessageHandler(forName: "desktopAction") }

    func loadDocument(_ name: String, expanded: Bool) async throws {
        web.loadHTMLString("<html><body><script>window.toolbarTestDocument='\(name)';</script></body></html>", baseURL: origin)
        let ready = "window.toolbarTestDocument === '\(name)' && window.kliprunPreferences?.toolbarExpanded === \(expanded)"
        for _ in 0..<100 {
            if (try? await web.evaluateJavaScript(ready)) as? Bool == true { return }
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(try await web.evaluateJavaScript(ready) as? Bool == true)
    }

    try await loadDocument("initial", expanded: false)
    for expanded in [true, false] {
        _ = try await web.evaluateJavaScript("window.webkit.messageHandlers.desktopAction.postMessage('toggle-toolbar-labels'); true")
        for _ in 0..<100 {
            if store.preferences.toolbarExpanded == expanded { break }
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(store.preferences.toolbarExpanded == expanded)
        #expect(DesktopStore(defaults: defaults).preferences.toolbarExpanded == expanded)
        try await loadDocument(expanded ? "expanded" : "compact", expanded: expanded)
    }
}
