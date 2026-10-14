import Foundation

public struct AgentLaunch {
    public let arguments: [String]
    public let environment: [String: String]

    public static func make(source: String, home: String, inherited: [String: String],
                            isExecutable: (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }) -> Self? {
        guard source == "opencode" || source == "codex" || source == "terminal" else { return nil }
        let command = source == "codex" && isExecutable("\(home)/.local/bin/codex-vk") ? "codex-vk" : source
        var environment = inherited
        let search = ["\(home)/.local/bin", "\(home)/.opencode/bin", "\(home)/.bun/bin", "/opt/homebrew/bin", "/usr/local/bin"]
        environment["PATH"] = (search + [inherited["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"]).joined(separator: ":")
        environment["HOME"] = home
        environment["TERM"] = "xterm-256color"
        environment["COLORTERM"] = "truecolor"
        if environment["LANG"]?.isEmpty != false { environment["LANG"] = "en_US.UTF-8" }
        return Self(arguments: source == "terminal" ? ["-l", "-i"] : ["-lic", "exec \(command)"], environment: environment)
    }
}
