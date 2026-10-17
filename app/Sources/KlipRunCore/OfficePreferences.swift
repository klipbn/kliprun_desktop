import Foundation

public struct OfficePreferences: Codable, Equatable {
    public let layout: String
    public let labels: Bool
    public let links: Bool
    public let animate: Bool

    public init(defaults: UserDefaults = .standard) {
        let saved = defaults.string(forKey: "office.layout") ?? "loft"
        layout = ["loft", "pods", "studio"].contains(saved) ? saved : "loft"
        labels = defaults.object(forKey: "office.labels") as? Bool ?? true
        links = defaults.object(forKey: "office.links") as? Bool ?? true
        animate = defaults.object(forKey: "office.animate") as? Bool ?? true
    }

    public init?(message: [String: Any]) {
        guard let layout = message["layout"] as? String, ["loft", "pods", "studio"].contains(layout),
              let labels = message["labels"] as? Bool, let links = message["links"] as? Bool,
              let animate = message["animate"] as? Bool else { return nil }
        self.layout = layout
        self.labels = labels
        self.links = links
        self.animate = animate
    }

    public func save(to defaults: UserDefaults = .standard) {
        defaults.set(layout, forKey: "office.layout")
        defaults.set(labels, forKey: "office.labels")
        defaults.set(links, forKey: "office.links")
        defaults.set(animate, forKey: "office.animate")
    }

    public var webScript: String {
        let data = try! JSONEncoder().encode(self)
        return "window.kliprunOfficePreferences = \(String(decoding: data, as: UTF8.self));"
    }
}
