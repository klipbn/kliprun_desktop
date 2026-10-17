import Foundation
import Testing
import JavaScriptCore
import WebKit
import AppKit
import CryptoKit
import SwiftUI
@testable import KlipRunCore
@testable import KlipRunDesktop

@MainActor @Test func releaseNotesRenderHeadingsListsCodeAndLinksWithoutMarkdownMarkers() throws {
    let rendered = ReleaseNotesView.render("## Changes\n\n- **Readable** notes\n- Use `code`\n\nSee [release](https://example.com).\n\n```sh\necho hello\n```")
    #expect(rendered.string.contains("Changes"))
    #expect(!rendered.string.contains("##"))
    #expect(!rendered.string.contains("**"))
    #expect(rendered.string.contains("• Readable notes"))
    #expect(rendered.string.contains("• Use code"))
    #expect(rendered.string.contains("echo hello"))
    let heading = (rendered.string as NSString).range(of: "Changes").location
    let body = (rendered.string as NSString).range(of: "notes").location
    let headingFont = try #require(rendered.attribute(.font, at: heading, effectiveRange: nil) as? NSFont)
    let bodyFont = try #require(rendered.attribute(.font, at: body, effectiveRange: nil) as? NSFont)
    #expect(headingFont.pointSize > bodyFont.pointSize)
    let link = (rendered.string as NSString).range(of: "release").location
    #expect((rendered.attribute(.link, at: link, effectiveRange: nil) as? URL)?.absoluteString == "https://example.com")
}

@MainActor @Test func downloadReportsByteProgressThenVerificationBeforeSaving() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [UpdateURLProtocol.self]
    config.httpAdditionalHeaders = ["X-Test-Chunked": "true"]
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let client = AppUpdateClient(session: session)
    let update = try #require(try await client.check(currentVersion: "0.0.9", architecture: "arm64"))
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    var events: [AppUpdateProgress] = []
    let archive = try await client.download(update, to: directory) { events.append($0) }
    #expect(events.contains { event in
        guard case .downloading(let received, let total) = event else { return false }
        return received > 0 && received < 1_048_576 && total == 1_048_576
    })
    #expect(events.last == .verifying)
    #expect(try Data(contentsOf: archive) == Data(repeating: 97, count: 1_048_576))
}

@Test func updateProgressHandlesUnknownLengthAndBoundsPercentages() {
    #expect(AppUpdateProgress.downloading(received: 25, total: 100).fraction == 0.25)
    #expect(AppUpdateProgress.downloading(received: 125, total: 100).fraction == 1)
    #expect(AppUpdateProgress.downloading(received: 5, total: nil).fraction == nil)
    #expect(AppUpdateProgress.downloading(received: 5, total: 0).fraction == nil)
    #expect(AppUpdateProgress.verifying.fraction == nil)
}

@MainActor @Test func releaseNotesKeepNestedAndOrderedListsAndRejectLocalLinks() {
    let rendered = ReleaseNotesView.render("1. First\n2. Second\n   - Nested\n\n[Unsafe](file:///tmp/secret)\n\n> Quoted **text**")
    #expect(rendered.string.contains("1. First\n2. Second\n• Nested"))
    let nested = (rendered.string as NSString).range(of: "Nested").location
    let paragraph = rendered.attribute(.paragraphStyle, at: nested, effectiveRange: nil) as? NSParagraphStyle
    #expect(paragraph?.headIndent == 40)
    let unsafe = (rendered.string as NSString).range(of: "Unsafe").location
    #expect(rendered.attribute(.link, at: unsafe, effectiveRange: nil) == nil)
}

