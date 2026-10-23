# Paseo PR

Paseo plugin that lists GitHub pull requests for registered projects and opens isolated workspaces from them.

Requires **Paseo 0.12.0 or newer on both the daemon and connected app**, plus the [GitHub CLI](https://cli.github.com/) (`gh`) on the **daemon** machine, authenticated with `gh auth login`. The plugin looks for `gh` on the process PATH, then Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`), `~/.local/bin`, and the login shell PATH so GUI-launched Paseo still finds it. Configure it from **Settings → Plugins → Pull requests** or **Pull requests → Settings**. Preferences are stored under `$PASEO_HOME/plugin-data/paseo-pr/settings.json`.

Plugins are installed per daemon. The path or Git clone lives on the host running the daemon, not on the machine where you open the Paseo app.

## Install

On the target host, open **Settings → Plugins** and turn on **Enable plugins**.

Paseo compiles the plugin itself and supplies React, React Native, TanStack Query, Zod, and `@getpaseo/plugin` at runtime. Do not run `npm install` just to load the plugin; that is only for local typechecking.

Paseo also validates type-only imports during compilation. Keep shared workspace contracts structural rather than importing `@getpaseo/protocol` types: that package is not host-provided, and installed plugin checkouts do not need local dependencies.

### Directory

Checkout this repository to an absolute path **on the daemon machine**, then:

```bash
paseo plugin install /absolute/path/to/paseo-pr
paseo plugin ls
```

If you pass `--host`, that path must already exist on the remote daemon. A path from your laptop will not be copied over.

### Git

Install on the target daemon:

```bash
paseo plugin add alexgaribay/paseo-pr
# or
paseo plugin add git@github.com:alexgaribay/paseo-pr.git --host <daemon>
paseo plugin ls
```

The daemon user must be able to clone the repository. This repo is private, so the host needs GitHub credentials (`gh auth login`, a deploy key, or SSH agent forwarding). Making the repository public is the other option.

Confirm the plugin is `running`. If it is not, check `paseo plugin logs paseo-pr` on that host.

Reload after edits to a directory install:

```bash
npm install          # optional, local typecheck only
npm run typecheck
paseo plugin reload paseo-pr
```

## Use

- The native sidebar **Pull requests** row opens the inbox screen for Paseo projects whose git remote is GitHub, with the author’s avatar next to their username. It uses Paseo's screen and sidebar component APIs on desktop, web, and mobile, without injecting elements into the app's DOM.
- Filter with **Repository**, **Status**, **Author**, **Assignee**, and **Review Attention** plus search. Draft PRs remain visible in the normal list.
- **Assignee: Me** lists PRs assigned to the signed-in GitHub user.
- **Review Attention: Me** includes direct review requests, your PRs with changes requested, and PRs needing re-review after the head commit changes. Drafts are excluded.
- **Reviews Need Attention** opens those results. The sidebar **Pull requests** row shows the same count. Zero hides the badge and inbox attention button. The sidebar count loads as soon as the row mounts, without first opening the inbox, then refreshes on the configured interval (default 5 minutes). The sidebar and inbox share cached attention/settings queries, and sidebar polling stops when its last mounted observer is removed.
- **Settings** on the inbox configures background refresh (Off, 1, 2, 5, 10, 15, or 30 minutes), which existing Paseo workspace labels to apply when this plugin **creates** a workspace (search and selected color pills; not applied when jumping to one), and the GitHub CLI path. The open inbox list uses the same interval.
- **Assigned PR automation** runs on the daemon that manages the repositories, not once per connected app. No host selection is required: each enabled daemon reviews eligible PRs only for its own discovered, non-excluded projects. Existing profile, prompt, enabled state, and completed review records are preserved; old host-owner settings are ignored. If the same repository is registered on multiple enabled daemons, each can run its own review; deduplication is daemon-local, not cross-host. Manual workspace creation remains available everywhere.
- Automatic review records are stored in `$PASEO_HOME/plugin-data/paseo-pr/automation.json`. Completed reviews survive app reconnects, plugin reloads, and disabling/re-enabling automation. Pending creation uses stable Paseo idempotency keys, so retrying a lost response does not create another workspace or agent. A PR is deduplicated by GitHub host, repository, and PR number even when the same repository is registered in multiple projects.
- **Automatic re-reviews** continue the original review agent's thread when a PR needs re-review at a new head commit. The follow-up prompt asks the agent to safely refresh the checkout, compare changes against its earlier review, verify resolved findings, and report remaining issues and an updated recommendation, using your configured review instructions. Observed busy agents and pending permission requests defer the follow-up. Sends explicitly request Paseo's `steer` behavior; if a turn starts after the idle check, steering is provider-dependent and Paseo may replace that turn when steering is unsupported.
- Archived review threads are restored through Paseo's send API when their workspace is still active. A missing thread or an archived thread whose workspace is unavailable gets a replacement agent and, if needed, a new PR workspace. Transport failures retry the original thread rather than creating another.
- Dispatched head commits and pending message IDs are persisted, so repeated polls, reloads, and re-enabling automation do not resend handled revisions. Old journal records retain their original agent IDs; unknown head commits do not trigger re-reviews.
- Automation excludes your own PRs and PRs whose author cannot be compared with the authenticated viewer. **Include draft PRs** is disabled by default; excluded drafts remain eligible when they become ready. Enabling automation processes current eligible assignments and review requests, but never clears completed records. A worker starts when the plugin first receives a status/settings request or workspace-created event, then continues polling every minute without requiring the app to remain open.
- Click a pull request row to open a show view with the description, conversation comments, and reviews, rendered as markdown with author avatars. **Create Workspace** creates a worktree checkout of that change request. **Jump to Workspace** opens an existing one. **View on GitHub** and markdown links use Paseo's supported external opener: system browser on desktop, a new tab on web, and the OS URL handler on mobile. GitHub host restrictions remain enforced.
- **New workspace** on a repo creates a worktree branched from `origin/HEAD`.
- Command Center (**⌘K** / **Ctrl+K**) → **Search for PR** opens the inbox and focuses the Search field.
