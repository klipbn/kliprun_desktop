// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SwiftTerm",
    platforms: [.macOS(.v13)],
    products: [.library(name: "SwiftTerm", targets: ["SwiftTerm"])],
    targets: [
        .target(name: "SwiftTerm", path: "Sources/SwiftTerm", exclude: ["iOS", "Documentation.docc", "Mac/README.md", "Apple/Metal/Shaders.metal"])
    ]
)
