# Verification evidence

Date: 2026-10-20. Platform: Windows x64, Node.js 22.23.2. Runner: tester-army/e2e 0.21.2, web engine 0.15.2, Chromium 156.

Latest repair verification (2026-10-21): **41/41 passed**, run `01a15b99-643d-7806-9ead-07bb9270dea4`, 33.16 seconds. See [repair details](repair-2026-10-21.md) for direct cell editing, persistent database controls, account links, and the authentication verification boundary.

## Results

| Check | Result |
| --- | --- |
| Public Notion page analysis, run 01a15716-da0c-7c06-8645-b3ad6b795151 | 4/4 passed |
| Initial empty-app navigation test | Failed as expected before implementation |
| First implemented workspace suite | 13/14 passed; theme test corrected to documented selectOption({value}) API |
| Main and edge-case suites | 27/27 passed |
| Five new review regression cases before fixes | 5/5 failed as expected |
| Full suite after fixes, run 01a15724-100f-7b2b-9626-6d82b7af2b68 | 32/32 passed, 0 failed, 0 skipped, 16.60 seconds |
| JavaScript syntax check (npm run check) | Passed |
| Fresh code review of five reported fixes | No remaining critical blocker found within reviewed scope |

## Browser coverage
Desktop startup, page title and body editing, reload persistence, slash-created checkbox persistence, Enter-created blocks, type conversion, workspace body search, favorites, duplication, trash and restore, parent/child restore semantics, task creation and editing, table/board consistency, status filter, task deletion persistence, templates and template isolation, settings and dark theme, actual JSON/Markdown file downloads, import preview/cancel/confirmation, cyclic import rejection, mobile navigation and horizontal overflow, HTML text escaping, maximum-size text and title boundaries, invalid imported IDs, storage failure with emergency backup, stale-tab save protection, keyboard search and Escape.

## Evidence locations
`.e2e/report.json` contains the last machine-readable result. `.e2e/results/` holds traces and screenshots. `.e2e-research/` and `docs/research/` retain local research evidence. These generated artifacts are ignored by Git and are not published with static assets.

Desktop and mobile screenshot artifacts were visually inspected. This is not a complete accessibility audit or proof of full Notion feature parity. Natural-language agent steps were not used: deterministic browser assertions require no separate model login.
