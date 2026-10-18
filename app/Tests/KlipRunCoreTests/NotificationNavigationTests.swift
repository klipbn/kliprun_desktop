import AppKit
import WebKit
import Testing
import KlipRunCore
@testable import KlipRunDesktop

@MainActor @Test(arguments: ["/office", "/sessions", "/", "/git"])
func notificationOpensSessionWithoutLeavingASessionView(path: String) async throws {
    let suite = "local.kliprun.notification-navigation.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults)
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 600, height: 400))
    store.webView = web
    web.loadHTMLString("""
        <html><script>
        window.opened = [];
        window.addEventListener('popstate', () => window.opened.push({
          path: location.pathname, id: new URLSearchParams(location.search).get('session')
        }));
        </script></html>
        """, baseURL: URL(string: "http://127.0.0.1:18796\(path)"))
    for _ in 0..<100 {
        if (try? await web.evaluateJavaScript("Array.isArray(window.opened)")) as? Bool == true { break }
        try await Task.sleep(for: .milliseconds(20))
    }
    #expect(try await web.evaluateJavaScript("Array.isArray(window.opened)") as? Bool == true)
    store.webDidFinishLoading()
    let ids = ["codex:00000000-0000-4000-8000-000000000001", "ses_demo_search"]
    let expectedPath = ["/office", "/sessions"].contains(path) ? path : "/"
    for (index, id) in ids.enumerated() {
        if index == 1 { store.webDidStartLoading() }
        store.openNotification(AgentNotification(sessionID: id, title: "Fictional session", kind: .input, revision: 1))
        #expect(store.selectedID == id)
        if index == 1 {
            #expect(try await web.evaluateJavaScript("window.opened.length") as? Int == 1)
            store.webDidFinishLoading()
        }
        let opened = try #require(try await web.evaluateJavaScript("window.opened") as? [[String: String]])
        #expect(opened.count == index + 1)
        #expect(opened.last?["path"] == expectedPath)
        #expect(opened.last?["id"] == id)
    }
}
