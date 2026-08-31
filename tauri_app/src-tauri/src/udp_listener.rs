use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::UdpSocket;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri::Emitter;

/// Notification event from the UDP listener (mirrors Python notify_hub.py).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationEvent {
    pub program: String,
    pub session_id: String,
    pub kind: String, // "needs_input", "turn_end", etc.
    pub message: String,
    pub ts: f64,
}

/// Per-session notification state.
#[derive(Debug, Clone)]
struct Entry {
    pub needs_input: bool,
    pub since: f64,
    pub message: String,
    pub program: String,
    pub last_notified: f64, // Time of last toast (for anti-flap)
}

/// UDP notification hub — mirrors notify_hub.py logic.
/// Thread-safe; UDP listener thread writes, main thread reads.
pub struct NotificationHub {
    state: Arc<Mutex<HashMap<String, Entry>>>,
}

impl NotificationHub {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Mark a session as needing input. Emits a NotificationEvent only on
    /// the not-needing -> needing edge (no repeat toasts).
    pub fn mark_needs_input(
        &self,
        session_id: String,
        message: String,
        program: String,
    ) -> Option<NotificationEvent> {
        let now = current_time();
        let mut state = self.state.lock().unwrap();

        let entry = state.entry(session_id.clone()).or_insert(Entry {
            needs_input: false,
            since: now,
            message: message.clone(),
            program: program.clone(),
            last_notified: 0.0,
        });

        // Edge transition: not needing -> needing
        if !entry.needs_input {
            entry.needs_input = true;
            entry.since = now;
            entry.message = message.clone();
            entry.program = program.clone();
            entry.last_notified = now;

            return Some(NotificationEvent {
                program,
                session_id,
                kind: "needs_input".to_string(),
                message,
                ts: now,
            });
        }

        None
    }

    /// Clear needs-input for a session (e.g., on PreToolUse or UserPromptSubmit).
    pub fn clear(&self, session_id: &str) {
        let mut state = self.state.lock().unwrap();
        if let Some(entry) = state.get_mut(session_id) {
            entry.needs_input = false;
        }
    }

    /// Get all session IDs currently needing input.
    pub fn get_needs_input_session_ids(&self) -> Vec<String> {
        let state = self.state.lock().unwrap();
        state
            .iter()
            .filter(|(_, entry)| entry.needs_input)
            .map(|(id, _)| id.clone())
            .collect()
    }

    /// Clean up old entries (stale after 15 min).
    pub fn expire_stale(&self, ttl_secs: f64) {
        let now = current_time();
        let mut state = self.state.lock().unwrap();
        state.retain(|_, entry| (now - entry.since) < ttl_secs);
    }

    /// Remove sessions not in the live set (called after scanner updates).
    pub fn retain_only(&self, live_session_ids: &[String]) {
        let live_set = live_session_ids.iter().cloned().collect::<std::collections::HashSet<_>>();
        let mut state = self.state.lock().unwrap();
        state.retain(|id, _| live_set.contains(id));
    }
}

fn current_time() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs_f64()
}

/// Spawns a UDP listener thread on 127.0.0.1:47200.
/// Emits "notification" events to the Tauri app when needs-input fires.
pub fn spawn_udp_listener(app: AppHandle, hub: Arc<NotificationHub>) -> Result<()> {
    thread::spawn(move || {
        if let Err(e) = run_listener(app, hub) {
            eprintln!("[udp] Error: {}", e);
        }
    });

    Ok(())
}

fn run_listener(app: AppHandle, hub: Arc<NotificationHub>) -> Result<()> {
    let socket = UdpSocket::bind("127.0.0.1:47200")?;
    socket.set_read_timeout(Some(std::time::Duration::from_millis(500)))?;

    eprintln!("[udp] Listening on 127.0.0.1:47200");

    let mut buf = [0u8; 1500];

    loop {
        match socket.recv_from(&mut buf) {
            Ok((n, _addr)) => {
                let data = &buf[..n];
                match std::str::from_utf8(data) {
                    Ok(json_str) => {
                        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(json_str) {
                            handle_packet(&app, &hub, payload);
                        }
                    }
                    Err(_) => {
                        // Ignore non-UTF8 packets
                    }
                }
            }
            Err(e)
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::WouldBlock
                        | std::io::ErrorKind::TimedOut
                        | std::io::ErrorKind::Interrupted
                ) =>
            {
                // Expected read-timeout tick. Windows reports WSAETIMEDOUT
                // (10060) as TimedOut, not WouldBlock, so matching only
                // WouldBlock kills this thread after the first 500ms and
                // needs-input alerts silently stop arriving.
                continue;
            }
            Err(e) => {
                eprintln!("[udp] Recv error: {}", e);
                break;
            }
        }
    }

    Ok(())
}

fn handle_packet(app: &AppHandle, hub: &Arc<NotificationHub>, payload: serde_json::Value) {
    let event_name = payload.get("event").and_then(|v| v.as_str()).unwrap_or("");
    let session_id = payload.get("session_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let program = payload.get("program").and_then(|v| v.as_str()).unwrap_or("claude").to_string();
    let message = payload.get("message").and_then(|v| v.as_str()).unwrap_or("").to_string();

    match event_name {
        "Notification" => {
            // Mark session as needing input (edge-triggered toast).
            if let Some(event) = hub.mark_needs_input(session_id, message, program) {
                // Emit notification event to frontend.
                if let Err(e) = app.emit("notification", &event) {
                    eprintln!("[udp] Failed to emit notification: {}", e);
                }
            }
        }
        "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "SessionEnd" => {
            // Clear the needs-input flag.
            hub.clear(&session_id);
        }
        _ => {
            // Unknown event, ignore
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::UdpSocket as StdUdpSocket;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_hub_edge_transition() {
        let hub = NotificationHub::new();

        // First mark_needs_input should trigger
        let ev1 = hub.mark_needs_input(
            "session1".to_string(),
            "permission needed".to_string(),
            "claude".to_string(),
        );
        assert!(ev1.is_some());

        // Second should not (still marked)
        let ev2 = hub.mark_needs_input(
            "session1".to_string(),
            "permission needed".to_string(),
            "claude".to_string(),
        );
        assert!(ev2.is_none());

        // After clear, should trigger again on next mark
        hub.clear("session1");
        let ev3 = hub.mark_needs_input(
            "session1".to_string(),
            "permission needed".to_string(),
            "claude".to_string(),
        );
        assert!(ev3.is_some());
    }

    #[test]
    fn test_hub_retain_only() {
        let hub = NotificationHub::new();

        // Mark two sessions
        hub.mark_needs_input("s1".to_string(), "msg".to_string(), "claude".to_string());
        hub.mark_needs_input("s2".to_string(), "msg".to_string(), "claude".to_string());

        // Retain only s1
        hub.retain_only(&["s1".to_string()]);

        // s2 should be gone
        let ids = hub.get_needs_input_session_ids();
        assert_eq!(ids, vec!["s1"]);
    }

    #[test]
    fn test_hub_expire_stale() {
        let hub = NotificationHub::new();

        hub.mark_needs_input("s1".to_string(), "msg".to_string(), "claude".to_string());

        // Expire with 0 ttl (everything older than now)
        thread::sleep(Duration::from_millis(10));
        hub.expire_stale(0.001);

        let ids = hub.get_needs_input_session_ids();
        assert!(ids.is_empty());
    }
}
