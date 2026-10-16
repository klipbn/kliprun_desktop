import Foundation
import KlipRunCore

struct TerminalLink: Decodable { let session_id: String; let pid: Int32 }
struct CodexTerminalProcess: Decodable { let pid: Int32; let generation: String }
struct TerminalLinks: Decodable { let links: [TerminalLink]; let codex_terminals: [CodexTerminalProcess]? }
struct ResumeSessionDetail: Decodable {
    let source: String
    let session_id: String
    let directory: String
    let exists: Bool
}

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

    func observeCodexSession(_ process: CodexTerminalProcess, prefix: String?) async throws -> Bool {
        guard let url = DesktopURL.make(base: baseURL, pathAndQuery: "api/codex/terminal-observation") else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 10
        request.httpBody = try JSONSerialization.data(withJSONObject: ["pid": process.pid, "generation": process.generation,
                                                                       "session_prefix": prefix as Any? ?? NSNull()])
        let (_, response) = try await URLSession.shared.data(for: request)
        return (response as? HTTPURLResponse)?.statusCode == 200
    }
}
