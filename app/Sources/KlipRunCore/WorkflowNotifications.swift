import Foundation

public struct WorkflowNotice: Decodable {
    public let id: String
    public let workflowId: String
    public let runId: String
    public let name: String
    public let status: String
    public let revision: Double
    public let nodeId: String?
    public var notification: AgentNotification {
        let message = status == "human_review" ? "Workflow is ready for human review."
            : status == "completed" ? "Workflow completed. The results are ready."
            : "Workflow needs attention. Open the task to review the reason."
        return AgentNotification(sessionID: "workflow:\(workflowId)", title: name,
                                 kind: status == "needs_attention" ? .input : .finished,
                                 revision: revision, message: message, actionLabel: "Open workflow")
    }
}
/// A Workflow card the engine wants to run in a terminal tab the user can watch.
public struct WorkflowLaunch: Decodable, Equatable {
    public let attemptId: String
    public let workflowName: String
    public let title: String
    public let source: String
    public let directory: String
    public let argv: [String]
    public let promptFile: String
    public var tabName: String { "\(workflowName) · \(title)" }
    public func agentLaunch(home: String, inherited: [String: String]) -> AgentLaunch? {
        guard directory.hasPrefix("/") else { return nil }
        return AgentLaunch.workflow(source: source, argv: argv, promptFile: promptFile, home: home, inherited: inherited)
    }
}
public struct WorkflowStatusSnapshot: Decodable {
    public let notices: [WorkflowNotice]
    public let launches: [WorkflowLaunch]
    /// Attempts whose cards stopped for attention; their terminal tabs should be on screen.
    public let attention: [String]
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        notices = try values.decode([WorkflowNotice].self, forKey: .notices)
        launches = try values.decodeIfPresent([WorkflowLaunch].self, forKey: .launches) ?? []
        attention = try values.decodeIfPresent([String].self, forKey: .attention) ?? []
    }
    private enum CodingKeys: String, CodingKey { case notices, launches, attention }
}
public struct WorkflowNotificationTracker {
    private var initialized = false
    private var seen: [String] = []
    public init() {}
    public mutating func observe(_ notices: [WorkflowNotice]) -> [WorkflowNotice] {
        let fresh = notices.filter { !seen.contains($0.id) }
        seen.append(contentsOf: fresh.map(\.id))
        if seen.count > 500 { seen.removeFirst(seen.count - 500) }
        defer { initialized = true }
        return initialized ? fresh : []
    }
}
