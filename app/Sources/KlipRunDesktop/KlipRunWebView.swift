import AppKit
import SwiftUI
import WebKit
import UniformTypeIdentifiers
import KlipRunCore

struct KlipRunWebView: NSViewRepresentable {
    let store: DesktopStore
    @ObservedObject var runtime: EngineRuntime

    func makeCoordinator() -> Coordinator { Coordinator(store: store) }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(context.coordinator, name: "sessionSelected")
        configuration.userContentController.add(context.coordinator, name: "sessionResume")
        configuration.userContentController.add(context.coordinator, name: "menuState")
        configuration.userContentController.add(context.coordinator, name: "sessionWorkspace")
        configuration.userContentController.addUserScript(WKUserScript(source: SessionWorkspace().webScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.add(context.coordinator, name: "officePreferences")
        configuration.userContentController.addUserScript(WKUserScript(source: OfficePreferences().webScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.add(context.coordinator, name: "cardOrder")
        configuration.userContentController.addUserScript(WKUserScript(source: SessionOrder().webScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.add(context.coordinator, name: "cardPriorities")
        configuration.userContentController.addUserScript(WKUserScript(source: SessionPriorities().webScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.addUserScript(WKUserScript(source: store.preferences.webScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.addUserScript(WKUserScript(source: AppUpdater.webScript(version: store.updater.availableVersion), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.add(context.coordinator, name: "desktopAction")
        configuration.userContentController.add(context.coordinator, name: "exportStatistics")
        configuration.userContentController.add(context.coordinator, name: "gitRepository")
        configuration.userContentController.add(context.coordinator, name: "gitWorkspace")
        configuration.userContentController.addUserScript(WKUserScript(source: GitWorkspace().webScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.add(context.coordinator, name: "repositoryFile")
        if let repository = UserDefaults.standard.string(forKey: "git.repository"),
           let data = try? JSONEncoder().encode(repository), let literal = String(data: data, encoding: .utf8) {
            configuration.userContentController.addUserScript(WKUserScript(source: "window.kliprunGitRepository = \(literal);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
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
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "menuState")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "sessionWorkspace")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "officePreferences")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "cardOrder")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "cardPriorities")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "desktopAction")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "exportStatistics")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "gitRepository")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "gitWorkspace")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "repositoryFile")
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
    }

    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        let store: DesktopStore
        var loadedBaseURL: URL?
        private var exportPanel: NSSavePanel?

        init(store: DesktopStore) { self.store = store }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == loadedBaseURL?.scheme,
                  message.frameInfo.securityOrigin.host == "127.0.0.1",
                  message.frameInfo.securityOrigin.port == loadedBaseURL?.port else { return }
            if message.name == "menuState",
               message.frameInfo.isMainFrame,
               message.frameInfo.securityOrigin.host == "127.0.0.1",
               message.frameInfo.securityOrigin.port == loadedBaseURL?.port,
               let body = message.body as? [String: Any], let state = DesktopMenuState(message: body) {
                store.menu.webState = state
                store.menu.updateFocus()
            } else if message.name == "exportStatistics",
               message.frameInfo.isMainFrame,
               message.frameInfo.securityOrigin.host == "127.0.0.1",
               message.frameInfo.securityOrigin.port == loadedBaseURL?.port,
               let body = message.body as? [String: String],
               let filename = body["filename"], let content = body["content"],
               let request = StatisticsExport(filename: filename, content: content) {
                saveStatistics(request, webView: message.webView)
            } else if message.name == "repositoryFile",
                      message.frameInfo.isMainFrame,
                      message.frameInfo.securityOrigin.host == "127.0.0.1",
                      message.frameInfo.securityOrigin.port == loadedBaseURL?.port,
                      let body = message.body as? [String: String],
                      let action = body["action"], ["reveal", "open", "copy"].contains(action),
                      let path = body["path"], !path.isEmpty,
                      path.utf8.count <= 4096, !path.utf8.contains(0) {
                if action == "copy" {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(path, forType: .string)
                } else if path.hasPrefix("/"), FileManager.default.fileExists(atPath: path) {
                    let url = URL(fileURLWithPath: path)
                    if action == "reveal" { NSWorkspace.shared.activateFileViewerSelecting([url]) }
                    else { NSWorkspace.shared.open(url) }
                }
            } else if message.name == "gitRepository",
                      message.frameInfo.isMainFrame,
                      message.frameInfo.securityOrigin.host == "127.0.0.1",
                      message.frameInfo.securityOrigin.port == loadedBaseURL?.port,
                      let directory = message.body as? String,
                      directory.hasPrefix("/"), directory.utf8.count <= 4096, !directory.utf8.contains(0),
                      let data = try? JSONEncoder().encode(directory), let literal = String(data: data, encoding: .utf8) {
                UserDefaults.standard.set(directory, forKey: "git.repository")
                let scripts = userContentController.userScripts.filter { !$0.source.hasPrefix("window.kliprunGitRepository = ") }
                userContentController.removeAllUserScripts()
                scripts.forEach(userContentController.addUserScript)
                userContentController.addUserScript(WKUserScript(source: "window.kliprunGitRepository = \(literal);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
            } else if message.name == "gitWorkspace",
                      let body = message.body as? [String: Any], GitWorkspace().set(body) {
                let scripts = userContentController.userScripts.filter { !$0.source.hasPrefix("window.kliprunGitWorkspace = ") }
                userContentController.removeAllUserScripts()
                scripts.forEach(userContentController.addUserScript)
                userContentController.addUserScript(WKUserScript(source: GitWorkspace().webScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            } else if message.name == "officePreferences",
                      message.frameInfo.isMainFrame,
                      message.frameInfo.securityOrigin.host == "127.0.0.1",
                      message.frameInfo.securityOrigin.port == loadedBaseURL?.port,
                      let body = message.body as? [String: Any],
                      let preferences = OfficePreferences(message: body) {
                preferences.save()
                let scripts = userContentController.userScripts.filter { !$0.source.hasPrefix("window.kliprunOfficePreferences = ") }
                userContentController.removeAllUserScripts()
                scripts.forEach(userContentController.addUserScript)
                userContentController.addUserScript(WKUserScript(source: preferences.webScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            } else if message.name == "cardOrder",
                      message.frameInfo.isMainFrame,
                      message.frameInfo.securityOrigin.host == "127.0.0.1",
                      message.frameInfo.securityOrigin.port == loadedBaseURL?.port,
                      let order = message.body as? [String: [String]],
                      SessionOrder().set(order) {
                let scripts = userContentController.userScripts.filter { !$0.source.hasPrefix("window.kliprunCardOrder = ") }
                userContentController.removeAllUserScripts()
                scripts.forEach(userContentController.addUserScript)
                userContentController.addUserScript(WKUserScript(source: SessionOrder().webScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            } else if message.name == "cardPriorities",
                      message.frameInfo.isMainFrame,
                      message.frameInfo.securityOrigin.host == "127.0.0.1",
                      message.frameInfo.securityOrigin.port == loadedBaseURL?.port,
                      let priorities = message.body as? [String: String],
                      SessionPriorities().set(priorities) {
                // Reloads must receive the latest values, not the initial snapshot.
                let scripts = userContentController.userScripts.filter { !$0.source.hasPrefix("window.kliprunCardPriorities = ") }
                userContentController.removeAllUserScripts()
                scripts.forEach(userContentController.addUserScript)
                userContentController.addUserScript(WKUserScript(source: SessionPriorities().webScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            } else if message.name == "sessionSelected" {
                store.selectWebSession(message.body as? String)
            } else if message.name == "sessionResume", let id = message.body as? String {
                store.resumeSession(id)
            } else if message.name == "sessionWorkspace",
                      message.frameInfo.isMainFrame,
                      message.frameInfo.securityOrigin.host == "127.0.0.1",
                      message.frameInfo.securityOrigin.port == loadedBaseURL?.port,
                      let body = message.body as? [String: Any], SessionWorkspace().set(body) {
                let scripts = userContentController.userScripts.filter { !$0.source.hasPrefix("window.kliprunSessionWorkspace = ") }
                userContentController.removeAllUserScripts()
                scripts.forEach(userContentController.addUserScript)
                userContentController.addUserScript(WKUserScript(source: SessionWorkspace().webScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            } else if message.name == "desktopAction",
                      message.frameInfo.isMainFrame,
                      message.frameInfo.securityOrigin.host == "127.0.0.1",
                      message.frameInfo.securityOrigin.port == loadedBaseURL?.port,
                      let action = message.body as? String {
                switch action {
                case "new-opencode": store.launch(source: "opencode")
                case "new-codex": store.launch(source: "codex")
                case "new-claude": store.launch(source: "claude")
                case "show-terminal": store.toggleTerminal()
                case "open-iterm": store.openSelectedInITerm()
                case "settings": store.showSettings()
                case "check-updates": store.checkForUpdates()
                case "open-repository": store.openRepository()
                default: break
                }
            }
        }

        private func saveStatistics(_ request: StatisticsExport, webView: WKWebView?) {
            guard exportPanel == nil else { return }
            let panel = NSSavePanel()
            panel.nameFieldStringValue = request.filename
            panel.allowedContentTypes = [.commaSeparatedText]
            panel.message = "Save daily token usage for the selected filters."
            exportPanel = panel
            let completion: (NSApplication.ModalResponse) -> Void = { [weak self] response in
                self?.exportPanel = nil
                guard response == .OK, let url = panel.url else { return }
                do { try request.data.write(to: url, options: .atomic) }
                catch { NSAlert(error: error).runModal() }
            }
            if let window = webView?.window { panel.beginSheetModal(for: window, completionHandler: completion) }
            else { panel.begin(completionHandler: completion) }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            store.webDidFinishLoading()
        }

        func permitsEngineNavigation(to url: URL, targetIsMainFrame: Bool?) -> Bool {
            targetIsMainFrame != false && url.scheme == loadedBaseURL?.scheme &&
                url.host == "127.0.0.1" && url.port == loadedBaseURL?.port
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = navigationAction.request.url else { return .cancel }
            // Native initial loads have no source frame; trust only the main engine origin.
            if permitsEngineNavigation(to: url, targetIsMainFrame: navigationAction.targetFrame?.isMainFrame) { return .allow }
            if navigationAction.targetFrame?.isMainFrame == false {
                let document = url.absoluteString.split(separator: "#", maxSplits: 1).first
                return document == "about:srcdoc" || document == "about:blank" ? .allow : .cancel
            }
            guard navigationAction.sourceFrame.isMainFrame else { return .cancel }
            if ["https", "http"].contains(url.scheme) {
                NSWorkspace.shared.open(url)
                return .cancel
            } else { return .cancel }
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            guard navigationAction.sourceFrame.isMainFrame else { return nil }
            if let url = navigationAction.request.url, ["https", "http"].contains(url.scheme), url.host != "127.0.0.1" {
                NSWorkspace.shared.open(url)
            }
            return nil
        }
    }
}
