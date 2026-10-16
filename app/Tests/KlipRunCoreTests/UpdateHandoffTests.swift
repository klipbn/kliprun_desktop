import Foundation
import Testing
@testable import KlipRunCore

@Test func updateHandoffWaitsForExitAndPassesPathsWithoutShellExpansion() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let marker = directory.appendingPathComponent("KlipRun's update $(false).zip")
    let app = Process()
    app.executableURL = URL(fileURLWithPath: "/bin/sleep")
    app.arguments = ["0.5"]
    try app.run()
    let handoff = try UpdateHandoff.launch(after: app.processIdentifier, command: ["/usr/bin/touch", marker.path])
    #expect(app.isRunning)
    #expect(!FileManager.default.fileExists(atPath: marker.path))
    app.waitUntilExit()
    handoff.waitUntilExit()
    #expect(handoff.terminationStatus == 0)
    #expect(FileManager.default.fileExists(atPath: marker.path))
}
