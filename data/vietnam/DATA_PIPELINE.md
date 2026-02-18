# Vietnam Terrain Data Pipeline

Data acquisition, processing, and integration plan for the realistic Vietnam War game mode.

## Target: First Real Map - A Shau Valley

**Hill 937 (Hamburger Hill / Dong Ap Bia)** - center of map
- Location: 16.233N, 107.177E
- A Shau Valley floor ~580m, flanking ridges 900-1800m
- Triple-canopy jungle, Ho Chi Minh Trail corridor
- Historical battles: Hamburger Hill (1969), Operation Delaware (1968), Firebase Ripcord (1970)

**Game mode**: Open world survival + squad command, bigger than Open Frontier (3200m)

---

## 1. Elevation Data

### 1a. Primary Source - AWS Terrain Tiles (DONE)

Terrarium PNG format, public domain, no auth. Decode: `elevation = (R * 256 + G + B / 256) - 32768`

**Status: Downloaded and merged**

| File | Grid | Resolution | Coverage | Elevation | Size |
|------|------|-----------|----------|-----------|------|
| `big-map/a-shau-z14-9x9.f32` | 2304x2304 | 9m/pixel | 21km x 21km | 373-1902m (1530m relief) | 20.3MB |
| `big-map/a-shau-z13-7x7.f32` | 1792x1792 | 18m/pixel | 33km x 33km | 90-2053m (1963m relief) | 12.3MB |

Visual heightmaps exported alongside for inspection.

Format: raw Float32, little-endian, meters. Load with:
```js
const buf = await fetch('a-shau-z14-9x9.f32').then(r => r.arrayBuffer());
const elevations = new Float32Array(buf); // 2304*2304 = 5,308,416 values
```

**Issue**: AWS tiles include tree canopy height in elevation (DSM not DTM). Dense jungle inflates ground level by 20-40m. Acceptable for first pass - FABDEM upgrade later.

### 1b. Upgrade Source - FABDEM (TODO)

Bare-earth corrected Copernicus 30m DEM. Removes canopy + buildings via ML. Reduces vertical error in forests from 5.15m to 2.88m.

- Source: https://www.fathom.global/product/global-terrain-data-fabdem/
- Also on Google Earth Engine: https://gee-community-catalog.org/projects/fabdem/
- Format: GeoTIFF, 30m resolution
- License: Free for academic/research use
- Status: NOT DOWNLOADED - requires registration

**Processing**:
```bash
# Crop A Shau Valley area (requires GDAL)
gdal_translate -projwin 107.07 16.32 107.27 16.13 fabdem_vietnam.tif a-shau-fabdem.tif
gdalinfo -mm a-shau-fabdem.tif  # check min/max
gdal_translate -of ENVI -ot Float32 a-shau-fabdem.tif a-shau-fabdem.f32
```

### 1c. Additional DEM Sources (BACKUP)

| Source | Resolution | URL | Notes |
|--------|-----------|-----|-------|
| SRTM GL1 | 30m | https://earthexplorer.usgs.gov/ | Tile N16E107.hgt covers A Shau. Raw binary 3601x3601 int16. |
| Copernicus GLO-30 | 30m | https://registry.opendata.aws/copernicus-dem/ | AWS S3, no login. GeoTIFF. |
| ALOS AW3D30 | 30m | https://www.eorc.jaxa.jp/ALOS/en/aw3d30/ | DSM (includes canopy). Diff vs FABDEM = canopy height map. |
| OpenTopography | 30m | https://opentopography.org/ | Multiple DEMs in one portal. |

### 1d. Game Integration

**Target file**: `src/systems/terrain/ChunkHeightGenerator.ts` - `generateHeightAt(worldX, worldZ)`

Current: 6-layer Perlin noise, height range -8 to ~100, seed 12345.

Replace with DEM lookup + procedural detail:
```
realHeight = bilinearSample(demGrid, worldX, worldZ)
proceduralDetail = perlinNoise(worldX * 0.1, worldZ * 0.1) * 2  // 1-2m micro variation
finalHeight = realHeight + proceduralDetail
```

**Height range change needed**: Current max 108 units. A Shau needs 1530+ units. Must expand `ChunkHeightGenerator` clamp, adjust camera far plane, fog distance, LOD thresholds.

