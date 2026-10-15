import Foundation
import Testing
@testable import KlipRunCore

@Test func statisticsExportAcceptsCSVWithoutInterpretingItsContents() {
    let csv = "date,timezone,total\r\n2026-10-15,UTC,1234567\r\n"
    let request = StatisticsExport(filename: "kliprun-tokens-2026-10-15-2026-10-15.csv", content: csv)
    #expect(request?.filename == "kliprun-tokens-2026-10-15-2026-10-15.csv")
    #expect(request?.data == Data(csv.utf8))
}

@Test func statisticsExportRejectsPathsNonCSVAndOversizedMessages() {
    for filename in ["../secrets.csv", "/tmp/export.csv", "kliprun-tokens-test.sh", "kliprun-tokens-../../export.csv", "kliprun-tokens-test.csv\n"] {
        #expect(StatisticsExport(filename: filename, content: "csv") == nil)
    }
    #expect(StatisticsExport(filename: "kliprun-tokens-test.csv", content: String(repeating: "x", count: 10_000_001)) == nil)
}
