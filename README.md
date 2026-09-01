# Paseo PR

Paseo plugin that lists GitHub pull requests for registered projects and opens isolated workspaces from them.

Requires the [GitHub CLI](https://cli.github.com/) (`gh`) on the daemon machine, authenticated with `gh auth login`. The plugin looks for `gh` on the process PATH, then Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`), `~/.local/bin`, and the login shell PATH so GUI-launched Paseo still finds it. Override that from **Pull requests** with **GitHub CLI path** (stored under `$PASEO_HOME/plugin-data/paseo-pr/settings.json`). Settings → Plugins cannot host plugin config today.

## Install

Enable plugins in Paseo (**Settings → Plugins**), then:

```bash
npm install
npm run typecheck
paseo plugin install /absolute/path/to/paseo-pr
```

Reload after edits:

```bash
npm run typecheck
paseo plugin reload paseo-pr
```

## Use

- Bottom sidebar **Pull requests** lists PRs for Paseo projects whose git remote is GitHub.
- Filter by project, state, author, and search.
- **Open workspace** on a PR creates a worktree checkout of that change request.
- **New workspace** on a repo creates a worktree branched from `origin/HEAD`.
- Command Center (**⌘K** / **Ctrl+K**) → **Open GitHub PR** looks up a PR by number and creates the same workspace.
