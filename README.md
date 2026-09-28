# Nearby Bus

Mobile friendly UK bus stop finder built with React, TypeScript, Vite, Leaflet, and the bustimes.org JSON endpoints.

## Run locally

```sh
npm install
npm run dev
```

Use `localhost` or serve the site over HTTPS so the browser can offer location access. The app asks for the device location on startup, checks it against a broad UK coverage envelope, loads nearby stops, and then loads departures for the selected stop.

## Data and map

- Nearby stop search: `https://bustimes.org/stops.json` with a small coordinate bounding box.
- Stop departures: `https://bustimes.org/stops/{ATCO_CODE}/times.json` (`{ times: [...] }` response).
- Map tiles: OpenStreetMap.

During development, Vite proxies `/bustimes/*` to bustimes.org to avoid browser CORS restrictions. In production, configure the same `/bustimes/*` reverse proxy on the hosting server (with suitable caching and attribution); static hosting alone cannot provide that proxy.
