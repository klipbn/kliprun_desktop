import AppKit
import Combine
import Foundation
import KlipRunCore
import WebKit

@MainActor
final class DesktopStore: ObservableObject {
    @Published private(set) var board: DesktopBoard?
    @Published var selectedID: String?
    @Published private(set) var terminalDock = TerminalDockState() {
        didSet { publishTerminalSelection() }
    }
    var selectedTerminalID: Int? { terminalDock.visibleID }
    @Published var terminalExpanded = false
    @Published private(set) var preferences: AppPreferences
    var interfaceZoom: InterfaceZoom { InterfaceZoom(percent: preferences.interfaceZoomPercent) }
    @Published var showingSettings = false
    @Published var terminals: [TerminalSession] = []
    @Published var error: String?
    let runtime = EngineRuntime()
    let updater: AppUpdater
    weak var webView: WKWebView?

    private var links: [String: Int32] = [:]
    private var tracker = NotificationTracker()
    let notifications: PopupNotifications
    private let defaults: UserDefaults
    private var loop: Task<Void, Never>?
    private var updateSubscription: AnyCancellable?
    private var nextTerminalID = 1
    private var pendingWebSessionID: String?
    private var pendingWebPage: String?
    private var webReady = false
    private var publishedTerminalSessionID: String?
    private var terminalSelectionPublished = false
    private var projectPanel: NSOpenPanel?
    private var resumingSessions = Set<String>()

    init(defaults: UserDefaults = .standard, updater: AppUpdater = AppUpdater()) {
        self.defaults = defaults
        self.updater = updater
        preferences = AppPreferences(defaults: defaults)
        notifications = PopupNotifications(defaults: defaults)
        updateSubscription = updater.$availableVersion.sink { [weak self] version in
            self?.webView?.evaluateJavaScript(AppUpdater.webScript(version: version))
        }
    }

    func updatePreferences(_ change: (inout AppPreferences) -> Void) {
        var updated = preferences
        change(&updated)
        updated = updated.validated()
        guard updated != preferences else { return }
        preferences = updated
        updated.save(to: defaults)
        terminals.forEach { $0.applyPreferences(updated) }
        webView?.pageZoom = CGFloat(interfaceZoom.factor)
        webView?.evaluateJavaScript(updated.webScript)
    }

