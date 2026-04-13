"""
Management command to seed NASA Earthaccess / MODIS DataSource records.

Usage:
    python manage.py setup_modis_sources
    python manage.py setup_modis_sources --bbox 77.0 23.0 77.5 23.5
    python manage.py setup_modis_sources --bbox 77.0 23.0 77.5 23.5 \\
        --start-date 2024-01-01 --update

Credentials (do NOT store in DataSource.config):
    export EARTHDATA_USERNAME=<your_username>
    export EARTHDATA_PASSWORD=<your_password>
"""

from django.core.management.base import BaseCommand

from apps.mining.models import DataSource

MODIS_SOURCES = [
    {
        "slug": "modis-lst-daily",
        "label": "MODIS Terra Daily Daytime LST (MOD11A1 v061, 1 km, °C)",
        "fetch_schedule": "0 3 * * *",  # daily at 03:00
    },
]

DEFAULT_BBOX = [68.0, 8.0, 97.5, 37.5] 
DEFAULT_START_DATE = "2024-01-01"


class Command(BaseCommand):
    help = "Seed NASA Earthaccess / MODIS DataSource records."

    def add_arguments(self, parser):
        parser.add_argument(
            "--bbox",
            nargs=4,
            type=float,
            metavar=("WEST", "SOUTH", "EAST", "NORTH"),
            default=DEFAULT_BBOX,
            help=(
                "Bounding box as west south east north (decimal degrees). "
                f"Default: {DEFAULT_BBOX}."
            ),
        )
        parser.add_argument(
            "--start-date",
            default=DEFAULT_START_DATE,
            metavar="YYYY-MM-DD",
            help=f"Earliest date to fetch (default: {DEFAULT_START_DATE}).",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help="Overwrite config on already-existing records.",
        )

    def handle(self, *args, **options):
        bbox: list[float] = options["bbox"]
        start_date: str = options["start_date"]
        update: bool = options["update"]

        self.stdout.write(f"bbox: {bbox}  start_date: {start_date}")

        for spec in MODIS_SOURCES:
            config = {"bbox": bbox, "start_date": start_date}
            ds, created = DataSource.objects.get_or_create(
                slug=spec["slug"],
                defaults={
                    "label": spec["label"],
                    "source_type": DataSource.SOURCE_EARTHACCESS,
                    "is_active": True,
                    "fetch_schedule": spec["fetch_schedule"],
                    "config": config,
                },
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"  created  {spec['slug']}"))
            elif update:
                ds.label = spec["label"]
                ds.config = config
                ds.save(update_fields=["label", "config"])
                self.stdout.write(self.style.WARNING(f"  updated  {spec['slug']}"))
            else:
                self.stdout.write(f"  exists   {spec['slug']}  (use --update to overwrite)")

        self.stdout.write(self.style.SUCCESS("Done."))
        self.stdout.write(
            self.style.WARNING(
                "\nReminder: set EARTHDATA_USERNAME and EARTHDATA_PASSWORD "
                "in your environment before running the mining task."
            )
        )
