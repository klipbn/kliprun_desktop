import Foundation

public enum WebMenuCommand: String, CaseIterable {
    case cancelDialog = "cancel-dialog"
    case newProject = "new-project", findSession = "find-session", saveFile = "save-file"
    case closeFile = "close-file", closeDiff = "close-diff", closeDetails = "close-details"
    case undo, redo, find, findNext = "find-next", findPrevious = "find-previous", refresh, shortcuts
}
public enum DesktopMenuFocus { case web, terminal, native }
public enum DesktopCloseTarget { case file, diff, details, terminal, settings, dialog, window }
public struct DesktopMenuState: Equatable {
    public var commands: Set<WebMenuCommand> = []
    public var editorFocused = false
    public var hasUnsavedFiles = false
    public init() {}
    public init?(message: [String: Any]) {
        guard let raw = message["commands"] as? [String], raw.count <= WebMenuCommand.allCases.count,
              let focused = message["editorFocused"] as? Bool else { return nil }
        let values = raw.compactMap(WebMenuCommand.init(rawValue:))
        guard values.count == raw.count else { return nil }
        commands = Set(values); editorFocused = focused
        if let raw = message["hasUnsavedFiles"] { guard let dirty = raw as? Bool else { return nil }; hasUnsavedFiles = dirty }
    }
    public func closeTarget(focus: DesktopMenuFocus, settings: Bool, terminalVisible: Bool) -> DesktopCloseTarget {
        if settings { return .settings }
        if focus == .terminal && terminalVisible { return .terminal }
        if focus == .web {
            if commands.contains(.cancelDialog) { return .dialog }
            if commands.contains(.closeFile) { return .file }
            if commands.contains(.closeDiff) { return .diff }
            if commands.contains(.closeDetails) { return .details }
        }
        return .window
    }
}
