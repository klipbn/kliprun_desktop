import Testing
@testable import KlipRunCore

@Test func bundledEngineAlwaysScansUTF8Paths() {
    let environment = EngineEnvironment.make(inherited: ["HOME": "/Users/test", "LC_ALL": "C"],
                                              token: "local-token", statePath: "/private/tmp/state")
    #expect(environment["LANG"] == "en_US.UTF-8")
    #expect(environment["LC_ALL"] == "en_US.UTF-8")
    #expect(environment["KLIPRUN_DESKTOP_TOKEN"] == "local-token")
    #expect(environment["KLIPRUN_BUN_HOME"] == "/private/tmp/state")
}
