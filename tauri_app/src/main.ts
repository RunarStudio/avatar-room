import "./style.css";
import { listen } from "@tauri-apps/api/event";
import { Avatar, Status, type Program } from "./avatar";
import { DASHBOARDS } from "./dashboards";

// ── Column model ─────────────────────────────────────────────────────────────
// One stage, one rail, always. `focused === null` (browse) puts every
// browsable column on stage side by side; focusing one gives it the whole
// stage and collapses the rest into the rail. Pull Requests and My Work are
// never browsable -- a PR table or a checklist is unreadable at a third of
// the window's width, so they only ever open full-width.
//
// Settings sits outside this array entirely (reached from the top-bar gear,
// not a rail icon) -- it's a destination you visit, not something you
// monitor alongside the others.

interface ColumnDef {
  id: string;
  label: string;
  browsable: boolean;
  frameSrc?: string; // present => rendered as an iframe, not native DOM
}

const COLUMNS: ColumnDef[] = [
  { id: "attention", label: "Attention", browsable: true },
  { id: "programs", label: "Programs", browsable: true },
  { id: "sessions", label: "Sessions", browsable: true },
  { id: "pull-requests", label: "Pull Requests", browsable: false, frameSrc: DASHBOARDS[0].src },
  { id: "my-work", label: "My Work", browsable: false },
];

const FOCUS_KEY = "avatar-room.focused-column.v1";

function readFocus(): string | null {
  try {
    const saved = localStorage.getItem(FOCUS_KEY);
    if (saved === "settings" || COLUMNS.some((c) => c.id === saved)) return saved;
  } catch {
    // Private windows and blocked site data both throw here; browse is fine.
  }
  return null;
}

function writeFocus(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(FOCUS_KEY);
    else localStorage.setItem(FOCUS_KEY, id);
  } catch {
    // Persisting the focus is a convenience, never a requirement.
  }
}

let focused: string | null = readFocus();

function onStageIds(): string[] {
  if (focused === "settings") return ["settings"];
  if (focused === null) return COLUMNS.filter((c) => c.browsable).map((c) => c.id);
  return [focused];
}

// ── Shell ────────────────────────────────────────────────────────────────────

const RAIL_ICON: Record<string, string> = {
  attention: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path></svg>`,
  programs: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"></rect><path d="M8 21h8"></path><path d="M12 17v4"></path></svg>`,
  sessions: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M6 9l3 3-3 3"></path><path d="M12 15h5"></path></svg>`,
  "pull-requests": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M6 9v6"></path><circle cx="18" cy="18" r="3"></circle><path d="M18 15V9a4 4 0 0 0-4-4h-3"></path><path d="M13 8l-2-3 2-3"></path></svg>`,
  "my-work": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`,
};

const GEAR_ICON = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.4.56.71.7H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <main class="dashboard">
    <header>
      <div>
        <p class="eyebrow">AI AVATAR ROOM</p>
        <h1>Release manager workspace</h1>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span class="status"><i></i> <span id="conn-label">Waiting for scanner…</span></span>
        <span class="status" id="jobs-chip"><i style="background:#78a9ff;"></i> <span id="jobs-label">— jobs running</span></span>
        <button id="settings-gear" class="icon-btn" title="Settings">${GEAR_ICON}</button>
      </div>
    </header>
    <div class="workspace">
      <nav id="rail" aria-label="Collapsed sections"></nav>
      <div id="panels"></div>
    </div>
  </main>
`;

const panels = document.querySelector<HTMLDivElement>("#panels")!;
const rail = document.querySelector<HTMLElement>("#rail")!;
const connLabel = document.querySelector<HTMLSpanElement>("#conn-label")!;
const jobsLabel = document.querySelector<HTMLSpanElement>("#jobs-label")!;

// One panel per column, plus a settings panel. Pull Requests mounts its
// iframe immediately and unconditionally (not lazily on first focus) --
// unlike a normal dashboard tab, this one's whole job is watching for PR
// approvals in the background so they can reach the Attention Queue before
// the user ever opens the tab.
for (const col of [...COLUMNS, { id: "settings", label: "Settings", browsable: false }]) {
  const panel = document.createElement("section");
  panel.className = col.frameSrc ? "panel panel-frame" : "panel";
  panel.dataset.panel = col.id;
  panels.appendChild(panel);
}

function panelFor(id: string): HTMLElement {
  return panels.querySelector<HTMLElement>(`[data-panel="${id}"]`)!;
}

let prFrame: HTMLIFrameElement | null = null;

function mountPullRequestsFrame(): void {
  const col = COLUMNS.find((c) => c.id === "pull-requests")!;
  const panel = panelFor("pull-requests");
  if (panel.querySelector("iframe")) return;
  const frame = document.createElement("iframe");
  frame.className = "dashboard-frame";
  frame.src = col.frameSrc!;
  frame.title = col.label;
  panel.appendChild(frame);
  prFrame = frame;
}

function renderRail(): void {
  const stage = new Set(onStageIds());
  const railItems = focused === "settings" ? COLUMNS : COLUMNS.filter((c) => !stage.has(c.id));

  rail.innerHTML = railItems
    .map((c) => {
      const badge = railBadge(c.id);
      const badgeHtml =
        badge !== ""
          ? `<span class="rail-badge${c.id === "attention" ? " rail-badge-alert" : ""}">${badge}</span>`
          : "";
      return `<button data-col="${c.id}" title="${c.label}">${RAIL_ICON[c.id] ?? ""}<span class="rail-label">${c.label}</span>${badgeHtml}</button>`;
    })
    .join("");
}

function railBadge(id: string): string {
  if (id === "attention") return String(attentionItems.length || "");
  if (id === "sessions") return String(lastScan?.programs.reduce((n, p) => n + p.sessions.length, 0) ?? "");
  return "";
}

function selectColumn(id: string | null): void {
  focused = id;
  writeFocus(id);
  const stageIds = onStageIds();
  const stage = new Set(stageIds);
  for (const col of [...COLUMNS, { id: "settings" }]) {
    panelFor(col.id).hidden = !stage.has(col.id);
  }
  panels.style.gridTemplateColumns = `repeat(${stageIds.length}, minmax(0, 1fr))`;
  renderRail();
}

rail.addEventListener("click", (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-col]");
  if (btn?.dataset.col) selectColumn(btn.dataset.col);
});

