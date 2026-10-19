import AppKit
import WebKit
import Testing
import KlipRunCore
@testable import KlipRunDesktop

@MainActor @Test func usageProviderSelectionReachesLiveAndReloadedWebViewsBeforeStartupRequests() async throws {
    let suite = "local.kliprun.usage-bridge.\(UUID().uuidString)", defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults)
    let coordinator = KlipRunWebView.Coordinator(store: store)
    let origin = URL(string: "http://127.0.0.1:18987")!
    coordinator.loadedBaseURL = origin
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.userContentController.addUserScript(WKUserScript(source: store.preferences.webScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    configuration.userContentController.addUserScript(WKUserScript(source: "window.keepInjectedScript=true", injectionTime: .atDocumentStart, forMainFrameOnly: true))
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 600), configuration: configuration)
    web.navigationDelegate = coordinator; store.webView = web
    func load(_ name: String) async throws {
        web.loadHTMLString("<html><script>window.initialUsageProviders=window.kliprunPreferences.usageProviders;window.usageDocument='\(name)'</script></html>", baseURL: origin)
        for _ in 0..<100 {
            if (try? await web.evaluateJavaScript("window.usageDocument")) as? String == name { return }
            try await Task.sleep(for: .milliseconds(20))
        }
        Issue.record("Web document did not load")
    }
    try await load("initial")
    store.updatePreferences {
        $0.usageProviderOrder = ["claude", "codex", "openai", "zai", "kimi"]
        $0.usageEnabledProviders = ["claude", "codex"]
    }
    #expect(try await web.evaluateJavaScript("window.kliprunPreferences.usageProviders") as? [String] == ["claude", "codex"])
    try await load("reloaded")
    #expect(try await web.evaluateJavaScript("window.initialUsageProviders") as? [String] == ["claude", "codex"])
    #expect(try await web.evaluateJavaScript("window.keepInjectedScript") as? Bool == true)
    store.updatePreferences { $0.usageEnabledProviders = [] }
    try await load("disabled")
    #expect(try await web.evaluateJavaScript("window.initialUsageProviders") as? [String] == [])
}
