import Foundation
import Testing
@testable import KlipRunCore

@Test func apiURLKeepsTheQueryOutsideThePath() {
    let url = DesktopURL.make(base: URL(string: "http://127.0.0.1:1234")!, pathAndQuery: "api/stats?from=1&to=2")
    #expect(url?.path == "/api/stats")
    #expect(url?.query == "from=1&to=2")
}
