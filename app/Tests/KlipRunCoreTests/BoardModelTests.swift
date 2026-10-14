import Foundation
import Testing
@testable import KlipRunCore

@Test func boardDecodesNestedCardsAndKeepsTheirSource() throws {
    let json = """
    {"columns":{"attention":{"title":"Needs attention","count":0,"cards":[]},"running":{"title":"Running","count":2,"cards":[{"source":"opencode","session_id":"ses_parent","directory":"/work","directory_name":"work","title":"Parent","column":"running","stage":"Working","stage_since":1000,"last_event_at":1000,"children":[{"source":"opencode","session_id":"ses_child","directory":"/work","directory_name":"work","title":"Child","column":"running","stage":"Working","stage_since":1000,"last_event_at":1000,"children":[]}]}]},"idle":{"title":"IDLE","count":0,"cards":[]}},"generated_at":1000}
    """
    let board = try JSONDecoder().decode(DesktopBoard.self, from: Data(json.utf8))
    #expect(board.cards.map(\.id) == ["ses_parent", "ses_child"])
    #expect(board.card("ses_child")?.source == "opencode")
}
