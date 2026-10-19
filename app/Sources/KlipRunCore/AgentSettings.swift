import Foundation

public struct AgentSettings: Equatable {
    public static let sources = ["opencode", "codex", "claude"]
    public var model: String
    public var cliPath: String
    public var arguments: String

    public init(model: String = "", cliPath: String = "", arguments: String = "") {
        self.model = model
        self.cliPath = cliPath
        self.arguments = arguments
    }

    public init(source: String, defaults: UserDefaults) {
        self.init(model: defaults.string(forKey: "agents.\(source).model") ?? "",
                  cliPath: defaults.string(forKey: "agents.\(source).cliPath") ?? "",
                  arguments: defaults.string(forKey: "agents.\(source).arguments") ?? "")
    }

    public func save(source: String, to defaults: UserDefaults) {
        guard Self.sources.contains(source) else { return }
        defaults.set(model, forKey: "agents.\(source).model")
        defaults.set(cliPath, forKey: "agents.\(source).cliPath")
        defaults.set(arguments, forKey: "agents.\(source).arguments")
    }

    public static func workflowJSON(_ settings: [String: AgentSettings]) -> Data? {
        var payload: [String: [String: Any]] = [:]
        for source in sources {
            let value = settings[source] ?? AgentSettings()
            guard value.validationMessage == nil, let arguments = value.parsedArguments else { return nil }
            payload[source] = ["cliPath": value.cliPath, "model": value.model, "arguments": arguments]
        }
        return try? JSONSerialization.data(withJSONObject: payload)
    }

    public var validationMessage: String? {
        if [model, cliPath, arguments].contains(where: { $0.utf8.contains(0) }) { return "Remove null characters from the launch settings." }
        if cliPath.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("-") { return "Enter a CLI path or command name." }
        if parsedArguments == nil { return "Close the quote or complete the escape in Launch arguments." }
        return nil
    }

    /// Shell-style quoting groups arguments; expansions and commands remain literal text.
    public var parsedArguments: [String]? {
        var result: [String] = [], value = "", quote: Character?, escaped = false, started = false
        for character in arguments {
            if escaped {
                if quote == "\"" && !["\"", "\\", "$", "`", "\n"].contains(character) { value.append("\\") }
                if character != "\n" { value.append(character); started = true }
                escaped = false
            } else if quote == "'" {
                if character == "'" { quote = nil } else { value.append(character) }
            } else if character == "\\" {
                escaped = true
            } else if let current = quote {
                if character == current { quote = nil } else { value.append(character) }
            } else if character == "'" || character == "\"" {
                quote = character; started = true
            } else if character.isWhitespace {
                if started { result.append(value); value = ""; started = false }
            } else {
                value.append(character); started = true
            }
        }
        guard quote == nil, !escaped else { return nil }
        if started { result.append(value) }
        return result
    }
}
