<p align="center">
  <img src="public/icons/icon-nobg.png" alt="Netflix Jikkyo" width="128">
</p>

<h1 align="center">Netflix Jikkyo</h1>

<p align="center"><strong>Netflix でみんなとコメントしよう</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.6-E50914" alt="Version">
  <img src="https://img.shields.io/badge/chrome-MV3-4285F4" alt="Manifest V3">
  <img src="https://img.shields.io/badge/license-BSL--1.1-blue" alt="License">
  <a href="https://github.com/keigoly/netflix-jikkyo/stargazers"><img src="https://img.shields.io/github/stars/keigoly/netflix-jikkyo?style=social" alt="Stars"></a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/cnegfiegbdnjkpnmbdnnngbnlejfeikk">Chrome Web Store からインストール</a>
</p>

---

**[English](README_EN.md)**

Netflix Jikkyo は、Netflix の視聴画面にニコニコ風の弾幕コメントをリアルタイムで流せる Chrome 拡張機能です。同じ作品を観ている人と一緒に盛り上がろう。

- サーバーを使わない **P2P 通信** — コメントデータが外部に保存されることはありません
- **インストールするだけ** — 設定不要で、すぐに使い始められます
- **Netflix ライブ配信**にも対応
- **ニコニコ生放送連携** — ニコ生のコメントを Netflix 画面にリアルタイム表示

## 機能

| 機能 | 説明 |
|---|---|
| **弾幕コメント** | 画面を流れるコメントで、みんなとリアルタイムに実況 |
| **ライブ配信対応** | Netflix のライブイベント (`/live/*`, `/event/*`) でもリアルタイム実況 |
| **ニコニコ生放送連携** | ニコ生のコメントを Netflix 画面に表示。サイドパネルから接続/表示を切替 |
| **サイドパネル** | コメント一覧・作品情報・統計をサイドバーで確認 |
| **NG フィルター** | コメント・コマンド・ユーザー ID 単位でブロック |
| **多言語対応** | 日本語 / English / 한국어 / Čeština / 繁體中文 |
| **カスタマイズ** | 速度・透明度・フォント・サイズ・背景モードを自由に調整 |
| **ポップアウト** | サイドパネルを独立ウィンドウに切り離し |
| **SNS シェア** | X, LINE, Facebook, Threads, Reddit でワンクリック共有 |

## インストール

[**Chrome Web Store からインストール**](https://chromewebstore.google.com/detail/cnegfiegbdnjkpnmbdnnngbnlejfeikk)

## 使い方

1. **Netflix で作品を再生** — 拡張機能が自動的に同じ作品の視聴者とつなぎます
2. **コメントを入力** — サイドパネル下部の入力バーからコメントを送信
3. **サイドパネルで管理** — Chrome サイドバーからコメント一覧・設定・NG フィルターを確認
4. **ニコ生連携** — サイドパネルの「ニコ生連携」セクションから接続し、ニコ生コメントをリアルタイム表示

## v1.0.6 の主な変更

- **Canvas 弾幕レンダラー** — DOM ベースから Canvas ベースに完全書き換え。描画パフォーマンスが大幅に向上し、大量コメント時もスムーズな再生を実現
- **管理者コメント刷新** — ニコ生風の白テキスト + 暗いバー背景、10秒表示、フォント自動調整で画面幅に収まる一行表示
- **ゴシップ P2P** — ピアリスト交換による全体接続数のより正確な推定
- **認証改善** — ログアウト時のデータ保持、アカウント別ニコ生認証
- **アーカイブコメント** — 過去のライブ配信のコメントをアーカイブ再生時に自動表示
- **Noto Sans JP フォント** — 日本語フォントをバンドルし、環境に依存しない一貫した表示
- **IndexedDB バッチ書き込み** — コメント保存のパフォーマンスを最適化

## プライバシー

コメントデータは各ユーザーのブラウザ内にのみ保存されます。外部サーバーへの送信や、閲覧履歴の収集は一切行いません。

詳しくは[プライバシーポリシー](PRIVACY_POLICY.md)をご覧ください。

## ライセンス

[Business Source License 1.1](LICENSE) — 個人非商用利用は無料です。2030年2月27日以降、Apache License 2.0 に移行します。

## リンク

- [Chrome Web Store](https://chromewebstore.google.com/detail/cnegfiegbdnjkpnmbdnnngbnlejfeikk)
- [不具合報告](https://docs.google.com/forms/d/e/1FAIpQLSdp-n-dh0VNvIqF4bKKbcsCOKDFswcsFNV_dGxDjX14I6FVDA/viewform)
- [プライバシーポリシー](PRIVACY_POLICY.md) / [Privacy Policy](PRIVACY_POLICY.en.md)
