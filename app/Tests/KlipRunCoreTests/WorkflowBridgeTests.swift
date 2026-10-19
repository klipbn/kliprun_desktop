import Foundation
import Testing
@testable import KlipRunCore

@Test func workflowSettingsPreserveConfiguredCLIModelAndLiteralArguments() throws {
    let settings = ["codex": AgentSettings(model: "custom-model", cliPath: "/tmp/custom codex", arguments: "-c 'model_reasoning_effort=high'")]
    let data = try #require(AgentSettings.workflowJSON(settings))
    let value = try #require(JSONSerialization.jsonObject(with: data) as? [String: [String: Any]])
    #expect(value["codex"]?["cliPath"] as? String == "/tmp/custom codex")
    #expect(value["codex"]?["arguments"] as? [String] == ["-c", "model_reasoning_effort=high"])
    #expect(value["codex"]?["model"] as? String == "custom-model")
    #expect(AgentSettings.workflowJSON(["codex": AgentSettings(arguments: "'unfinished")]) == nil)
}
