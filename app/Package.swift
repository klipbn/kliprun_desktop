// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "KlipRunDesktop",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "KlipRunDesktop", targets: ["KlipRunDesktop"])],
    dependencies: [.package(path: "../vendor/SwiftTerm")],
    targets: [
        .target(name: "KlipRunCore"),
        .executableTarget(name: "KlipRunDesktop", dependencies: ["KlipRunCore", "SwiftTerm"]),
        .testTarget(name: "KlipRunCoreTests", dependencies: ["KlipRunCore", "KlipRunDesktop", "SwiftTerm"])
    ]
)
