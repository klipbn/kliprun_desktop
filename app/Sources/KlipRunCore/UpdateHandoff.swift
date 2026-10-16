import Foundation

public enum UpdateHandoff {
    // The helper outlives the app; positional arguments keep file paths out of shell code.
    @discardableResult
    public static func launch(after pid: Int32, command: [String]) throws -> Process {
        let helper = Process()
        helper.executableURL = URL(fileURLWithPath: "/bin/sh")
        helper.arguments = ["-c", """
        attempts=0
        while kill -0 "$1" 2>/dev/null; do
            attempts=$((attempts + 1))
            [ "$attempts" -lt 600 ] || exit 1
            sleep 0.1
        done
        shift
        exec "$@"
        """, "kliprun-update", String(pid)] + command
        helper.standardInput = FileHandle.nullDevice
        helper.standardOutput = FileHandle.nullDevice
        helper.standardError = FileHandle.nullDevice
        try helper.run()
        return helper
    }
}
