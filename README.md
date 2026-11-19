# BrainSpark Games — NEON RUSH

A mobile-friendly 3D browser multiplayer racing prototype using Three.js, Node.js and WebSockets.

## Features in this build
- 3D neon race road, finish line and original low-poly cars
- Mobile touch controls and desktop keyboard controls
- Create a room or join by five-character room code
- Up to 8 racers per room
- Room host controls race start; host transfers if the host disconnects
- Server-authoritative basic movement, countdown, finish detection and live positions
- Smoothed remote-car rendering, speed/progress HUD and leaderboard
- Health endpoint at `/health`
- WebSocket heartbeat, input bounds/rate limiting, payload limit and idle-room cleanup
- Dockerfile, Render blueprint and GitHub Actions integration tests

## Run locally
Requires Node.js 20+.

```bash
npm install
npm run check
npm test
npm start
```

Open http://localhost:3000. To test from another device on the same Wi-Fi, open the host computer's LAN IP and port 3000.

## Deploy
The game needs a persistent Node.js host with WebSocket support. GitHub Pages is static hosting and cannot run this server. A Render Blueprint is included in `render.yaml`; check the provider's current free-tier availability, sleep behavior, usage limits and pricing before deploying. The same-origin client connects to the server's WebSocket endpoint. The `/health` route is provided for host health checks.

## Controls
- Keyboard: W / Up accelerate, S / Down brake, A / Left steer left, D / Right steer right.
- Touch: on-screen steering and pedal buttons.

## Important limitations
This remains an early playable prototype, not a finished commercial racing game. The driving model is intentionally simple; there is no robust vehicle collision/physics system, curved track, item system, matchmaking queue, reconnect/resume, persistent accounts or leaderboards, lag compensation, production anti-cheat, chat, reporting/moderation, privacy dashboard, sound, music, accessibility audit or low-end-device performance certification. The server simulation is not cheat-proof. The browser client loads Three.js from a public CDN and therefore needs internet access.

No live deployment or real multi-device race has been performed by this repository commit alone. CI integration tests verify server startup, health/static routes, room capacity and host-only race start. They do not replace real-device playtesting.

Do not commit personal information, passwords, payment details, private keys or API secrets. Publishing, accounts, payment setup and identity verification must be handled by an eligible adult where platform rules require it.

## Next release milestones
1. Real vehicle physics, collisions, track barriers and multiple tracks.
2. Reconnect handling, room lifecycle, race reset and network quality handling.
3. More extensive automated race simulation and security review.
4. Optional profiles and persistent leaderboards with privacy controls.
5. Test on low-end Android devices and desktop browsers.
6. Deploy the WebSocket server and test multiple devices.
7. Consider monetization only after stability and platform approval.

**BrainSpark Games presents NEON RUSH.**
