import Foundation

public struct GitWorkspace {
    private let defaults: UserDefaults
    private let key = "git.workspace"
    private static var empty: [String: Any] { ["version": 1, "repositories": [:]] }

    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    public var value: [String: Any] {
        guard let data = defaults.data(forKey: key),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              Self.valid(value) else { return Self.empty }
        return value
    }

    private static func valid(_ value: [String: Any]) -> Bool {
        guard value["version"] as? Int == 1, let repositories = value["repositories"] as? [String: Any],
              repositories.count <= 100, repositories.keys.allSatisfy({ $0.hasPrefix("/") && $0.utf8.count <= 4096 && !$0.utf8.contains(0) }),
              repositories.values.allSatisfy({ $0 is [String: Any] }), JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value), data.count <= 4 * 1024 * 1024 else { return false }
        return true
    }

    @discardableResult public func set(_ value: [String: Any]) -> Bool {
        guard Self.valid(value), let data = try? JSONSerialization.data(withJSONObject: value) else { return false }
        defaults.set(data, forKey: key)
        return true
    }

    public var webScript: String {
        let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        return "window.kliprunGitWorkspace = \(String(decoding: data, as: UTF8.self));"
    }
}
