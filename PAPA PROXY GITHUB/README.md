# PAPA PROXY

`PAPA PROXY` is a Chromium browser extension for selective proxy routing. It routes only chosen services and domains through your configured proxies and keeps the rest of the browser traffic direct.

This repository is prepared so a user can download it and manually install the extension from the `proxy_extension/` folder without any build step.

## Main capabilities

- Selective routing through PAC rules
- Multiple HTTP / HTTPS / SOCKS5 / SOCKS4 proxies
- Optional username and password authentication
- Autonomous proxy search with connection threshold below `2000 ms`
- Automatic failover when the active proxy becomes unhealthy
- Country proxy loading from Proxifly
- Manual import of a pasted proxy list
- Favorites, favorite-only mode, and start-from-next-proxy action
- `TEST ALL`, per-proxy status, latency, IP, and country display
- English and Russian interface
- Debug logs and local JSON backup export for saved lists and favorites

## Install

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the `proxy_extension/` folder.

Detailed installation notes are in [docs/INSTALL.md](docs/INSTALL.md).

## Documentation

- [docs/INSTALL.md](docs/INSTALL.md)
- [docs/FEATURES.md](docs/FEATURES.md)
- [CHANGELOG.md](CHANGELOG.md)

## Repository layout

```text
PAPA PROXY GITHUB/
|- .github/
|- data/
|- docs/
|- proxy_extension/
|- tests/
|- CHANGELOG.md
|- README.md
`- package.json
```
