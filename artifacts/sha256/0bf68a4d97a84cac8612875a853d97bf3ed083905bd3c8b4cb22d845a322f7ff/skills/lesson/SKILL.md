---
name: lesson
description: Propose a lesson worth keeping to the project's owners, with a citation. Nothing is written until an owner promotes it.
argument-hint: <the lesson, in a sentence or two>
disable-model-invocation: true
---

Propose this lesson to the memory inbox of the intent's project: $ARGUMENTS

1. If no lesson was given, ask the person what the lesson is, and stop.
2. Write the lesson as a rule a later agent can follow, in at most a few sentences. Leave out secrets, credentials, personal data and file contents.
3. Cite where it comes from: a file of this repository at the current commit (its `repo` as owner/name, `path`, `sha` and `lines`), or the run and step it was learned in (`run_id` and `step_key`).
4. Run `wl lesson` with the Bash tool, with the lesson as one JSON object on its standard input: `text`, `kind` (`procedural` for how to do something, `semantic` for a fact, `episodic` for what happened), `scope` (`{"type": "service", "ref": "payments"}`, or `project`, `repo`, `team` or `org`), `target_path` (under `atlas/memories/`, ending `.md`) and `citations`. It proposes it to the session's intent's project through Weftline's Context MCP server. If it says there is no session here, ask the person to start one with `/wl:work <KEY>`, and stop.
5. Tell the person it went to the project's owners for review, and that nothing is written to the repository until they promote it.