**Coordinate mapping**: Game world (0,0) = map center (Hill 937). 1 game unit = 1 meter. DEM pixel at 9m resolution upsampled via bilinear interpolation.

---

## 2. Vegetation Density Data

Current vegetation system (`ChunkVegetationGenerator.ts`) spawns all 7 types uniformly everywhere. Real Vietnam has distinct vegetation zones.

### 2a. MODIS NDVI - Vegetation Density (TODO)

Normalized Difference Vegetation Index. Quantitative canopy density 0.0-1.0.

- Source: https://www.earthdata.nasa.gov/topics/land-surface/normalized-difference-vegetation-index-ndvi
- Product: MOD13Q1 (250m, 16-day composite)
- Format: HDF-EOS
- License: Free (NASA Earthdata login required)
- Coverage: 2000-present

**Processing**:
```bash
# Extract NDVI band from HDF, crop to A Shau, export as GeoTIFF
gdal_translate -of GTiff HDF4_EOS:EOS_GRID:"MOD13Q1.hdf":MODIS_Grid:NDVI ndvi.tif
gdal_translate -projwin 107.07 16.32 107.27 16.13 ndvi.tif a-shau-ndvi.tif
# Convert to 8-bit PNG for easy browser loading
gdal_translate -of PNG -ot Byte -scale -2000 10000 0 255 a-shau-ndvi.tif a-shau-ndvi.png
```

**Game integration**: Sample NDVI at each vegetation spawn point. Map to density multiplier:
- NDVI 0.7-1.0: Triple canopy. Max density, tall dipterocarps + banyans (25-35m)
- NDVI 0.4-0.7: Secondary growth. Medium density, palms + smaller trees
- NDVI 0.2-0.4: Grassland / defoliated. Short ferns + cogon grass, sparse trees
- NDVI < 0.2: Bare ground / rock / water. Minimal vegetation

### 2b. ESA CCI Land Cover - Vegetation Classes (TODO)

22-class land cover at 300m resolution. Tells us WHAT grows, not just how dense.

- Source: https://climate.esa.int/en/projects/land-cover/data/
- Viewer: https://maps.elie.ucl.ac.be/CCI/viewer/
- Format: GeoTIFF
- License: Free
- Coverage: Annual maps 1992-2018

**Classes relevant to A Shau**:
- 50: Evergreen broadleaf forest (triple canopy)
- 60-62: Deciduous broadleaf forest (monsoon forest)
- 100-110: Mosaic forest/shrubland
- 120-122: Shrubland
- 130: Grassland
- 160: Flooded forest
- 170: Mangroves
- 190: Urban
- 210: Water

**Processing**: Same GDAL crop workflow. Export as indexed PNG. Map each class to a vegetation profile (species mix, density, height range).

### 2c. Agent Orange Defoliation Data (TODO)

HERBS database - flight paths of 9,000+ Operation Ranch Hand spray missions (1962-1971).

- Source: http://www.workerveteranhealth.org/milherbs/new/herbs.php?s=2
- GIS layers: http://www.workerveteranhealth.org/milherbs/new/datalayers.php
- Spray maps: https://vn-agentorange.org/maps/
- Format: Database with UTM coordinates, GIS layers
- License: Public domain

**Game use**: Create defoliation mask. Sprayed areas:
- Replace triple canopy with bamboo thickets + cogon grass (1-3m)
- Open corridors along roads/rivers for clear sightlines
- Visual contrast between intact jungle and stripped zones
- 31,000 km2 total affected (17.8% of forests)

**Processing**: Download GIS layers, rasterize spray paths to match DEM grid, export as binary mask. Each pixel = sprayed (1) or intact (0).

### 2d. Canopy Height Map (DERIVED - TODO)

Difference ALOS AW3D30 (DSM, includes canopy) minus FABDEM (bare earth) = canopy height.

- No separate download needed - computed from existing DEMs
- Output: Float32 grid matching DEM dimensions
- Values: 0m (bare) to 30-40m (tallest emergent trees)
- Directly drives billboard height parameter in vegetation generator

---

## 3. Hydrology - Rivers and Streams

Current water: single flat plane at Y=0. No rivers.

### 3a. HydroRIVERS - River Vector Network (TODO)

Global river network with Strahler stream order.

