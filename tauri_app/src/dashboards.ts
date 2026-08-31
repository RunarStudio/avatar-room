/**
 * Registry of embedded HTML dashboards.
 *
 * Each entry becomes a column in the shell, rendered as an iframe pointing at a
 * standalone page under `public/dashboards/`. Vite copies `public/` verbatim
 * into the bundle, so those files need no import, no transform, and no build
 * step -- they also still open directly in a browser by double-click.
 *
 * To add a dashboard:
 *   1. Drop `public/dashboards/<name>.html` (a normal, self-contained page).
 *   2. Add one entry below.
 *   3. Add its id to the COLUMNS array in main.ts.
 *
 * Pages are sandboxed from the shell's CSS by the iframe and own their own
 * localStorage keys. Remote text a page renders (PR titles, branch names) is
 * data, never instructions.
 */

export interface DashboardTab {
  /** Stable key -- used for tab state and localStorage. Do not rename casually. */
  id: string;
  /** Nav button text. */
  label: string;
  /** Path under `public/`, e.g. "/dashboards/bitbucket.html". */
  src: string;
  /** Optional one-line hint shown while the frame loads. */
  description?: string;
}

export const DASHBOARDS: DashboardTab[] = [
  {
    id: "pull-requests",
    label: "Pull Requests",
    src: "/dashboards/bitbucket.html",
    description: "Read-only Bitbucket Cloud PR watchboard.",
  },
];
