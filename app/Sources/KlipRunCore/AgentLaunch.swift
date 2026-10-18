import Foundation

public struct AgentLaunch {
    public let arguments: [String]
    public let environment: [String: String]

    public static func make(source: String, home: String, inherited: [String: String], sessionID: String? = nil,
                            isExecutable: (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }) -> Self? {
        guard source == "opencode" || source == "codex" || source == "claude" || source == "terminal" else { return nil }
        let command = source == "codex" && isExecutable("\(home)/.local/bin/codex-vk") ? "codex-vk" : source
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
        var environment = inherited
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
        let title = source == "codex" ? " -c 'tui.terminal_title=[\"session-id\"]'" : ""
        return Self(arguments: source == "terminal" ? ["-l", "-i"] : ["-lic", "exec \(command)\(title)\(resume)"], environment: environment)
    }
}