- Source: https://www.hydrosheds.org/products/hydrorivers
- Downloads: https://www.hydrosheds.org/hydrosheds-core-downloads
- Format: ESRI Shapefile
- License: Free
- Attributes: Strahler order, catchment area, discharge, river name

**Processing**:
1. Clip to A Shau Valley bounding box using GDAL/OGR
2. Rasterize river vectors onto DEM grid
3. Stream order -> river width: order 1-2 = 1-3m, order 3-4 = 5-15m, order 5+ = 30m+
4. Export as binary mask + width map

**Game integration**: Carve river channels into terrain heightmap. Lower elevation along river pixels by channel depth (1-5m depending on order). Water system renders water surface at river bed + depth.

### 3b. Vietnam River Network (ALTERNATIVE - TODO)

Vietnam-specific, more complete than HydroSHEDS for this region.

- Source: https://data.opendevelopmentmekong.net/dataset/mng-li-thy-vn
- Format: GeoPackage (Shapefile inside)
- Also: https://github.com/Hydroviet/shapefiles (no login, GitHub)
- Attributes: River name, basin, sub-basin, Strahler number

### 3c. Derived Drainage (FALLBACK)

If vector data too complex, derive drainage from DEM:
- Flow direction from steepest descent
- Flow accumulation (count upstream pixels)
- Threshold accumulation > N = stream
- Built into many GIS tools (GRASS r.watershed, SAGA)

---

## 4. Historical Military Data

### 4a. Firebase / LZ Locations (TODO)

Coordinates for every firebase and landing zone.

- Source: https://vietnamtripledeuce.org/Location%20of%20Bases%20in%20Vietnam.pdf
- Source: http://www.thebattleofkontum.com/extras/RVNlistoflocations.pdf
- Format: PDF with lat/lon and MGRS grid references
- License: Public domain

**Processing**: Extract coordinates for firebases within A Shau Valley bounds. Convert to game world coordinates. Use as:
- Spawn points
- Capture zones
- AI patrol destinations
- Historical markers on minimap

**Key firebases in/near A Shau**:
- Firebase Ripcord (16.17N, 107.23E)
- Firebase Bastogne (16.35N, 107.44E)
- Firebase Veghel
- Firebase Blaze
- LZ Stallion, LZ Pepper, LZ Goodman
- A Luoi airfield (valley floor)

### 4b. US Army Topographic Maps L7014 (REFERENCE)

The actual maps soldiers carried. 1:50,000 scale, contour lines, vegetation symbols.

- Source: https://maps.lib.utexas.edu/maps/topo/vietnam/
- Also: https://www.loc.gov/maps/?fa=location:vietnam
- Format: Scanned GeoPDF (600 DPI)
- License: Public domain

**Use**: Visual reference for validating terrain accuracy, extracting trail/road networks, identifying vegetation density classification from map symbols. Not directly loaded into game but essential for authenticity checks.

Relevant sheets: Look for sheets covering 16.13N-16.32N, 107.07E-107.27E. The L7014 series uses UTM grid; these coordinates fall in the Hue/Phu Bai area sheets.

### 4c. CORONA Declassified Satellite Imagery (REFERENCE)

Actual war-era aerial photos at 1.8m resolution (KH-4B).

- Source: https://earthexplorer.usgs.gov/ > Declassified Data > Declass 1
- Coverage: 1960-1972
- Format: Digitized TIFF
- License: Public domain

**Use**: Validate what the landscape actually looked like during the war. Shows pre/during defoliation forest cover, village locations, rice paddies, trail networks.

---

## 5. Climate / Weather Data

### 5a. Monsoon Parameters (REFERENCE)

For `WeatherSystem.ts` and `DayNightCycle.ts`.

A Shau Valley (Central region) climate:
- Wet season: September-January (NE monsoon)
- Dry season: February-August
- Annual rainfall: 2000-3000mm
- Wettest month: October-November (400-800mm)
- Temperature: 20-35C (cooler at altitude: 15-30C)
- Fog: Frequent morning valley fog, persistent cloud at ridgeline (900m+)
- Humidity: 80-90%

Source: https://climateknowledgeportal.worldbank.org/country/vietnam/climate-data-historical

**Game integration**: Drive `WeatherConfig` based on in-game calendar. Higher rain probability in wet months, fog density by time of day, cloud ceiling at ridgeline altitude.

