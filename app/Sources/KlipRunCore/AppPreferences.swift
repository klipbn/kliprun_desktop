import Foundation

public struct AppPreferences: Equatable {
    public static let usageProviders = ["openai", "codex", "claude", "zai", "kimi"]
    public var wheelSensitivity: Double
    public var smoothSensitivity: Double
    public var terminalFontSize: Double
    public var interfaceZoomPercent: Int
    public var terminalPosition: String
    public var startupPage: String
    public var detailTab: String
    public var theme: String
    public var terminalTheme: String
    public var klopikSkin: String
    public var reduceMotion: Bool
    public var toolbarExpanded: Bool
    public var usageProviderOrder: [String]
    public var usageEnabledProviders: [String]

    public init(defaults: UserDefaults = .standard) {
        wheelSensitivity = defaults.object(forKey: "terminal.wheelSensitivity") as? Double ?? 5
        smoothSensitivity = defaults.object(forKey: "terminal.smoothSensitivity") as? Double ?? 1
        terminalFontSize = defaults.object(forKey: "terminal.fontSize") as? Double ?? 13
        interfaceZoomPercent = defaults.object(forKey: "interface.zoom") as? Int ?? 100
        terminalPosition = defaults.string(forKey: "terminal.position") ?? "left"
        startupPage = defaults.string(forKey: "appearance.startupPage") ?? "/sessions"
        detailTab = defaults.string(forKey: "appearance.detailTab") ?? "agent-text"
        terminalTheme = defaults.string(forKey: "terminal.theme") ?? "app"
        theme = defaults.string(forKey: "appearance.theme") ?? "graphite"
        klopikSkin = defaults.string(forKey: "appearance.klopikSkin") ?? "default"
        reduceMotion = defaults.bool(forKey: "appearance.reduceMotion")
        toolbarExpanded = defaults.bool(forKey: "appearance.toolbarExpanded")
        usageProviderOrder = defaults.stringArray(forKey: "usage.providerOrder") ?? Self.usageProviders
        usageEnabledProviders = defaults.stringArray(forKey: "usage.enabledProviders") ?? Self.usageProviders
        self = validated()
    }

    public func validated() -> Self {
        var value = self
        func bounded(_ number: Double, _ range: ClosedRange<Double>, fallback: Double) -> Double {
            number.isFinite ? min(range.upperBound, max(range.lowerBound, number)) : fallback
        }
        value.wheelSensitivity = bounded(wheelSensitivity, 1...10, fallback: 5).rounded()
        value.smoothSensitivity = bounded(smoothSensitivity, 1...10, fallback: 1).rounded()
        value.terminalFontSize = bounded(terminalFontSize, 10...24, fallback: 13).rounded()
        value.interfaceZoomPercent = InterfaceZoom(percent: interfaceZoomPercent).percent
        if !["bottom", "left"].contains(terminalPosition) { value.terminalPosition = "left" }
        if !["/sessions", "/", "/git", "/office", "/stats", "/usage"].contains(startupPage) { value.startupPage = "/" }
        if !["user", "agent-text", "agent", "models", "kanban"].contains(detailTab) { value.detailTab = "agent-text" }
        if !["default", "ember", "dusk", "graphite", "daybreak", "paper"].contains(theme) { value.theme = "graphite" }
        if terminalTheme != "app", !TerminalPalette.themes.contains(where: { $0.id == terminalTheme }) { value.terminalTheme = "app" }
        if KlopikSkin(rawValue: klopikSkin) == nil { value.klopikSkin = "default" }
        var seen = Set<String>()
        value.usageProviderOrder = (usageProviderOrder + Self.usageProviders).filter {
            Self.usageProviders.contains($0) && seen.insert($0).inserted
        }
        value.usageEnabledProviders = value.usageProviderOrder.filter { usageEnabledProviders.contains($0) }
        return value
    }

    public func save(to defaults: UserDefaults) {
        let value = validated()
        defaults.set(value.wheelSensitivity, forKey: "terminal.wheelSensitivity")
        defaults.set(value.smoothSensitivity, forKey: "terminal.smoothSensitivity")
        defaults.set(value.terminalFontSize, forKey: "terminal.fontSize")
        defaults.set(value.interfaceZoomPercent, forKey: "interface.zoom")
        defaults.set(value.terminalPosition, forKey: "terminal.position")
        defaults.set(value.startupPage, forKey: "appearance.startupPage")
        defaults.set(value.detailTab, forKey: "appearance.detailTab")
        defaults.set(value.terminalTheme, forKey: "terminal.theme")
        defaults.set(value.theme, forKey: "appearance.theme")
        defaults.set(value.klopikSkin, forKey: "appearance.klopikSkin")
        defaults.set(value.reduceMotion, forKey: "appearance.reduceMotion")
        defaults.set(value.toolbarExpanded, forKey: "appearance.toolbarExpanded")
        defaults.set(value.usageProviderOrder, forKey: "usage.providerOrder")
        defaults.set(value.usageEnabledProviders, forKey: "usage.enabledProviders")
    }

    public var resolvedTerminalTheme: String { terminalTheme == "app" ? theme : terminalTheme }

    public var webScript: String {
        // Only validated enum values and booleans cross into the web view.
        let value = validated()
        let providers = value.usageEnabledProviders.map { "'\($0)'" }.joined(separator: ",")
        return "window.kliprunPreferences = {detailTab: '\(value.detailTab)', theme: '\(value.theme)', klopikSkin: '\(value.klopikSkin)', reduceMotion: \(value.reduceMotion), toolbarExpanded: \(value.toolbarExpanded), usageProviders: [\(providers)]}; window.dispatchEvent(new Event('kliprun:preferences'));"
    }
}
