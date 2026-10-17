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
    private var appliedTheme = ""
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
        applyTheme("graphite")
        view.minimumContrastRatio = 4.5
        view.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
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
        if appliedTheme != preferences.theme { applyTheme(preferences.theme, notify: true) }
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

    private func applyTheme(_ theme: String, notify: Bool = false) {
        let palette: (UInt32, UInt32, [UInt32])
        switch theme {
        case "ember": palette = (0x0d1016, 0xbfbdb6, [
            0x0d1016, 0xef7177, 0xaad84c, 0xfeb454, 0x5ac1fe, 0x39bae5, 0x95e5cb, 0xbfbdb6,
            0x545557, 0x83353b, 0x567627, 0x92582b, 0x27618c, 0x205a78, 0x4c806f, 0xfafafa])
        case "dusk": palette = (0x242835, 0xcccac2, [
            0x242835, 0xf18779, 0xd5fe80, 0xfecf72, 0x72cffe, 0x5bcde5, 0x95e5cb, 0xcccac2,
            0x67696e, 0x833f3c, 0x75993c, 0x937237, 0x336d8d, 0x2b6c7b, 0x4c806f, 0xfafafa])
        case "graphite": palette = (0x282c34, 0xabb2bf, [
            0x282c34, 0xe06c75, 0x98c379, 0xe5c07b, 0x61afef, 0xc678dd, 0x56b6c2, 0xabb2bf,
            0x636d83, 0xea858b, 0xaad581, 0xffd885, 0x85c1ff, 0xd398eb, 0x6ed5de, 0xfafafa])
        case "daybreak": palette = (0xfcfcfc, 0x5c6166, [
            0x5c6166, 0xef7271, 0x85b304, 0xf1ad49, 0x3b9ee5, 0x55b4d3, 0x4dbf99, 0xfcfcfc,
            0x3b9ee5, 0xfebab6, 0xc7d98f, 0xfed5a3, 0xabcdf2, 0xb1d8e8, 0xace0cb, 0xffffff])
        case "paper": palette = (0xfafafa, 0x2a2c33, [
            0x000000, 0xde3e35, 0x3f953a, 0xd2b67c, 0x2f5af3, 0x950095, 0x0997b3, 0xbbbbbb,
            0x000000, 0xde3e35, 0x3f953a, 0xd2b67c, 0x2f5af3, 0xa00095, 0x0bbcd6, 0xffffff])
        default: palette = (0x0d1117, 0xe6edf3, [
            0x0d1117, 0xf47067, 0x3fb950, 0xd29922, 0x58a6ff, 0xbc8cff, 0x39c5cf, 0xb1bac4,
            0x6e7681, 0xffa198, 0x56d364, 0xe3b341, 0x79c0ff, 0xd2a8ff, 0x56d4dd, 0xf0f6fc])
        }
        view.nativeBackgroundColor = Self.color(palette.0)
        view.nativeForegroundColor = Self.color(palette.1)
        view.installColors(palette.2.map { Color(nsColor: Self.color($0)) })
        view.updateColorScheme(theme == "daybreak" || theme == "paper" ? .light : .dark, notify: notify)
        appliedTheme = theme
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
        if nsView.show(session.view) {
            DispatchQueue.main.async { session.view.window?.makeFirstResponder(session.view) }
        }
    }
}
