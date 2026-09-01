# Paseo PR

Paseo plugin that lists GitHub pull requests for registered projects and opens isolated workspaces from them.

Requires the [GitHub CLI](https://cli.github.com/) (`gh`) on the **daemon** machine, authenticated with `gh auth login`. The plugin looks for `gh` on the process PATH, then Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`), `~/.local/bin`, and the login shell PATH so GUI-launched Paseo still finds it. Override that from **Pull requests → Settings**. Refresh interval and the GitHub CLI path are stored under `$PASEO_HOME/plugin-data/paseo-pr/settings.json`. Paseo's own Settings → Plugins cannot host plugin config today.

Plugins are installed per daemon. The path or Git clone lives on the host running the daemon, not on the machine where you open the Paseo app.

## Install

On the target host, open **Settings → Plugins** and turn on **Enable plugins**.

Paseo compiles the plugin itself and supplies React, React Native, TanStack Query, Zod, and `@getpaseo/plugin` at runtime. Do not run `npm install` just to load the plugin; that is only for local typechecking.

### Directory (Paseo 0.6+)

Checkout this repository to an absolute path **on the daemon machine**, then:

```bash
paseo plugin install /absolute/path/to/paseo-pr
paseo plugin ls
```

If you pass `--host`, that path must already exist on the remote daemon. A path from your laptop will not be copied over.

### Git (Paseo 0.7+)

Git plugin install needs daemon feature `pluginGitManagement` (Paseo 0.7). A 0.6 daemon answers `Update the host to install and update Git plugins.` Update Paseo on that host, then:

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

- Bottom sidebar **Pull requests** lists PRs for Paseo projects whose git remote is GitHub.
- Filter with **Repository**, **Status**, **Author**, **Assignee**, and **Awaiting Review** (checkbox items) plus search.
- **Assignee: Me** lists PRs assigned to the signed-in GitHub user.
- **Awaiting Review: Me** lists open PRs that need you: review requested, or your PR with changes requested.
- **Reviews Awaiting on Me** on the inbox lists those waiting PRs. The sidebar **Pull requests** item still shows a count (desktop/web). Zero hides both. The count starts after the inbox is opened once, then refreshes on the interval from **Settings** (default 5 minutes).
- **Settings** on the inbox configures background refresh (Off, 1, 2, 5, 10, 15, or 30 minutes) and the GitHub CLI path. The open inbox list uses the same interval.
- Click a pull request row to open a show view with the description, conversation comments, and reviews, rendered as markdown with author avatars. **Create Workspace** creates a worktree checkout of that change request. **Jump to Workspace** opens an existing one. **View on GitHub** on the show view opens the same PR in the browser.
- **New workspace** on a repo creates a worktree branched from `origin/HEAD`.
- Command Center (**⌘K** / **Ctrl+K**) → **Search for PR** opens the inbox and focuses the Search field. **Open by number** on the inbox still opens a pull request by number.
