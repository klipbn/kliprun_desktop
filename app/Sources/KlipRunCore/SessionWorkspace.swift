import Foundation

/// KlipRun organization only; independent of the engine port and agent stores.
public struct SessionWorkspace {
    private let defaults: UserDefaults
    private let key = "session.workspace"
    private struct Group: Codable { let id: String; let name: String }
    private struct Project: Codable { let id: String; let name: String; let groups: [Group] }
    private struct Assignment: Codable { let projectId: String; let groupId: String? }
    private struct Snapshot: Codable {
        let version: Int
        let projects: [Project]
        let assignments: [String: Assignment]
        let favorites: [String]
        let collapsed: [String]
        let sidebarCollapsed: Bool
        let sidebarWidth: Double?
    }
    private static let empty = "{\"version\":1,\"projects\":[],\"assignments\":{},\"favorites\":[],\"collapsed\":[],\"sidebarCollapsed\":false}"

    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    private static func valid(_ data: Data) -> Bool {
        guard data.count <= 4 * 1024 * 1024, let value = try? JSONDecoder().decode(Snapshot.self, from: data), value.version == 1 else { return false }
        func text(_ text: String, _ limit: Int) -> Bool { !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && text.utf16.count <= limit && !text.utf8.contains(0) }
        func strings(_ strings: [String], _ limit: Int) -> Bool { strings.count <= limit && Set(strings).count == strings.count && strings.allSatisfy { text($0, 512) } }
        guard value.projects.count <= 200, value.assignments.count <= 100000,
              strings(value.favorites, 100000), strings(value.collapsed, 10000),
              Set(value.projects.map(\.id)).count == value.projects.count,
              Set(value.projects.map { $0.name.lowercased() }).count == value.projects.count else { return false }
        if let width = value.sidebarWidth, !width.isFinite || !(118...480).contains(width) { return false }
        for project in value.projects {
            guard text(project.id, 200), text(project.name, 60), project.groups.count <= 200,
                  Set(project.groups.map(\.id)).count == project.groups.count,
                  Set(project.groups.map { $0.name.lowercased() }).count == project.groups.count,
                  project.groups.allSatisfy({ text($0.id, 200) && text($0.name, 60) && $0.name.lowercased() != "uncategorized" }) else { return false }
        }
        return value.assignments.allSatisfy { id, assignment in
            guard text(id, 512), let project = value.projects.first(where: { $0.id == assignment.projectId }) else { return false }
            return assignment.groupId == nil || project.groups.contains(where: { $0.id == assignment.groupId })
        }
    }
    public var json: String {
        guard let data = defaults.data(forKey: key), Self.valid(data), let string = String(data: data, encoding: .utf8) else { return Self.empty }
        return string
    }
    @discardableResult public func set(_ message: [String: Any]) -> Bool {
        guard JSONSerialization.isValidJSONObject(message), let data = try? JSONSerialization.data(withJSONObject: message, options: [.sortedKeys]), Self.valid(data) else { return false }
        defaults.set(data, forKey: key)
        return true
    }
    public var webScript: String { "window.kliprunSessionWorkspace = \(json);" }
}
