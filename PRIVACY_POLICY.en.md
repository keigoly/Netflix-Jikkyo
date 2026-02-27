# Privacy Policy

**Netflix Jikkyo Chrome Extension**

Last updated: February 26, 2026

---

## 1. Introduction

This Privacy Policy describes how the Chrome extension "Netflix Jikkyo" (the "Extension") handles user information. The Extension provides a real-time comment sharing feature on Netflix's viewing interface.

The Extension uses a serverless architecture and does not operate any central server that collects or stores user comment data.

## 2. Information We Collect

### 2.1 Information Stored Locally

The following information is stored only within the user's browser and is never transmitted externally.

| Data | Storage | Purpose |
|------|---------|---------|
| Comment history (text, timestamp, title ID) | IndexedDB | Displaying the comment list |
| Settings (nickname, comment color, danmaku speed, etc.) | chrome.storage.sync | Syncing user preferences |
| Authentication state (Google account info) | chrome.storage.local | Nickname management |
| Feature flag cache | chrome.storage.session | Temporary caching of remote configuration |

### 2.2 Information Shared via P2P

The following information is shared directly with other users watching the same Netflix title via WebRTC (peer-to-peer):

- Comment text
- Nickname
- Comment color, position, and size settings
- Timestamp

This information is shared only between peers simultaneously watching the same title and does not pass through any third-party server.

### 2.3 Google Authentication

You may optionally use Google OAuth authentication for nickname management. The only information obtained is:

- Email address
- Display name
- Profile picture URL

This information is stored only within the user's browser (`chrome.storage.local`).

## 3. Information We Do Not Collect

The Extension does **not** collect any of the following:

- Netflix viewing history or browsing history
- IP addresses (while WebRTC connections may expose IP addresses to connected peers by design, the Extension does not record or collect this information)
- Payment information
- Cookies
- Analytics data (no tracking tools such as Google Analytics are used)

## 4. Third-Party Communications

The Extension communicates with external services only as minimally required for its functionality.

| Service | Purpose | Information Sent |
|---------|---------|-----------------|
| Netflix (netflix.com) | Fetching title metadata (title, synopsis) | Title ID (request includes Netflix cookies) |
| Cloudflare Workers (netflix-jikkyo-config.skeigoly.workers.dev) | Fetching remote feature flags | None (GET request only) |
| Google OAuth (accounts.google.com) | Authentication (optional) | Authentication information as specified by Google |
| GitHub API (api.github.com) | Checking for extension updates | None (GET request only) |
| BitTorrent trackers | P2P peer discovery (via Trystero library) | Room identifier (hashed value) |

## 5. Data Security

The Extension implements the following security measures:

- **Encrypted communications** — P2P communication encrypted via WebRTC DTLS/SRTP; external API communication over HTTPS
- **Input validation** — All P2P messages are validated for structure, type, and length
- **Text sanitization** — Control characters are stripped and text length is enforced
- **Rate limiting** — Per-peer message frequency limits
- **XSS prevention** — No use of innerHTML; safe DOM manipulation via textContent only
- **Content Security Policy** — Strict CSP with `script-src 'self'`

## 6. Data Retention and Deletion

- **Comment history** — Stored in IndexedDB for up to 365 days; expired data is automatically deleted
- **Settings data** — Retained until explicitly changed or deleted by the user
- **Data export and deletion** — Comment history can be exported or fully deleted from the settings screen in the side panel
- **On uninstall** — When the Extension is uninstalled, all data stored in IndexedDB and chrome.storage is automatically deleted by Chrome

## 7. Children's Privacy

The Extension is not intended for children under the age of 13. We do not knowingly collect information from children under 13.

## 8. Changes to This Policy

This Privacy Policy may be updated from time to time. If significant changes are made, we will notify users through an extension update. The latest version of this policy is always available on this page.

## 9. Contact Us

If you have any questions or concerns about this Privacy Policy, please contact us at:

- **GitHub Issues**: [https://github.com/keigoly/netflix-jikkyo/issues](https://github.com/keigoly/netflix-jikkyo/issues)
