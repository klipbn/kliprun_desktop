public enum TerminalPaneLayout {
    public static func height(preferred: Double, available: Double, expanded: Bool) -> Double {
        let space = max(0, available)
        if expanded { return space }
        let minimum = min(220, space)
        let maximum = max(minimum, space - 180)
        return min(max(preferred.isFinite ? preferred : 330, minimum), maximum)
    }

    public static func dragged(start: Double, translationY: Double, available: Double) -> Double {
        height(preferred: start - translationY, available: available, expanded: false)
    }
}
