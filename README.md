# DA ROOM

A real-time multiplayer party game about ruining a perfectly good story with pasted images, text panels, and bad drawings. Everyone starts a chain, random chains rotate every round, and the room votes for the most unhinged one at the end. The reveal plays back one panel at a time, and any chain can be exported as a downloadable animated GIF.

Built with **React + TypeScript + Vite** on the client and **Express + Socket.IO + TypeScript** on the server. Rooms and images live in server memory.

## Quick start

Requires **Node.js 20+** and npm.

```bash
npm install
npm run dev
```

Open **http://localhost:5173** for the Vite client. The Socket.IO / API server runs on **http://localhost:3001**.

To run the production build:

```bash
npm run build
npm start
```

Open **http://localhost:3001**. `PORT` can be used to override the server port:

```powershell
$env:PORT=4000; npm start
```

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Runs the API/server and Vite dev server together |
| `npm run dev:server` | Runs only the server with file watching |
| `npm run dev:client` | Runs only the Vite client |
| `npm run build` | Builds the client to `dist/` and type-checks both client and server |
| `npm start` | Runs the production server, serving `dist/` and Socket.IO |
| `npm run typecheck` | Type-checks client and server without building |
| `npm test` | Runs the Node test suite (`tsx --test`) |

For local multiplayer smoke tests without extra browser tabs, `scripts/bots.mjs` joins a room as socket bots, submits panels, and votes:

```bash
node scripts/bots.mjs http://localhost:3001 ROOMCODE BotOne,BotTwo
```

## Deploying

DA ROOM is one Node process: it serves the built client from `dist/`, hosts Socket.IO, and keeps rooms and uploaded images in memory. GitHub Pages **cannot** host it — Pages only serves static files, so there is no socket server, no room state, and no `/api/images/:id`.