@MainActor @Test func updateDialogUsesMainWindowHeightAndGivesExtraSpaceToReleaseNotes() async throws {
    let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let notes = "## Changes\n\n" + (1...100).map { "- Release detail \($0): improve the desktop experience." }.joined(separator: "\n")
    try updateRelease(body: notes).write(to: file)
    defer { try? FileManager.default.removeItem(at: file) }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [UpdateURLProtocol.self]
    config.httpAdditionalHeaders = ["X-Test-Release-File": file.path]
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let updater = AppUpdater(client: AppUpdateClient(session: session), installedVersion: "0.0.9")
    await updater.check()
    guard case .available = updater.phase else { Issue.record("Expected an available update"); return }
    let suite = "local.kliprun.tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = DesktopStore(defaults: defaults, updater: updater)
    let host = NSHostingView(rootView: ContentView(store: store))
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 980, height: 660),
                          styleMask: [.titled, .resizable], backing: .buffered, defer: false)
    window.contentView = host
    window.orderFront(nil)
    defer {
        if let sheet = window.attachedSheet { window.endSheet(sheet) }
        updater.isPresented = false
        window.orderOut(nil)
    }
    host.layoutSubtreeIfNeeded()
    updater.isPresented = true
    for _ in 0..<100 where window.attachedSheet == nil { try await Task.sleep(for: .milliseconds(20)) }
    let sheet = try #require(window.attachedSheet)
    func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
    var viewportHeights: [CGFloat] = []
    for height: CGFloat in [660, 900] {
        window.setContentSize(NSSize(width: 980, height: height))
        host.layoutSubtreeIfNeeded()
        try await Task.sleep(for: .milliseconds(300))
        let sheetContent = try #require(sheet.contentView)
        sheetContent.layoutSubtreeIfNeeded()
        #expect(abs(sheetContent.bounds.height - host.bounds.height) <= 2)
        let scroll = try #require(descendants(sheetContent).compactMap { $0 as? NSScrollView }.first {
            ($0.documentView as? NSTextView)?.string.contains("Release detail 100") == true
        })
        viewportHeights.append(scroll.contentView.bounds.height)
        #expect(scroll.documentView!.bounds.height > scroll.contentView.bounds.height)
        scroll.contentView.scroll(to: NSPoint(x: 0, y: scroll.documentView!.bounds.height))
        #expect(scroll.contentView.bounds.origin.y > 0)
    }
    #expect(abs(viewportHeights[1] - viewportHeights[0] - 240) <= 2)
}

private func updateRelease(version: String = "0.0.10", prerelease: Bool = false, draft: Bool = false,
                           name: String? = nil, url: String? = nil, body: Any? = "- Preview release notes before downloading.",
                           digest: String = "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") throws -> Data {
    var release: [String: Any] = [
        "tag_name": "v\(version)", "prerelease": prerelease, "draft": draft,
        "assets": [["name": name ?? "KlipRun-\(version)-macos-arm64.zip",
                    "browser_download_url": url ?? "https://github.com/klipbn/kliprun_desktop/releases/download/v\(version)/KlipRun-\(version)-macos-arm64.zip",
                    "digest": digest]]
    ]
    release["body"] = body
    return try JSONSerialization.data(withJSONObject: release)
}

@MainActor private final class UpdateQuitProbe: NSObject, NSApplicationDelegate {
    var requests = 0
    var sheetWasVisible = false
    var wasPreparedToInstall = false
    weak var window: NSWindow?
    weak var updater: AppUpdater?

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        requests += 1
        sheetWasVisible = window?.attachedSheet != nil
        wasPreparedToInstall = updater?.installOnExit == true
        updater?.cancelQuit()
        // Exercise AppKit's termination path without exiting the test runner.
        return .terminateCancel
    }
}

