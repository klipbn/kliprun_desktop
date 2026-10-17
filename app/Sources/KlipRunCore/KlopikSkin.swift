public enum KlopikSkin: String, CaseIterable {
    case `default`, robot, astronaut, knight, wizard, explorer

    public var label: String { rawValue.prefix(1).uppercased() + rawValue.dropFirst() }
}