    func start() {
        pendingWebPage = preferences.startupPage
        updater.startBackgroundChecks()
        runtime.start()
        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    func stop() {
        loop?.cancel(); loop = nil
        updater.stopBackgroundChecks()
        terminals.forEach { $0.terminate() }
        runtime.stop()
    }

    private func refresh() async {
        guard let baseURL = runtime.baseURL else { error = runtime.error; return }
        let api = DesktopAPI(baseURL: baseURL, token: runtime.token)
        do {
            let (snapshot, notificationSnapshot) = try await api.board()
            board = snapshot
            error = nil
            var linkPayload: TerminalLinks = try await api.get("api/terminal-links")
            let parents = terminals.contains(where: \.isRunning) ? processParents() : [:]
            var reported = false
            for terminal in terminals where terminal.isRunning && terminal.hasCodexSessionTitle {
                let processes = (linkPayload.codex_terminals ?? []).filter {
                    ProcessTree.owns(pid: $0.pid, terminalPID: terminal.pid, parents: parents)
                }
                guard processes.count == 1, let process = processes.first else { continue }
                let prefix = terminal.codexSessionPrefix
                let observation = "\(process.pid):\(process.generation):\(prefix ?? "")"
                guard terminal.reportedCodexObservation != observation else { continue }
                let resolved = try await api.observeCodexSession(process, prefix: prefix)
                // The TUI may switch chats while the request is in flight.
                if resolved && terminal.codexSessionPrefix == prefix { terminal.reportedCodexObservation = observation }
                reported = true
            }
            if reported { linkPayload = try await api.get("api/terminal-links") }
            links = Dictionary(uniqueKeysWithValues: linkPayload.links.map { ($0.session_id, $0.pid) })
            for terminal in terminals where terminal.isRunning {
                if terminal.hasCodexSessionTitle && terminal.reportedCodexObservation == nil {
                    terminal.updateSessionLink(observed: [])
                    continue
                }
                let observed = Set(linkPayload.links.filter {
                    ProcessTree.owns(pid: $0.pid, terminalPID: terminal.pid, parents: parents)
                }.map(\.session_id))
                terminal.updateSessionLink(observed: observed)
            }
            publishTerminalSelection()
            if let selectedID, let terminalID = ownedTerminals()[selectedID] {
                var dock = terminalDock
                dock.selectCard(terminalID)
                if dock != terminalDock { terminalDock = dock }
            }
            if NSRunningApplication.runningApplications(withBundleIdentifier: "local.kliprun.notifications").isEmpty {
                for event in tracker.observe(notificationSnapshot.cards) {
                    notifications.show(event) { [weak self] in self?.openNotification(event) }
                }
            } else { _ = tracker.observe(notificationSnapshot.cards) }
        } catch {
            self.error = error.localizedDescription
            tracker = NotificationTracker()
        }
    }

    func selectWebSession(_ id: String?) {
        selectedID = id
        guard let id else { return }
        switch NotificationRoute.resolve(sessionID: id, owned: ownedTerminals()) {
        case .terminal(_, let terminalID):
            var dock = terminalDock
            dock.selectCard(terminalID)
            terminalDock = dock
        case .activity: break
        }
    }

    func openNotification(_ event: AgentNotification) {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.windows.first(where: { $0.canBecomeKey })?.makeKeyAndOrderFront(nil)
        selectWebSession(event.sessionID)
        if let terminalID = ownedTerminals()[event.sessionID] { selectTerminalTab(terminalID) }
        openInWeb(event.sessionID)
    }

    func openInWeb(_ id: String) {
        guard webReady, let webView, let literal = try? String(data: JSONEncoder().encode(id), encoding: .utf8) else {
            pendingWebSessionID = id; return
        }
        let script = "window.history.pushState(null, '', '/?session=' + encodeURIComponent(\(literal))); window.dispatchEvent(new PopStateEvent('popstate'));"
        webView.evaluateJavaScript(script)
    }

    func webDidStartLoading() { webReady = false; terminalSelectionPublished = false }
    func webDidFinishLoading() {
        webReady = true
        webView?.evaluateJavaScript(preferences.webScript)
        webView?.evaluateJavaScript(AppUpdater.webScript(version: updater.availableVersion))
        publishTerminalSelection()
        if let pendingWebPage { self.pendingWebPage = nil; showPage(pendingWebPage) }
        if let pendingWebSessionID { self.pendingWebSessionID = nil; openInWeb(pendingWebSessionID) }
    }

    func showPage(_ path: String) {
        guard ["/", "/git", "/stats", "/office", "/usage"].contains(path) else { return }
        terminalExpanded = false
        guard webReady, let webView else { pendingWebPage = path; return }
        webView.evaluateJavaScript("window.kliprunPendingNavigation = '\(path)'; window.dispatchEvent(new CustomEvent('kliprun:navigate', { detail: '\(path)' }));")
    }

    private func publishTerminalSelection() {
        guard webReady, let webView else { return }
        let id = terminal(for: selectedTerminalID)?.sessionID
        guard !terminalSelectionPublished || publishedTerminalSessionID != id else { return }
        let literal = id.flatMap { try? String(data: JSONEncoder().encode($0), encoding: .utf8) } ?? "null"
        webView.evaluateJavaScript("window.kliprunTerminalSessionId = \(literal); window.dispatchEvent(new CustomEvent('kliprun:terminal-selection', { detail: \(literal) }));")
        publishedTerminalSessionID = id
        terminalSelectionPublished = true
    }

    func terminal(for id: Int?) -> TerminalSession? { terminals.first { $0.id == id } }
    var activeTerminalCount: Int { max(terminals.filter(\.isRunning).count, attachedTerminalChildCount()) }

    func openRepository() {
        guard projectPanel == nil else { return }
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.prompt = "Open Repository"
        panel.message = "Choose a Git working tree."
        projectPanel = panel
        let completion: (NSApplication.ModalResponse) -> Void = { [weak self] response in
            Task { @MainActor in
                guard let self else { return }
                self.projectPanel = nil
                guard response == .OK, let path = panel.url?.path,
                      let literal = try? String(data: JSONEncoder().encode(path), encoding: .utf8) else { return }
                self.showPage("/git")
                try? await self.webView?.evaluateJavaScript("window.kliprunPendingRepository = \(literal); window.dispatchEvent(new CustomEvent('kliprun:repository', { detail: \(literal) }));")
            }
        }
        if let window = NSApp.keyWindow ?? NSApp.mainWindow { panel.beginSheetModal(for: window, completionHandler: completion) }
        else { panel.begin(completionHandler: completion) }
    }

    func launch(source: String) {
        guard projectPanel == nil, source == "opencode" || source == "codex" else { return }
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true; panel.canChooseFiles = false
        panel.prompt = "Open Project"
        projectPanel = panel
        NSApp.activate(ignoringOtherApps: true)
        let completion: (NSApplication.ModalResponse) -> Void = { [weak self] response in
            Task { @MainActor in
                guard let self else { return }
                self.projectPanel = nil
                guard response == .OK, let directory = panel.url?.path else { return }
                self.startTerminal(source: source, directory: directory)
            }
        }
        if let window = NSApp.keyWindow ?? NSApp.mainWindow {
            panel.beginSheetModal(for: window, completionHandler: completion)
        } else {
            panel.begin(completionHandler: completion)
        }
    }

    func newTerminal() {
        let directory = terminal(for: terminalDock.preferredID)?.directory ?? FileManager.default.homeDirectoryForCurrentUser.path
        startTerminal(source: "terminal", directory: directory)
    }

    func chooseNewTerminal() {
        guard projectPanel == nil else { return }
        let alert = NSAlert()
        alert.messageText = "New Terminal"
        alert.informativeText = "Choose what to open."
        alert.addButton(withTitle: "OpenCode")
        alert.addButton(withTitle: "Codex")
        alert.addButton(withTitle: "Terminal")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)
        switch alert.runModal() {
        case .alertFirstButtonReturn: launch(source: "opencode")
        case .alertSecondButtonReturn: launch(source: "codex")
        case .alertThirdButtonReturn: newTerminal()
        default: break
        }
    }

