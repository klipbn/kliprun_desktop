import AppKit
import SwiftUI
import WebKit

struct KlipRunWebView: NSViewRepresentable {
    let store: DesktopStore
    @ObservedObject var runtime: EngineRuntime

    func makeCoordinator() -> Coordinator { Coordinator(store: store) }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(context.coordinator, name: "sessionSelected")
        configuration.userContentController.add(context.coordinator, name: "sessionResume")
        configuration.userContentController.add(context.coordinator, name: "recentSessionsCollapsed")
        let collapsed = UserDefaults.standard.bool(forKey: "recentSessions.collapsed")
        configuration.userContentController.addUserScript(WKUserScript(source: "window.kliprunRecentSessionsCollapsed = \(collapsed);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.add(context.coordinator, name: "desktopAction")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.underPageBackgroundColor = NSColor(red: 13 / 255, green: 17 / 255, blue: 23 / 255, alpha: 1)
        webView.pageZoom = CGFloat(store.interfaceZoom.factor)
        webView.allowsBackForwardNavigationGestures = true
        store.webView = webView
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        webView.pageZoom = CGFloat(store.interfaceZoom.factor)
        guard let baseURL = runtime.baseURL, context.coordinator.loadedBaseURL != baseURL else { return }
        context.coordinator.loadedBaseURL = baseURL
        store.webDidStartLoading()
        var components = URLComponents(url: baseURL.appendingPathComponent("_desktop/auth"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "token", value: runtime.token)]
        webView.load(URLRequest(url: components.url!))
    }

    static func dismantleNSView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "sessionSelected")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "sessionResume")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "recentSessionsCollapsed")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "desktopAction")
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
    }

    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        let store: DesktopStore
        var loadedBaseURL: URL?

        init(store: DesktopStore) { self.store = store }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "sessionSelected" {
                store.selectWebSession(message.body as? String)
            } else if message.name == "sessionResume", let id = message.body as? String {
                store.resumeSession(id)
            } else if message.name == "recentSessionsCollapsed", let collapsed = message.body as? Bool {
                UserDefaults.standard.set(collapsed, forKey: "recentSessions.collapsed")
            } else if message.name == "desktopAction", let action = message.body as? String {
                switch action {
                case "new-opencode": store.launch(source: "opencode")
                case "new-codex": store.launch(source: "codex")
                case "show-terminal": store.toggleTerminal()
                case "open-iterm": store.openSelectedInITerm()
                case "notification-settings": store.showNotificationSettings()
                default: break
                }
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            store.webDidFinishLoading()
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = navigationAction.request.url else { return .cancel }
            if url.host == "127.0.0.1", url.port == loadedBaseURL?.port {
                return .allow
            } else if ["https", "http"].contains(url.scheme) {
                NSWorkspace.shared.open(url)
                return .cancel
            } else { return .cancel }
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url, ["https", "http"].contains(url.scheme), url.host != "127.0.0.1" {
                NSWorkspace.shared.open(url)
            }
            return nil
        }
    }
}
