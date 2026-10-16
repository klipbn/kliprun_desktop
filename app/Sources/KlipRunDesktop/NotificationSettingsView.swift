import AppKit
import SwiftUI

struct NotificationSettingsView: View {
    @ObservedObject var store: DesktopStore
    @ObservedObject var notifications: PopupNotifications
    @State private var customSeconds = ""
    @State private var legacyRunning = !NSRunningApplication.runningApplications(withBundleIdentifier: "local.kliprun.notifications").isEmpty

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Toggle("Enable notifications", isOn: Binding(
                get: { !notifications.paused }, set: { notifications.setPaused(!$0) }))
            VStack(spacing: 14) {
                Toggle("Response ready", isOn: Binding(get: { notifications.responseReady }, set: { notifications.setResponseReady($0) }))
                Toggle("Needs your input", isOn: Binding(get: { notifications.needsInput }, set: { notifications.setNeedsInput($0) }))
            }.disabled(notifications.paused)
            Picker("Display duration", selection: Binding(
                get: { notifications.displaySeconds }, set: { _ = notifications.setDisplaySeconds($0) })) {
                ForEach([5.0, 8.0, 15.0, 30.0, 60.0, 0.0], id: \.self) { seconds in
                    Text(seconds == 0 ? "Until dismissed" : "\(Int(seconds)) sec").tag(seconds)
                }
                if ![5.0, 8.0, 15.0, 30.0, 60.0, 0.0].contains(notifications.displaySeconds) {
                    Text("\(Int(notifications.displaySeconds)) sec").tag(notifications.displaySeconds)
                }
            }.pickerStyle(.menu)
            HStack {
                TextField("Custom seconds", text: $customSeconds)
                    .textFieldStyle(.plain).padding(8).frame(width: 150)
                    .background(SettingsStyle.background, in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(SettingsStyle.border))
                Button("Apply") {
                    if let value = Double(customSeconds), notifications.setDisplaySeconds(value) { customSeconds = "" }
                }
                .disabled(customSeconds.isEmpty)
            }
            Text("1 to 3600 seconds. Until dismissed keeps the popup visible until you close it.")
                .font(.caption).foregroundStyle(.secondary)
            HStack {
                Picker("Sound", selection: Binding<String?>(
                    get: { notifications.soundName }, set: { notifications.setSoundName($0) })) {
                    Text("None").tag(nil as String?)
                    ForEach(PopupNotifications.systemSoundNames, id: \.self) { name in
                        Text(name).tag(Optional(name))
                    }
                }.pickerStyle(.menu)
                Button("Preview sound") { notifications.previewSound() }
                    .disabled(notifications.soundName == nil)
            }
            Divider()
            Button("Show preview") { store.previewNotification() }
            Button("Reset to top right") { notifications.resetPosition() }
            if legacyRunning {
                Divider()
                Text("The legacy KlipRun Notifications app is running and may show duplicate alerts.")
                    .font(.caption).foregroundStyle(.orange)
                Button("Quit legacy app") {
                    for app in NSRunningApplication.runningApplications(withBundleIdentifier: "local.kliprun.notifications") { app.terminate() }
                    legacyRunning = false
                }
            }
        }
    }
}