---

## 6. Data Files Inventory

### Downloaded (79MB total, 282 files)

```
data/vietnam/
  big-map/                              # Primary map data
    a-shau-z14-9x9.f32                  # [READY] 2304x2304, 9m/px, 21km, 20.3MB
    a-shau-z14-9x9.f32.meta.json        # Metadata (bounds, elevation stats)
    a-shau-z14-9x9-heightmap.png         # Visual heightmap
    a-shau-z13-7x7.f32                  # [READY] 1792x1792, 18m/px, 33km, 12.3MB
    a-shau-z13-7x7.f32.meta.json
    a-shau-z13-7x7-heightmap.png
    manifest.json
    z13/                                 # 49 raw Terrarium PNGs
    z14/                                 # 81 raw Terrarium PNGs
  terrain-tiles/                         # 10 battle areas, 4 zoom levels each
    a-shau-valley/                       # 12 tiles
    ia-drang/                            # 12 tiles
    central-highlands-pleiku/            # 12 tiles
    cu-chi/                              # 12 tiles
    hue-citadel/                         # 12 tiles
    mekong-delta/                        # 12 tiles
    khe-sanh/                            # 12 tiles
    dak-to/                              # 12 tiles
    kon-tum/                             # 12 tiles
    long-binh/                           # 12 tiles
    manifest.json
    analysis-report.json
  converted/                             # 10 merged 768x768 F32 grids (small areas)
    {area}-z14-merged.f32                # Per-area merged elevation
    {area}-z14-merged.f32.meta.json
  scripts/
    download-terrain-tiles.js            # AWS tile downloader (10 areas)
    download-big-map.js                  # A Shau big grid downloader
    analyze-tiles.js                     # Terrarium decoder + elevation stats
  srtm/                                  # (empty - for SRTM HGT files)
  reference/                             # (empty - for topo maps, imagery)
```

### Not Yet Downloaded

| Data | Source | Format | Size Est. | Auth | Priority |
|------|--------|--------|-----------|------|----------|
| FABDEM bare-earth DEM | Fathom/GEE | GeoTIFF | ~50MB tile | Registration | HIGH |
| SRTM N16E107.hgt | USGS EarthExplorer | HGT (raw int16) | 25MB | Login | MEDIUM |
| MODIS NDVI | NASA Earthdata | HDF | ~50MB | Login | HIGH |
| ESA CCI Land Cover | ESA | GeoTIFF | ~200MB (global) | None | MEDIUM |
| HydroRIVERS Asia | hydrosheds.org | Shapefile | ~100MB | None | MEDIUM |
| Hydroviet rivers | GitHub | Shapefile | ~5MB | None | HIGH (easy) |
| HERBS Agent Orange | workerveteranhealth.org | GIS | ~20MB | None | LOW (polish) |
| CORONA imagery | USGS EarthExplorer | TIFF | ~100MB/frame | Login | LOW (reference) |
| L7014 topo maps | UT Austin | GeoPDF | ~10MB/sheet | None | LOW (reference) |
| Firebase coordinates | Various PDFs | PDF/text | <1MB | None | HIGH |

---

## 7. Processing Pipeline

### Phase 1 - Minimum Viable Real Terrain

Use what we have now. No external tools needed.

1. Load `a-shau-z14-9x9.f32` as static asset (or fetch at runtime)
2. In `ChunkHeightGenerator.generateHeightAt()`, sample from Float32 grid with bilinear interpolation
3. Map game world coords to DEM pixel coords: `px = (worldX + halfWorld) / worldSize * gridWidth`
4. Add 1-2m Perlin noise for micro-detail below DEM resolution
5. Expand height range from 108 to 2000 units
6. Adjust fog, camera far plane, LOD distances for larger heights
7. New `GameModeConfig` for A Shau Valley mode (worldSize: 21000)

**No GDAL, no external services, no auth. Just load a binary file.**

### Phase 2 - Vegetation Zones

1. Derive slope map from DEM (gradient magnitude between adjacent pixels)
2. Use elevation + slope to create basic biome zones:
   - Valley floor (< 650m, slope < 15deg): Dense triple canopy
   - Mid-slope (650-900m, moderate slope): Mixed forest
   - Ridgeline (> 900m, steep): Sparse scrub + grass
   - Ravines (high slope, low elevation): Bamboo thickets
