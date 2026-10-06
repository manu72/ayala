/**
 * Pulls OpenStreetMap data around Ayala Triangle Gardens (Makati) and saves it
 * as GeoJSON for the map generator. Map data © OpenStreetMap contributors, ODbL.
 *
 * Everything tagged in the bbox is kept (park, footways, roads, buildings,
 * steps, tunnels, shops, trees…) so the generator can filter without refetching.
 *
 * Run: node scripts/fetch-osm.mjs   → scripts/atg-osm.geojson
 */

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'atg-osm.geojson')

// south, west, north, east — triangle (lat 14.5549–14.5580, lon 121.0214–121.0258)
// plus the surrounding roads, frontage buildings and underpass/stair links.
const BBOX = [14.5535, 121.0200, 14.5592, 121.0272]

const QUERY = `[out:json][timeout:120];
(
  node(${BBOX})(if:count_tags() > 0);
  way(${BBOX});
  relation["type"="multipolygon"](${BBOX});
);
out geom;`

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

async function fetchOverpass() {
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'ayala-game-map/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(QUERY),
        signal: AbortSignal.timeout(180_000),
      })
      if (res.ok) return { url, data: await res.json() }
      console.warn(`${url}: HTTP ${res.status}`)
    } catch (err) {
      console.warn(`${url}: ${err.message}`)
    }
  }
  throw new Error('All Overpass mirrors failed')
}

// Closed ways with these keys are areas (osmtogeojson-style heuristic).
const AREA_KEYS = ['building', 'building:part', 'landuse', 'leisure', 'natural', 'amenity', 'shop',
  'tourism', 'man_made', 'place', 'historic', 'area:highway', 'parking', 'water', 'indoor', 'office']
const LINEAR_VALUES = { natural: ['tree_row', 'cliff', 'coastline'], man_made: ['embankment', 'cutline', 'pipeline'], leisure: ['track'] }

function isArea(tags, coords) {
  const first = coords[0], last = coords[coords.length - 1]
  if (coords.length < 4 || first[0] !== last[0] || first[1] !== last[1]) return false
  if (tags.area === 'no') return false
  if (tags.area === 'yes') return true
  return AREA_KEYS.some(k => k in tags && !(LINEAR_VALUES[k] ?? []).includes(tags[k]))
}

const lonLat = g => g.map(p => [p.lon, p.lat])

// Stitch multipolygon member ways into closed rings.
function joinRings(lines) {
  const rings = []
  const pool = lines.map(l => [...l])
  while (pool.length) {
    let ring = pool.shift()
    let grew = true
    while (grew && !samePt(ring[0], ring[ring.length - 1])) {
      grew = false
      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i]
        const end = ring[ring.length - 1]
        if (samePt(seg[0], end)) ring = ring.concat(seg.slice(1))
        else if (samePt(seg[seg.length - 1], end)) ring = ring.concat([...seg].reverse().slice(1))
        else continue
        pool.splice(i, 1)
        grew = true
        break
      }
    }
    if (ring.length >= 4 && samePt(ring[0], ring[ring.length - 1])) rings.push(ring)
  }
  return rings
}
const samePt = (a, b) => a[0] === b[0] && a[1] === b[1]

function toFeature(el) {
  const properties = { '@id': `${el.type}/${el.id}`, ...el.tags }
  if (el.type === 'node') {
    return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: [el.lon, el.lat] } }
  }
  if (el.type === 'way') {
    if (!el.tags || !el.geometry) return null // untagged ways only matter as relation members
    const coords = lonLat(el.geometry)
    const geometry = isArea(el.tags, coords)
      ? { type: 'Polygon', coordinates: [coords] }
      : { type: 'LineString', coordinates: coords }
    return { type: 'Feature', properties, geometry }
  }
  // multipolygon relation
  const members = (el.members ?? []).filter(m => m.type === 'way' && m.geometry)
  const outer = joinRings(members.filter(m => m.role !== 'inner').map(m => lonLat(m.geometry)))
  const inner = joinRings(members.filter(m => m.role === 'inner').map(m => lonLat(m.geometry)))
  if (!outer.length) return null
  // ponytail: holes attached to the first outer ring; fine for the few CBD multipolygons
  const polys = outer.map((ring, i) => (i === 0 ? [ring, ...inner] : [ring]))
  return { type: 'Feature', properties, geometry: { type: 'MultiPolygon', coordinates: polys } }
}

const { url, data } = await fetchOverpass()
const features = data.elements.map(toFeature).filter(Boolean)

const header = {
  type: 'FeatureCollection',
  attribution: '© OpenStreetMap contributors',
  license: 'ODbL-1.0 — https://www.openstreetmap.org/copyright',
  source: url,
  osm_base: data.osm3s?.timestamp_osm_base ?? null,
  bbox: [BBOX[1], BBOX[0], BBOX[3], BBOX[2]],
  query: QUERY,
}

// One feature per line keeps diffs reviewable when the extract is refreshed.
const body = JSON.stringify(header).slice(0, -1) +
  ',"features":[\n' + features.map(f => JSON.stringify(f)).join(',\n') + '\n]}\n'
writeFileSync(OUT, body)

const count = (t) => features.filter(f => f.geometry.type === t).length
console.log(`Wrote ${OUT} from ${url} (osm_base ${header.osm_base})`)
console.log(`${features.length} features: ${count('Point')} points, ${count('LineString')} lines, ${count('Polygon')} polygons, ${count('MultiPolygon')} multipolygons`)
