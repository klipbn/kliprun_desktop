import Foundation
import Testing
@testable import KlipRunCore
@testable import KlipRunDesktop

private func updateRelease(version: String = "0.0.10", prerelease: Bool = false, draft: Bool = false,
                           name: String? = nil, url: String? = nil,
                           digest: String = "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") throws -> Data {
    try JSONSerialization.data(withJSONObject: [
        "tag_name": "v\(version)", "prerelease": prerelease, "draft": draft,
        "assets": [["name": name ?? "KlipRun-\(version)-macos-arm64.zip",
                    "browser_download_url": url ?? "https://github.com/klipbn/kliprun_desktop/releases/download/v\(version)/KlipRun-\(version)-macos-arm64.zip",
                    "digest": digest]]
    ])
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
        let status = request.url?.absoluteString == expected || isArchive ? Int(request.value(forHTTPHeaderField: "X-Test-Status") ?? "200")! : 404
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: isArchive ? Data("abc".utf8) : (try? updateRelease()) ?? Data())
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor @Test func updateDialogAllowsHandoffOnlyAfterVerifiedDownloadAndClearsCancelledQuit() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [UpdateURLProtocol.self]
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let updater = AppUpdater(client: AppUpdateClient(session: session), installedVersion: "0.0.9")
    #expect(!updater.prepareToQuit())
    await updater.check()
    guard case .available(let release) = updater.phase else { Issue.record("Expected an available update"); return }
    #expect(release.version == "0.0.10")
    #expect(!updater.prepareToQuit())
    await updater.download(to: directory)
    guard case .ready(let archive) = updater.phase else { Issue.record("Expected a verified download: \(updater.phase)"); return }
    #expect(try Data(contentsOf: archive) == Data("abc".utf8))
    #expect(updater.prepareToQuit())
    #expect(updater.archiveToReveal == archive)
    updater.cancelQuit()
    #expect(updater.archiveToReveal == nil)
    guard case .ready = updater.phase else { Issue.record("Cancelled exit must keep the download ready"); return }
    #expect(updater.prepareToQuit())
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
