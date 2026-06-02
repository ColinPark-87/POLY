# Stop Search Overlay — Design Spec

Date: 2026-05-18  
File to modify: `app/(campus)/campus/vehicles/RouteMapView.tsx`

## Goal

Add a floating search box to the top-right of the Kakao Map so staff can type a stop name (e.g. "동아청솔") and instantly see which buses serve it, in which direction, at what time, and how many students board there.

## UI Layout

Position: `absolute top-3 right-3 z-[1000]`, width `w-72`.

```
┌──────────────────────────────────────┐
│ 🔍 정류장 검색...          [×]      │  ← input
├──────────────────────────────────────┤
│ "동아청솔"                           │
│ ─────────────────────────────────── │
│ 🟠 1호차  하원  14:30  매일반  3명  │
│ 🔵 2호차  등원  08:10  유치부  2명  │
└──────────────────────────────────────┘
```

- Dropdown hidden when query is empty
- Results scrollable (max-h ~280px)
- Bus color dot matches existing `BUS_COLOR_MAP`

## Data Logic

No new API. Derive results from existing in-memory `bothDirGroups` via `useMemo`:

```
For each { group, dir } in bothDirGroups:
  For each [busName, students] in group.busMap:
    For each student where student.location includes stopSearchQuery (case-insensitive):
      Emit row: { stopName, busName, dir, sessionName, time: student.pickup_time, count }
Merge rows with same (stopName + busName + dir + sessionName) — keep earliest time, sum count
Sort: dep before arr, then by time ascending
```

Result type:
```ts
interface StopSearchRow {
  stopName: string
  busName: string
  dir: 'arr' | 'dep'
  sessionLabel: string
  time: string | null
  count: number
}
```

## State Added

```ts
const [stopSearchQuery, setStopSearchQuery] = useState('')
const highlightMarkerRef = useRef<any>(null)
```

`stopSearchResults: StopSearchRow[]` is a `useMemo` derived from `bothDirGroups` + `stopSearchQuery` — no extra state.

## Map Interaction

On result row click:
1. Look up `coords[stopName]`
2. If found: `map.panTo(new kakao.maps.LatLng(lat, lng))` + place a pulsing highlight marker (remove previous via `highlightMarkerRef`)
3. If not found: show inline notice "좌표 미설정" on the row (no map action)

Highlight marker: custom overlay div with a 36px animated ring in the bus color, auto-removed on next search or on `×` clear.

## Constraints

- No new files — all changes in `RouteMapView.tsx`
- No new API routes
- Must not interfere with existing map overlays (markers, polylines, BusCard)
- Works regardless of which sidebar page (1/2/3) is active
