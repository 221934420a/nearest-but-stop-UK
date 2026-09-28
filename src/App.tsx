import { useCallback, useEffect, useMemo, useState } from 'react'
import { Circle, Clock3, LocateFixed, MapPin, Navigation, RefreshCw, Wifi } from 'lucide-react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import { getDepartures, getNearbyStops, isInUk } from './services'
import type { BusStop, Departure } from './types'

type Coordinates = { lat: number; lon: number; accuracy?: number }

function Recenter({ position }: { position: LatLngExpression }) {
  const map = useMap()
  useEffect(() => { map.flyTo(position, Math.max(map.getZoom(), 15), { duration: 0.8 }) }, [latOf(position), lonOf(position)])
  return null
}
function latOf(position: LatLngExpression) { return Array.isArray(position) ? position[0] : (position as any).lat }
function lonOf(position: LatLngExpression) { return Array.isArray(position) ? position[1] : (position as any).lng }

function App() {
  const [location, setLocation] = useState<Coordinates | null>(null)
  const [stops, setStops] = useState<BusStop[]>([])
  const [selected, setSelected] = useState<BusStop | null>(null)
  const [departures, setDepartures] = useState<Departure[]>([])
  const [locating, setLocating] = useState(true)
  const [loadingStops, setLoadingStops] = useState(false)
  const [loadingDepartures, setLoadingDepartures] = useState(false)
  const [error, setError] = useState('')
  const [departureError, setDepartureError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setError('This browser does not support location services. Please try another browser.')
      setLocating(false)
      return
    }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = { lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy }
        setLocation(next)
        setLocating(false)
        if (!isInUk(next.lat, next.lon)) {
          setError('Your current location is outside our UK service area.')
          setStops([])
          setSelected(null)
          return
        }
        setError('')
      },
      (positionError) => {
        const message = positionError.code === 1
          ? 'Location access is turned off. Allow this site to use your location in your browser settings, then try again.'
          : positionError.code === 2 ? 'We could not determine your location. Check that location services are on and try again.' : 'The location request timed out. Please try again.'
        setError(message)
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    )
  }, [])

  useEffect(() => { locate() }, [locate])

  useEffect(() => {
    if (!location || !isInUk(location.lat, location.lon)) return
    const controller = new AbortController()
    setLoadingStops(true)
    getNearbyStops(location.lat, location.lon, controller.signal)
      .then((results) => {
        setStops(results)
        setSelected((current) => current && results.some((stop) => stop.id === current.id) ? current : results[0] ?? null)
        if (!results.length) setError('No bus stops found nearby. Try updating your location or check back later.')
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message || 'Could not load nearby bus stops. Please try again later.') })
      .finally(() => { if (!controller.signal.aborted) setLoadingStops(false) })
    return () => controller.abort()
  }, [location])

  const loadDepartures = useCallback((stop: BusStop) => {
    if (!stop.atcoCode) {
      setDepartureError('This stop is missing its code, so departures are unavailable.')
      return
    }
    const controller = new AbortController()
    setLoadingDepartures(true)
    setDepartureError('')
    getDepartures(stop.atcoCode, controller.signal)
      .then((results) => { setDepartures(results); setUpdatedAt(new Date()) })
      .catch((err) => { if (err.name !== 'AbortError') setDepartureError(err.message || 'Could not load departures.') })
      .finally(() => setLoadingDepartures(false))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    setDepartures([])
    if (selected) return loadDepartures(selected)
  }, [selected, loadDepartures])

  const centre: LatLngExpression = useMemo(() => location ? [location.lat, location.lon] : [54.5, -3], [location])
  const locationAvailable = Boolean(location && isInUk(location.lat, location.lon))
  const mapReady = locationAvailable && stops.length > 0

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Nearby Bus home"><span className="brand-mark"><Navigation size={19} fill="currentColor" /></span><span>nearby<span className="brand-light">bus</span></span></a>
        <div className="topbar-note"><span className="live-dot" />UK bus stop information</div>
        <button className="icon-button locate-top" onClick={locate} disabled={locating} aria-label="Update location"><LocateFixed size={18} /> <span>{locating ? 'Locating…' : 'Update location'}</span></button>
      </header>

      <section className="workspace">
        <aside className="side-panel">
          <div className="location-status">
            <span className={`status-icon ${locating ? 'is-loading' : locationAvailable ? 'is-good' : 'is-muted'}`}><LocateFixed size={17} /></span>
            <div className="status-copy"><strong>{locating ? 'Finding your location' : locationAvailable ? 'Location found' : 'Your location is needed'}</strong><span>{locating ? 'Allow location access in your browser' : locationAvailable ? `Accuracy about ${Math.max(1, Math.round((location?.accuracy ?? 0) / 10) * 10)} metres` : 'Only used to find nearby stops'}</span></div>
            {!locating && <button className="text-button" onClick={locate}>{locationAvailable ? 'Update' : 'Allow location'}</button>}
          </div>

          {error && <div className="notice" role="status"><span className="notice-dot" />{error}</div>}

          <div className="departures-section departures-first">
            <div className="section-heading departures-heading"><div><span className="section-kicker">UPCOMING DEPARTURES</span><h2>{selected ? selected.name : 'Bus departures'}</h2></div><span className="departure-count">{departures.length ? `${departures.length} buses` : ''}</span></div>
            {selected && <div className="selected-meta"><MapPin size={13} />{selected.indicator ? `${selected.indicator} · ` : ''}{formatDistance(selected.distance)} · {selected.atcoCode}</div>}
            {loadingDepartures && <div className="departure-loading"><span className="spinner" />Loading departures…</div>}
            {departureError && <div className="departure-error">{departureError}</div>}
            {!loadingDepartures && selected && !departureError && departures.length === 0 && <div className="empty-departures">No upcoming departures available.</div>}
            {!loadingDepartures && departures.map((departure, index) => <DepartureRow key={`${departure.line}-${departure.due}-${index}`} departure={departure} />)}
            {updatedAt && !loadingDepartures && <div className="updated-time"><Clock3 size={12} />Updated at {updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>}
          </div>

          <div className="section-heading"><div><span className="section-kicker">STOPS NEAR YOU</span><h2>Nearby stops <span className="count-pill">{stops.length || '—'}</span></h2></div>{locationAvailable && <button className="refresh-button" onClick={locate} aria-label="Refresh nearby stops"><RefreshCw size={15} /></button>}</div>
          <div className="stops-list" aria-live="polite">
            {loadingStops && <div className="skeleton-list"><div /><div /><div /></div>}
            {!loadingStops && stops.map((stop, index) => (
              <button key={stop.id} className={`stop-card ${selected?.id === stop.id ? 'selected' : ''}`} onClick={() => setSelected(stop)}>
                <span className={`stop-number ${index === 0 ? 'nearest' : ''}`}>{String(index + 1).padStart(2, '0')}</span>
                <span className="stop-main"><strong>{stop.name}</strong><span>{stop.indicator ? `${stop.indicator} · ` : ''}{stop.lines.length ? stop.lines.slice(0, 3).join(' · ') : 'View departures'}</span></span>
                <span className="stop-distance">{formatDistance(stop.distance)}</span>
              </button>
            ))}
            {!loadingStops && !stops.length && !error && <div className="empty-note">Allow location access to see nearby stops.</div>}
          </div>

          <footer className="panel-footer"><span>Departure data from bustimes.org</span><span className="privacy-note"><Circle size={6} fill="currentColor" />Your location is not stored</span></footer>
        </aside>

        <section className="map-panel" aria-label="Map of nearby bus stops">
          <div className="map-top-label"><span className="map-label-icon"><MapPin size={14} /></span><span>{locationAvailable ? 'Near you' : 'UK bus stops'}</span><span className="map-label-divider" />{locationAvailable ? `${stops.length} stops` : 'Allow location to view stops'}</div>
          {mapReady ? <MapContainer center={centre} zoom={15} zoomControl={false} className="map">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <ZoomControl position="bottomright" />
            <Recenter position={centre} />
            <CircleMarker center={centre} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#386dff', fillOpacity: 1 }}><Tooltip direction="top">You are here</Tooltip></CircleMarker>
            {stops.map((stop, index) => <CircleMarker key={stop.id} center={[stop.lat, stop.lon]} radius={selected?.id === stop.id ? 11 : 8} eventHandlers={{ click: () => setSelected(stop) }} pathOptions={{ color: '#fff', weight: 3, fillColor: selected?.id === stop.id ? '#ef704f' : '#183e33', fillOpacity: 1 }}><Tooltip direction="top" offset={[0, -8]}>{index === 0 ? `Nearest · ${stop.name}` : stop.name}</Tooltip></CircleMarker>)}
          </MapContainer> : <div className="map-placeholder"><div className="placeholder-grid" /><div className="placeholder-content"><span className="placeholder-icon"><MapPin size={24} /></span><strong>{locating ? 'Finding your location' : locationAvailable ? 'Searching for nearby stops' : 'Your next stop is waiting'}</strong><span>{locating ? 'Allow location access to see nearby bus stops' : error || 'Allow location access and we’ll show the nearest stops on the map.'}</span>{!locating && !locationAvailable && <button className="primary-button" onClick={locate}><LocateFixed size={16} />Use my location</button>}</div><div className="map-credit">MAP DATA · OPENSTREETMAP</div></div>}
          <div className="map-legend"><span><i className="legend-you" />Your location</span><span><i className="legend-stop" />Bus stop</span><span><i className="legend-selected" />Selected stop</span></div>
          <div className="map-attribution">Map © OpenStreetMap contributors</div>
          {mapReady && <button className="map-locate-button" onClick={locate} aria-label="Return to my location"><LocateFixed size={18} /></button>}
          {!mapReady && <div className="map-corner-note"><Wifi size={14} />Your location stays on your device</div>}
          {locationAvailable && stops.length > 0 && <div className="map-bottom-card"><span className="bottom-card-icon"><MapPin size={17} /></span><span><strong>{selected?.name ?? stops[0].name}</strong><small>{formatDistance(selected?.distance ?? stops[0].distance)} · {departures.length ? `Next bus ${departures[0].due}` : 'View upcoming departures'}</small></span><span className="bottom-card-arrow">↗</span></div>}
        </section>
      </section>
    </main>
  )
}

function DepartureRow({ departure }: { departure: Departure }) {
  return <div className="departure-row"><span className="line-badge">{departure.line}</span><span className="departure-destination"><strong>{departure.destination}</strong><small>{departure.operator || (departure.live ? 'Live tracking' : 'Timetabled')}</small></span><span className="departure-time"><strong>{departure.due}</strong><small className={departure.live ? 'live-status' : ''}>{departure.live ? 'Live' : 'Due'}</small></span></div>
}

function formatDistance(metres: number) { return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km` }

export default App
