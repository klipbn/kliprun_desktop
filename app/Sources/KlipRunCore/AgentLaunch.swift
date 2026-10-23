import Foundation

public struct AgentLaunch {
    public let arguments: [String]
    public let environment: [String: String]

    public static func make(source: String, home: String, inherited: [String: String], sessionID: String? = nil,
                            settings: AgentSettings = AgentSettings(),
                            isExecutable: (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }) -> Self? {
        guard source == "opencode" || source == "codex" || source == "claude" || source == "terminal" else { return nil }
        if source != "terminal", settings.validationMessage != nil { return nil }
        let configured = settings.cliPath.trimmingCharacters(in: .whitespacesAndNewlines)
        var command = source == "codex" && isExecutable("\(home)/.local/bin/codex-vk") ? "codex-vk" : source
        if !configured.isEmpty { command = configured.hasPrefix("~/") ? home + "/" + configured.dropFirst(2) : configured }
        var resume = ""
        if let sessionID {
            switch source {
            case "codex":
                guard sessionID.hasPrefix("codex:"), UUID(uuidString: String(sessionID.dropFirst(6))) != nil else { return nil }
                resume = " resume \(sessionID.dropFirst(6))"
            case "opencode":
                guard sessionID.range(of: "^ses_[a-zA-Z0-9_-]+$", options: .regularExpression) != nil else { return nil }
                resume = " --session \(sessionID)"
            case "claude":
                guard sessionID.hasPrefix("claude:"), UUID(uuidString: String(sessionID.dropFirst(7))) != nil else { return nil }
                resume = " --resume \(sessionID.dropFirst(7))"
            default: return nil
            }
        }
        let environment = Self.environment(source: source, home: home, inherited: inherited)
        let title = source == "codex" ? " -c 'tui.terminal_title=[\"session-id\"]'" : ""
        let model = settings.model.trimmingCharacters(in: .whitespacesAndNewlines)
        let options = (model.isEmpty ? [] : ["--model", model]) + (settings.parsedArguments ?? [])
        let extra = options.isEmpty ? "" : " " + options.map(shellQuote).joined(separator: " ")
        return Self(arguments: source == "terminal" ? ["-l", "-i"] : ["-lic", "exec \(shellQuote(command))\(title)\(resume)\(extra)"], environment: environment)
    }

    /// The CLI reads the task file itself, keeping long workflow histories out of exec's argument limit.
    public static func workflow(source: String, argv: [String], promptFile: String, home: String, inherited: [String: String]) -> Self? {
        guard source == "claude" || source == "codex", !argv.isEmpty,
              argv.allSatisfy({ !$0.isEmpty && !$0.contains("\0") }),
              promptFile.hasPrefix("/"), !promptFile.contains("\0") else { return nil }
        let prompt = "Read the full Workflow task from \(promptFile). Follow all its instructions and complete the task."
        let command = (argv + [prompt]).map(shellQuote).joined(separator: " ")
        return Self(arguments: ["-lic", "exec \(command)"], environment: environment(source: source, home: home, inherited: inherited))
    }

    private static func environment(source: String, home: String, inherited: [String: String]) -> [String: String] {
        var environment = inherited
        // The app launcher may disable colors for its own logs; the embedded PTY supports colors.
        environment.removeValue(forKey: "NO_COLOR")
        if source == "claude" {
            environment.removeValue(forKey: "CLAUDECODE")
            environment.removeValue(forKey: "CLAUDE_CODE_ENTRYPOINT")
        }
        let search = ["\(home)/.local/bin", "\(home)/.opencode/bin", "\(home)/.bun/bin", "/opt/homebrew/bin", "/usr/local/bin"]
        environment["PATH"] = (search + [inherited["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"]).joined(separator: ":")
        environment["HOME"] = home
        environment["TERM"] = "xterm-256color"
        environment["COLORTERM"] = "truecolor"
        if environment["LANG"]?.isEmpty != false { environment["LANG"] = "en_US.UTF-8" }
        return environment
    }

    private static func shellQuote(_ value: String) -> String {
        if value.range(of: "^[a-zA-Z0-9_./:@%+=,-]+$", options: .regularExpression) != nil { return value }
        return "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}