@MainActor @Test func installAndRestartButtonReachesTerminationAfterClosingSheet() async throws {
    // Other UI tests open sheets too; AppKit termination needs its own application process.
    if ProcessInfo.processInfo.environment["KLIPRUN_UPDATE_UI_CHILD"] != "1" {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
        var arguments = ["--testing-library", "swift-testing", "--filter", "installAndRestartButtonReachesTerminationAfterClosingSheet"]
        if let index = CommandLine.arguments.firstIndex(of: "--test-bundle-path") {
            arguments = ["--test-bundle-path", CommandLine.arguments[index + 1]] + arguments
        }
        process.arguments = arguments
        process.environment = ProcessInfo.processInfo.environment.merging(["KLIPRUN_UPDATE_UI_CHILD": "1"]) { _, child in child }
        let output = Pipe(); process.standardOutput = output; process.standardError = output
        try process.run()
        let log = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        let report = String(decoding: log, as: UTF8.self)
        #expect(process.terminationStatus == 0, "\(report)")
        #expect(report.contains("Test run with 1 test"), "\(report)")
        return
    }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let source = directory.appendingPathComponent("KlipRun.app"), destination = directory.appendingPathComponent("Installed.app")
    try fixtureApp(source, version: "0.0.10"); try fixtureApp(destination, version: "0.0.9")
    let archive = directory.appendingPathComponent("fixture.zip"), release = directory.appendingPathComponent("release.json")
    let zip = Process(); zip.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
    zip.arguments = ["-c", "-k", "--keepParent", source.path, archive.path]; try zip.run(); zip.waitUntilExit()
    let digest = SHA256.hash(data: try Data(contentsOf: archive)).map { String(format: "%02x", $0) }.joined()
    try updateRelease(digest: "sha256:\(digest)").write(to: release)
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [UpdateURLProtocol.self]
    config.httpAdditionalHeaders = ["X-Test-Archive-File": archive.path, "X-Test-Release-File": release.path]
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let suite = "local.kliprun.update-tests.\(UUID().uuidString)", defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let updater = AppUpdater(client: AppUpdateClient(session: session), installedVersion: "0.0.9", applicationURL: destination, defaults: defaults)
    await updater.check(); await updater.download(to: directory)
    guard case .ready = updater.phase else { Issue.record("Expected a prepared update: \(updater.phase)"); return }
    let store = DesktopStore(defaults: defaults, updater: updater)
    let probe = UpdateQuitProbe(); probe.updater = updater
    let previousDelegate = NSApplication.shared.delegate
    NSApplication.shared.delegate = probe
    defer { NSApplication.shared.delegate = previousDelegate }
    for embedded in [false, true] {
        let content = embedded ? AnyView(UpdateView(updater: updater, embedded: true).padding(20)) : AnyView(ContentView(store: store))
        let host = NSHostingView(rootView: content)
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: embedded ? 560 : 980, height: 660),
                              styleMask: [.titled, .resizable], backing: .buffered, defer: false)
        window.contentView = host
        window.makeKeyAndOrderFront(nil)
        probe.window = window
        defer {
            if let sheet = window.attachedSheet { window.endSheet(sheet) }
            updater.isPresented = false
            window.orderOut(nil)
        }
        for height: CGFloat in [660, 900] {
            window.setContentSize(NSSize(width: embedded ? 560 : 980, height: height))
            host.layoutSubtreeIfNeeded()
            updater.isPresented = !embedded
            if !embedded {
                for _ in 0..<100 where window.attachedSheet == nil { try await Task.sleep(for: .milliseconds(20)) }
            }
            let panel = embedded ? window : try #require(window.attachedSheet)
            try await Task.sleep(for: .milliseconds(300))
            panel.makeKeyAndOrderFront(nil)
            let panelContent = try #require(panel.contentView)
            let point = panelContent.convert(NSPoint(x: panelContent.bounds.width - 100,
                y: panelContent.isFlipped ? panelContent.bounds.height - 36 : 36), to: nil)
            let previousRequests = probe.requests
            for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
                let event = try #require(NSEvent.mouseEvent(with: type, location: point, modifierFlags: [],
                    timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: panel.windowNumber,
                    context: nil, eventNumber: 1, clickCount: 1, pressure: type == .leftMouseDown ? 1 : 0))
                NSApplication.shared.sendEvent(event)
            }
            for _ in 0..<100 where probe.requests == previousRequests { try await Task.sleep(for: .milliseconds(20)) }
            #expect(probe.requests == previousRequests + 1)
            #expect(!probe.sheetWasVisible)
            #expect(probe.wasPreparedToInstall)
            #expect(!updater.installOnExit)
            guard case .ready = updater.phase else { Issue.record("Cancelled restart must keep the update ready"); return }
        }
    }
}

@Test func updateKeepsReleaseNotesWithTheirParagraphsAndLists() throws {
    let update = try #require(try AppUpdate.available(
        in: updateRelease(body: "\r\n## Changes\n\n- **Preview** changes.\n- Keep working.\n\nSee [release](https://example.com).\n "),
        currentVersion: "0.0.9", architecture: "arm64"))
    #expect(update.releaseNotes == "## Changes\n\n- **Preview** changes.\n- Keep working.\n\nSee [release](https://example.com).")
}

@Test func updateStillWorksWhenReleaseNotesAreMissingNullOrBlank() throws {
    for body: Any? in [nil, NSNull(), "", " \n\t\r\n"] {
        let update = try #require(try AppUpdate.available(
            in: updateRelease(body: body), currentVersion: "0.0.9", architecture: "arm64"))
        #expect(update.releaseNotes == "No release notes were provided for this version.")
    }
}

