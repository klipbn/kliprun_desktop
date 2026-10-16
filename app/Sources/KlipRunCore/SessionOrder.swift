import Foundation

public struct SessionOrder {
    private let defaults: UserDefaults
    private let key = "session.cardOrder"
    private static let columns: Set<String> = ["attention", "running", "idle"]

    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    public var values: [String: [String]] {
        (defaults.dictionary(forKey: key) as? [String: [String]] ?? [:])
            .filter { Self.columns.contains($0.key) }
    }

    @discardableResult public func set(_ order: [String: [String]]) -> Bool {
        guard Set(order.keys).isSubset(of: Self.columns),
              order.values.allSatisfy({ Set($0).count == $0.count }) else { return false }
        defaults.set(order, forKey: key)
        return true
    }

    public var webScript: String {
        let data = try? JSONSerialization.data(withJSONObject: values, options: [.sortedKeys])
        let json = data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        return "window.kliprunCardOrder = \(json);"
    }
}
