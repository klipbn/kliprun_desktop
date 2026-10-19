import AppKit
import SwiftUI
import KlipRunCore

struct SettingsView: View {
    @ObservedObject var store: DesktopStore
    @ObservedObject private var runtime: EngineRuntime
    @ObservedObject private var updater: AppUpdater
    @State private var section = "Terminal"
    @State private var copied = false
    @State private var themeMenuOpen = false
    private let sections = [("Terminal", "terminal"), ("Appearance", "paintpalette"), ("Notifications", "bell"),
                            ("Agents", "command"), ("Usage", "gauge"), ("Updates", "arrow.down.circle"), ("About", "info.circle")]

    init(store: DesktopStore) {
        self.store = store
        runtime = store.runtime
        updater = store.updater
    }

    private func binding<Value>(_ key: WritableKeyPath<AppPreferences, Value>) -> Binding<Value> {
        Binding(get: { store.preferences[keyPath: key] },
                set: { value in store.updatePreferences { $0[keyPath: key] = value } })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "slider.horizontal.3").foregroundStyle(SettingsStyle.accent)
                    .frame(width: 34, height: 34).background(SettingsStyle.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 3) {
                    Text("Settings").font(.system(size: 20, weight: .semibold))
                    Text("Make KlipRun work your way").font(.system(size: 11)).foregroundStyle(.secondary)
                }
                Spacer()
                Button { store.showingSettings = false } label: {
                    Image(systemName: "xmark").frame(width: 16, height: 16)
                }
                .keyboardShortcut(.cancelAction).accessibilityLabel("Close settings").help("Close settings (Esc)")
            }.padding(20)
            HStack(spacing: 4) {
                ForEach(sections, id: \.0) { name, icon in
                    Button { section = name } label: {
                        VStack(spacing: 6) {
                            ZStack(alignment: .topTrailing) {
                                Image(systemName: icon).font(.system(size: 15))
                                if name == "Updates", updater.availableVersion != nil {
                                    Circle().fill(.orange).frame(width: 5, height: 5).offset(x: 5, y: -2)
                                }
                            }
                            Text(name).font(.system(size: 10, weight: .medium)).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 10)
                        .foregroundStyle(section == name ? SettingsStyle.accent : Color.secondary)
                        .background(section == name ? SettingsStyle.accent.opacity(0.1) : .clear, in: RoundedRectangle(cornerRadius: 7))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain).accessibilityLabel(name)
                    .accessibilityAddTraits(section == name ? .isSelected : [])
                }
            }.padding(.horizontal, 16).padding(.bottom, 16)
            Divider().overlay(SettingsStyle.border)
            if section == "Updates" {
                UpdateView(updater: updater, embedded: true).padding(20)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        switch section {
                        case "Terminal": terminal
                        case "Appearance": appearance
                        case "Agents": AgentSettingsView(store: store)
                        case "Usage": UsageSettingsView(store: store)
                        case "Notifications":
                            SettingsCard(title: "Coworker notifications", subtitle: "Choose which events need your attention and how they appear.") {
                                NotificationSettingsView(store: store, notifications: store.notifications)
                            }
                        default: about
                        }
                    }
                    .padding(20).frame(maxWidth: .infinity, alignment: .leading)
                }
                .id(section)
            }
            Divider().overlay(SettingsStyle.border)
            HStack {
                Label("Changes save automatically", systemImage: "checkmark.circle").foregroundStyle(.secondary)
                Spacer()
                Text("⌘,").foregroundStyle(SettingsStyle.accent)
            }.font(.system(size: 10)).padding(.horizontal, 20).padding(.vertical, 12)
        }
        .font(.system(size: 12))
        .buttonStyle(SettingsButtonStyle())
        .toggleStyle(SettingsToggleStyle())
        .tint(SettingsStyle.accent)
        .background(SettingsStyle.background)
        .overlay(alignment: .leading) { Rectangle().fill(SettingsStyle.border).frame(width: 1) }
        .preferredColorScheme(["daybreak", "paper"].contains(store.preferences.theme) ? .light : .dark)
        .accessibilityIdentifier("settings-panel")
    }

    private var terminal: some View {
        VStack(alignment: .leading, spacing: 16) {
            SettingsCard(title: "Scrolling", subtitle: "Applies immediately to every open terminal. Trackpads and Magic Mouse have their own speed.") {
                speedControl("Mouse wheel", key: \.wheelSensitivity, defaultValue: 5)
                Divider()
                speedControl("Smooth scrolling", key: \.smoothSensitivity, defaultValue: 1)
            }
            SettingsCard(title: "Text & layout", subtitle: "Terminal font size is independent of interface scale.") {
                HStack {
                    Text("Font size")
                    Spacer()
                    Button { store.updatePreferences { $0.terminalFontSize -= 1 } } label: { Image(systemName: "minus") }
                        .disabled(store.preferences.terminalFontSize <= 10).accessibilityLabel("Decrease terminal font size")
                    Text("\(Int(store.preferences.terminalFontSize)) pt").monospacedDigit().frame(width: 42)
                    Button { store.updatePreferences { $0.terminalFontSize += 1 } } label: { Image(systemName: "plus") }
                        .disabled(store.preferences.terminalFontSize >= 24).accessibilityLabel("Increase terminal font size")
                }
                Text("$ kliprun\nReady for your next idea_")
                    .font(.system(size: CGFloat(store.preferences.terminalFontSize), design: .monospaced))
                    .foregroundStyle(SettingsStyle.accent).frame(maxWidth: .infinity, alignment: .leading).padding(12)
                    .background(SettingsStyle.background, in: RoundedRectangle(cornerRadius: 6))
                choices("Terminal position", key: \.terminalPosition, values: [("Left", "left"), ("Bottom", "bottom")])
                Button("Reset terminal settings") {
                    store.updatePreferences { $0.wheelSensitivity = 5; $0.smoothSensitivity = 1; $0.terminalFontSize = 13; $0.terminalPosition = "left" }
                }
            }
            SettingsCard(title: "Keyboard shortcuts", subtitle: "Keep your hands on the keyboard.") {
                shortcut("Show / hide terminal", "⌘J")
                shortcut("New terminal", "⌘T")
                shortcut("Expand / restore terminal", "⌘↩")
                shortcut("Switch terminal tab", "⌘1–9")
            }
        }
    }

    private func speedControl(_ title: String, key: WritableKeyPath<AppPreferences, Double>, defaultValue: Double) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                Spacer()
                Text("\(Int(store.preferences[keyPath: key]))×").monospacedDigit().foregroundStyle(SettingsStyle.accent)
                Button("Reset") { store.updatePreferences { $0[keyPath: key] = defaultValue } }
                    .accessibilityLabel("Reset \(title.lowercased())")
            }
            Slider(value: binding(key), in: 1...10, step: 1) { Text(title) }.labelsHidden()
        }
    }

    private var appearance: some View {
        VStack(alignment: .leading, spacing: 16) {
            SettingsCard(title: "Interface scale", subtitle: "Resize the board and details without changing terminal text.") {
                HStack {
                    Text("\(store.interfaceZoom.percent)%").font(.system(size: 24, weight: .semibold)).monospacedDigit()
                    Spacer()
                    Button("Reset to 100%") { store.resetZoom() }
                }
                Slider(value: Binding(get: { Double(store.preferences.interfaceZoomPercent) }, set: { value in
                    store.updatePreferences { $0.interfaceZoomPercent = Int(value) }
                }), in: 70...200, step: 10) { Text("Interface scale") }.labelsHidden()
                HStack {
                    ForEach([80, 100, 120, 150], id: \.self) { percent in
                        Button { store.updatePreferences { $0.interfaceZoomPercent = percent } } label: {
                            Text("\(percent)%").frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            SettingsCard(title: "Default views", subtitle: "The startup screen opens next launch. The details tab applies immediately.") {
                choices("Startup screen", key: \.startupPage, values: [("Sessions", "/sessions"), ("Kanban", "/"), ("Office", "/office"), ("Git", "/git"), ("Usage", "/usage"), ("Statistics", "/stats")])
                choices("Default details tab", key: \.detailTab, values: [("User", "user"), ("Agents T", "agent-text"), ("Agent", "agent"), ("Models", "models"), ("Kanban", "kanban")])
            }
            SettingsCard(title: "Motion", subtitle: "KlipRun also respects the macOS Reduce Motion setting.") {
                Toggle("Reduce Office animations", isOn: binding(\.reduceMotion))
            }
            SettingsCard(title: "Select Theme", subtitle: "Choose an interface palette. Changes apply immediately.") {
                Button { themeMenuOpen.toggle() } label: {
                    HStack(spacing: 8) {
                        Text(themeOptions.first { $0.0 == store.preferences.theme }?.1 ?? "Graphite")
                        Spacer()
                        Image(systemName: "chevron.down").font(.system(size: 10)).foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 10).frame(height: 32)
                    .background(SettingsStyle.background, in: RoundedRectangle(cornerRadius: 5))
                    .overlay(RoundedRectangle(cornerRadius: 5).stroke(themeMenuOpen ? SettingsStyle.accent : SettingsStyle.border))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Theme")
                .accessibilityIdentifier("theme-trigger")
                .popover(isPresented: $themeMenuOpen, arrowEdge: .bottom) {
                    VStack(spacing: 2) {
                        ForEach(themeOptions, id: \.0) { value, label in
                            ThemeOptionRow(label: label, selected: store.preferences.theme == value) {
                                store.updatePreferences { $0.theme = value }
                                themeMenuOpen = false
                            }
                            .accessibilityIdentifier("theme-option-\(value)")
                        }
                    }
                    .padding(5)
                    .frame(width: 220)
                    .background(SettingsStyle.surface)
                }
            }
            SettingsCard(title: "Klopik skins", subtitle: "Choose your Office characters. Each agent keeps its own variation within the set.") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach(KlopikSkin.allCases, id: \.rawValue) { skin in
                        KlopikSkinOption(skin: skin, selected: store.preferences.klopikSkin == skin.rawValue) {
                            store.updatePreferences { $0.klopikSkin = skin.rawValue }
                        }
                    }
                }
            }
        }
    }

    private var themeOptions: [(String, String)] {
        [("graphite", "Graphite"), ("default", "Midnight"), ("ember", "Ember"),
         ("dusk", "Dusk"), ("daybreak", "Daybreak"), ("paper", "Paper")]
    }

    private var about: some View {
        VStack(alignment: .leading, spacing: 16) {
            SettingsCard(title: "KlipRun Desktop", subtitle: "Your OpenCode, Codex, and Claude Code sessions in one place.") {
                shortcut("Version", updater.installedVersion)
                shortcut("Architecture", AppUpdateClient.architecture == "arm64" ? "Apple Silicon" : "Intel")
                shortcut("Active terminals", "\(store.terminals.filter(\.isRunning).count)")
                Label(runtime.baseURL == nil ? "Engine offline" : "Engine running locally", systemImage: "circle.fill")
                    .foregroundStyle(runtime.baseURL == nil ? .orange : .green)
                if let message = runtime.error ?? store.error {
                    Text(message).font(.system(size: 11)).foregroundStyle(.orange).textSelection(.enabled)
                }
            }
            SettingsCard(title: "Troubleshooting", subtitle: "Open local files or copy basic app diagnostics without credentials or session content.") {
                HStack {
                    Button("Open app data") { NSWorkspace.shared.open(runtime.stateDirectory) }
                    Button("Reveal engine log") { NSWorkspace.shared.activateFileViewerSelecting([runtime.stateDirectory.appendingPathComponent("engine.log")]) }
                        .disabled(!FileManager.default.fileExists(atPath: runtime.stateDirectory.appendingPathComponent("engine.log").path))
                }
                Button(copied ? "Copied diagnostics" : "Copy diagnostics") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(store.diagnostics, forType: .string)
                    copied = true
                }
            }
            SettingsCard(title: "Made by klipbn", subtitle: "Alexey Voronko · Lead Data Analyst") {
                Text("AdTech, experimentation, and analytics engineering. Creator of KlipRun and KlipRun Desktop.")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
                HStack(spacing: 16) {
                    Link("GitHub profile", destination: URL(string: "https://github.com/klipbn")!)
                    Link("Source code", destination: URL(string: "https://github.com/klipbn/kliprun_desktop")!)
                }
                .font(.system(size: 11, weight: .medium)).foregroundStyle(SettingsStyle.accent)
            }
        }
    }

    private func choices(_ title: String, key: WritableKeyPath<AppPreferences, String>, values: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).foregroundStyle(.secondary)
            HStack(spacing: 4) {
                ForEach(values, id: \.1) { label, value in
                    Button { store.updatePreferences { $0[keyPath: key] = value } } label: {
                        Text(label).font(.system(size: 11, weight: .medium)).frame(maxWidth: .infinity).padding(.vertical, 8)
                            .foregroundStyle(store.preferences[keyPath: key] == value ? SettingsStyle.accent : Color.secondary)
                            .background(store.preferences[keyPath: key] == value ? SettingsStyle.accent.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 5))
                            .contentShape(Rectangle())
                    }.buttonStyle(.plain).accessibilityAddTraits(store.preferences[keyPath: key] == value ? .isSelected : [])
                }
            }.padding(3).background(SettingsStyle.background, in: RoundedRectangle(cornerRadius: 7))
        }
    }

    private func shortcut(_ title: String, _ keys: String) -> some View {
        HStack { Text(title).foregroundStyle(.secondary); Spacer(); Text(keys).monospacedDigit() }
    }
}

