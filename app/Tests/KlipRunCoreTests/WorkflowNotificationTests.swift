import Foundation
import Testing
@testable import KlipRunCore

@Test func workflowNotificationsAreDeduplicatedAndIncludeFastNewRuns() throws {
    func notice(_ id: String, _ status: String) throws -> WorkflowNotice {
        let data = try JSONSerialization.data(withJSONObject: ["id":id,"workflowId":"flow","runId":"run","name":"Review a report","status":status,"revision":1000,"nodeId":"review"])
        return try JSONDecoder().decode(WorkflowNotice.self, from: data)
    }
    var tracker = WorkflowNotificationTracker()
    #expect(tracker.observe([try notice("old", "completed")]).isEmpty)
    let ready = try notice("new", "human_review")
    #expect(tracker.observe([ready]).map(\.id) == ["new"])
    #expect(tracker.observe([ready]).isEmpty)
    #expect(ready.notification.actionLabel == "Open workflow")
    #expect(ready.notification.message.contains("human review"))
    #expect(tracker.observe([try notice("again", "needs_attention")]).first?.notification.kind == .input)
    #expect(tracker.observe([try notice("done", "completed")]).first?.notification.kind == .finished)
}