    private func startTerminal(source: String, directory: String, resumeSessionID: String? = nil) {
        guard let terminal = TerminalSession(id: nextTerminalID, source: source, directory: directory, resumeSessionID: resumeSessionID,
                                              onExit: { [weak self] id in self?.closeTerminal(id) }) else { return }
        terminal.applyPreferences(preferences)
        nextTerminalID += 1
        terminals.append(terminal)
        selectedID = nil
        var dock = terminalDock
        dock.show(terminal.id)
        terminalDock = dock
    }

    func resumeSession(_ id: String) {
        let source = id.hasPrefix("codex:") ? "codex" : "opencode"
        guard AgentLaunch.make(source: source, home: "", inherited: [:], sessionID: id) != nil else { return }
        if let terminal = terminals.first(where: { $0.isRunning && ($0.sessionID == id || ($0.sessionID == nil && $0.resumeSessionID == id)) }) {
            selectTerminalTab(terminal.id)
            return
        }
        guard let baseURL = runtime.baseURL, resumingSessions.insert(id).inserted else { return }
        Task {
            defer { resumingSessions.remove(id) }
            do {
                let detail: ResumeSessionDetail = try await DesktopAPI(baseURL: baseURL, token: runtime.token).get("api/session/\(id)")
                var isDirectory: ObjCBool = false
                guard detail.exists, detail.session_id == id, detail.source == source,
                      detail.directory.hasPrefix("/"),
                      FileManager.default.fileExists(atPath: detail.directory, isDirectory: &isDirectory), isDirectory.boolValue else {
                    throw NSError(domain: "KlipRun", code: 1, userInfo: [NSLocalizedDescriptionKey: "The session or its original project folder is no longer available."])
                }
                startTerminal(source: source, directory: detail.directory, resumeSessionID: id)
            } catch {
                let alert = NSAlert()
                alert.messageText = "Could not resume session"
                alert.informativeText = error.localizedDescription
                alert.runModal()
            }
        }
    }

    func closeTerminal(_ id: Int) {
        guard let terminal = terminal(for: id) else { return }
        if terminal.isRunning {
            let alert = NSAlert()
            alert.messageText = "End this agent session?"
            alert.informativeText = "Closing this tab ends its running process."
            alert.addButton(withTitle: "End Session"); alert.addButton(withTitle: "Cancel")
            guard alert.runModal() == .alertFirstButtonReturn else { return }
            terminal.terminate()
        }
        terminals.removeAll { $0.id == id }
        var dock = terminalDock
        dock.remove(id, availableIDs: terminals.map(\.id))
        terminalDock = dock
        if terminals.isEmpty { terminalExpanded = false }
    }

    func moveTerminal(_ id: Int, to targetID: Int) {
        guard id != targetID, let from = terminals.firstIndex(where: { $0.id == id }),
              let to = terminals.firstIndex(where: { $0.id == targetID }) else { return }
        let terminal = terminals.remove(at: from)
        terminals.insert(terminal, at: to)
    }

    func linkTerminalToSelectedSession(_ id: Int) {
        guard let selectedID, let terminal = terminal(for: id), terminal.isRunning else { return }
        // Explicit user evidence is scoped to this running tab, never guessed from its folder.
        for other in terminals where other.id != id && other.explicitSessionID == selectedID {
            other.explicitSessionID = nil
            if other.sessionID == selectedID { other.sessionID = nil }
        }
        terminal.explicitSessionID = selectedID
        terminal.sessionID = selectedID
        selectWebSession(selectedID)
        publishTerminalSelection()
    }

    func selectTerminalTab(_ id: Int) {
        guard let terminal = terminal(for: id) else { return }
        var dock = terminalDock
        dock.show(id)
        terminalDock = dock
        selectedID = terminal.sessionID
    }

    func selectTerminalTab(number: Int) {
        guard (1...9).contains(number), terminals.count >= number else { return }
        selectTerminalTab(terminals[number - 1].id)
    }

