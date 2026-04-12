import json
from pathlib import Path

from django.contrib.gis.geos import GEOSGeometry, MultiPolygon, Polygon
from django.core.management.base import BaseCommand, CommandError

from apps.boundaries.models import State, District


def to_multipolygon(geom):
    if geom.geom_type == "Polygon":
        return MultiPolygon(geom)
    elif geom.geom_type == "MultiPolygon":
        return geom
    raise ValueError(f"Unexpected geometry type: {geom.geom_type}")


class Command(BaseCommand):
    help = "Load India state and district boundaries from GeoJSON files"

    def add_arguments(self, parser):
        parser.add_argument("--file", required=True, help="Path to states GeoJSON file")
        parser.add_argument("--file-districts", help="Path to districts GeoJSON file")
        parser.add_argument("--state-name-field", default="ST_NM", help="Field name for state name")
        parser.add_argument("--state-code-field", default="ST_CD", help="Field name for state code")
        parser.add_argument("--district-name-field", default="DISTRICT", help="Field name for district name")
        parser.add_argument("--district-code-field", default="DIST_CD", help="Field name for district code")
        parser.add_argument("--district-state-field", default="ST_CD", help="Field linking district to state code")
        parser.add_argument("--clear", action="store_true", help="Clear existing data before loading")

    def handle(self, *args, **options):
        if options["clear"]:
            self.stdout.write("Clearing existing boundaries...")
            District.objects.all().delete()
            State.objects.all().delete()

        self._load_states(
            options["file"],
            options["state_name_field"],
            options["state_code_field"],
        )

        if options["file_districts"]:
            self._load_districts(
                options["file_districts"],
                options["district_name_field"],
                options["district_code_field"],
                options["district_state_field"],
            )

    def _load_states(self, filepath, name_field, code_field):
        path = Path(filepath)
        if not path.exists():
            raise CommandError(f"File not found: {filepath}")

        self.stdout.write(f"Loading states from {filepath}...")
        with open(path) as f:
            data = json.load(f)

        features = data.get("features", [])
        created = 0
        updated = 0

        for feat in features:
            props = feat.get("properties", {})
            name = props.get(name_field, "").strip()
            code = str(props.get(code_field, "")).strip()

            if not name or not code:
                self.stdout.write(
                    self.style.WARNING(f"Skipping feature with missing name/code: {props}")
                )
                continue

            try:
                geom = GEOSGeometry(json.dumps(feat["geometry"]))
                geom = to_multipolygon(geom)
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"Invalid geometry for {name}: {e}"))
                continue

            state, was_created = State.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "geometry": geom,
                    "properties": props,
                },
            )

            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(f"States: {created} created, {updated} updated")
        )

    def _load_districts(self, filepath, name_field, code_field, state_field):
        path = Path(filepath)
        if not path.exists():
            raise CommandError(f"File not found: {filepath}")

        self.stdout.write(f"Loading districts from {filepath}...")
        with open(path) as f:
            data = json.load(f)

        features = data.get("features", [])
        state_cache = {s.name: s for s in State.objects.all()}
        created = 0
        skipped = 0

        for feat in features:
            props = feat.get("properties", {})
            if not props.get(name_field):
                skipped += 1
                continue
            name = props.get(name_field, "").strip()
            code = str(props.get(code_field, name[0:3].upper())).strip()
            if not props.get(state_field):
                skipped += 1
                continue
            state_name = str(props.get(state_field, "")).strip()

            if not name or not code:
                skipped += 1
                continue

            state = state_cache.get(state_name)
            if not state:
                self.stdout.write(
                    self.style.WARNING(f"No state found for name '{state_name}' (district: {name})")
                )
                skipped += 1
                continue

            try:
                geom = GEOSGeometry(json.dumps(feat["geometry"]))
                geom = to_multipolygon(geom)
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"Invalid geometry for {name}: {e}"))
                skipped += 1
                continue

            District.objects.update_or_create(
                code=code,
                state=state,
                defaults={
                    "name": name,
                    "geometry": geom,
                    "properties": props,
                },
            )
            created += 1

        self.stdout.write(
            self.style.SUCCESS(f"Districts: {created} created/updated, {skipped} skipped")
        )
