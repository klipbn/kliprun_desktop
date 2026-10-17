import Foundation
import Testing
@testable import KlipRunCore

private func command(_ args: [String]) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: args[0]); process.arguments = Array(args.dropFirst())
    process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
    try process.run(); process.waitUntilExit()
    #expect(process.terminationStatus == 0)
}

func fixtureApp(_ at: URL, version: String, identifier: String = "local.kliprun.desktop") throws {
    let contents = at.appendingPathComponent("Contents")
    try FileManager.default.createDirectory(at: contents.appendingPathComponent("MacOS"), withIntermediateDirectories: true)
    let info = ["CFBundleIdentifier": identifier, "CFBundleExecutable": "KlipRunDesktop", "CFBundleShortVersionString": version, "CFBundlePackageType": "APPL"]
    try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0).write(to: contents.appendingPathComponent("Info.plist"))
    let source = at.deletingLastPathComponent().appendingPathComponent("fixture.c")
    try "int main(void) { return 0; }".write(to: source, atomically: true, encoding: .utf8)
    try command(["/usr/bin/cc", "-arch", AppUpdateClient.architecture, source.path, "-o", contents.appendingPathComponent("MacOS/KlipRunDesktop").path])
    try command(["/usr/bin/codesign", "--force", "--sign", "-", at.path])
}

@Test func installationWaitsForExitReplacesAppAndKeepsRollbackCopy() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("KlipRun's update $(false)-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let destination = directory.appendingPathComponent("Installed.app"), source = directory.appendingPathComponent("KlipRun.app")
    try fixtureApp(destination, version: "0.0.1"); try fixtureApp(source, version: "0.0.2")
    let archive = directory.appendingPathComponent("update.zip")
    try command(["/usr/bin/ditto", "-c", "-k", "--keepParent", source.path, archive.path])
    let prepared = try AppInstallation.prepare(archive: archive, destination: destination, version: "0.0.2")
    let app = Process(); app.executableURL = URL(fileURLWithPath: "/bin/sleep"); app.arguments = ["0.4"]; try app.run()
    let helper = try prepared.launch(after: app.processIdentifier, relaunch: ["/usr/bin/true"])
    #expect(!FileManager.default.fileExists(atPath: prepared.backup.path))
    app.waitUntilExit(); helper.waitUntilExit()
    #expect(helper.terminationStatus == 0)
    #expect(try String(contentsOf: prepared.result, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) == "installed")
    #expect(Bundle(url: destination)?.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String == "0.0.2")
    #expect(FileManager.default.fileExists(atPath: prepared.backup.appendingPathComponent("Contents/MacOS/KlipRunDesktop").path))
}

@Test func installationRejectsWrongBundleAndRollsBackIfRelaunchFails() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let destination = directory.appendingPathComponent("Installed.app"), source = directory.appendingPathComponent("KlipRun.app")
    try fixtureApp(destination, version: "0.0.1"); try fixtureApp(source, version: "0.0.2")
    let archive = directory.appendingPathComponent("update.zip")
    try command(["/usr/bin/ditto", "-c", "-k", "--keepParent", source.path, archive.path])
    #expect(throws: (any Error).self) { try AppInstallation.prepare(archive: archive, destination: destination, version: "0.0.3") }
    let prepared = try AppInstallation.prepare(archive: archive, destination: destination, version: "0.0.2")
    let helper = try prepared.launch(after: Int32.max, relaunch: ["/usr/bin/false"])
    helper.waitUntilExit()
    #expect(helper.terminationStatus != 0)
    #expect(Bundle(url: destination)?.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String == "0.0.1")
    #expect(try String(contentsOf: prepared.result, encoding: .utf8).contains("failed"))
    #expect(!FileManager.default.fileExists(atPath: prepared.backup.path))
}