@Test func updateSelectsNewerVersionNumericallyAndMatchingMacAsset() throws {
    let update = try #require(try AppUpdate.available(in: updateRelease(), currentVersion: "0.0.9", architecture: "arm64"))
    #expect(update.version == "0.0.10")
    #expect(update.filename == "KlipRun-0.0.10-macos-arm64.zip")
    #expect(update.url.absoluteString == "https://github.com/klipbn/kliprun_desktop/releases/download/v0.0.10/KlipRun-0.0.10-macos-arm64.zip")
    #expect(try AppUpdate.available(in: updateRelease(), currentVersion: "0.0.10", architecture: "arm64") == nil)
    #expect(try AppUpdate.available(in: updateRelease(), currentVersion: "0.1.0", architecture: "arm64") == nil)
}

@Test func updateSavesOnlyVerifiedArchiveWithoutReplacingExistingDownload() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let archive = directory.appendingPathComponent("download.tmp")
    try Data("abc".utf8).write(to: archive)
    let update = try #require(try AppUpdate.available(in: updateRelease(), currentVersion: "0.0.9", architecture: "arm64"))
    let first = try update.saveVerifiedArchive(archive, in: directory)
    let second = try update.saveVerifiedArchive(archive, in: directory)
    #expect(first != second)
    #expect(first.lastPathComponent == "KlipRun-0.0.10-macos-arm64.zip")
    #expect(try Data(contentsOf: first) == Data("abc".utf8))
    #expect(try Data(contentsOf: second) == Data("abc".utf8))
    try Data("corrupted".utf8).write(to: archive)
    let before = try FileManager.default.contentsOfDirectory(atPath: directory.path).sorted()
    #expect(throws: AppUpdateError.checksumMismatch) { try update.saveVerifiedArchive(archive, in: directory) }
    #expect(try FileManager.default.contentsOfDirectory(atPath: directory.path).sorted() == before)
    #expect(try Data(contentsOf: first) == Data("abc".utf8))
}

@Test func updateIgnoresDraftsAndPrereleasesAndRejectsUnsupportedAssets() throws {
    #expect(try AppUpdate.available(in: updateRelease(prerelease: true), currentVersion: "0.0.9", architecture: "arm64") == nil)
    #expect(try AppUpdate.available(in: updateRelease(draft: true), currentVersion: "0.0.9", architecture: "arm64") == nil)
    #expect(throws: AppUpdateError.missingAsset) {
        try AppUpdate.available(in: updateRelease(), currentVersion: "0.0.9", architecture: "x86_64")
    }
    #expect(throws: AppUpdateError.invalidVersion) {
        try AppUpdate.available(in: updateRelease(version: "1.0.0-beta.1"), currentVersion: "0.0.9", architecture: "arm64")
    }
    for url in ["http://github.com/klipbn/kliprun_desktop/releases/download/v0.0.10/KlipRun-0.0.10-macos-arm64.zip",
                "https://example.com/KlipRun-0.0.10-macos-arm64.zip",
                "https://github.com/other/project/releases/download/v0.0.10/KlipRun-0.0.10-macos-arm64.zip"] {
        #expect(throws: AppUpdateError.untrustedDownload) {
            try AppUpdate.available(in: updateRelease(url: url), currentVersion: "0.0.9", architecture: "arm64")
        }
    }
    #expect(throws: AppUpdateError.invalidChecksum) {
        try AppUpdate.available(in: updateRelease(digest: "sha256:bad"), currentVersion: "0.0.9", architecture: "arm64")
    }
}

