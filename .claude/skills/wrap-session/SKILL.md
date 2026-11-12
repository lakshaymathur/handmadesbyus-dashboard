---
name: wrap-session
description: End-of-session handoff for the HandMadesByUs dashboard. Updates docs/PROGRESS.md, keeps CLAUDE.md current, and commits the session's work. Run when the user types /wrap-session.
disable-model-invocation: true
---

# Wrap up this development session

Do these steps in order. Be brief and only touch what changed this session.

1. **Check the state**
   - Run `git status --short` and `git diff --stat` to see what changed.
   - If the project has `typecheck`, `lint` or `test` scripts, run them. If anything fails, tell the user and ask whether to fix it now or record it under *Known issues*. Don't commit silently over failures.

2. **Update `docs/PROGRESS.md`**
   - Set `_Last updated:` to today's date.
   - Tick off finished milestones. Update **Current focus**.
   - Rewrite **Next steps** as the 3–5 concrete next actions, specific enough that a fresh session can start straight away (name files or spec sections).
   - Add any decision made this session that isn't in the spec or code to **Decisions not in the spec**.
   - Add or remove **Known issues**.
   - **Prune**: delete detail about finished work (git keeps it). Keep the file under ~80 lines.

3. **Update `CLAUDE.md` only if needed**
   - Commands added or changed (remove the *(planned)* markers once they exist), folder layout changes, or new hard rules.
   - Don't add progress notes or session narrative to CLAUDE.md.

4. **Commit**
   - Stage the session's changes. Never stage `.env*` files (except `.env.example`) or `.docker-data/`.
   - Message: `<milestone>: <what was built>` on the first line, then a few bullet lines with the key changes and any notable decisions. End with the attribution trailer from the session's instructions, if one is given.
   - Don't push.

5. **Report** in 2–3 lines: what was committed, and what the next session should start with.
