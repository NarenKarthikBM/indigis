# IndiGIS — India Geospatial Portal

A web-based geospatial portal for India with dark-themed UI, PostGIS backend, and TiTiler raster tile serving.

## Quick Start

```bash
# 1. Copy env
cp .env.example .env

# 2. Build and start all services
docker compose up --build

# 3. In another terminal — run migrations
make migrate

# 4. Load layer metadata fixtures
docker compose exec backend python manage.py loaddata data/fixtures/layers.json

# 5. Load boundary data (provide your own GeoJSON)
docker compose exec backend python manage.py load_boundaries \
  --file=data/boundaries/state_boundaries.geojson \
  --file-districts=data/boundaries/district_boundaries.geojson \
  --state-name-field=STATE \
  --state-code-field=ST_CD \
  --district-name-field=DISTRICT \
  --district-code-field=DIST_LGD \
  --district-state-field=STATE_UT
```

## Services

| Service  | URL                        | Description              |
|----------|----------------------------|--------------------------|
| Frontend | http://localhost:5173      | React + Vite app         |
| Backend  | http://localhost:8000      | Django REST API          |
| TiTiler  | http://localhost:8080/docs | COG tile server          |
| PostGIS  | localhost:5432             | PostgreSQL + PostGIS     |

## Management Commands

### Register a raster layer with a COG
```bash
docker compose exec backend python manage.py register_layer \
  --slug=dtm \
  --label="Digital Terrain Model" \
  --group=core \
  --cog-url=https://example.com/dtm.tif \
  --colormap=terrain \
  --min=0 \
  --max=5000 \
  --description="SRTM 30m elevation" \
  --data-source="NASA SRTM" \
  --resolution="30 meters"
```

### Load a vector layer
```bash
docker compose exec backend python manage.py load_vector_layer \
  --slug=railways \
  --label="Railways" \
  --file=data/railways.geojson \
  --geometry-type=LineString \
  --min-zoom=7
```

## Boundary Data

The app expects GeoJSON files with these default field names:
- States: `ST_NM` (name), `ST_CD` (code)
- Districts: `DIST_NM` (name), `DIST_CD` (code), `ST_CD` (state code FK)

Use `--state-name-field`, `--state-code-field`, etc. to override.

A good free source: [India Administrative Boundaries - DataMeet](https://github.com/datameet/maps)

## Design Tokens

```
Primary Background:  #1A1A2E
Secondary BG:        #16213E
Accent Purple:       #7B2D8E
Accent Coral:        #E94560
Text Primary:        #EAEAEA
```