document.querySelector<HTMLButtonElement>("#settings-gear")!.addEventListener("click", () => {
  selectColumn(focused === "settings" ? null : "settings");
});

// ── Panel content ────────────────────────────────────────────────────────────

panelFor("attention").innerHTML = `
  <article class="attention">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div>
        <p class="eyebrow">ATTENTION QUEUE</p>
        <h2 id="attention-title">No items need a decision</h2>
        <p id="attention-subtitle" class="muted small"></p>
      </div>
    </div>
    <div id="attention-list"></div>
  </article>
`;

panelFor("programs").innerHTML = `
  <article>
    <p class="eyebrow">PROGRAMS</p>
    <canvas id="avatar-canvas" width="640" height="200"></canvas>
    <div id="program-list"></div>
  </article>
`;

panelFor("sessions").innerHTML = `
  <article>
    <p class="eyebrow">SESSIONS</p>
    <h2>Live sessions</h2>
    <div id="session-list"><p class="muted">Waiting for the first scan…</p></div>
  </article>
`;

panelFor("my-work").innerHTML = `
  <article>
    <p class="eyebrow">MY WORK</p>
    <h2>Personal checklist</h2>
    <p class="muted">Locally persisted release-manager checklist — not built yet.</p>
  </article>
`;

panelFor("settings").innerHTML = `
  <article>
    <p class="eyebrow">SETTINGS</p>
    <h2>Program visibility, skins, notifications</h2>
    <p class="muted">Not built yet.</p>
  </article>
`;

// Mount Pull Requests immediately -- see the comment above the panel loop.
mountPullRequestsFrame();

// ── Avatars ──────────────────────────────────────────────────────────────────

const canvas = document.querySelector<HTMLCanvasElement>("#avatar-canvas")!;
const ctx = canvas.getContext("2d")!;
const avatars: Record<Program, Avatar> = {
  claude: new Avatar(canvas, 60, 40, "claude", Status.IDLE),
  cursor: new Avatar(canvas, 180, 40, "cursor", Status.IDLE),
};

const STATUS_BY_NAME: Record<string, Status> = {
  idle: Status.IDLE,
  thinking: Status.THINKING,
  busy: Status.BUSY,
  subagent: Status.SUBAGENT,
  error: Status.ERROR,
  done: Status.DONE,
  needs_input: Status.NEEDS_INPUT,
};

// ── Scan + notification state ───────────────────────────────────────────────

