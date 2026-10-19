import Foundation
import Testing
@testable import KlipRunCore

@Test func usageProvidersDefaultToAllAndPreserveAnExplicitEmptySelection() {
    let suite = "usage-providers-\(UUID().uuidString)", defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    var value = AppPreferences(defaults: defaults)
    #expect(value.usageProviderOrder == ["openai", "codex", "claude", "zai", "kimi"])
    #expect(value.usageEnabledProviders == value.usageProviderOrder)
    value.usageEnabledProviders = []
    value.save(to: defaults)
    #expect(AppPreferences(defaults: defaults).usageEnabledProviders.isEmpty)
}

@Test func usageProviderOrderingAndVisibilityPersistWithoutChangingOtherPreferences() {
    let suite = "usage-provider-order-\(UUID().uuidString)", defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    var value = AppPreferences(defaults: defaults)
    value.usageProviderOrder = ["claude", "codex", "openai", "kimi", "zai"]
    value.usageEnabledProviders = ["codex", "claude"]
    value.save(to: defaults)
    let saved = AppPreferences(defaults: defaults)
    #expect(saved.usageProviderOrder == ["claude", "codex", "openai", "kimi", "zai"])
    #expect(saved.usageEnabledProviders == ["claude", "codex"])
    #expect(saved.startupPage == "/sessions")
    #expect(saved.theme == "graphite")
    var invalid = saved
    invalid.usageProviderOrder = ["codex", "codex", "unknown"]
    invalid.usageEnabledProviders = ["claude", "unknown", "codex", "codex"]
    let normalized = invalid.validated()
    #expect(normalized.usageProviderOrder == ["codex", "openai", "claude", "zai", "kimi"])
    #expect(normalized.usageEnabledProviders == ["codex", "claude"])
}
