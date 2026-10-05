# LangCapture Skills

Turn real coding-agent conversations, in any language, into useful English for explaining your work. The agent reads and analyzes your selected sessions; the bundled upload helper saves only selected expressions to your LangCapture library.

## Install

Requires Node.js 22+ and npm/npx. No third-party packages are needed by the upload helper.

```sh
npx skills add yexia553/langcapture-skills --skill langcapture-work-english -g -a codex -y
```

Replace `codex` with `claude-code`, `pi`, or `opencode`, or omit `-a` to choose agents interactively.

## Connect LangCapture

Open **Settings → Coding Agent** in LangCapture and run the generated token configuration command. It writes your personal upload token to `~/.langcapture/config.json`, outside the installed skill. All your agents share this configuration; running a new configuration command replaces the local token. Tokens expire after one year and can be revoked in settings.

Reload your agent, then ask:

> Turn today's work conversations into English for a project update, and save the expressions I choose to LangCapture.

You can specify a date, project, agent, or communication scenario. The skill works with Chinese and other source languages, composing English grounded in the work rather than requiring suitable English quotations.

## Privacy and coverage

The skill contains no personal credentials. Keep generated configuration commands and local configuration private. Raw histories stay local; the upload helper sends only selected English to your configured LangCapture origin. Capture uses normal account language settings and credits. The agent reports inaccessible local, remote, or cloud sessions; coverage depends on its tools and access.

## Structure and development

`skills/langcapture-work-english/SKILL.md` contains standard Agent Skills frontmatter and the workflow. `scripts/upload.mjs` is the only bundled executable helper; history reading and analysis are performed by the host agent.

```sh
node --test
```

MIT licensed. No build step or dependency installation is required.