private final class UpdateURLProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let expected = "https://api.github.com/repos/klipbn/kliprun_desktop/releases/latest"
        let isArchive = request.url?.absoluteString == "https://github.com/klipbn/kliprun_desktop/releases/download/v0.0.10/KlipRun-0.0.10-macos-arm64.zip"
        let chunked = request.value(forHTTPHeaderField: "X-Test-Chunked") == "true"
        let archive = request.value(forHTTPHeaderField: "X-Test-Archive-File").flatMap { try? Data(contentsOf: URL(fileURLWithPath: $0)) } ?? Data("abc".utf8)
        let status = request.url?.absoluteString == expected || isArchive ? Int(request.value(forHTTPHeaderField: "X-Test-Status") ?? "200")! : 404
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                                       headerFields: isArchive ? ["Content-Length": chunked ? "1048576" : String(archive.count)] : nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        if isArchive, chunked {
            client?.urlProtocol(self, didLoad: Data(repeating: 97, count: 524_288))
            DispatchQueue.global().asyncAfter(deadline: .now() + 0.2) { [self] in
                client?.urlProtocol(self, didLoad: Data(repeating: 97, count: 524_288))
                client?.urlProtocolDidFinishLoading(self)
            }
            return
        }
        let release = request.value(forHTTPHeaderField: "X-Test-Release-File")
            .flatMap { try? Data(contentsOf: URL(fileURLWithPath: $0)) } ?? (try? updateRelease()) ?? Data()
        var payload = release
        if chunked {
            let digest = SHA256.hash(data: Data(repeating: 97, count: 1_048_576)).map { String(format: "%02x", $0) }.joined()
            payload = (try? updateRelease(digest: "sha256:\(digest)")) ?? Data()
        }
        client?.urlProtocol(self, didLoad: isArchive ? archive : payload)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor @Test func updateDialogAllowsHandoffOnlyAfterVerifiedDownloadAndClearsCancelledQuit() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let source = directory.appendingPathComponent("KlipRun.app"), destination = directory.appendingPathComponent("Installed.app")
    try fixtureApp(source, version: "0.0.10"); try fixtureApp(destination, version: "0.0.9")
    let archive = directory.appendingPathComponent("fixture.zip"), release = directory.appendingPathComponent("release.json")
    let zip = Process(); zip.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
    zip.arguments = ["-c", "-k", "--keepParent", source.path, archive.path]; try zip.run(); zip.waitUntilExit()
    let digest = SHA256.hash(data: try Data(contentsOf: archive)).map { String(format: "%02x", $0) }.joined()
    try updateRelease(digest: "sha256:\(digest)").write(to: release)
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [UpdateURLProtocol.self]
    config.httpAdditionalHeaders = ["X-Test-Archive-File": archive.path, "X-Test-Release-File": release.path]
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let suite = "local.kliprun.update-tests.\(UUID().uuidString)", defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let updater = AppUpdater(client: AppUpdateClient(session: session), installedVersion: "0.0.9", applicationURL: destination, defaults: defaults)
    #expect(!updater.prepareToQuit())
    await updater.check()
    guard case .available(let release) = updater.phase else { Issue.record("Expected an available update"); return }
    #expect(release.version == "0.0.10")
    #expect(release.releaseNotes == "- Preview release notes before downloading.")
    #expect(!updater.prepareToQuit())
    await updater.download(to: directory)
    guard case .ready = updater.phase else { Issue.record("Expected a prepared update: \(updater.phase)"); return }
    await updater.check(background: true)
    #expect(updater.availableVersion == "0.0.10")
    updater.isPresented = true
    #expect(updater.prepareToQuit())
    #expect(!updater.isPresented)
    updater.cancelQuit()
    #expect(!updater.installOnExit)
    guard case .ready = updater.phase else { Issue.record("Cancelled exit must keep the download ready"); return }
    #expect(updater.prepareToQuit())
    let installation = try #require(updater.installation)
    let helper = try updater.installAfterExit(after: Int32.max, relaunch: ["/usr/bin/true"])
    helper?.waitUntilExit()
    let restarted = AppUpdater(installedVersion: "0.0.10", applicationURL: destination, defaults: defaults)
    restarted.restoreAfterUpdate()
    #expect(restarted.isPresented)
    guard case .installed(let version, let notes) = restarted.phase else { Issue.record("Expected What's New after restart"); return }
    #expect(version == "0.0.10")
    #expect(notes == "- Preview release notes before downloading.")
    #expect(!FileManager.default.fileExists(atPath: installation.directory.path))
    let nextLaunch = AppUpdater(installedVersion: "0.0.10", applicationURL: destination, defaults: defaults)
    nextLaunch.restoreAfterUpdate()
    #expect(!nextLaunch.isPresented)
}

@Test func updateChecksPublicGitHubReleaseAndReportsHTTPFailures() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [UpdateURLProtocol.self]
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let client = AppUpdateClient(session: session)
    let update = try await client.check(currentVersion: "0.0.9", architecture: "arm64")
    #expect(update?.version == "0.0.10")
    #expect(try await client.check(currentVersion: "0.0.10", architecture: "arm64") == nil)
    config.httpAdditionalHeaders = ["X-Test-Status": "429"]
    let limitedSession = URLSession(configuration: config)
    defer { limitedSession.invalidateAndCancel() }
    await #expect(throws: AppUpdateError.http(429)) {
        try await AppUpdateClient(session: limitedSession).check(currentVersion: "0.0.9", architecture: "arm64")
    }
}

