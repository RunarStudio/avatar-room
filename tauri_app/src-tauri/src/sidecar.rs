use anyhow::Result;
use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::AppHandle;
use tauri::Emitter;

/// Spawns the Python sidecar scanner and streams JSON scan events to the frontend.
pub fn spawn_sidecar(app_handle: AppHandle) -> Result<()> {
    let app = app_handle.clone();
    let should_exit = Arc::new(AtomicBool::new(false));
    let exit_flag = should_exit.clone();

    thread::spawn(move || {
        if let Err(e) = run_sidecar(app, exit_flag) {
            eprintln!("[sidecar] Error: {}", e);
        }
    });

    Ok(())
}

fn run_sidecar(app: AppHandle, should_exit: Arc<AtomicBool>) -> Result<()> {
    // Spawn the Python sidecar process using std::process::Command.
    // cargo run sets cwd to src-tauri/, so ../.. reaches the repo root.
    let sidecar_path = if cfg!(debug_assertions) {
        std::path::PathBuf::from("../../scanner_sidecar.py")
    } else {
        // Release mode: bundled alongside the executable in resources.
        std::path::PathBuf::from("../scanner_sidecar.py")
    };

    eprintln!("[sidecar] Spawning: python {}", sidecar_path.display());

    // stdin MUST be piped and its handle held open for the process lifetime.
    // scanner_sidecar.py's _watch_stdin() blocks on sys.stdin.readline() and
    // stops the producer when that pipe closes. A windowed Tauri app has no
    // valid stdin to inherit, so without this the sidecar reads EOF, exits
    // after roughly one snapshot, and the scan stream dies silently.
    let mut child = Command::new("python")
        .arg(&sidecar_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    // Bind (do not take) the stdin handle so it lives as long as `child`.
    let _sidecar_stdin = child.stdin.as_ref();

    let stdout = child.stdout.take().ok_or_else(|| {
        anyhow::anyhow!("Failed to capture sidecar stdout")
    })?;

    let reader = BufReader::new(stdout);

    // Read JSON lines from the sidecar and emit them to the frontend.
    for line_result in reader.lines() {
        if should_exit.load(Ordering::Relaxed) {
            break;
        }

        match line_result {
            Ok(line) => {
                // Try to parse as JSON.
                match serde_json::from_str::<Value>(&line) {
                    Ok(json_val) => {
                        // Emit to the frontend as "scan" event.
                        if let Err(e) = app.emit("scan", &json_val) {
                            eprintln!("[sidecar] Failed to emit scan event: {}", e);
                        }
                    }
                    Err(_) => {
                        // Not JSON, log it
                        eprintln!("[sidecar] Received non-JSON line: {}", line);
                    }
                }
            }
            Err(e) => {
                eprintln!("[sidecar] Read error: {}", e);
                break;
            }
        }
    }

    eprintln!("[sidecar] Exiting");
    Ok(())
}