struct KlopikSkinOption: View {
    let skin: KlopikSkin
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 5) {
                if let url = Bundle.main.url(forResource: skin.rawValue, withExtension: "png", subdirectory: "KlopikSkins"),
                   let image = NSImage(contentsOf: url) {
                    Image(nsImage: image).resizable().interpolation(.none).scaledToFit().frame(height: 48)
                } else {
                    Image(systemName: "person.fill").frame(height: 48).foregroundStyle(SettingsStyle.accent)
                }
                HStack(spacing: 4) {
                    Text(skin.label).font(.system(size: 11, weight: .medium))
                    if selected { Image(systemName: "checkmark").font(.system(size: 9, weight: .semibold)) }
                }
            }
            .frame(maxWidth: .infinity).padding(8)
            .foregroundStyle(selected ? SettingsStyle.accent : Color.secondary)
            .background(selected ? SettingsStyle.accent.opacity(0.1) : SettingsStyle.background, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(selected ? SettingsStyle.accent : SettingsStyle.border))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain).accessibilityLabel("Klopik skin: \(skin.label)")
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("klopik-skin-\(skin.rawValue)")
    }
}

private struct ThemeOptionRow: View {
    let label: String
    let selected: Bool
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(label).font(.system(size: 12, weight: .medium))
                Spacer()
                if selected { Image(systemName: "checkmark").font(.system(size: 10)).foregroundStyle(SettingsStyle.accent) }
            }
            .padding(.horizontal, 9).frame(height: 30)
            .foregroundStyle(.primary)
            .background(hovered ? SettingsStyle.accent.opacity(0.14) : .clear, in: RoundedRectangle(cornerRadius: 4))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