3. Modulate `ChunkVegetationGenerator` density per-zone
4. Vary vegetation type mix per zone (valley = tall trees, ridge = grass + shrubs)

**No external data needed - derived from DEM alone.**

### Phase 3 - Rivers

1. Download Hydroviet shapefiles from GitHub (no auth)
2. Rasterize river vectors onto DEM grid
3. Carve river channels into heightmap
4. Place water surfaces along channels
5. Or: derive drainage from DEM using flow accumulation

### Phase 4 - Historical Accuracy

1. Extract firebase coordinates from PDFs
2. Place as zones/objectives in game mode config
3. Download FABDEM for bare-earth correction
4. Download MODIS NDVI for vegetation density calibration
5. Reference L7014 topo maps for trail/road network placement

### Phase 5 - Polish

1. Agent Orange defoliation masks (stripped corridors)
2. CORONA imagery cross-reference for historical validation
3. Multiple map support (Ia Drang, Khe Sanh, Cu Chi as additional maps)
4. Seasonal weather variation from climate data

---

## 8. Game Engine Changes Required

### New Game Mode Config

```
worldSize: 21000          # 21km (vs 3200 Open Frontier)
chunkRenderDistance: 12-15 # Needs testing with larger terrain
maxCombatants: 200-500    # Scale with map size
matchDuration: unlimited  # Open world survival
maxTickets: unlimited
```

### Height System Expansion

| Parameter | Current | A Shau Valley |
|-----------|---------|---------------|
| Height range | -8 to 100 (108 units) | 0 to 2000+ |
| Water level | Y=0 fixed | Variable (river elevation) |
| Height clamp | `max(-8, h)` | `max(minElev, h)` |
| Camera far plane | Needs increase | ~5000+ for ridgeline views |
| Fog far | Current values | Scale with altitude |
| LOD distances | Current values | Scale proportionally |

### Chunk System Scaling

21km / 64m chunk = 328 chunks per axis = 107,584 total chunks. Only render distance matters - loading is already distance-based. May need:
- Larger chunk size (128 or 256 units) for efficiency at this scale
- Terrain LOD (reduce vertex count for distant chunks)
- Height query cache expansion

### Vegetation at Scale

21km x 21km with current density = millions of billboards. Need:
- LOD for vegetation (reduce density with distance)
- Biome-based density variation (not all max-density everywhere)
- Billboard impostor atlas for variety (currently 7 types)

---

## 9. Quick Reference - Loading DEM in Browser

```js
// Load the A Shau Valley elevation grid
const DEM_URL = 'data/vietnam/big-map/a-shau-z14-9x9.f32';
const DEM_WIDTH = 2304;
const DEM_HEIGHT = 2304;
const WORLD_SIZE = 21136; // meters
const PIXEL_RES = 9.17;  // meters per pixel

const response = await fetch(DEM_URL);
const buffer = await response.arrayBuffer();
const dem = new Float32Array(buffer);

// Sample elevation at world position (bilinear interpolation)
function sampleElevation(worldX: number, worldZ: number): number {
  // World coords: centered on Hill 937, -halfWorld to +halfWorld
  const halfWorld = WORLD_SIZE / 2;
  const px = (worldX + halfWorld) / WORLD_SIZE * (DEM_WIDTH - 1);
  const py = (worldZ + halfWorld) / WORLD_SIZE * (DEM_HEIGHT - 1);

  // Clamp to grid
  const x0 = Math.max(0, Math.min(DEM_WIDTH - 2, Math.floor(px)));
  const y0 = Math.max(0, Math.min(DEM_HEIGHT - 2, Math.floor(py)));
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = px - x0;
  const fy = py - y0;

  // Bilinear interpolation
  const h00 = dem[y0 * DEM_WIDTH + x0];
  const h10 = dem[y0 * DEM_WIDTH + x1];
  const h01 = dem[y1 * DEM_WIDTH + x0];
  const h11 = dem[y1 * DEM_WIDTH + x1];

  return (
    h00 * (1 - fx) * (1 - fy) +
    h10 * fx * (1 - fy) +
    h01 * (1 - fx) * fy +
    h11 * fx * fy
  );
}
```
