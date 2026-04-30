# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

All services run via Docker Compose. The Makefile wraps common operations:

```bash
# Start/stop
make up            # docker compose up
make up-d          # docker compose up -d
make down          # docker compose down
make build         # docker compose build

# Database
make migrate       # run Django migrations
make seed          # load data/fixtures/layers.json
make psql          # open psql shell
make shell         # open Django shell

# First-time setup
cp .env.example .env
docker compose up --build
make migrate
make seed
docker compose exec backend python manage.py load_boundaries \
  --file=data/boundaries/state_boundaries.geojson \
  --file-districts=data/boundaries/district_boundaries.geojson \
  --state-name-field=STATE --state-code-field=ST_CD \
  --district-name-field=DISTRICT --district-code-field=DIST_LGD \
  --district-state-field=STATE_UT
```

**Frontend standalone (outside Docker):**
```bash
cd frontend && npm run dev    # http://localhost:5173
cd frontend && npm run build
cd frontend && npm run lint
```

**Backend management commands:**
```bash
# Register a raster layer with COG
docker compose exec backend python manage.py register_layer \
  --slug=dtm --label="Digital Terrain Model" --group=core \
  --cog-url=https://example.com/dtm.tif --colormap=terrain --min=0 --max=5000

# Climate Extreme Risk Engine - run after ERA5 data is archived in /data/era5_nc/
docker compose exec backend python manage.py compute_baseline   # 1991-2020 percentiles (Tier 2)
docker compose exec backend python manage.py compute_etccdi \
  --indices TXx,TNn,TNx,TXn --start-year 1990 --end-year 2024
docker compose exec backend python manage.py compute_trends \
  --indices TXx,TNn,TNx,TXn
docker compose exec backend python manage.py compute_gev \
  --indices TXx,TNn --return-periods 10,25,50,100
docker compose exec backend python manage.py compute_correlations \
  --indices TXx,TNn,TNx,TXn --teleconnections SOI,MEI,IOD   # needs /data/teleconnections/{soi,mei,iod}.json
docker compose exec backend python manage.py compute_correlations \
  --seasonal --seasons DJF,MAM,JJAS                          # seasonal SOI; needs /data/teleconnections/nino_seasonal.json
docker compose exec backend python manage.py compute_correlations \
  --seasonal --annual                                        # both annual and seasonal
```

**No test suite exists yet.** When tests are added: `docker compose exec backend python manage.py test apps.<app_name>`

## Service URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| TiTiler | http://localhost:8080/docs |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

Vite proxies `/api` → `http://backend:8000`. Frontend env: `VITE_API_BASE=/api/v1`, `VITE_TITILER_URL`.

## Architecture

IndiGIS is a geospatial portal for India with:
- **Django REST API** (backend) with PostGIS + 6 Django apps
- **React + TypeScript** (frontend) with Leaflet maps and React Flow workflow builder
- **TiTiler** for serving Cloud Optimized GeoTIFFs (COGs)
- **Celery + Redis** for async raster ingestion and statistics
- All communication via REST (`/api/v1/`), JWT auth (SimpleJWT)

### Backend Apps (`backend/apps/`)

| App | Responsibility |
|-----|---------------|
| `layers` | Raster/vector layer metadata, COG registration, async upload pipeline |
| `workflows` | Node-based processing graph, executor, 60+ node types |
| `boundaries` | State/district PostGIS boundaries, `load_boundaries` management command |
| `mining` | External data fetching (GEE, CHIRPS, WDPA, NASA Earthaccess, Copernicus CDS) |
| `stats` | Zonal statistics (mean/std/variance/percentiles/histogram) per state/district via Celery |
| `users` | JWT auth (register/login/refresh/me) |
| `climate` | ETCCDI extreme indices (CDO ECA), Mann-Kendall trends, GEV return periods, climate API |

**Celery queues:** `uploads`, `mining`, `processing`, `exports`, `stats`, `climate`

### Frontend Structure (`frontend/src/`)

