// swift-tools-version: 6.1

import PackageDescription

let package = Package(
  name: "LoofitWidgetVisualTests",
  platforms: [.iOS("16.4")],
  products: [],
  targets: [
    .target(
      name: "LoofitWorkoutCore",
      path: "modules/loofit-workout-core/ios",
      exclude: ["LoofitWorkoutCoreModule.swift", "Tests"],
      linkerSettings: [
        .linkedFramework("ActivityKit"),
        .linkedFramework("AppIntents"),
        .linkedFramework("CryptoKit"),
        .linkedFramework("WidgetKit"),
        .linkedLibrary("sqlite3"),
      ]
    ),
    .target(
      name: "LoofitWidgetRenderer",
      dependencies: ["LoofitWorkoutCore"],
      path: "plugins/native-widgets",
      exclude: ["WidgetBundleEntry.swift"]
    ),
    .testTarget(
      name: "LoofitWidgetRendererVisualTests",
      dependencies: ["LoofitWorkoutCore", "LoofitWidgetRenderer"],
      path: "tests/ios-widget-renderer"
    ),
  ],
  swiftLanguageModes: [.v5]
)
