<p align="center">
  <img src="public/icons/icon-nobg-en.png" alt="Netflix Jikkyo" width="128">
</p>

<h1 align="center">Netflix Jikkyo</h1>

<p align="center"><strong>Watch Netflix together with live comments</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.5-E50914" alt="Version">
  <img src="https://img.shields.io/badge/chrome-MV3-4285F4" alt="Manifest V3">
  <img src="https://img.shields.io/badge/license-BSL--1.1-blue" alt="License">
  <a href="https://github.com/keigoly/netflix-jikkyo/stargazers"><img src="https://img.shields.io/github/stars/keigoly/netflix-jikkyo?style=social" alt="Stars"></a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/cnegfiegbdnjkpnmbdnnngbnlejfeikk">Install from Chrome Web Store</a>
</p>

---

Netflix Jikkyo is a Chrome extension that overlays Niconico-style danmaku comments on Netflix in real time. Share the moment with everyone watching the same title.

- Serverless **P2P communication** — your comment data never leaves your browser
- **Install and go** — no configuration needed, start watching immediately
- **Netflix Live events** supported
- **Niconico Live integration** — display Niconico Live comments on the Netflix screen in real time

## Features

| Feature | Description |
|---|---|
| **Danmaku comments** | Scrolling comments shared in real time with other viewers |
| **Live event support** | Real-time commentary during Netflix live events (`/live/*`, `/event/*`) |
| **Niconico Live integration** | Display Niconico Live comments on the Netflix screen. Connect/toggle from the side panel |
| **Side panel** | View comment list, title info, and stats in the Chrome sidebar |
| **NG filters** | Block by comment content, command, or user ID |
| **Multilingual** | 日本語 / English / 한국어 / Čeština / 繁體中文 |
| **Customization** | Adjust speed, opacity, font, size, and background mode |
| **Pop-out** | Detach the side panel into a standalone window |
| **Social sharing** | One-click sharing via X, LINE, Facebook, Threads, Reddit |

## Install

[**Install from Chrome Web Store**](https://chromewebstore.google.com/detail/cnegfiegbdnjkpnmbdnnngbnlejfeikk)

## How to Use

1. **Play a title on Netflix** — The extension automatically connects you with other viewers
2. **Type a comment** — Send comments from the input bar at the bottom of the side panel
3. **Manage in the side panel** — Open Chrome's sidebar to see the comment list, settings, and NG filters
4. **Niconico Live** — Connect from the "Nico Live" section in the side panel to display live comments

## What's New in v1.0.5

- **Archive playback stability** — Fixed false live-edge detection when watching archives in a separate tab while the Nico Live bridge is connected
- **Per-title bridge awareness** — Bridge connection state is now evaluated per title, preventing unrelated tabs from being affected
- **Chase playback comment saving** — Niconico comments received during catch-up viewing now correctly record the playback position

## Privacy

Comment data is stored only in your browser. Nothing is sent to external servers and no browsing data is collected.

See our [Privacy Policy](PRIVACY_POLICY.en.md) for details.

## License

[Business Source License 1.1](LICENSE) — Free for personal, non-commercial use. Converts to Apache License 2.0 on February 27, 2030.

## Links

- [Chrome Web Store](https://chromewebstore.google.com/detail/cnegfiegbdnjkpnmbdnnngbnlejfeikk)
- [Bug Reports](https://docs.google.com/forms/d/e/1FAIpQLSdp-n-dh0VNvIqF4bKKbcsCOKDFswcsFNV_dGxDjX14I6FVDA/viewform)
- [Privacy Policy](PRIVACY_POLICY.en.md) / [プライバシーポリシー](PRIVACY_POLICY.md)
