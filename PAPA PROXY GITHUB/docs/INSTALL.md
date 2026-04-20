# Install PAPA PROXY

## Requirements

- Chrome, Edge, Brave, or another Chromium browser
- Access to `chrome://extensions`
- The downloaded repository contents

## Manual installation

1. Download or clone the repository to your computer.
2. Open `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select the folder `proxy_extension/`.
6. Pin the extension if you want fast access from the toolbar.

## First setup

1. Open the extension popup.
2. Click the settings button.
3. Load proxies in one of these ways:
   - `+ Country` to load a country list from Proxifly
   - `+IMP` to paste your own proxy list
   - `+ Add Proxy` to add entries manually
4. Optionally run `TEST ALL`.
5. Use the `Backups` section if you want to export or import saved lists and favorites.
6. Enable the routed services you need.
7. Turn on `PAPA PROXY`.

## Supported proxy input formats

- `host:port`
- `host:port:user:pass`
- `http://host:port`
- `https://host:port`
- `socks5://user:pass@host:port`
- `socks4://host:port`

## Notes

- The extension does not need a build step.
- Saved lists and favorite proxies can be exported and imported through the backup section in settings.
- The public unpacked extension folder is `proxy_extension/`.
