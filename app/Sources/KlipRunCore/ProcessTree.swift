public enum ProcessTree {
    public static func parents(from output: String) -> [Int32: Int32] {
        var result: [Int32: Int32] = [:]
        for line in output.split(separator: "\n") {
            let values = line.split(whereSeparator: \.isWhitespace)
            if values.count == 2, let pid = Int32(values[0]), let parent = Int32(values[1]), pid > 0 {
                result[pid] = parent
            }
        }
        return result
    }

    public static func owns(pid: Int32, terminalPID: Int32, parents: [Int32: Int32]) -> Bool {
        guard pid > 0, terminalPID > 0 else { return false }
        var current = pid
        var visited = Set<Int32>()
        while current > 1, visited.insert(current).inserted {
            if current == terminalPID { return true }
            current = parents[current] ?? 0
        }
        return false
    }

    public static func terminalChildren(of parentPID: Int32, in output: String) -> Int {
        output.split(separator: "\n").reduce(0) { count, line in
            let fields = line.split(maxSplits: 3, whereSeparator: \.isWhitespace)
            guard fields.count >= 3, Int32(fields[1]) == parentPID,
                  !["??", "?", "-"].contains(String(fields[2])) else { return count }
            return count + 1
        }
    }
}
