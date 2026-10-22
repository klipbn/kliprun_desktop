import Foundation

public struct SessionPriorities {
    private let defaults: UserDefaults
    private let key = "session.priorities"
    private static let allowed: Set<String> = ["critical", "medium", "low", "question", "warning", "urgent", "blocked"]

    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    public var values: [String: String] {
        (defaults.dictionary(forKey: key) as? [String: String] ?? [:])
            .filter { Self.allowed.contains($0.value) }
    }

    @discardableResult public func set(_ priorities: [String: String]) -> Bool {
        guard priorities.values.allSatisfy(Self.allowed.contains) else { return false }
        defaults.set(priorities, forKey: key)
        return true
    }

    public var webScript: String {
        let data = try? JSONSerialization.data(withJSONObject: values, options: [.sortedKeys])
        let json = data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        return "window.kliprunCardPriorities = \(json);"
    }
}
