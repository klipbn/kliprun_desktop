import Foundation

public struct TerminalTitle {
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
