# Spec 3e — HQ Casebook Desk (folder-grouped home) — design

**Date:** 2026-06-08
**Status:** Approved (design); plan pending
**Branch (planned):** `feat/hq-casebook-desk-3e`
**Part of:** the "Maple Hollow — World & Reputation" program (Spec 3), the **final** sub-spec
(execution order **3c → 3d → 3f → 3e**). **Depends on 3a** (reputation/rank), **3c** (cast/places
data), **3d** (World surfaces to link into), and **3f** (the one-tap "Start a new case" button — 3e
places it in the Open folder rather than defining its behavior). 3e is the capstone that ties the
program together on the home screen.

## Program context (where 3e sits)

By the time 3e starts, the app has: rank + Trophy Room (3a), Postgres (3b), a recurring cast/places
model + generation (3c), and the full World surfaces — Town, Who's Who, character/place detail with
portraits (3d). What's missing is a **home** that frames all of it. Today's `MainScreen` is a hero
greeting + a category grid + scattered entry buttons. 3e reskins the home into the prototype's
**detective's desk**: a casebook with manila-folder groups.

## The problem 3e solves

The home screen doesn't yet reflect the World. Cases, people, and places are reachable only via
ad-hoc buttons (added minimally in 3a/3d). 3e makes the home screen *be* the detective's desk — an
organized casebook where Open and Closed cases, the People of Maple Hollow, and its Places each live
in their own labeled folder, with rank/identity on the desk.

## Decisions (locked with user, 2026-06-08)

- **Folder groups = Open / Closed / People / Places.** The home reorganizes into four manila-folder
  groups: **Open cases** (in-progress / unsolved ready cases for this detective), **Closed cases**
  (solved or given-up), **People** (→ Who's Who, 3d), **Places** (→ Town, 3d).
- **Frontend reorganization — no new data or generation.** 3e composes existing data
  (mysteries + their per-detective solution state from 3a/3b, the roster from 3c/3d) into the desk
  layout. It adds **no** tables, no generation changes, no new core APIs (it may add a thin
  convenience read if grouping Open/Closed server-side is cleaner than client filtering).

## Goal

Reskin the home screen into a **detective's casebook desk**: the player's identity + rank on the
desk, and four manila folders — Open cases, Closed cases, People, Places — that organize everything
the program built, in the warm Maple Hollow aesthetic.

## Architecture

### Home as a desk of folders (frontend)

Rebuild `MainScreen` using the casebook `Folder` primitive (from the 3a/casebook reskin) as the
organizing motif:

- **Desk header** — the existing hero greeting (detective name + avatar) plus the **rank card** from
  3a (rank name + progress to next), styled as an ID/badge on the desk.
- **Open cases folder** — the detective's cases that are `ready` but **not yet resolved** by this
  player (no solution / not given up). Each is a case tab/card (cover thumbnail + title + a
  "new"/"in-progress" stamp). Tapping → the case (playback/solve flow). A "＋ New case" affordance
  lives here — this is **3f's single "Start a new case" button** (open-ended, preset-driven
  generation); 3e only places it, it does not define its behavior. (The old category grid is already
  gone by 3f.)
- **Closed cases folder** — cases this player has **solved or given up** (the Trophy Room's corpus,
  reframed on the desk). Solved cases carry a ✓/rank stamp. This folder is effectively the home-screen
  face of the 3a Trophy Room; the Trophy Room screen itself remains reachable for the full display.
- **People folder** — opens the **Who's Who** (3d). Folder face shows a few portrait peeks +
  resident count.
- **Places folder** — opens the **Town** (3d). Folder face shows a couple of place thumbnails.

### Data composition (no new model)

- Open vs. Closed split is **per-detective** and derives from the same solution/resolution state 3a
  already uses for reputation (a player has "resolved" a case if a `solutions` row exists — solved or
  gave-up). 3e reuses that; if a server-side grouped read (`GET /api/mysteries?group=open|closed`) is
  cleaner than client-side filtering of the existing list, add that thin convenience endpoint — no
  new tables.
- People/Places folder counts come from 3c/3d's `GET /characters` / `GET /places`.
- Everything stays **spoiler-safe** by construction (the home shows titles/covers/status, never
  solutions).

### Visual system

Pure reskin/recompose using **existing** casebook tokens, fonts, and primitives (3a + casebook reskin
already established `Folder`, `Stamp`, `SceneFrame`, manila/ink palette, slab-serif/typewriter/
handwriting fonts). Inline-`style={{}}` + CSS-vars convention; **no new design tokens**, no CSS-module
rewrite (`project_stack_facts_actual`).

## Components & boundaries

- `apps/web/src/screens/MainScreen/` — recomposed into desk + four `Folder` groups. Likely new
  subcomponents: `DeskHeader` (hero + rank badge), `CaseFolder` (Open/Closed case lists),
  `PeopleFolder` / `PlacesFolder` (folder faces linking to 3d). Reuse the existing CategoryGrid as
  the "new case" action inside/near the Open folder.
- Optional `routes/mysteries.ts` thin `group` query param (only if it simplifies the client).
- No `packages/shared` type changes expected (reuses existing mystery/solution/reputation DTOs).

## Testing

- Web typecheck + vite build; `MainScreen` renders the four folders from mocked data; Open/Closed
  split is correct for a detective with a mix of resolved/unresolved cases; People/Places folders
  link to Who's Who/Town.
- If the thin grouped endpoint is added: a pg-mem route test for the Open/Closed split per player.
- Playwright smoke: home desk → open a case from Open; home → Closed shows a solved case with stamp;
  home → People → Who's Who; home → Places → Town.
- iPad pass (the real surface): folders open/close cleanly, tap targets are kid-sized, no iOS
  nested-button/auto-zoom regressions (`reference_web_delete_gotchas`).

## Non-goals (deferred / out of scope)

- **No new data model, generation, or solvability changes** (all in 3c).
- **No new World surfaces** — People/Places folders link into 3d's existing Town/Who's Who.
- **No replacement of the Trophy Room** — the Closed folder is its home-screen face; the 3a Trophy
  Room screen stays.
- **No drag-and-drop / physical desk interactions** — folders are tap-to-open groups, not a
  skeuomorphic draggable desk.
- No changes to auth, COPPA posture, or the per-detective model.

## Open questions

- **Closed folder vs. Trophy Room overlap:** keep both (Closed folder = quick peek, Trophy Room =
  full display) vs. fold Trophy Room into the Closed folder. Recommend keeping both for v1 (least
  disruption to 3a).
- **"New case" placement:** 3f's "Start a new case" button inside the Open folder vs. a persistent
  desk button. Recommend inside/adjacent to the Open folder (it's the natural "add to open cases"
  gesture).
- **Empty states:** a brand-new detective has empty Open/Closed folders — needs a friendly
  first-case prompt. Recommend a warm empty-folder card pointing at "＋ New case."

## Acceptance criteria

1. The home screen is the casebook desk: identity + rank badge, and four working manila folders
   (Open / Closed / People / Places).
2. Open/Closed split is correct **per detective** and spoiler-safe; tapping a case enters the right
   flow.
3. People/Places folders open Who's Who/Town (3d); folder faces show counts/peeks.
4. Built entirely on existing tokens/primitives; web typecheck + vite build green; deployed to
   exe.dev for the iPad pass that closes out the whole Phase 3 program.
