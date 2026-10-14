import Foundation

public enum DesktopURL {
    public static func make(base: URL, pathAndQuery: String) -> URL? {
        let parts = pathAndQuery.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        guard var components = URLComponents(url: base.appendingPathComponent(String(parts[0])), resolvingAgainstBaseURL: false) else { return nil }
        if parts.count == 2 { components.percentEncodedQuery = String(parts[1]) }
        return components.url
    }
}
