# PAPA PROXY

`PAPA PROXY` is a Chromium extension for selective proxy routing. It keeps normal browsing direct and sends only chosen services or domains through a configured proxy chain with automatic failover.

The project contains the working development source in `extension/` and a public distribution folder in `PAPA PROXY GITHUB/proxy_extension/` that can be downloaded and installed manually in Chrome, Edge, Brave, or other Chromium browsers.

## Current capabilities

- Per-site routing through a PAC script instead of proxying the entire browser
- Multiple HTTP, HTTPS, SOCKS5, and SOCKS4 proxies with optional authentication
- Autonomous proxy search with connection only when latency is below `2000 ms`
- Automatic failover when the active proxy degrades on a routed tab
- Country proxy loading from Proxifly and manual proxy list import from pasted text
- Favorites, favorite-only mode, and resume search from the next proxy
- `TEST ALL`, per-proxy test results, debug logs, and toolbar state indicators
- English and Russian UI with localized popup and toolbar tooltips
- Export of saved proxy lists and favorite proxies to local JSON files

## Project structure

```text
PAPA PROXY/
|- extension/                 # current working extension source
|- data/                      # project data
|- docs/                      # design and implementation notes
|- tests/                     # automated Node tests
|- PAPA PROXY GITHUB/         # public GitHub-ready package
|  |- proxy_extension/        # unpacked extension for manual install
|  |- docs/                   # user-facing documentation
|  |- README.md
|  `- CHANGELOG.md
`- package.json
```

## Quick install

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select `PAPA PROXY GITHUB/proxy_extension/` for the public package or `extension/` for the development source.

Detailed steps are in [PAPA PROXY GITHUB/docs/INSTALL.md](PAPA%20PROXY%20GITHUB/docs/INSTALL.md).

## Recommended user flow

1. Open the popup and go to settings.
2. Load a country list or paste your own proxy list.
3. Run `TEST ALL` if you want to pre-check the list.
4. Enable the routed services you need.
5. Turn on `PAPA PROXY`.
6. Let autonomous search pick the first proxy with latency below `2000 ms`.

## Public package

The folder `PAPA PROXY GITHUB/` contains the public repository shape intended for publishing. It includes:

- `proxy_extension/` for browser installation
- `docs/INSTALL.md` with install instructions
- `docs/FEATURES.md` with feature documentation
- `CHANGELOG.md` with release notes

## Development

- Test command: `npm test`
- No build step is required
- The extension is Manifest V3 and uses vanilla JavaScript modules