`render.yaml` is a [Render Blueprint](https://render.com/docs/blueprint-spec) that deploys the whole app as a single web service:

1. Push to GitHub (branch `main`).
2. In Render, choose **New → Blueprint** and select this repository.
3. Render reads `render.yaml` and runs:
   - build: `npm ci --include=dev && npm run build`
   - start: `npm start`
   - health check: `/api/health`
4. Open the generated `https://<service>.onrender.com` URL. That link is shareable; players just join with the room code.

`tsx` is a runtime dependency rather than a dev dependency, so `npm start` works even when a host installs production dependencies only. `render.yaml` pins Node 22 and `NODE_ENV=production`; change `region` if Frankfurt is not closest to your players.

### Free-tier caveats

- The free instance sleeps after about 15 minutes of inactivity, so the next visitor waits roughly 30–60 seconds for a cold start.
- Restarting or redeploying wipes every room and image, because storage is in memory by design.
- Run exactly one instance. Room state is per-process, so horizontal scaling or multiple instances would split players across separate servers.
- Any host with WebSocket support works (Railway, Fly.io, a VPS, or a container). HTTPS is required for clipboard and camera-free paste flows to behave like they do on localhost; Render supplies TLS and `wss://` automatically.

## How to play

1. One player creates a room with a nickname. The room gets a five-character code and a shareable link.
2. Friends join with the code or link. The lobby supports **2-12 players**. Readiness is a soft signal; the host can start once at least two players are connected.
3. **Round 1:** every player starts their own chain with one image, one text panel, or a drawing. That first panel carries the **call** caption above it.
4. **Rounds 2-R:** every player is randomly assigned another player's chain. Assignments are dealt with a randomized matching pass, and a player is never given a chain whose latest panel they authored. They see only that chain's latest panel and add exactly one image, text panel, or drawing.
5. Captions alternate down the chain. The **call** sits above one panel, then the **answer** lands below the next panel, then the call again, and so on.
6. When every round is complete, the reveal plays the room back **one panel at a time**, Gartic Phone style. The full wall of chains stays hidden until voting opens.
7. The host opens voting. Each player gets one vote. The winner is the chain with the most votes. Results include the full gallery, a replay of the reveal, and GIF export controls.

A complete chain is rendered like this:

```text
panel 0:  [CALL caption]
          [image / text / drawing]

panel 1:  [image / text / drawing]
          [ANSWER caption]

panel 2:  [CALL caption]
          [image / text / drawing]
```

The first panel gets a call caption, never both captions. Even panel indexes use the call; odd indexes use the answer. The call is fixed: `AND THEN {pronoun} WALKS IN` is not editable, and only the pronoun changes it. The answer is editable, defaults to `AND WALKS OUT TF?`, and also supports `{pronoun}`.

## Settings

The host can edit settings in the lobby only.

| Setting | Default | Notes |
| --- | --- | --- |
| Pronoun | `SHE` | Presets `SHE` / `HE` / `THEY`, or a custom value up to 24 characters. Replaces `{pronoun}` in captions. |
| Call caption | `AND THEN {pronoun} WALKS IN` | Locked. Only the pronoun changes it. |
| Answer caption | `AND WALKS OUT TF?` | Editable, max 120 characters. Blank or overlong values fall back to the default. |
| Total rounds | `6` | Range **2-12**, including round 1. |
| Submission timer | Off | Optional 15-600 seconds. Missing panels are auto-filled with a server-generated placeholder when it expires. |
| Voting timer | Off | Optional 15-600 seconds. Voting closes automatically when it expires. |
| Allow self-voting | Off | When off, a player cannot vote for their own chain. |
| Sudden-death tiebreak | Off | Runs one 30-second vote between tied chains. If that also ties, the host picks. |
| Drawing mode | Off | Adds a **Draw** tab that starts from the latest image in the assigned chain, so players can doodle over the panel they were handed. |

Settings changes are saved explicitly with **Save settings**. Unsaved changes are applied automatically when the host starts the game. The UI blocks invalid values, and the server independently normalizes or clamps anything it receives.

## Architecture

### High level

```text
Browser (React + Socket.IO client)
        |
        |  Socket.IO events + acks
        v
Express HTTP server --- GET /api/health
        |              GET /api/images/:id
        |
        +--- Socket.IO --- RoomManager (authoritative state machine)
                              |
                              +--- ImageStore (in-memory image buffers)
```

The server is authoritative for phases, random chain assignments, timers, deadlines, submissions, voting eligibility, ties, and host migration. Clients only send intents; they never decide assignments or results. GIF rendering happens entirely in the browser with `gifenc`.

### Directory map

```text
src/
  client/
    App.tsx                 session lifecycle, reconnect boot, phase routing, toasts
    socket.ts               typed Socket.IO wrapper and ack requests
    session.ts              localStorage session, room code URL helpers
    image.ts                clipboard reading, resize/compress/validation, canvas export
    gif.ts                  canvas frame rendering and animated GIF encoding
    gifenc.d.ts             local typings for gifenc
    components/
      HomeScreen.tsx        create/join flow
      LobbyScreen.tsx       players, ready state, invite link, host settings
      SettingsPanel.tsx     host settings editor + validation
      RoomHeader.tsx        room code, phase, countdown, copy/leave
      RoundScreen.tsx       submit / waiting / benched states
      ImageComposer.tsx     Image / Text / Draw tabs, paste, upload, drag/drop
      DrawingCanvas.tsx     brush, custom colors, bucket fill, undo, clear, drawing over an image
      RevealScreen.tsx      step-by-step reveal and GIF entry point
      RevealTheater.tsx     panel-by-panel autoplay, arrows, dots, chain tabs
      GifMaker.tsx          chain picker, speed, preview, download
      VotingScreen.tsx      one-vote flow, self-vote rules, vote dock
      ResultsScreen.tsx     winner, tie handling, scoreboard, replay, GIF export
      Comic.tsx             comic panels, chain cards, lightbox, per-chain GIF buttons
      ...                   modal, icons, countdown, toasts
    styles.css              design system and responsive layout
  server/
    index.ts                production entry point / PORT
    createServer.ts         Express, Socket.IO, image route, static client
    roomManager.ts          all game state and socket handlers
    assignment.ts           randomized matching that never shows a player their own latest panel
    images.ts               magic-byte validation, placeholder SVG, image store
  shared/
    types.ts                shared contracts, constants, limits
    settings.ts             defaults, normalization, captions, validation
tests/
  assignment.test.ts        randomized matching across 2-12 players
  game.test.ts              multi-client integration flow, text panels, assignments
  settings.test.ts          settings normalization, caption and text rendering
scripts/
  bots.mjs                  optional local helper: N socket bots join, submit, and vote
render.yaml                 Render Blueprint: one Node service for client + server
```

### Phases

| Phase | Meaning |
| --- | --- |
| `lobby` | Players join, ready up, host edits settings, host starts the game. |
| `round_submit` | Active players add one panel (image, text, or drawing) to their assigned chain. |
| `round_waiting` | All active players submitted (or the timer expired); short transition before the next round or reveal. |
| `reveal` | The step-by-step reveal plays chain by chain. The host starts voting when the room has looked. |
| `final_voting` | One vote per connected player. The full gallery is visible, but totals stay hidden until voting ends. |
| `results` | Winner, final tallies, tie handling, replay reveal, GIF export, and rematch controls. |

### Socket.IO contract

Every client-to-server event accepts an acknowledgement callback that returns:

```ts
{ ok: true, session?: SessionInfo, message?: string }
| { ok: false, error: string }
```

| Client to server | Purpose |
| --- | --- |
| `create_room` | `{ nickname }` |
| `join_room` | `{ nickname, roomCode }` |
| `reconnect_room` | `{ roomCode, playerId, token }` |
| `update_settings` | `{ settings }` - host, lobby only |
| `toggle_ready` | `{ ready }` |
| `start_game` | host, lobby, at least 2 connected players |
| `submit_panel` | `{ dataUrl }`, `{ text, textPosition? }`, or both - one panel for the current assignment |
| `start_voting` | host, reveal phase |
| `vote` | `{ chainId }` - one vote, cannot be changed |
| `tie_break` | `{ chainId }` - host, unresolved tie |
| `play_again` | host, results -> lobby with settings preserved |
| `leave_room` | leaves the room |

`submit_image` remains registered as a legacy alias for `submit_panel` so older open tabs keep working during a deploy.

Server-to-client events:

| Event | Purpose |
| --- | --- |
| `room_state` | Full per-player `RoomState` snapshot after every change |
| `room_closed` | `{ message }` when the room is destroyed or expires |

Each snapshot is personalized: `you.assignment`, `you.myRoundPanel`, `you.myVoteChainId`, and eligible chains are calculated for that player. Other players' assignments and unrevealed chains are not exposed.

### HTTP endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Health check |
| `GET /api/images/:id` | Serves an uploaded image or the generated placeholder |

Images have UUIDs and are served with long-lived immutable caching. They are kept in memory and removed when the room is destroyed or expires.

## Rotation and game rules

- A chain belongs to the player who created it. Chain order is fixed at game start.
- Round 1 assigns every player their own chain.
- For rounds 2+, the server deals chains completely at random, then uses a randomized bipartite matching pass with one hard rule: a player is never assigned a chain whose latest panel they authored, because that is the panel they would be shown. Avoiding the chain a player started is a soft preference applied whenever a full deal is still possible. If no safe assignment exists, that player is benched instead of being shown their own image. The latest panel is the only panel included in the assignment.
- A panel stores its round, either an image or text, one caption plus its kind (`call` / `answer`), author, and an `auto` flag.
- Caption alternation is based on the panel index inside the chain: even index = call above the panel, odd index = answer below the panel.
- Captions are rendered once from the settings at submission time, so later settings changes cannot rewrite history.
- Every panel is permanent after submission.
- Submission status is player-specific: players see who is working and who is in.
- If the submission timer expires, every assignment without a submitted panel receives the shared **AUTO PANEL** placeholder so all chains still have a complete round.
- If fewer than two players are connected during `round_submit`, the game pauses. It resumes as players reconnect.
- Mid-game leaves do not destroy the room. The leaver is marked `left`; their chain stays in the reveal, and a submitted panel remains. Incomplete assignments are auto-filled if needed.
- `play_again` removes players who explicitly left, clears chains and votes, resets readiness, preserves settings, and returns the room to the lobby.

## Reconnection and host migration

- A successful create/join stores a random per-player token and session in `localStorage` (`da-room:session:v1`).
- On refresh or socket reconnect, the client calls `reconnect_room` with `{ roomCode, playerId, token }` and recovers the same seat.
- Reconnecting replaces any stale socket still bound to that player.
- If a player reconnects after the current round's chains were already dealt, they are **benched for that round**: they cannot submit and the round does not wait for them. They return in the next round.
- If the host disconnects, host migration waits **20 seconds** to give them a chance to return. If the host explicitly leaves, migration happens immediately. The earliest-joined connected remaining player becomes host.
- If every player leaves, the room is destroyed.
- Rooms expire after **6 hours** without activity; a cleanup sweep runs every 10 minutes.

## Panels: images, text, and drawings

### Image panels

- Clipboard paste (`Ctrl+V` / `Cmd+V`) is the primary path. Upload and drag/drop use the same pipeline; a **Paste from clipboard** button uses the async Clipboard API when available.
- Accepts PNG, JPEG, WebP, and GIF source files up to **25 MB**.
- Still images are decoded, scaled to a maximum dimension of **1280 px**, and re-encoded as JPEG. Quality is reduced and then dimensions are stepped down until the data URL is at most about 1.8 million characters.
- Animated GIFs at or under **2 MB** are preserved byte-for-byte, so they keep animating in the reveal, gallery, and results. Larger GIFs fall back to a still JPEG frame to stay inside the server limit.
- A preview is shown with the correct call or answer caption before submission. Users can replace or remove the selected image.
- Errors are shown inline for unsupported types, empty/broken files, files over 25 MB, and compression failures.

### Text panels

- The **Text** tab swaps the image for a textarea. The written panel renders directly on the panel with no paper card or label: **Impact-style uppercase white text with a black outline**, laid over the background image.
- Text is capped at **280 characters** and normalized on the server: CRLF becomes LF, control characters become spaces, horizontal whitespace collapses, and runs of three or more newlines become a single blank line.
- Text panels still receive the alternating call/answer caption for their panel index.
- An optional **background image** can sit behind the text. It uses the same image pipeline as any other panel: paste, upload, drag/drop, PNG/JPEG/WebP/GIF, the 25 MB source ceiling, the 2 MB stored ceiling, browser compression, and animated-GIF handling.
- A **text corner** selector picks where the text sits: top-left, top-right, bottom-left, or bottom-right. The same corner is used in the game and in the GIF export. Without a background image, the text is drawn over a dark panel so the white outline stays readable.

### Drawing mode and the Draw tab

- Drawing mode is a host setting. When enabled, the composer gains a **Draw** tab and opens on it.
- The Draw tab is only offered while drawing mode is on. With it off, the composer offers Image and Text.
- The canvas is seeded with the latest image in the assigned chain, so players draw directly over the panel they received. Text panels with a background image also seed the canvas. If the latest panel is plain text, the canvas starts blank.
- A background image can be added, replaced, pasted, dropped, or uploaded from the Draw tab. It uses the same formats, size limits, compression, and animated-GIF handling as every other panel image.
- Changing the background resets the current strokes, so pick the background before drawing. **Remove** returns to the latest panel image, or a blank canvas if there is none.
- Brush colors, a **custom color picker**, brush size, undo (up to 10 snapshots), and clear are available.
- The toolbar has two tools: **Brush** and **Fill**.
- **Fill without the image** (default) uses only the stroke layer as its boundary. It spreads until it hits your brush strokes and ignores the background image entirely, so a busy photo cannot break or leak the fill. Filling an already-filled region recolors it, and strokes stay on top of fills.
- **Include image** is a switch shown in Fill mode. When on, the bucket also samples the background image, so it stops at image color edges as well as at strokes. Leave it off to fill a shape cleanly over a photo.
- Fills are stored on their own layer, so undo and clear affect fills and strokes independently, and the exported panel keeps strokes above fills.
- The canvas is exported as a compressed JPEG under the normal server limits. Very detailed drawings can fail with a readable error rather than silently dropping the panel. An animated GIF background exports as its first frame.

Server:

- The data URL is validated and the binary payload is checked against **PNG / JPEG / WebP / GIF magic bytes**; declared MIME must match.
- Stored image max is **2 MB**, data URL max is **2.8 million characters**, and each room has a **96 MB** image budget.
- The server generates a shared SVG **AUTO PANEL** placeholder for missed submissions.
- Images are never written to disk and are not sent to a third party.

## Reveal and GIF export

- The reveal page shows only the **Reveal Theater**, not the full gallery.
- The theater walks one panel at a time across every chain, with previous/next controls, keyboard arrow navigation, chain tabs, per-chain panel dots, and autoplay. The first panel of each chain gets a short chain intro card.
- The complete wall of chains unlocks during `final_voting` and `results`, so nobody can study every chain before the show is over.
- **GIF maker** is available from the reveal and results screens. It is client-side only: `gifenc` encodes a title frame, each panel with its caption, and an end frame into a looping `.gif`.
- Text panels render in the GIF as Impact-style white text with a black outline in the chosen corner, over their background image when they have one.
- The maker supports chain selection, three frame speeds, a live animated preview, and a **Download GIF** button. Per-chain **Make GIF** buttons open the maker with that chain preselected.
- Animated image uploads play in-game. The GIF export draws their current first frame, because the encoder works from canvas frames.

## Voting, ties, and results

- One vote per connected player. Votes are hidden until voting finishes.
- Self-voting is blocked by default. If the only available chains are the player's own, that fallback is allowed so the game can finish.
- Voting finalizes when every connected, eligible voter has voted, or when the voting timer expires. Disconnected players do not block the result.
- If the vote is tied:
  - With **sudden-death** enabled and at least one vote cast, one 30-second vote runs between the tied chains.
  - If sudden death is disabled, or sudden death still ties, the host must pick one of the tied chains.
  - If nobody votes, all chains tie and the host picks.
- The results screen shows the winner, total votes, tie status, and the complete scoreboard with every chain and vote count. It also offers **Replay reveal**, the **GIF maker**, per-chain GIF export, and **Play again**.

## Assumptions and deliberate choices

These are product decisions made to keep the MVP coherent:

- **In-memory MVP.** No database, auth provider, or persistent image storage. Restarting the process loses rooms. This keeps local setup simple and is documented as a production limitation.
- **Room codes and tokens instead of accounts.** Sessions are bearer tokens. Anyone with a player's token and room code can reconnect as that player; there is no password or OAuth.
- **Duplicate nicknames are allowed but suffixed.** Case-insensitive duplicates become `alex (2)`, etc. This avoids rejecting a join for a common name.
- **Readiness is not required to start.** The host can start once two players are connected; ready is a social signal.
- **Timers are optional and off by default.** Rounds wait for stragglers unless the host turns a timer on. The submission timer auto-fills missing panels instead of silently dropping them, because every chain should have the same number of panels.
- **Optional voting timer and sudden-death setting** were added beyond the minimum brief because real party rooms stall or tie frequently.
- **Reconnect benching** prevents one disconnected player from blocking a round after assignments have already been dealt.
- **Host grace period** is 20 seconds on disconnect, but immediate on explicit leave. This balances accidental refreshes with rooms that should keep moving.
- **Random assignment never shows your own picture.** The hard rule is that a player is never assigned a chain whose latest panel they authored, because that panel is the prompt they would see next. Avoiding the chain a player started is applied whenever a full deal is still possible; in tight cases (for example two players in a later round) the deal stays full as long as the latest panel belongs to someone else. If no safe pairing exists, the server benches the player for that round rather than breaking the rule.
- **Call captions are intentionally fixed.** Only the pronoun is configurable; the answer caption is editable. This keeps the call-and-answer rhythm consistent across every chain.
- **Text panels are first-class panels.** They still consume a round, receive captions, and appear in GIFs just like images. A text panel can also carry a background image using the same upload and size rules as an image panel.
- **Animated GIF uploads are size-gated.** Keeping animation requires storing the original bytes, so only GIFs at or under 2 MB stay animated; larger files are normalized to a still frame.
- **GIF export is client-side.** No server rendering queue, no download storage, no third-party service. Large chains take a few seconds and are limited by browser memory.
- **No public room list or matchmaking.** Rooms are joined with codes/links only.
- **2-player tie behavior:** with self-voting off, each player can only vote for the other chain, so a 2-player game normally ties. The host tie-break (or sudden death followed by host tie-break) resolves it. Enable self-voting for a different 2-player dynamic.
- **Room images are retained until room destruction.** There is no per-round garbage collection because the reveal and GIF export need every panel.
- **No rate limiting or anti-abuse beyond size/type checks.** This is an MVP for trusted groups; put it behind a reverse proxy and rate limits before exposing it publicly.
- **Browser support:** current Chromium/Firefox/Safari with Canvas, Clipboard, `gifenc`-compatible canvas APIs, and WebSocket support. Clipboard button reads may require permission or HTTPS; `Ctrl+V` / `Cmd+V` paste remains the fallback.

## Tests

```bash
npm run typecheck
npm test
npm run build
```

The test suite currently covers:

- a full multi-client game (create, join, settings, rounds, reveal, voting, results),
- random chain assignments that never return a player's own latest panel, across 2-12 players and many rounds,
- alternating call/answer captions on every panel,
- text panel submission and normalization, with and without a background image,
- text position validation and the bottom-left fallback,
- host tie-breaking,
- duplicate nicknames and invalid settings,
- settings normalization, caption rendering, and validation.

`npm test` uses real timers for the short automatic round transition and takes roughly 10-30 seconds.

## Manual test checklist

Use two browsers, two devices, or a normal window plus a private window. Sessions are stored per browser localStorage.

### Lobby and joining

- [ ] Host creates a room; code and share link appear; **Copy join link** copies a URL with `?room=CODE`.
- [ ] Guest opens the link, sees the code prefilled, joins.
- [ ] Third guest using an existing nickname gets a suffixed name rather than a collision.
- [ ] Player count shows connected players, ready toggles update for everyone, and a guest cannot edit host settings.
- [ ] Host can change rounds (2-12), pronoun, answer caption, timers, self-vote, sudden-death, and drawing mode; invalid or blank values are blocked.
- [ ] The call caption preview changes only when the pronoun changes and cannot be edited.
- [ ] Host cannot start with one player; with two connected players, start works.
- [ ] Host leaves lobby: earliest remaining player becomes host.

### Rounds and input

- [ ] Round 1: each player starts their own chain, and the first panel shows the call caption above it.
- [ ] Round 2+: each player receives a random chain whose latest panel is never their own, sees only that latest panel, and sees the correct call or answer caption. In a longer two-player game, a player may receive their own starting chain once its latest panel belongs to the other player, but never their own picture.
- [ ] Clipboard paste works with an image; preview shows the correct caption.
- [ ] Upload and drag/drop work; multiple files use the first and show a note.
- [ ] An animated GIF under 2 MB keeps animating in the preview and in the chain.
- [ ] A GIF over 2 MB falls back to a still frame with the expected note.
- [ ] **Text** tab submits a text panel; it renders as Impact-style white text with a black outline in the chosen corner and keeps its caption.
- [ ] All four text corners (top-left, top-right, bottom-left, bottom-right) are selectable in the composer and render in the same corner during reveal and in the GIF.
- [ ] A background image can be added to a text panel by upload, paste, or drag/drop; it appears behind the text and in the GIF, and can be removed.
- [ ] **Draw** tab draws over the latest image; undo, clear, swatches, custom color picker, and brush size work.
- [ ] **Fill** without **Include image** only respects brush strokes: draw a closed shape over a colorful photo, fill inside, and the fill does not leak or get blocked by image colors.
- [ ] Filling the same region again recolors it; strokes remain visible above the fill.
- [ ] **Include image** makes the fill stop at background image color edges too.
- [ ] From the Draw tab, add, replace, paste, or drop a background image, then draw over it; **Remove** falls back to the latest panel or a blank canvas.
- [ ] With drawing mode on, the composer opens on the Draw tab; with it off, Image is the default.
- [ ] Unsupported type, corrupt image, and over-25 MB file show readable errors without submitting.
- [ ] Submission status changes to **Panel in** for the submitting player and the round advances when all active players submit.
- [ ] With a short submission timer, missing panels become **AUTO PANEL** placeholders and the game continues.
- [ ] Refresh mid-round: the player reconnects to the same seat; if chains were already dealt, they are benched that round and return next round.
- [ ] Disconnect all but one player mid-round: the game pauses, then resumes after reconnection.
- [ ] A mid-game leave is marked; remaining players can finish; ties/host controls still work.

### Reveal, GIF, voting, results

- [ ] The reveal screen shows the theater only, not the full gallery.
- [ ] The theater walks panel by panel in order, with working arrows, dots, chain tabs, keyboard arrows, autoplay, and a chain intro on each first panel.
- [ ] Every chain's first panel shows the call caption above it and alternating panels show the answer below.
- [ ] Panel **View** opens the lightbox and closes without breaking scroll.
- [ ] GIF maker opens from reveal and results, preselects a chain from **Make GIF**, previews the loop, and downloads a working `.gif`.
- [ ] Host starts voting; the full gallery appears and each player gets one vote and cannot vote for their own chain by default.
- [ ] Vote selection requires **Lock in my vote**; totals remain hidden until the end.
- [ ] Voting finalizes when everyone has voted; with a voting timer, it finalizes automatically.
- [ ] Disconnected players do not block finalization.
- [ ] A tie offers the host a crown choice; with sudden death enabled it runs the extra 30-second vote first.
- [ ] Winner and scoreboard display correctly on desktop and mobile; **Replay reveal** and per-chain GIF buttons work.
- [ ] Host can **Play again**, settings persist, and the room returns to the lobby.
- [ ] Leaving the final results screen and creating a new room works.

### Responsive and accessibility

- [ ] At a phone-sized width, the home, lobby, round composer, drawing canvas, reveal theater, GIF maker, voting, and results screens stack cleanly with no horizontal scrolling.
- [ ] Keyboard: tab to controls, activate the drop zone with Enter/Space, use arrow keys in the reveal, and confirm focus states are visible.
- [ ] Color contrast is acceptable for captions, buttons, and status badges.
- [ ] Evident server errors (invalid settings, expired room, closed room) surface as a readable message or banner rather than a blank screen.

## Troubleshooting

- **`npm install` fails against a private registry mirror:** the project `.npmrc` pins `https://registry.npmjs.org/`. Remove or edit it if your environment requires another registry.
- **Port 3001 is busy:** set `PORT` before `npm start`, or stop the other process. Vite's dev proxy targets `http://localhost:3001`; update `vite.config.ts` if you change the server port for development.
- **Clipboard button does nothing:** browsers restrict clipboard reads. Use `Ctrl+V` / `Cmd+V` paste into the composer card instead.
- **GIF generation fails:** very long chains or low-memory mobile browsers can fail while encoding. Try a faster frame speed, close other tabs, or export a shorter chain.
- **Room is gone after a server restart:** expected for the in-memory MVP.
