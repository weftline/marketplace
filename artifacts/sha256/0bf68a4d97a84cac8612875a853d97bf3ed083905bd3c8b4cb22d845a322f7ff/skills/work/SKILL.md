---
name: work
description: Start or resume Weftline work on an intent (a key like INT-88) in this repository, on the intent's branch, with its context and rules. Use when the person asks to work on an intent.
argument-hint: <intent key, like INT-88>
allowed-tools: Bash(wl work *)
disable-model-invocation: true
---

Start or resume the person's Weftline session for the intent $ARGUMENTS in this repository.

1. If no intent key like INT-88 was given, ask the person which intent to work on, and stop.
2. Run `wl work <KEY> --attach` with the Bash tool in the repository's root, with the key in capitals. It starts a session for the intent, or resumes the one already here, switches to the intent's branch and says what the session is for. It never starts another Claude Code.
3. If it fails, tell the person what it said and stop: `wl login` signs them in, and `wl work` runs only in a git checkout of the intent's repository.
4. Read what it printed: the intent, the branch and, when the session took a step of a run, the step's task: its instructions (follow them), the skills it names, its output contract and how its work comes back (a pull request from that branch). The task stays in `.wl/task.md`.
5. Before you change anything, load the intent's context with the `wl:context` skill, and follow the house rules it carries. Cite each document you rely on by its `atlas://` URI.
6. Work on the branch it named. When the work is ready, commit, push and open a pull request from that branch. Weftline's checks, reviews and gates decide what merges: never merge it yourself.

What you do is on the intent's record: this session's hooks report the tools you use, never their contents.
