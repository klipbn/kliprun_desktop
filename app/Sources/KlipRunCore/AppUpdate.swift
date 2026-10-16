import Foundation
import CryptoKit

public struct AppUpdate: Sendable {
    public let version: String
    public let filename: String
    public let url: URL
    public let sha256: String

    public func saveVerifiedArchive(_ archive: URL, in directory: URL) throws -> URL {
        let file = try FileHandle(forReadingFrom: archive)
        defer { try? file.close() }
        var hash = SHA256()
        while let chunk = try file.read(upToCount: 1_048_576), !chunk.isEmpty { hash.update(data: chunk) }
        let checksum = hash.finalize().map { String(format: "%02x", $0) }.joined()
        guard checksum == sha256 else { throw AppUpdateError.checksumMismatch }
        let folder = directory.appendingPathComponent("KlipRun Update \(version) \(UUID().uuidString)", isDirectory: true)
        let destination = folder.appendingPathComponent(filename)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        do { try FileManager.default.copyItem(at: archive, to: destination) }
        catch {
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
        return destination
    }

    public static func available(in data: Data, currentVersion: String, architecture: String) throws -> AppUpdate? {
        let release = try JSONDecoder().decode(Release.self, from: data)
        guard !release.draft, !release.prerelease else { return nil }
        let version = release.tagName.hasPrefix("v") ? String(release.tagName.dropFirst()) : release.tagName
        guard let latest = components(version), let current = components(currentVersion) else {
            throw AppUpdateError.invalidVersion
        }
        guard current.lexicographicallyPrecedes(latest) else { return nil }
        let filename = "KlipRun-\(version)-macos-\(architecture).zip"
        guard let asset = release.assets.first(where: { $0.name == filename }) else {
            throw AppUpdateError.missingAsset
        }
        let expectedURL = "https://github.com/klipbn/kliprun_desktop/releases/download/\(release.tagName)/\(filename)"
        guard asset.browserDownloadURL.absoluteString == expectedURL else { throw AppUpdateError.untrustedDownload }
        guard let digest = asset.digest, digest.range(of: "^sha256:[0-9a-fA-F]{64}\\z", options: .regularExpression) != nil else {
            throw AppUpdateError.invalidChecksum
        }
        return AppUpdate(version: version, filename: filename, url: asset.browserDownloadURL,
                         sha256: String(digest.dropFirst(7)).lowercased())
    }

    private static func components(_ version: String) -> [Int]? {
        guard version.range(of: "^[0-9]+\\.[0-9]+\\.[0-9]+\\z", options: .regularExpression) != nil else { return nil }
        let parts = version.split(separator: ".").compactMap { Int($0) }
        return parts.count == 3 ? parts : nil
    }

    private struct Release: Decodable {
        let tagName: String
        let draft: Bool
        let prerelease: Bool
        let assets: [Asset]
        enum CodingKeys: String, CodingKey { case tagName = "tag_name", draft, prerelease, assets }
    }

    private struct Asset: Decodable {
        let name: String
        let browserDownloadURL: URL
        let digest: String?
        enum CodingKeys: String, CodingKey { case name, browserDownloadURL = "browser_download_url", digest }
    }
}

public struct AppUpdateClient: Sendable {
    private let session: URLSession

    public init(session: URLSession = URLSession(configuration: .ephemeral)) { self.session = session }

    public static var architecture: String {
        #if arch(arm64)
        "arm64"
        #else
        "x86_64"
        #endif
    }

    public func check(currentVersion: String, architecture: String = AppUpdateClient.architecture) async throws -> AppUpdate? {
        let url = URL(string: "https://api.github.com/repos/klipbn/kliprun_desktop/releases/latest")!
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("KlipRun/\(currentVersion)", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await session.data(for: request)
        try checkResponse(response)
        return try AppUpdate.available(in: data, currentVersion: currentVersion, architecture: architecture)
    }

    public func download(_ update: AppUpdate, to directory: URL) async throws -> URL {
        let request = URLRequest(url: update.url, timeoutInterval: 300)
        let (archive, response) = try await session.download(for: request)
        defer { try? FileManager.default.removeItem(at: archive) }
        try checkResponse(response)
        try Task.checkCancellation()
        return try update.saveVerifiedArchive(archive, in: directory)
    }

    private func checkResponse(_ response: URLResponse) throws {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw AppUpdateError.http(status) }
    }
}

public enum AppUpdateError: LocalizedError, Equatable {
    case invalidVersion, missingAsset, untrustedDownload, invalidChecksum, checksumMismatch
    case http(Int)

    public var errorDescription: String? {
        switch self {
        case .invalidVersion: "The installed or released version number is invalid."
        case .missingAsset: "This release does not include a download for this Mac's architecture."
        case .untrustedDownload: "The update download is not from the KlipRun GitHub repository."
        case .invalidChecksum: "This release does not include a valid SHA256 checksum."
        case .checksumMismatch: "The download failed SHA256 verification. No update was saved. Please try again."
        case .http(let status): "GitHub returned HTTP \(status). Please try again later."
        }
    }
}
