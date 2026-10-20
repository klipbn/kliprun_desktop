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

    init?(id: Int, source: String, directory: String, resumeSessionID: String? = nil, agentSettings: AgentSettings = AgentSettings(), preferences: AppPreferences = AppPreferences(), onExit: @escaping (Int) -> Void = { _ in }) {
        guard let launch = AgentLaunch.make(source: source, home: FileManager.default.homeDirectoryForCurrentUser.path,
                                            inherited: ProcessInfo.processInfo.environment, sessionID: resumeSessionID, settings: agentSettings) else { return nil }
        self.id = id; self.source = source; self.directory = directory
        self.resumeSessionID = resumeSessionID
        self.explicitSessionID = resumeSessionID
        self.sessionID = resumeSessionID
        self.onExit = onExit
        let initialTitle = "\(source == "codex" ? "Codex" : source == "opencode" ? "OpenCode" : source == "claude" ? "Claude Code" : "Terminal") · \((directory as NSString).lastPathComponent)"
        title = initialTitle
        titleState = TerminalTitle(automatic: initialTitle)
        super.init()
        applyPreferences(preferences)
        view.minimumContrastRatio = 4.5
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
        if appliedTheme != preferences.resolvedTerminalTheme { applyTheme(preferences.resolvedTerminalTheme, notify: true) }
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

    private func applyTheme(_ theme: String, notify: Bool = false) {
        view.applyPalette(TerminalPalette(theme: theme), notify: notify)
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
