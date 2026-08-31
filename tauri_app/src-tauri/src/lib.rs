mod sidecar;
mod udp_listener;

use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Create the notification hub (shared between UDP listener and main thread).
            let hub = Arc::new(udp_listener::NotificationHub::new());

            // Spawn the Python sidecar scanner on startup.
            sidecar::spawn_sidecar(app_handle.clone())
                .expect("failed to spawn sidecar");

            // Spawn the UDP listener on 127.0.0.1:47200.
            udp_listener::spawn_udp_listener(app_handle, hub)
                .expect("failed to spawn UDP listener");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AI Avatar Room");
}
