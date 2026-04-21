.PHONY: up down migrate seed shell era5-run era5-process logs build

up:
	docker compose up

up-d:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

migrate:
	docker compose exec backend python manage.py migrate

seed:
	docker compose exec backend python manage.py loaddata apps/layers/fixtures/layers.json

shell:
	docker compose exec backend python manage.py shell

era5-run:
	docker compose exec backend python manage.py shell -c "\
import faulthandler; faulthandler.enable(); \
import logging; logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s'); \
from apps.mining.sources.era5_daily import ERA5DailySource; \
ERA5DailySource('$(slug)').run()"

era5-process:
	docker compose exec backend python manage.py shell -c "\
import faulthandler; faulthandler.enable(); \
import logging; logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s'); \
from apps.mining.sources.era5_daily import ERA5DailySource; \
ERA5DailySource('$(slug)').run_processing(years=$(if $(years),[$(years)],None))"

psql:
	docker compose exec db psql -U indigis -d indigis

logs:
	docker compose logs -f

load-boundaries:
	docker compose exec backend python manage.py load_boundaries --file=data/boundaries/india_states.geojson --file-districts=data/boundaries/india_districts.geojson