    func renameSelectedTerminal() {
        guard let terminal = terminal(for: selectedTerminalID) else { return }
        let alert = NSAlert()
        alert.messageText = "Rename Terminal Tab"
        alert.informativeText = "Leave the name empty to use the agent's title."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        field.stringValue = terminal.title
        alert.accessoryView = field
        alert.addButton(withTitle: "Rename")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        terminal.rename(field.stringValue)
    }

    func hideTerminal() {
        var dock = terminalDock
        dock.hide()
        terminalDock = dock
        terminalExpanded = false
    }

    func toggleTerminal() {
        var dock = terminalDock
        if dock.toggle(availableIDs: terminals.map(\.id)) {
            terminalDock = dock
            if dock.visibleID == nil { terminalExpanded = false }
            return
        }
        chooseNewTerminal()
    }

    func toggleTerminalExpanded() {
        if selectedTerminalID == nil {
            var dock = terminalDock
            guard dock.toggle(availableIDs: terminals.map(\.id)) else { return }
            terminalDock = dock
            terminalExpanded = true
        } else {
            terminalExpanded.toggle()
        }
    }

    func zoomIn() { var zoom = interfaceZoom; zoom.increase(); setZoom(zoom) }
    func zoomOut() { var zoom = interfaceZoom; zoom.decrease(); setZoom(zoom) }
    func resetZoom() { var zoom = interfaceZoom; zoom.reset(); setZoom(zoom) }

    var diagnostics: String {
        """
        KlipRun \(updater.installedVersion)
        macOS: \(ProcessInfo.processInfo.operatingSystemVersionString)
        Architecture: \(AppUpdateClient.architecture)
        Engine: \(runtime.baseURL == nil ? "offline" : "running on loopback")
        Active terminals: \(activeTerminalCount)
        Interface scale: \(interfaceZoom.percent)%
        Terminal position: \(preferences.terminalPosition)
        """
    }

    private func setZoom(_ zoom: InterfaceZoom) {
        updatePreferences { $0.interfaceZoomPercent = zoom.percent }
    }

    func showSettings() {
        NSApp.activate(ignoringOtherApps: true)
        updater.isPresented = false
        showingSettings = true
    }

    func checkForUpdates() {
        NSApp.activate(ignoringOtherApps: true)
        showingSettings = false
        updater.show()
    }

    func previewNotification() {
        notifications.preview { [weak self] in
            self?.showingSettings = false
            NSApp.activate(ignoringOtherApps: true)
            self?.webView?.evaluateJavaScript("window.history.pushState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate'));")
        }
    }

    func openSelectedInITerm() {
        guard let selectedID else { return }
        if let message = ExternalTerminal.open(pid: terminalPID(for: selectedID)) {
            let alert = NSAlert(); alert.messageText = message; alert.runModal()
        }
    }

    private func terminalPID(for sessionID: String) -> Int32? {
        var id: String? = sessionID
        while let current = id {
            if let pid = links[current] { return pid }
            id = board?.card(current)?.parentID
        }
        return nil
    }

    private func ownedTerminals() -> [String: Int] {
        var direct: [String: Int] = [:]
        for terminal in terminals where terminal.isRunning {
            if let sessionID = terminal.sessionID, direct[sessionID] == nil { direct[sessionID] = terminal.id }
        }
        var result = direct
        for card in board?.cards ?? [] {
            var ancestor = card.parentID
            while let id = ancestor {
                if let terminalID = direct[id] { result[card.id] = terminalID; break }
                ancestor = board?.card(id)?.parentID
            }
        }
        return result
    }

    private func processParents() -> [Int32: Int32] {
        let command = Process()
        command.executableURL = URL(fileURLWithPath: "/bin/ps")
        command.arguments = ["-axo", "pid=,ppid="]
        let pipe = Pipe()
        command.standardOutput = pipe
        command.standardError = FileHandle.nullDevice
        do {
            try command.run()
            let output = pipe.fileHandleForReading.readDataToEndOfFile()
            command.waitUntilExit()
            return ProcessTree.parents(from: String(decoding: output, as: UTF8.self))
        } catch { return [:] }
    }

    private func attachedTerminalChildCount() -> Int {
        let command = Process()
        command.executableURL = URL(fileURLWithPath: "/bin/ps")
        command.arguments = ["-axo", "pid=,ppid=,tty=,command="]
        let pipe = Pipe()
        command.standardOutput = pipe
        command.standardError = FileHandle.nullDevice
        do {
            try command.run()
            let output = pipe.fileHandleForReading.readDataToEndOfFile()
            command.waitUntilExit()
            return ProcessTree.terminalChildren(of: ProcessInfo.processInfo.processIdentifier,
                                                in: String(decoding: output, as: UTF8.self))
        } catch { return 0 }
    }
}
