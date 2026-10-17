import Foundation
import Testing
@testable import KlipRunCore

@Test(arguments: ["loft", "pods", "studio"])
func officeChoicesSurviveRelaunch(_ layout: String) throws {
    let suite = "local.kliprun.office-tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let value = try #require(OfficePreferences(message: ["layout": layout, "labels": false, "links": true, "animate": false]))
    value.save(to: defaults)
    let restored = OfficePreferences(defaults: defaults)
    #expect(restored == value)
    #expect(restored.webScript.contains("\"layout\":\"\(layout)\""))
}

@Test func officeRejectsMalformedMessagesAndRecoversInvalidStorage() {
    #expect(OfficePreferences(message: ["layout": "');alert(1)", "labels": true, "links": true, "animate": true]) == nil)
    #expect(OfficePreferences(message: ["layout": "loft", "labels": "false", "links": true, "animate": true]) == nil)
    #expect(OfficePreferences(message: ["layout": "loft"]) == nil)
    let suite = "local.kliprun.office-tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    defaults.set("invalid", forKey: "office.layout")
    #expect(OfficePreferences(defaults: defaults).layout == "loft")
    #expect(OfficePreferences(defaults: defaults).animate == true)
}
