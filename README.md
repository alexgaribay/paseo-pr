# Paseo PR

Paseo plugin that lists GitHub pull requests for registered projects and opens isolated workspaces from them.

Requires **Paseo 0.10.3 or newer on both the daemon and connected app**, plus the [GitHub CLI](https://cli.github.com/) (`gh`) on the **daemon** machine, authenticated with `gh auth login`. The plugin looks for `gh` on the process PATH, then Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`), `~/.local/bin`, and the login shell PATH so GUI-launched Paseo still finds it. Configure it from **Settings → Plugins → Pull requests** or **Pull requests → Settings**. Preferences are stored under `$PASEO_HOME/plugin-data/paseo-pr/settings.json`.

Plugins are installed per daemon. The path or Git clone lives on the host running the daemon, not on the machine where you open the Paseo app.

## Install

On the target host, open **Settings → Plugins** and turn on **Enable plugins**.

Paseo compiles the plugin itself and supplies React, React Native, TanStack Query, Zod, and `@getpaseo/plugin` at runtime. Do not run `npm install` just to load the plugin; that is only for local typechecking.

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

- Bottom sidebar **Pull requests** lists PRs for Paseo projects whose git remote is GitHub, with the author’s avatar next to their username.
- Filter with **Repository**, **Status**, **Author**, **Assignee**, and **Review Attention** plus search. Draft PRs remain visible in the normal list.
- **Assignee: Me** lists PRs assigned to the signed-in GitHub user.
- **Review Attention: Me** includes direct review requests, your PRs with changes requested, and PRs needing re-review after the head commit changes. Drafts are excluded.
- **Reviews Need Attention** opens those results. The sidebar **Pull requests** item shows the same count (desktop/web). Zero hides both. The count starts after the inbox is opened once, then refreshes on the configured interval (default 5 minutes).
- **Settings** on the inbox configures background refresh (Off, 1, 2, 5, 10, 15, or 30 minutes), which existing Paseo workspace labels to apply when this plugin **creates** a workspace (search and selected color pills; not applied when jumping to one), and the GitHub CLI path. The open inbox list uses the same interval.
- **Assigned PR automation** runs on the daemon, not once per connected app. Choose one **Review host** under automation settings; the picker includes other configured hosts, including offline ones. Use the same designated owner on every enabled installation, or leave other installations set to **None**. Only the matching daemon creates automatic reviews; there is no automatic failover to another host. Existing settings without an owner pause automation until one is selected. Manual workspace creation remains available everywhere.
- Automatic review records are stored in `$PASEO_HOME/plugin-data/paseo-pr/automation.json`. Completed reviews survive app reconnects, plugin reloads, and disabling/re-enabling automation. Pending creation uses stable Paseo idempotency keys, so retrying a lost response does not create another workspace or agent. A PR is deduplicated by GitHub host, repository, and PR number even when the same repository is registered in multiple projects.
- Automation excludes your own PRs and PRs whose author cannot be compared with the authenticated viewer. **Include draft PRs** is disabled by default; excluded drafts remain eligible when they become ready. Enabling automation processes current eligible assignments and review requests, but never clears completed records. A worker starts when the plugin first receives a status/settings request or workspace-created event, then continues polling every minute without requiring the app to remain open.
- Click a pull request row to open a show view with the description, conversation comments, and reviews, rendered as markdown with author avatars. **Create Workspace** creates a worktree checkout of that change request. **Jump to Workspace** opens an existing one. **View on GitHub** and markdown links use Paseo's supported external opener: system browser on desktop, a new tab on web, and the OS URL handler on mobile. GitHub host restrictions remain enforced.
- **New workspace** on a repo creates a worktree branched from `origin/HEAD`.
- Command Center (**⌘K** / **Ctrl+K**) → **Search for PR** opens the inbox and focuses the Search field.
