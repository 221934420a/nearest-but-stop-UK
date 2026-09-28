export type BusStop = {
  id: string
  atcoCode: string
  name: string
  indicator: string
  lat: number
  lon: number
  distance: number
  lines: string[]
}

export type Departure = {
  line: string
  destination: string
  due: string
  scheduled: string
  operator: string
  live: boolean
  status: string
}
