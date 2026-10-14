import Foundation

public struct BoardCard: Decodable, Identifiable, Hashable {
    public struct Agent: Decodable, Hashable { public let name: String }
    public struct Context: Decodable, Hashable { public let model: String; public let percent: Double; public let used: Int; public let limit: Int }
    public struct Link: Decodable, Hashable { public let url: String; public let label: String }

    public let source: String
    public let id: String
    public let directory: String
    public let directoryName: String
    public let title: String
    public let parentID: String?
    public let column: String
    public let stage: String
    public let stageSince: Double
    public let runningSince: Double?
    public let lastEventAt: Double
    public let finishedAt: Double?
    public let model: String?
    public let context: Context?
    public let branch: String?
    public let agent: Agent?
    public let children: [BoardCard]
    public let error: String?
    public let reason: String?
    public let subagentCount: Int
    public let subagentActive: Int
    public let mrs: [Link]

    enum CodingKeys: String, CodingKey {
        case source, id = "session_id", directory, directoryName = "directory_name", title
        case parentID = "parent_id", column, stage, stageSince = "stage_since"
        case runningSince = "running_since", lastEventAt = "last_event_at", finishedAt = "finished_at"
        case model = "model_ref", context, branch, agent, children, error, reason
        case subagentCount = "subagent_count", subagentActive = "subagent_active", mrs
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        source = try c.decode(String.self, forKey: .source)
        id = try c.decode(String.self, forKey: .id)
        directory = try c.decode(String.self, forKey: .directory)
        directoryName = try c.decode(String.self, forKey: .directoryName)
        title = try c.decode(String.self, forKey: .title)
        parentID = try c.decodeIfPresent(String.self, forKey: .parentID)
        column = try c.decode(String.self, forKey: .column)
        stage = try c.decode(String.self, forKey: .stage)
        stageSince = try c.decode(Double.self, forKey: .stageSince)
        runningSince = try c.decodeIfPresent(Double.self, forKey: .runningSince)
        lastEventAt = try c.decode(Double.self, forKey: .lastEventAt)
        finishedAt = try c.decodeIfPresent(Double.self, forKey: .finishedAt)
        model = try c.decodeIfPresent(String.self, forKey: .model)
        context = try c.decodeIfPresent(Context.self, forKey: .context)
        branch = try c.decodeIfPresent(String.self, forKey: .branch)
        agent = try c.decodeIfPresent(Agent.self, forKey: .agent)
        children = try c.decodeIfPresent([BoardCard].self, forKey: .children) ?? []
        error = try c.decodeIfPresent(String.self, forKey: .error)
        reason = try c.decodeIfPresent(String.self, forKey: .reason)
        subagentCount = try c.decodeIfPresent(Int.self, forKey: .subagentCount) ?? 0
        subagentActive = try c.decodeIfPresent(Int.self, forKey: .subagentActive) ?? 0
        mrs = try c.decodeIfPresent([Link].self, forKey: .mrs) ?? []
    }

}

public struct DesktopBoard: Decodable {
    public struct Column: Decodable { public let title: String; public let count: Int; public let cards: [BoardCard] }
    public let columns: [String: Column]
    public let generatedAt: Double
    enum CodingKeys: String, CodingKey { case columns, generatedAt = "generated_at" }

    public var cards: [BoardCard] {
        var result: [BoardCard] = []
        func visit(_ card: BoardCard) { result.append(card); card.children.forEach(visit) }
        for key in ["attention", "running", "idle"] { columns[key]?.cards.forEach(visit) }
        return result
    }

    public func card(_ id: String) -> BoardCard? { cards.first { $0.id == id } }
}
