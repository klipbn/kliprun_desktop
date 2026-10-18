import AppKit
import WebKit
import Testing
@testable import KlipRunDesktop

@MainActor @Test func nativeStartupNavigationDoesNotNeedASourceFrame() {
    let coordinator = KlipRunWebView.Coordinator(store: DesktopStore())
    coordinator.loadedBaseURL = URL(string: "http://127.0.0.1:18993")!
    let auth = URL(string: "http://127.0.0.1:18993/_desktop/auth")!
    #expect(coordinator.permitsEngineNavigation(to: auth, targetIsMainFrame: true))
    #expect(coordinator.permitsEngineNavigation(to: auth, targetIsMainFrame: nil))
    #expect(!coordinator.permitsEngineNavigation(to: auth, targetIsMainFrame: false))
    #expect(!coordinator.permitsEngineNavigation(to: URL(string: "http://127.0.0.1:18994/")!, targetIsMainFrame: true))
    #expect(!coordinator.permitsEngineNavigation(to: URL(string: "https://127.0.0.1:18993/")!, targetIsMainFrame: true))
}

@MainActor @Test func webViewCanLoadTheEngineAndItsAuthenticationRedirectFromANativeRequest() async throws {
    let server = Process()
    server.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    server.arguments = ["bun", "-e", """
      const server = Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
        if(new URL(request.url).pathname === '/_desktop/auth') return new Response(null,{status:302,headers:{Location:'/', 'Set-Cookie':'test_auth=yes; HttpOnly; SameSite=Strict; Path=/'}});
        return new Response(request.headers.get('cookie')?.includes('test_auth=yes') ? '<html><body><h1 id="ready">Ready</h1></body></html>' : 'Unauthorized',{headers:{'Content-Type':'text/html'}});
      }}); console.log(server.port);
      """]
    let output = Pipe(); server.standardOutput = output; server.standardError = Pipe()
    try server.run()
    defer { if server.isRunning { server.terminate() }; server.waitUntilExit() }
    let line = String(decoding: output.fileHandleForReading.availableData, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
    let port = try #require(Int(line))
    let suite = "local.kliprun.navigation.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let coordinator = KlipRunWebView.Coordinator(store: DesktopStore(defaults: defaults))
    let base = URL(string: "http://127.0.0.1:\(port)")!
    coordinator.loadedBaseURL = base
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 640, height: 400), configuration: configuration)
    web.navigationDelegate = coordinator
    defer { web.stopLoading() }
    web.load(URLRequest(url: base.appendingPathComponent("_desktop/auth")))
    for _ in 0..<150 {
        if (try? await web.evaluateJavaScript("document.getElementById('ready')?.textContent")) as? String == "Ready" { break }
        try await Task.sleep(for: .milliseconds(20))
    }
    #expect(try await web.evaluateJavaScript("document.getElementById('ready')?.textContent") as? String == "Ready")
}

@MainActor @Test func htmlPreviewCannotSelectSessionsThroughTheNativeBridge() async throws {
    let suite = "local.kliprun.html-preview.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults)
    let coordinator = KlipRunWebView.Coordinator(store: store)
    coordinator.loadedBaseURL = URL(string: "http://127.0.0.1:18993")!
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.userContentController.add(coordinator, name: "sessionSelected")
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 640, height: 400), configuration: configuration)
    defer { web.stopLoading(); configuration.userContentController.removeScriptMessageHandler(forName: "sessionSelected") }
    web.loadHTMLString("""
      <script>
        window.ready = false;
        addEventListener('message', event => { if(event.data === 'child ready') window.ready = true; });
        webkit.messageHandlers.sessionSelected.postMessage('ses_main');
      </script>
      <iframe sandbox="allow-scripts" srcdoc="<script>webkit.messageHandlers.sessionSelected.postMessage('ses_untrusted');parent.postMessage('child ready','*')</script>"></iframe>
      """, baseURL: coordinator.loadedBaseURL)
    for _ in 0..<150 {
        if (try? await web.evaluateJavaScript("window.ready")) as? Bool == true { break }
        try await Task.sleep(for: .milliseconds(20))
    }
    #expect(try await web.evaluateJavaScript("window.ready") as? Bool == true)
    #expect(store.selectedID == "ses_main")

    web.navigationDelegate = coordinator
    web.uiDelegate = coordinator
    try await web.evaluateJavaScript("""
      window.policyReady = false;
      addEventListener('message', event => { if(event.data === 'policy ready') window.policyReady = true; });
      const frame = document.createElement('iframe');
      frame.sandbox = 'allow-scripts';
      frame.srcdoc = "<script>parent.postMessage('policy ready','*')</script>";
      document.body.appendChild(frame);
      void 0;
      """)
    for _ in 0..<150 {
        if (try? await web.evaluateJavaScript("window.policyReady")) as? Bool == true { break }
        try await Task.sleep(for: .milliseconds(20))
    }
    #expect(try await web.evaluateJavaScript("window.policyReady") as? Bool == true)
}
