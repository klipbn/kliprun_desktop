public struct InterfaceZoom: Equatable {
    public private(set) var percent: Int
    public var factor: Double { Double(percent) / 100 }

    public init(percent: Int = 100) {
        self.percent = min(200, max(70, percent == 0 ? 100 : percent))
    }

    public mutating func increase() { percent = min(200, percent + 10) }
    public mutating func decrease() { percent = max(70, percent - 10) }
    public mutating func reset() { percent = 100 }
}