**Routing** (React Router):
- `/` → Climate risk dashboard (`ClimateRiskApp`) - summary cards, top districts, pipeline overview
- `/explore` → Climate map explorer (`ClimateExploreApp`) - choropleth + district detail panel + rankings
- `/tools` → Original map dashboard (`AppShell`) - layer browser, TiTiler overlays, workflow builder link
- `/upload` → Raster/NetCDF upload
- `/workflows` → Workflow builder canvas
- `/login`, `/register` → Auth

**Zustand store slices** (`src/store/`): `authSlice`, `layersSlice`, `mapSlice`, `uploadSlice`, `workflowSlice`, `uiSlice`, `climateSlice`

**Key component groups:**
- `map/` - Leaflet map, TiTiler tile overlay, layer panel, legend
- `workflow/` - React Flow canvas (`WorkflowCanvas`), `NodePalette`, `NodeConfigPanel`, `ResultPreview`, `WorkflowBrowser`
- `sidebar/` - Layer browser, statistics panel
- `upload/` - File input, progress tracking
- `climate/` - `ClimateRiskApp`, `ClimateExploreApp`, `ClimateMap` (choropleth), `IndexSelector`, `MetricToggle`, `DistrictDetailPanel`, `TimeSeriesChart`, `ReturnPeriodChart`, `RadarChart`, `RankingDrawer`

### Key Patterns

**COG Pipeline:** Upload → GDAL metadata extraction → rio-cogeo conversion → stored in `/cogs` volume → TiTiler serves tiles
Tile URL pattern: `/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=<cog_url>&colormap=...&rescale=...`

**Workflow Executor** (`backend/apps/workflows/executor.py`): Validates nodes against `NODE_REGISTRY`, topological sort (Kahn's algorithm), executes in dependency order passing results downstream.

**Zonal Stats:** Computed per `RasterAsset × State/District` stored in `RasterStateStats`/`RasterDistrictStats`. Rate-limited to 2/min per worker. Triggered via `create_raster_asset_and_queue_stats` with optional `countdown` for staggering.

**ERA5 Pipeline (NetCDF-native):** CDS API → yearly NC → CDO temporal aggregation → yearly COG → RasterAsset + stats queued. Monthly COGs registered without stats. Source NCs archived at `/data/era5_nc/` for ETCCDI computation. No daily COGs created.

**ETCCDI Pipeline:** Archived NC → CDO ECA operator → result NC → COG → RasterAsset + stats. Trend: per-pixel Mann-Kendall (pymannkendall) across all annual COGs → slope/p-value rasters. GEV: per-pixel scipy.stats.genextreme fit → return-level rasters. Correlation: per-pixel scipy.stats.pearsonr between annual COG stack and teleconnection yearly timeseries (SOI/MEI/IOD from `/data/teleconnections/{tc}.json`). All products flow through the same zonal stats pipeline.

**Climate API:** `GET /api/v1/climate/indices/` | `choropleth/?index=TXx&metric=trend_slope&level=district` | `profile/<district_code>/` | `rankings/?index=TXx&metric=trend_slope`
Correlation choropleth metric: `corr_soi` | `corr_mei` | `corr_iod`

**ETCCDI Layer slug conventions:**
- Annual index: `etccdi-{index_lower}` (e.g. `etccdi-txx`)
- Trend: `trend-{index_lower}` (e.g. `trend-txx`)
- GEV return level: `gev-rp{N}-{index_lower}` (e.g. `gev-rp50-txx`)
- Teleconnection correlation: `corr-{tc_lower}-{index_lower}` (e.g. `corr-soi-txx`)
- Seasonal SOI correlation: `corr-soi-{season_lower}-{index_lower}` (e.g. `corr-soi-djf-txx`)

**Layer Model Hierarchy:**
```
Layer → RasterAsset (individual COG per time period)
      → RasterStateStats / RasterDistrictStats
      → UploadTask (async tracking)
VectorLayer (1:1 with Layer) → VectorFeature (PostGIS geometry)
Workflow → WorkflowRun (execution history)
DataSource → MiningJob → RasterAsset
```

**Settings:** `backend/config/settings/base.py` (common) + `dev.py` (DEBUG=True, CORS allow-all). API routes in `backend/config/urls.py`.
