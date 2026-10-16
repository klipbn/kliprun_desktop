import Foundation

public struct TerminalTitle {
    /// Codex 0.163 truncates UUID title items to 29 characters plus three dots.
    public static func codexSessionPrefix(_ title: String) -> String? {
        let pattern = "^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{5}(?:[a-fA-F0-9]{7}|\\.\\.\\.)(?: [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏])?$"
        guard title.range(of: pattern, options: .regularExpression) != nil else { return nil }
        return String(title.prefix(while: { $0 != "." && $0 != " " })).lowercased()
    }

    private var automatic: String
    private var custom: String?
    public var display: String { custom ?? automatic }

    public init(automatic: String) { self.automatic = automatic }

    public mutating func updateAutomatic(_ title: String) {
        if !title.isEmpty { automatic = title }
    }

    public mutating func rename(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        custom = trimmed.isEmpty ? nil : trimmed
    }
}
