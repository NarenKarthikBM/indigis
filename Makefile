.PHONY: up down migrate seed shell logs build

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

psql:
	docker compose exec db psql -U indigis -d indigis

logs:
	docker compose logs -f

load-boundaries:
	docker compose exec backend python manage.py load_boundaries --file=data/boundaries/india_states.geojson --file-districts=data/boundaries/india_districts.geojson
