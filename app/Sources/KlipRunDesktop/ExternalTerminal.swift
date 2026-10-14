import AppKit

@MainActor
enum ExternalTerminal {
    static func open(pid: Int32?) -> String? {
        guard !NSRunningApplication.runningApplications(withBundleIdentifier: "com.googlecode.iterm2").isEmpty else {
            return "iTerm2 is not running"
        }
        guard let pid, let tty = terminalTTY(pid: pid) else {
            activate(); return "Could not identify the exact tab; iTerm2 was activated"
        }
        let script = """
        tell application id "com.googlecode.iterm2"
          repeat with w in windows
            repeat with t in tabs of w
              repeat with s in sessions of t
                if (tty of s as text) is "/dev/\(tty)" then
                  select t
                  activate
                  return "found"
                end if
              end repeat
            end repeat
          end repeat
          activate
        end tell
        return "missing"
        """
        let command = Process()
        command.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        command.arguments = ["-e", script]
        let pipe = Pipe(); command.standardOutput = pipe; command.standardError = Pipe()
        do {
            try command.run(); command.waitUntilExit()
            let result = String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
            if command.terminationStatus == 0 && result.contains("found") { return nil }
        } catch { /* Fall back to activating the app. */ }
        activate()
        return "Could not identify the exact tab; iTerm2 was activated"
    }

    private static func terminalTTY(pid: Int32) -> String? {
        guard pid > 0 else { return nil }
        let command = Process()
        command.executableURL = URL(fileURLWithPath: "/bin/ps")
        command.arguments = ["-p", String(pid), "-o", "tty="]
        let pipe = Pipe(); command.standardOutput = pipe; command.standardError = Pipe()
        do {
            try command.run(); command.waitUntilExit()
            let value = String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return value.range(of: #"^ttys[0-9A-Za-z]+$"#, options: .regularExpression) == nil ? nil : value
        } catch { return nil }
    }

    private static func activate() {
        NSRunningApplication.runningApplications(withBundleIdentifier: "com.googlecode.iterm2").first?.activate()
    }
}
