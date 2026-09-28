import { app } from '@azure/functions'

const bustimesOrigin = 'https://bustimes.org'

app.http('bustimesProxy', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'bustimes/{*path}',
  handler: async (request, context) => {
    const path = request.params.path ?? ''

    // Keep this proxy limited to the two public read-only endpoints the app uses.
    const isStopsRequest = path === 'stops.json'
    const isDeparturesRequest = /^stops\/[A-Za-z0-9_-]+\/times\.json$/.test(path)
    if (!isStopsRequest && !isDeparturesRequest) {
      return { status: 404, body: 'Not found' }
    }

    const upstreamUrl = new URL(`/${path}`, bustimesOrigin)
    for (const [key, value] of request.query) upstreamUrl.searchParams.append(key, value)

    try {
      const upstream = await fetch(upstreamUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      })
      const body = Buffer.from(await upstream.arrayBuffer())
      return {
        status: upstream.status,
        headers: {
          'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
          'cache-control': isStopsRequest ? 'public, max-age=300' : 'public, max-age=20',
        },
        body,
      }
    } catch (error) {
      context.error('bustimes.org request failed', error)
      return {
        status: 502,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Bus data is temporarily unavailable.' }),
      }
    }
  },
})
