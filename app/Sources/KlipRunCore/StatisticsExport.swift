import Foundation

public struct StatisticsExport {
    public let filename: String
    public let data: Data

    public init?(filename: String, content: String) {
        guard filename.utf8.count <= 160,
              filename.range(of: "^kliprun-tokens-[A-Za-z0-9-]+\\.csv\\z", options: .regularExpression) != nil,
              content.utf8.count <= 10_000_000 else { return nil }
        self.filename = filename
        self.data = Data(content.utf8)
    }
}
