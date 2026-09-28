import type { BusStop, Departure } from './types'

// Vite proxies this route locally; Azure Static Web Apps maps it to the
// same-origin Function in /api during deployment.
const API = '/api/bustimes'

async function fetchBustimes(url: string, signal?: AbortSignal) {
  try {
    return await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('Could not connect to the bus data service. Check the API proxy deployment and try again.')
  }
}

export function isInUk(lat: number, lon: number) {
  // A deliberately broad UK envelope, including Northern Ireland and the islands.
  return lat >= 49.8 && lat <= 60.9 && lon >= -8.7 && lon <= 1.9
}

export function distanceMetres(aLat: number, aLon: number, bLat: number, bLon: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const dLat = radians(bLat - aLat)
  const dLon = radians(bLon - aLon)
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function decodeStop(feature: any, userLat: number, userLon: number): BusStop | null {
  const properties = feature.properties ?? feature
  const coords = feature.geometry?.coordinates ?? properties.location
  if (!coords || coords.length < 2) return null
  const [lon, lat] = coords.map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  // bustimes.org's GeoJSON omits atco_code from properties; its stop URL is
  // `/stops/{atco_code}`, so use that canonical identifier as a fallback.
  const stopPathCode = String(properties.url ?? '').match(/\/stops\/([^/?#]+)/i)?.[1]
  const atcoCode = String(properties.atco_code ?? properties.atcoCode ?? stopPathCode ?? properties.id ?? '')
  const serviceNames = properties.line_names ?? properties.services ?? []
  return {
    id: atcoCode || `${lat},${lon}`,
    atcoCode,
    name: properties.name ?? properties.common_name ?? 'Bus stop',
    indicator: properties.indicator ?? '',
    lat,
    lon,
    distance: distanceMetres(userLat, userLon, lat, lon),
    lines: Array.isArray(serviceNames) ? serviceNames.map(String) : String(serviceNames).split(',').filter(Boolean),
  }
}

export async function getNearbyStops(lat: number, lon: number, signal?: AbortSignal): Promise<BusStop[]> {
  const radius = 0.018
  const query = new URLSearchParams({
    xmin: String(lon - radius), xmax: String(lon + radius),
    ymin: String(lat - radius), ymax: String(lat + radius),
  })
  const response = await fetchBustimes(`${API}/stops.json?${query}`, signal)
  if (!response.ok) throw new Error(`Nearby stops are temporarily unavailable (${response.status}).`)
  const data = await response.json()
  const features = Array.isArray(data) ? data : data.features ?? data.results ?? []
  return features
    .map((feature: any) => decodeStop(feature, lat, lon))
    .filter((stop: BusStop | null): stop is BusStop => stop !== null)
    .sort((a: BusStop, b: BusStop) => a.distance - b.distance)
    .slice(0, 12)
}

export async function getDepartures(atcoCode: string, signal?: AbortSignal): Promise<Departure[]> {
  const response = await fetchBustimes(`${API}/stops/${encodeURIComponent(atcoCode)}/times.json?limit=8`, signal)
  if (!response.ok) throw new Error(`Departures are temporarily unavailable (${response.status}).`)
  const data = await response.json()
  const rows = Array.isArray(data) ? data : data.times ?? data.results ?? data.departures ?? []
  return rows.map((row: any) => {
    const time = row.expected_departure_time ?? row.expected_arrival_time ?? row.aimed_departure_time ?? row.aimed_arrival_time ?? row.time
    const due = formatTime(time ?? row.due ?? row.departure_time)
    const live = Boolean(row.live || row.delay || row.expected_departure_time || row.expected_arrival_time || row.actual_departure_time || row.real_time)
    return {
      line: String(row.service?.line_name ?? row.line_name ?? row.line ?? '—'),
      destination: String(row.headsign ?? row.destination?.name ?? row.destination ?? row.destination_name ?? 'Destination unavailable'),
      due,
      scheduled: row.aimed_departure_time ?? row.aimed_arrival_time ?? '',
      operator: String(row.operator?.name ?? row.service?.operators?.[0]?.name ?? ''),
      live,
      status: String(row.status ?? ''),
    }
  })
}

function formatTime(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—'
  // The API can return either ISO datetimes or time-only values.
  const timeOnly = value.match(/(?:T|^)(\d{2}:\d{2})(?::\d{2})?/)
  if (timeOnly) return timeOnly[1]
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
}
