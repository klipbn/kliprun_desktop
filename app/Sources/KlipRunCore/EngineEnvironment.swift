public enum EngineEnvironment {
    public static func make(inherited: [String: String], token: String, statePath: String) -> [String: String] {
        var environment = inherited
        environment["KLIPRUN_DESKTOP_TOKEN"] = token
        environment["KLIPRUN_BUN_HOME"] = statePath
        // lsof escapes non-ASCII cwd bytes unless the process runs with a UTF-8 locale.
        environment["LANG"] = "en_US.UTF-8"
        environment["LC_CTYPE"] = "en_US.UTF-8"
        environment["LC_ALL"] = "en_US.UTF-8"
        return environment
    }
}