@MainActor @Test func backgroundUpdateCheckPublishesVersionWithoutOpeningWindow() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [UpdateURLProtocol.self]
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let updater = AppUpdater(client: AppUpdateClient(session: session), installedVersion: "0.0.9")
    await updater.check(background: true)
    #expect(updater.availableVersion == "0.0.10")
    #expect(!updater.isPresented)
    guard case .available(let release) = updater.phase else { Issue.record("Background result must include release notes before downloading"); return }
    #expect(release.releaseNotes == "- Preview release notes before downloading.")
}

@MainActor @Test func backgroundChecksRepeatKeepKnownUpdateOnFailureAndStop() async throws {
    let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try updateRelease().write(to: file, options: .atomic)
    defer { try? FileManager.default.removeItem(at: file) }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [UpdateURLProtocol.self]
    config.httpAdditionalHeaders = ["X-Test-Release-File": file.path]
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let updater = AppUpdater(client: AppUpdateClient(session: session), installedVersion: "0.0.9")
    defer { updater.stopBackgroundChecks() }
    updater.startBackgroundChecks(every: .milliseconds(20))
    for _ in 0..<200 where updater.availableVersion != "0.0.10" { try await Task.sleep(for: .milliseconds(10)) }
    #expect(updater.availableVersion == "0.0.10")
    try Data("unavailable".utf8).write(to: file, options: .atomic)
    try await Task.sleep(for: .milliseconds(100))
    #expect(updater.availableVersion == "0.0.10")
    #expect(!updater.isPresented)
    try updateRelease(version: "0.0.11").write(to: file, options: .atomic)
    for _ in 0..<200 where updater.availableVersion != "0.0.11" { try await Task.sleep(for: .milliseconds(10)) }
    #expect(updater.availableVersion == "0.0.11")
    updater.stopBackgroundChecks()
    try updateRelease(version: "0.0.12").write(to: file, options: .atomic)
    try await Task.sleep(for: .milliseconds(100))
    #expect(updater.availableVersion == "0.0.11")
}

@MainActor @Test func updateAvailabilityScriptDeliversVersionAndClearsStaleWebState() throws {
    let context = try #require(JSContext())
    context.evaluateScript("var updates = []; var window = { dispatchEvent: function() { updates.push(window.kliprunUpdateVersion); } }; function Event() {}")
    context.evaluateScript(AppUpdater.webScript(version: "0.0.10"))
    #expect(context.evaluateScript("window.kliprunUpdateVersion")?.toString() == "0.0.10")
    context.evaluateScript(AppUpdater.webScript(version: nil))
    #expect(context.evaluateScript("window.kliprunUpdateVersion === null")?.toBool() == true)
    #expect(context.evaluateScript("updates.length")?.toInt32() == 2)
    #expect(context.exception == nil)
}

@MainActor @Test func updateIndicatorReachesMountedWebViewAndClearsWhenReleaseIsCurrent() async throws {
    let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try updateRelease().write(to: file, options: .atomic)
    defer { try? FileManager.default.removeItem(at: file) }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [UpdateURLProtocol.self]
    config.httpAdditionalHeaders = ["X-Test-Release-File": file.path]
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let updater = AppUpdater(client: AppUpdateClient(session: session), installedVersion: "0.0.9")
    await updater.check(background: true)
    let store = DesktopStore(updater: updater)
    defer { store.stop() }
    let web = WKWebView()
    store.webView = web
    web.loadHTMLString("<html><body>Update bridge test</body></html>", baseURL: nil)
    for _ in 0..<200 where web.isLoading { try await Task.sleep(for: .milliseconds(10)) }
    store.webDidFinishLoading()
    let mounted = try await web.evaluateJavaScript("window.kliprunUpdateVersion") as? String
    #expect(mounted == "0.0.10")
    try updateRelease(version: "0.0.11").write(to: file, options: .atomic)
    await updater.check(background: true)
    let changed = try await web.evaluateJavaScript("window.kliprunUpdateVersion") as? String
    #expect(changed == "0.0.11")
    try updateRelease(version: "0.0.9").write(to: file, options: .atomic)
    await updater.check(background: true)
    let cleared = try await web.evaluateJavaScript("window.kliprunUpdateVersion === null") as? Bool
    #expect(cleared == true)
    #expect(updater.availableVersion == nil)
    #expect(!updater.isPresented)
}
