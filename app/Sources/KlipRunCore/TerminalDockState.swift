public struct TerminalDockState: Equatable {
    public private(set) var visibleID: Int?
    public private(set) var preferredID: Int?

    public init() {}

    public mutating func show(_ id: Int) {
        visibleID = id
        preferredID = id
    }

    public mutating func hide() { visibleID = nil }

    public mutating func selectCard(_ ownedID: Int?) {
        guard let ownedID else { return }
        preferredID = ownedID
        if visibleID != nil { visibleID = ownedID }
    }

    @discardableResult public mutating func toggle(availableIDs: [Int]) -> Bool {
        if visibleID != nil { hide(); return true }
        guard let id = preferredID.flatMap({ availableIDs.contains($0) ? $0 : nil }) ?? availableIDs.last else { return false }
        show(id)
        return true
    }

    public mutating func remove(_ id: Int, availableIDs: [Int]) {
        if preferredID == id || preferredID.map({ !availableIDs.contains($0) }) == true { preferredID = availableIDs.last }
        if visibleID == id || visibleID.map({ !availableIDs.contains($0) }) == true { visibleID = availableIDs.last }
    }
}
