# BrainSpark Games — NEON RUSH

A mobile-friendly 3D browser multiplayer racing prototype using Three.js, Node.js and WebSockets.

## Included
- 3D neon road scene and original low-poly cars
- Touchscreen and keyboard driving controls
- Room creation and room-code joining
- Up to 8 players per room
- Server-simulated movement and shared race state
- Position, speed, progress and live leaderboard
- Countdown and finish-state handling
- Node server serves both the game client and WebSocket endpoint

## Run locally
Requires Node.js 20+.

```bash
npm install
npm start
```
Open http://localhost:3000. For another device on the same Wi-Fi, use the host computer's LAN IP and port 3000.

## Deploy
The game needs a persistent Node.js host with WebSocket support. GitHub Pages is static hosting and cannot run this server. A Render Blueprint is included in `render.yaml`; check the provider's current free-tier availability, sleep behavior and limits before deploying. The same-origin client connects to the deployed server's WebSocket endpoint.

## Controls
- Keyboard: W / Up accelerate, S / Down brake, A / Left steer left, D / Right steer right.
- Touch: on-screen steering and pedal buttons.

## Current status and limitations
This is a playable foundation, not a finished commercial game. Proper vehicle physics, collisions, track boundaries, reconnect handling, room ownership, race reset, matchmaking, authentication, persistent profiles/leaderboards, lag compensation, robust anti-cheat, reporting/moderation, privacy controls, accessibility testing and low-end device performance testing remain to be built and validated. Do not treat the current basic server simulation as cheat-proof.

Do not commit personal information, passwords, payment details, private keys or API secrets. Publishing, accounts, payment setup and any identity verification must be handled by an eligible adult where platform rules require it.

## Roadmap
1. Upgrade physics, track geometry, boundaries and collision handling.
2. Add room lifecycle, reconnect, race reset and disconnect handling.
3. Add automated multi-client tests and stronger server validation.
4. Add optional profiles and persistent leaderboards with privacy controls.
5. Test on low-end Android devices and desktop browsers.
6. Deploy the WebSocket server and test two or more devices.
7. Consider monetization only after the game is stable and platform-approved.

**BrainSpark Games presents NEON RUSH.**
