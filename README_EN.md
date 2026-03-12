<p align="center">
  <img src="public/icons/icon-nobg.png" alt="Netflix Jikkyo" width="128">
</p>

<h1 align="center">Netflix Jikkyo</h1>

<p align="center"><strong>Watch Netflix together with live comments</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.6-E50914" alt="Version">
  <img src="https://img.shields.io/badge/chrome-MV3-4285F4" alt="Manifest V3">
  <img src="https://img.shields.io/badge/license-BSL--1.1-blue" alt="License">
  <a href="https://github.com/keigoly/netflix-jikkyo/stargazers"><img src="https://img.shields.io/github/stars/keigoly/netflix-jikkyo?style=social" alt="Stars"></a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/cnegfiegbdnjkpnmbdnnngbnlejfeikk">Install from Chrome Web Store</a>
</p>

---

**[日本語](README.md)**

Netflix Jikkyo is a Chrome extension that overlays Niconico-style scrolling comments (danmaku) on Netflix in real time. Watch together and share the excitement with other viewers.

- **P2P communication** — no external server stores your comment data
- **Zero configuration** — just install and start watching
- **Netflix live events** supported
- **Niconico Live integration** — display Niconico Live comments on Netflix in real time

## Features

| Feature | Description |
|---|---|
| **Danmaku comments** | Scrolling comments across the screen for real-time reactions |
| **Live event support** | Real-time comments on Netflix live events (`/live/*`, `/event/*`) |
| **Niconico Live integration** | Display Niconico Live comments on Netflix. Toggle connection from the side panel |
| **Side panel** | View comment list, title info, and statistics in the sidebar |
| **NG filter** | Block by comment text, command, or user ID |
| **Multilingual** | Japanese / English / Korean / Czech / Traditional Chinese |
| **Customization** | Adjust speed, opacity, font, size, and background theme |
| **Pop-out** | Detach the side panel into a standalone window |
| **SNS sharing** | One-click share to X, LINE, Facebook, Threads, Reddit |

## Install

[**Install from Chrome Web Store**](https://chromewebstore.google.com/detail/cnegfiegbdnjkpnmbdnnngbnlejfeikk)

## How to use

1. **Play something on Netflix** — the extension automatically connects you with other viewers watching the same title
2. **Send comments** — type in the input bar at the bottom of the side panel
3. **Manage via side panel** — view comment list, settings, and NG filters from the Chrome sidebar
4. **Niconico Live integration** — connect from the "Nico Live" section in the side panel to display Niconico comments in real time

## What's new in v1.0.6

- **Canvas danmaku renderer** — complete rewrite from DOM to Canvas-based rendering. Dramatically improved performance with smooth playback even during comment bursts
- **Admin comments redesigned** — Niconico-style white text with dark bar background, 10-second display, auto-sizing font to fit one line
- **Gossip P2P** — peer list exchange for more accurate global peer count estimation
- **Auth improvements** — data preserved on logout, per-account Niconico authentication
- **Archive comments** — automatically display comments from past live broadcasts during archive playback
- **Noto Sans JP font** — bundled Japanese font for consistent display across all environments
- **IndexedDB batch writes** — optimized comment storage performance

## Privacy

Comment data is stored only in your browser. No data is sent to external servers and no browsing history is collected.

See [Privacy Policy](PRIVACY_POLICY.en.md) for details.

## License

[Business Source License 1.1](LICENSE) — free for personal non-commercial use. Transitions to Apache License 2.0 on February 27, 2030.

## Links

- [Chrome Web Store](https://chromewebstore.google.com/detail/cnegfiegbdnjkpnmbdnnngbnlejfeikk)
- [Bug Report](https://docs.google.com/forms/d/e/1FAIpQLSdp-n-dh0VNvIqF4bKKbcsCOKDFswcsFNV_dGxDjX14I6FVDA/viewform)
- [Privacy Policy (EN)](PRIVACY_POLICY.en.md) / [Privacy Policy (JA)](PRIVACY_POLICY.md)
