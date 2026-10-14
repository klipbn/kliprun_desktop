public enum NotificationRoute: Equatable {
    case terminal(sessionID: String, terminalID: Int)
    case activity(sessionID: String)

    public static func resolve(sessionID: String, owned: [String: Int]) -> Self {
        if let terminalID = owned[sessionID] {
            return .terminal(sessionID: sessionID, terminalID: terminalID)
        }
        return .activity(sessionID: sessionID)
    }
}
