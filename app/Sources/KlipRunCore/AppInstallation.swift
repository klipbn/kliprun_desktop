import Foundation
import MachO

public struct AppInstallation: Codable, Sendable {
    public let directory: URL
    public let destination: URL
    public var application: URL { directory.appendingPathComponent("KlipRun.app") }
    public var backup: URL { directory.appendingPathComponent("Previous.app") }
    public var result: URL { directory.appendingPathComponent("result") }

    public static func prepare(archive: URL, destination: URL, version: String) throws -> AppInstallation {
        let fm = FileManager.default
        let destination = destination.resolvingSymlinksInPath()
        guard destination.pathExtension == "app", fm.fileExists(atPath: destination.path),
              fm.isWritableFile(atPath: destination.deletingLastPathComponent().path) else {
            throw InstallationError("KlipRun cannot replace this copy. Install it in a writable Applications folder first.")
        }
        // Stage on the same volume so both replacement and rollback use atomic renames.
        let directory = destination.deletingLastPathComponent().appendingPathComponent(".kliprun-update-\(UUID().uuidString)")
        try fm.createDirectory(at: directory, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        let prepared = AppInstallation(directory: directory, destination: destination)
        do {
            let entries = try run(["/usr/bin/unzip", "-Z1", archive.path], in: directory).split(separator: "\n")
            guard !entries.isEmpty, entries.allSatisfy({ entry in
                !entry.hasPrefix("/") && !entry.split(separator: "/").contains("..") &&
                (entry.hasPrefix("KlipRun.app/") || entry.hasPrefix("__MACOSX/"))
            }) else { throw InstallationError("The update archive has an unexpected layout.") }
            let listing = try run(["/usr/bin/zipinfo", "-l", archive.path], in: directory)
            guard !listing.split(separator: "\n").contains(where: { $0.hasPrefix("l") }) else {
                throw InstallationError("The update archive contains unsupported symbolic links.")
            }
            _ = try run(["/usr/bin/ditto", "-x", "-k", archive.path, directory.path], in: directory)
            let infoURL = prepared.application.appendingPathComponent("Contents/Info.plist")
            let info = try PropertyListSerialization.propertyList(from: Data(contentsOf: infoURL), format: nil) as? [String: Any]
            guard info?["CFBundleIdentifier"] as? String == "local.kliprun.desktop",
                  info?["CFBundleShortVersionString"] as? String == version,
                  info?["CFBundleExecutable"] as? String == "KlipRunDesktop" else {
                throw InstallationError("The downloaded application does not match this update.")
            }
            _ = try run(["/usr/bin/codesign", "--verify", "--deep", "--strict", prepared.application.path], in: directory)
            let architecture = AppUpdateClient.architecture == "arm64" ? CPU_TYPE_ARM64 : CPU_TYPE_X86_64
            guard Bundle(url: prepared.application)?.executableArchitectures?.contains(NSNumber(value: architecture)) == true else {
                throw InstallationError("The update does not support this Mac’s architecture.")
            }
            return prepared
        } catch {
            try? fm.removeItem(at: directory)
            throw error
        }
    }

    @discardableResult
    public func launch(after pid: Int32, relaunch: [String]? = nil) throws -> Process {
        guard FileManager.default.fileExists(atPath: application.path), !FileManager.default.fileExists(atPath: backup.path) else {
            throw InstallationError("The prepared update is unavailable. Download it again.")
        }
        // Paths are positional arguments, never interpolated into shell source.
        return try UpdateHandoff.launch(after: pid, command: ["/bin/sh", "-c", """
        staged=$1; destination=$2; backup=$3; result=$4
        shift 4
        fail() {
            printf 'failed\\n' > "$result"
            "$@" >/dev/null 2>&1
            exit 1
        }
        /bin/mv "$destination" "$backup" || fail "$@"
        if ! /bin/mv "$staged" "$destination"; then
            /bin/mv "$backup" "$destination"
            fail "$@"
        fi
        printf 'installed\\n' > "$result"
        if ! "$@"; then
            /bin/mv "$destination" "$staged" && /bin/mv "$backup" "$destination"
            fail "$@"
        fi
        """, "kliprun-install", application.path, destination.path, backup.path, result.path] +
            (relaunch ?? ["/usr/bin/open", "-n", destination.path]))
    }

    private static func run(_ args: [String], in directory: URL) throws -> String {
        let log = directory.appendingPathComponent("validation.log")
        FileManager.default.createFile(atPath: log.path, contents: nil)
        let handle = try FileHandle(forWritingTo: log)
        defer { try? handle.close() }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: args[0]); process.arguments = Array(args.dropFirst())
        process.standardOutput = handle; process.standardError = handle
        try process.run(); process.waitUntilExit()
        let output = try String(contentsOf: log, encoding: .utf8)
        guard process.terminationStatus == 0 else { throw InstallationError("Update validation failed (\(URL(fileURLWithPath: args[0]).lastPathComponent), exit \(process.terminationStatus)): \(output.trimmingCharacters(in: .whitespacesAndNewlines))") }
        return output
    }
}

private struct InstallationError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
