# Bitbucket Cloud PR dashboard

Open `tauri_app/public/dashboards/bitbucket.html` in a modern browser, or use the
**Pull Requests** tab in the Tauri app. It is a read-only, local
dashboard; no server, webhook, or extra package is required.

## One-time setup

1. In Bitbucket Cloud, create an API token limited to the
   `read:pullrequest:bitbucket` scope.
2. Enter the token, workspace, and repository slug in the dashboard's **Initial
   setup** panel, then select **Save and connect**.
3. Choose a polling interval. The 60-second default is the practical choice;
   the 1-second option is available for short, focused monitoring periods.

The page stores the token, repository settings, event choices, and its cached
list of non-`feature/` branches in this browser profile's `localStorage`.
Use **Forget token** before sharing the browser profile or computer.

The branch list is fetched on connection and refreshed at most once every ten
minutes. PRs refresh at the selected rate. If Bitbucket returns HTTP 429, the
page switches the next retry to 60 seconds.

## Included filters and flags

- Destination branches whose names do not begin with `feature/`
- New PRs entering a watched branch
- PR updates/new commits
- Reviews requested from the current token's user
- Optional failed build/check status (this makes one extra request per open PR)

The dashboard never approves, comments on, merges, or modifies a PR.
