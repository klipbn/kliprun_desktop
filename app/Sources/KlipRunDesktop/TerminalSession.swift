import AppKit
import SwiftUI
import SwiftTerm
import KlipRunCore

@MainActor
final class TerminalSession: NSObject, ObservableObject, Identifiable, LocalProcessTerminalViewDelegate {
    let id: Int
    let source: String
    let directory: String
    let resumeSessionID: String?
    private let onExit: (Int) -> Void
    let view = LocalProcessTerminalView(frame: .zero)
    @Published var title: String
    private var titleState: TerminalTitle
    @Published var isRunning = true
    var explicitSessionID: String?
    var sessionID: String?
    private(set) var codexSessionPrefix: String?
    private(set) var hasCodexSessionTitle = false
    var reportedCodexObservation: String?
    var pid: Int32 { view.process?.shellPid ?? 0 }

    init?(id: Int, source: String, directory: String, resumeSessionID: String? = nil, onExit: @escaping (Int) -> Void = { _ in }) {
        guard let launch = AgentLaunch.make(source: source, home: FileManager.default.homeDirectoryForCurrentUser.path,
                                            inherited: ProcessInfo.processInfo.environment, sessionID: resumeSessionID) else { return nil }
        self.id = id; self.source = source; self.directory = directory
        self.resumeSessionID = resumeSessionID
        self.explicitSessionID = resumeSessionID
        self.sessionID = resumeSessionID
        self.onExit = onExit
        let initialTitle = "\(source == "codex" ? "Codex" : source == "opencode" ? "OpenCode" : "Terminal") · \((directory as NSString).lastPathComponent)"
        title = initialTitle
        titleState = TerminalTitle(automatic: initialTitle)
        super.init()
        view.nativeBackgroundColor = Self.color(0x0d1117)
        view.nativeForegroundColor = Self.color(0xe6edf3)
        view.installColors([
            0x0d1117, 0xf47067, 0x3fb950, 0xd29922,
            0x58a6ff, 0xbc8cff, 0x39c5cf, 0xb1bac4,
            0x6e7681, 0xffa198, 0x56d364, 0xe3b341,
            0x79c0ff, 0xd2a8ff, 0x56d4dd, 0xf0f6fc,
        ].map { Color(nsColor: Self.color($0)) })
        view.minimumContrastRatio = 4.5
        view.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        view.updateColorScheme(.dark, notify: false)
        view.processDelegate = self
        view.startProcess(executable: "/bin/zsh", args: launch.arguments,
                          environment: launch.environment.map { "\($0.key)=\($0.value)" }, currentDirectory: directory)
    }

    func updateSessionLink(observed: Set<String>) {
        if observed.count == 1 {
            let observedID = observed.first!
            if explicitSessionID != observedID { explicitSessionID = nil }
            sessionID = observedID
        } else if observed.isEmpty {
            sessionID = explicitSessionID
        } else {
            sessionID = nil
        }
    }

    func terminate() { if isRunning { view.terminate() } }
    func rename(_ name: String) { titleState.rename(name); title = titleState.display }
    func applyPreferences(_ preferences: AppPreferences) {
        if view.scrollSensitivity != preferences.wheelSensitivity { view.scrollSensitivity = preferences.wheelSensitivity }
        if view.preciseScrollSensitivity != preferences.smoothSensitivity { view.preciseScrollSensitivity = preferences.smoothSensitivity }
        if view.font.pointSize != preferences.terminalFontSize {
            view.font = NSFont.monospacedSystemFont(ofSize: preferences.terminalFontSize, weight: .regular)
        }
    }
    func sizeChanged(source: LocalProcessTerminalView, newCols: Int, newRows: Int) {}
    func setTerminalTitle(source: LocalProcessTerminalView, title: String) {
        if self.source == "codex" {
            let prefix = TerminalTitle.codexSessionPrefix(title)
            if prefix != nil { hasCodexSessionTitle = true }
            if codexSessionPrefix != prefix {
                codexSessionPrefix = prefix
                reportedCodexObservation = nil
                explicitSessionID = nil
                sessionID = nil
            }
            return
        }
        titleState.updateAutomatic(title)
        self.title = titleState.display
    }
    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}
    func processTerminated(source: TerminalView, exitCode: Int32?) {
        isRunning = false
        onExit(id)
    }
    func processFailedToStart(source: TerminalView, error: LocalProcessError) {
        isRunning = false
        view.feed(text: "\r\nCould not start the terminal: \(error)\r\n")
    }

    private static func color(_ hex: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255,
                green: CGFloat((hex >> 8) & 0xff) / 255,
                blue: CGFloat(hex & 0xff) / 255, alpha: 1)
    }
}

struct TerminalPane: NSViewRepresentable {
    let session: TerminalSession
    func makeNSView(context: Context) -> TerminalHostView {
        let host = TerminalHostView(frame: .zero)
        host.show(session.view)
        DispatchQueue.main.async { session.view.window?.makeFirstResponder(session.view) }
        return host
    }
    func updateNSView(_ nsView: TerminalHostView, context: Context) {
        nsView.show(session.view)
        DispatchQueue.main.async { session.view.window?.makeFirstResponder(session.view) }
    }
}
