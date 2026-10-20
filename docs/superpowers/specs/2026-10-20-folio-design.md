# Folio workspace design

## Intent and evidence
The user requested analysis of Notion's UI and functionality using tester-army/e2e, followed by an app and repeated E2E testing until complete.
Four real-browser e2e research tests passed against Notion's public Help Center. Evidence is in docs/research and .e2e-research. These are publicly documented screens, not a logged-in audit of a private workspace.

## Findings and implementation choices
Notion centers on a sidebar page tree, block-based documents, searchable workspace content, and databases with interchangeable views. Favorites and trash support navigation and recovery. A database record is a page with properties.
Build an original Korean personal workspace named Folio, inspired by these flows. Use a restrained warm-white interface, charcoal sidebar typography, blue controls, a decorative abstract cover, breadcrumbs, and accessible dialog controls. The default document is a getting-started hub with linked project cards and an embedded task database.

## Scope
- Create, rename, duplicate, favorite, nest, trash, and restore pages; recursive deletion and restoration preserve hierarchy.
- Editable document title and text, heading, bullet, checkbox, callout, quote, divider blocks. Slash menu, Enter to add, block type selection, reorder and delete controls.
- Search page titles and block text, with keyboard shortcut Ctrl/Cmd+K.
- Task database: table and board views; add/edit/delete records; title, status, priority, assignee, due date; status filter, query, sort; database state shared between views.
- Templates create real pages. Settings change workspace name and theme. Export workspace JSON and current page Markdown. Import validated workspace JSON with explicit replace confirmation.
- Browser localStorage persistence, recoverable storage errors, mobile navigation, keyboard access, escaped user content. No external services or remote fonts required.

## Explicit limits
No Notion account integration, remote synchronization, AI model, multiplayer editing, billing, or fake sharing. Display local-only storage clearly in settings. Non-agent E2E assertions do not need model credentials.

## Completion criteria
Public Notion analysis recorded; all implemented user flows pass tester-army/e2e; a successful production Chromium smoke run, mobile layout checks and no browser console errors; runnable local app and published owner-private static deployment if hosting succeeds.

## Source references
- https://www.notion.com/help/create-your-first-page
- https://www.notion.com/help/navigate-with-the-sidebar
- https://www.notion.com/help/intro-to-databases
- https://www.notion.com/help/search
