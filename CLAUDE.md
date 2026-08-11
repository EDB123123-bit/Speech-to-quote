# Speech-to-quote

This repository has the [Superpowers](https://github.com/obra/superpowers) skills library installed at the project level (`.claude/skills/`), since the Claude Code `/plugin` command isn't available in this environment. A `SessionStart` hook (`.claude/hooks/superpowers-session-start`, wired in `.claude/settings.json`) injects the `using-superpowers` skill at the start of every session, replicating the official plugin's behavior.

Available skills: brainstorming, writing-plans, executing-plans, subagent-driven-development, dispatching-parallel-agents, test-driven-development, systematic-debugging, requesting-code-review, receiving-code-review, using-git-worktrees, finishing-a-development-branch, verification-before-completion, writing-skills, design-loop.

To get the real plugin (with auto-updates) instead, run in an environment with `/plugin` support:

```
/plugin install superpowers@claude-plugins-official
```