interface ScanSession {
  session_id: string;
  short_id: string;
  status: string;
  tool: string;
  cwd: string;
}
interface ScanProgram {
  program_id: string;
  name: string;
  status: string;
  sessions: ScanSession[];
}
interface ScanPayload {
  type: string;
  version?: number;
  ts: number;
  programs: ScanProgram[];
}

interface AttentionItem {
  dot: string;
  what: string;
  where: string;
  age: string;
  badge?: { text: string; bg: string; fg: string };
  url?: string;
}

// session_id -> when the Rust hub first flagged it (for relative "age").
const needsInputSince = new Map<string, number>();
const needsInputMessage = new Map<string, string>();

interface PrAttentionItem {
  id: number;
  title: string;
  destination: string;
  source: string;
  url: string;
  reason: "review" | "failed";
  updatedOn: string;
}

let prConnected = false;
let prAttention: PrAttentionItem[] = [];
let runningJobs = 0;
let lastScan: ScanPayload | null = null;
let attentionItems: AttentionItem[] = [];

function timeAgo(epochMsOrIso: number | string): string {
  const then = typeof epochMsOrIso === "number" ? epochMsOrIso : Date.parse(epochMsOrIso);
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

// Scanned/remote strings (cwd, PR titles, branch names) are written as text
// nodes, never as HTML -- never treat them as instructions either.
function text(el: HTMLElement, value: string): void {
  el.textContent = value;
}

function recomputeAttention(): void {
  const sessionItems: AttentionItem[] = [];
  if (lastScan) {
    for (const prog of lastScan.programs) {
      for (const s of prog.sessions) {
        if (!needsInputSince.has(s.session_id)) continue;
        sessionItems.push({
          dot: "#ff44dd",
          what: needsInputMessage.get(s.session_id) || `${prog.name} needs your permission`,
          where: baseName(s.cwd) || s.short_id,
          age: timeAgo(needsInputSince.get(s.session_id)!),
        });
      }
    }
  }

  const prItems: AttentionItem[] = prAttention.map((pr) => ({
    dot: pr.reason === "review" ? "#f6c85f" : "#ff7385",
    what: `PR #${pr.id} ${pr.reason === "review" ? "needs your approval" : "failed CI after your approval"}`,
    where: `${pr.source || "?"} → ${pr.destination}`,
    age: timeAgo(pr.updatedOn),
    badge:
      pr.reason === "review"
        ? { text: "Review", bg: "#f6c85f", fg: "#36270a" }
        : { text: "Failed", bg: "#ff7385", fg: "#481621" },
    url: pr.url,
  }));

  attentionItems = [...prItems, ...sessionItems];
  renderAttention();
  renderRail();
}

function renderAttention(): void {
  const title = document.querySelector<HTMLElement>("#attention-title")!;
  const subtitle = document.querySelector<HTMLElement>("#attention-subtitle")!;
  const list = document.querySelector<HTMLElement>("#attention-list")!;

  text(
    title,
    attentionItems.length
      ? `${attentionItems.length} item${attentionItems.length === 1 ? "" : "s"} ${attentionItems.length === 1 ? "needs" : "need"} a decision`
      : "No items need a decision",
  );
  text(
    subtitle,
    prConnected
      ? `${prAttention.length} PR(s), ${attentionItems.length - prAttention.length} session(s)`
      : "Connect Pull Requests to include PR approvals here.",
  );

  list.replaceChildren();
  for (const item of attentionItems) {
    const row = document.createElement("div");
    row.className = "attention-row";

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = item.dot;
    row.appendChild(dot);

    const body = document.createElement("div");
    body.className = "attention-body";

    const whatLine = document.createElement("div");
    whatLine.className = "attention-what-line";
    const what = document.createElement("p");
    what.className = "attention-what";
    text(what, item.what);
    whatLine.appendChild(what);
    if (item.badge) {
      const badge = document.createElement("span");
      badge.className = "pill-badge";
      badge.style.background = item.badge.bg;
      badge.style.color = item.badge.fg;
      text(badge, item.badge.text);
      whatLine.appendChild(badge);
    }
    body.appendChild(whatLine);

    const where = document.createElement("p");
    where.className = "attention-where mono";
    text(where, item.where);
    body.appendChild(where);
    row.appendChild(body);

    const age = document.createElement("span");
    age.className = "attention-age";
    text(age, item.age);
    row.appendChild(age);

    if (item.url) {
      row.style.cursor = "pointer";
      row.title = "Open in browser";
      row.addEventListener("click", () => window.open(item.url, "_blank", "noreferrer"));
    }

    list.appendChild(row);
  }
  if (!list.childElementCount) {
    const empty = document.createElement("p");
    empty.className = "muted";
    text(empty, "Nothing needs a decision right now.");
    list.appendChild(empty);
  }
}

function renderScan(scan: ScanPayload): void {
  const programList = document.querySelector<HTMLElement>("#program-list")!;
  programList.replaceChildren();

  for (const prog of scan.programs) {
    const status = STATUS_BY_NAME[prog.status] ?? Status.IDLE;
    const flagged = prog.sessions.some((s) => needsInputSince.has(s.session_id));
    const avatar = avatars[prog.program_id as Program];
    if (avatar) avatar.setStatus(flagged ? Status.NEEDS_INPUT : status);

    const row = document.createElement("div");
    row.className = "program-row";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = flagged ? "#ff44dd" : "#3d4770";
    row.appendChild(dot);
    const name = document.createElement("span");
    name.className = "program-name";
    text(name, prog.name);
    row.appendChild(name);
    const meta = document.createElement("span");
    meta.className = "program-meta mono";
    text(meta, prog.sessions.length ? `${prog.sessions.length} session(s)` : "no sessions");
    row.appendChild(meta);
    programList.appendChild(row);
  }

  const list = document.querySelector<HTMLElement>("#session-list")!;
  list.replaceChildren();
  for (const prog of scan.programs) {
    for (const s of prog.sessions) {
      const row = document.createElement("p");
      row.className = needsInputSince.has(s.session_id) ? "session needs-input" : "session";
      const tool = s.tool ? ` · ${s.tool}` : "";
      text(row, `${prog.name} · ${s.short_id} · ${s.status}${tool} · ${s.cwd}`);
      list.appendChild(row);
    }
  }
  if (!list.childElementCount) {
    const empty = document.createElement("p");
    empty.className = "muted";
    text(empty, "No active sessions.");
    list.appendChild(empty);
  }

  renderRail();
}

listen<ScanPayload>("scan", (event) => {
  lastScan = event.payload;
  text(connLabel, `Scanner live · ${lastScan.programs.length} program(s)`);
  // Drop needs-input flags for sessions the scanner no longer sees.
  const liveIds = new Set(lastScan.programs.flatMap((p) => p.sessions.map((s) => s.session_id)));
  for (const id of [...needsInputSince.keys()]) {
    if (!liveIds.has(id)) {
      needsInputSince.delete(id);
      needsInputMessage.delete(id);
    }
  }
  renderScan(lastScan);
  recomputeAttention();
});

listen<{ session_id: string; message: string }>("notification", (event) => {
  needsInputSince.set(event.payload.session_id, Date.now());
  needsInputMessage.set(event.payload.session_id, event.payload.message || "");
  if (lastScan) renderScan(lastScan);
  recomputeAttention();
});

// ── Pull Requests bridge ─────────────────────────────────────────────────────
// The bitbucket.html page owns its own Bitbucket credentials and polling; it
// posts its computed attention items and running-job count here so they can
// join the queue without this shell ever touching a Bitbucket API directly.

interface PrStatusMessage {
  type: "avatar-room:pr-status";
  connected: boolean;
  watchBranches: string[];
  attentionPRs: PrAttentionItem[];
  runningJobs: number;
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (!prFrame || event.source !== prFrame.contentWindow) return;
  const data = event.data as Partial<PrStatusMessage> | null;
  if (!data || data.type !== "avatar-room:pr-status") return;

  prConnected = !!data.connected;
  prAttention = Array.isArray(data.attentionPRs) ? data.attentionPRs : [];
  runningJobs = typeof data.runningJobs === "number" ? data.runningJobs : 0;

  text(
    jobsLabel,
    prConnected ? `${runningJobs} job${runningJobs === 1 ? "" : "s"} running` : "Pull Requests not connected",
  );
  recomputeAttention();
});

// 20 FPS render loop, matching the tkinter overlay's cadence.
setInterval(() => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const avatar of Object.values(avatars)) {
    avatar.update();
    avatar.draw(ctx);
  }
}, 50);

// Ages ("12s" -> "13s" -> "1m") tick forward even between scans/notifications.
setInterval(() => {
  if (attentionItems.length) recomputeAttention();
}, 5000);

selectColumn(focused);
recomputeAttention();
