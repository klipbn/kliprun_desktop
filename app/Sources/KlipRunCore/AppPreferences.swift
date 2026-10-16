import Foundation

public struct AppPreferences: Equatable {
    public var wheelSensitivity: Double
    public var smoothSensitivity: Double
    public var terminalFontSize: Double
    public var interfaceZoomPercent: Int
    public var terminalPosition: String
    public var startupPage: String
    public var detailTab: String
    public var reduceMotion: Bool

    public init(defaults: UserDefaults = .standard) {
        wheelSensitivity = defaults.object(forKey: "terminal.wheelSensitivity") as? Double ?? 5
        smoothSensitivity = defaults.object(forKey: "terminal.smoothSensitivity") as? Double ?? 1
        terminalFontSize = defaults.object(forKey: "terminal.fontSize") as? Double ?? 13
        interfaceZoomPercent = defaults.object(forKey: "interface.zoom") as? Int ?? 100
        terminalPosition = defaults.string(forKey: "terminal.position") ?? "bottom"
        startupPage = defaults.string(forKey: "appearance.startupPage") ?? "/"
        detailTab = defaults.string(forKey: "appearance.detailTab") ?? "agent-text"
        reduceMotion = defaults.bool(forKey: "appearance.reduceMotion")
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
        if !["bottom", "left"].contains(terminalPosition) { value.terminalPosition = "bottom" }
        if !["/", "/git", "/office", "/stats", "/usage"].contains(startupPage) { value.startupPage = "/" }
        if !["user", "agent-text", "agent", "models", "kanban"].contains(detailTab) { value.detailTab = "agent-text" }
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
        defaults.set(value.reduceMotion, forKey: "appearance.reduceMotion")
    }

    public var webScript: String {
        // Only validated enum values and booleans cross into the web view.
        let value = validated()
        return "window.kliprunPreferences = {detailTab: '\(value.detailTab)', reduceMotion: \(value.reduceMotion)}; window.dispatchEvent(new Event('kliprun:preferences'));"
    }
}
