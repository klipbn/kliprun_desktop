import SwiftUI
import KlipRunCore

struct SettingsView: View {
    @ObservedObject var store: DesktopStore
    @State private var section = "Terminal"

    private func binding<Value>(_ key: WritableKeyPath<AppPreferences, Value>) -> Binding<Value> {
        Binding(get: { store.preferences[keyPath: key] },
                set: { value in store.updatePreferences { $0[keyPath: key] = value } })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Label("Settings", systemImage: "gearshape").font(.title2.weight(.semibold))
                Spacer()
                Button("Done") { store.showingSettings = false }.keyboardShortcut(.cancelAction)
            }
            Picker("Section", selection: $section) {
                ForEach(["Terminal", "Appearance", "Notifications"], id: \.self) { Text($0).tag($0) }
            }.pickerStyle(.segmented).labelsHidden()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch section {
                    case "Terminal": terminal
                    case "Appearance": appearance
                    default: NotificationSettingsView(store: store, notifications: store.notifications)
                    }
                }.padding(2).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(24)
        .frame(width: 570, height: 510)
        .preferredColorScheme(.dark)
    }

    private var terminal: some View {
        VStack(alignment: .leading, spacing: 20) {
            speedControl("Mouse wheel speed", key: \.wheelSensitivity, defaultValue: 5)
            speedControl("Smooth scrolling speed", key: \.smoothSensitivity, defaultValue: 1)
            Text("Smooth scrolling applies to trackpads and devices such as Magic Mouse. Changes apply to all open terminals immediately.")
                .font(.caption).foregroundStyle(.secondary)
            Divider()
            HStack {
                Stepper("Font size: \(Int(store.preferences.terminalFontSize)) pt", value: binding(\.terminalFontSize), in: 10...24)
                Button("Reset") { store.updatePreferences { $0.terminalFontSize = 13 } }
            }
            Picker("Terminal position", selection: binding(\.terminalPosition)) {
                Text("Bottom").tag("bottom")
                Text("Left").tag("left")
            }
        }
    }

    private func speedControl(_ title: String, key: WritableKeyPath<AppPreferences, Double>, defaultValue: Double) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title)
                Spacer()
                Text("\(Int(store.preferences[keyPath: key]))×").monospacedDigit().frame(width: 35, alignment: .trailing)
                Button("Reset") { store.updatePreferences { $0[keyPath: key] = defaultValue } }
                    .accessibilityLabel("Reset \(title.lowercased())")
            }
            Slider(value: binding(key), in: 1...10, step: 1) { Text(title) }.labelsHidden()
        }
    }

    private var appearance: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Stepper("Interface scale: \(store.interfaceZoom.percent)%", value: binding(\.interfaceZoomPercent), in: 70...200, step: 10)
                Button("Reset") { store.resetZoom() }
            }
            Text("Interface scale does not change the terminal font size.").font(.caption).foregroundStyle(.secondary)
            Picker("Startup screen", selection: binding(\.startupPage)) {
                Text("Kanban").tag("/")
                Text("Office").tag("/office")
                Text("Statistics").tag("/stats")
                Text("Usage").tag("/usage")
            }
            Text("Opens the next time you launch KlipRun.").font(.caption).foregroundStyle(.secondary)
            Picker("Default details tab", selection: binding(\.detailTab)) {
                Text("Agents T").tag("agent-text")
                Text("All").tag("all")
                Text("Agent").tag("agent")
            }
            Toggle("Reduce Office animations", isOn: binding(\.reduceMotion))
            Text("Also respects the macOS Reduce Motion setting.").font(.caption).foregroundStyle(.secondary)
        }
    }
}
