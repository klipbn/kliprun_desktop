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
public struct WorkflowStatusSnapshot: Decodable { public let notices: [WorkflowNotice] }
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
