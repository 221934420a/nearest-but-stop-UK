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

During development, Vite proxies `/api/bustimes/*` to bustimes.org. For Azure Static Web Apps, the included Azure Function at `api/src/functions/bustimes.js` provides the production proxy and avoids browser CORS restrictions. The deployment pipeline must set `api_location: api` and `output_location: dist` so the Function and `public/staticwebapp.config.json` are published with the site. If using the Azure Static Web Apps GitHub Action, set those values in its workflow. If the site is hosted on Azure App Service or Storage static website instead, this Function must be deployed separately and routed to `/api/bustimes/*`.
