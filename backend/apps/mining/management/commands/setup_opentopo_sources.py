"""
Management command: python manage.py setup_opentopo_sources

Creates one DataSource record per OpenTopography DEM type.
Existing records are left untouched (use --update to overwrite config).

Usage:
    # Create all 15 sources (skips existing)
    python manage.py setup_opentopo_sources

    # Set the bounding box for all sources at once
    python manage.py setup_opentopo_sources --south 23.0 --north 23.5 --west 77.0 --east 77.5

    # Also set the API key
    python manage.py setup_opentopo_sources --south 23.0 --north 23.5 \\
        --west 77.0 --east 77.5 --api-key YOUR_KEY

    # Overwrite config on existing records
    python manage.py setup_opentopo_sources --south 23.0 --north 23.5 \\
        --west 77.0 --east 77.5 --api-key YOUR_KEY --update
"""

from django.core.management.base import BaseCommand

from apps.mining.models import DataSource
from apps.mining.sources.opentopo import DEM_TYPES, demtype_to_slug


class Command(BaseCommand):
    help = "Seed DataSource records for all OpenTopography DEM types."

    def add_arguments(self, parser):
        parser.add_argument("--south", type=float, default=None, help="Bounding box south (lat)")
        parser.add_argument("--north", type=float, default=None, help="Bounding box north (lat)")
        parser.add_argument("--west",  type=float, default=None, help="Bounding box west (lon)")
        parser.add_argument("--east",  type=float, default=None, help="Bounding box east (lon)")
        parser.add_argument("--api-key", dest="api_key", default="", help="OpenTopography API key")
        parser.add_argument(
            "--update",
            action="store_true",
            help="Overwrite config on existing DataSource records",
        )

    def handle(self, *args, **options):
        bbox_keys = ("south", "north", "west", "east")
        bbox_provided = all(options[k] is not None for k in bbox_keys)

        created = updated = skipped = 0

        for demtype, label in DEM_TYPES:
            slug = demtype_to_slug(demtype)
            config: dict = {"demtype": demtype}

            if bbox_provided:
                config.update({k: options[k] for k in bbox_keys})

            if options["api_key"]:
                config["api_key"] = options["api_key"]

            ds, was_created = DataSource.objects.get_or_create(
                slug=slug,
                defaults={
                    "label": f"OpenTopography — {label}",
                    "source_type": "opentopo",
                    "fetch_schedule": "0 7 1 * *",  # monthly, day-1, 07:00
                    "is_active": True,
                    "config": config,
                },
            )

            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"  CREATED  {slug}"))
            elif options["update"]:
                ds.config = config
                ds.save(update_fields=["config"])
                updated += 1
                self.stdout.write(self.style.WARNING(f"  UPDATED  {slug}"))
            else:
                skipped += 1
                self.stdout.write(f"  skipped  {slug}  (already exists; use --update to overwrite)")

        self.stdout.write("")
        self.stdout.write(f"Done. created={created}  updated={updated}  skipped={skipped}")

        if not bbox_provided:
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING(
                    "No bounding box supplied — sources won't run until you add\n"
                    "south/north/west/east to each DataSource.config (via admin or --update)."
                )
            )
