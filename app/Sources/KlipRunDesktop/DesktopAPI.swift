import Foundation
import KlipRunCore

struct TerminalLink: Decodable { let session_id: String; let pid: Int32 }
struct TerminalLinks: Decodable { let links: [TerminalLink] }

@MainActor final class DesktopAPI {
    let baseURL: URL
    let token: String
    init(baseURL: URL, token: String) { self.baseURL = baseURL; self.token = token }

    func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        guard let url = DesktopURL.make(base: baseURL, pathAndQuery: path) else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 10
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(type, from: data)
    }

    func board() async throws -> (DesktopBoard, BoardSnapshot) {
        var request = URLRequest(url: DesktopURL.make(base: baseURL, pathAndQuery: "api/board")!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 10
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return (try JSONDecoder().decode(DesktopBoard.self, from: data), try JSONDecoder().decode(BoardSnapshot.self, from: data))
    }
}
