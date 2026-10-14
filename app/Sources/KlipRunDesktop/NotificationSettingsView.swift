import AppKit
import SwiftUI

struct NotificationSettingsView: View {
    @ObservedObject var store: DesktopStore
    @ObservedObject var notifications: PopupNotifications
    @State private var customSeconds = ""
    @State private var legacyRunning = !NSRunningApplication.runningApplications(withBundleIdentifier: "local.kliprun.notifications").isEmpty

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label("Notifications", systemImage: "bell.badge").font(.headline)
                Spacer()
                Button("Done") { store.showingNotificationSettings = false }
            }
            Toggle("Show the coworker when a response is ready or input is needed", isOn: Binding(
                get: { !notifications.paused }, set: { notifications.setPaused(!$0) }))
            Picker("Display duration", selection: Binding(
                get: { notifications.displaySeconds }, set: { _ = notifications.setDisplaySeconds($0) })) {
                ForEach([5.0, 8.0, 15.0, 30.0, 60.0, 0.0], id: \.self) { seconds in
                    Text(seconds == 0 ? "Until dismissed" : "\(Int(seconds)) sec").tag(seconds)
                }
                if ![5.0, 8.0, 15.0, 30.0, 60.0, 0.0].contains(notifications.displaySeconds) {
                    Text("\(Int(notifications.displaySeconds)) sec").tag(notifications.displaySeconds)
                }
            }
            HStack {
                TextField("Custom seconds", text: $customSeconds).frame(width: 165)
                Button("Apply") {
                    if let value = Double(customSeconds), notifications.setDisplaySeconds(value) { customSeconds = "" }
                }
                .disabled(customSeconds.isEmpty)
            }
            Text("1 to 3600 seconds. Until dismissed keeps the popup visible until you close it.")
                .font(.caption).foregroundStyle(.secondary)
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
        .padding(22)
        .frame(width: 430)
        .preferredColorScheme(.dark)
    }
}
