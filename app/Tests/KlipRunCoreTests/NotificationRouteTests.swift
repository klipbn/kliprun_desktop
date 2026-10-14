import Testing
@testable import KlipRunCore

@Test func notificationOpensTheMatchingOwnedTerminal() {
    let route = NotificationRoute.resolve(sessionID: "ses_second", owned: ["ses_first": 1, "ses_second": 2])
    #expect(route == .terminal(sessionID: "ses_second", terminalID: 2))
}

@Test func notificationOpensActivityForAnExternalSession() {
    let route = NotificationRoute.resolve(sessionID: "codex:abc", owned: ["ses_first": 1])
    #expect(route == .activity(sessionID: "codex:abc"))
}
