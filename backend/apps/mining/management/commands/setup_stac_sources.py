"""
Management command to seed the 5 STAC DataSource records.

Usage:
    python manage.py setup_stac_sources
    python manage.py setup_stac_sources --bbox 77.0 23.0 77.5 23.5
    python manage.py setup_stac_sources --bbox 77.0 23.0 77.5 23.5 --update

The default bbox is a small region around Bhopal suitable for testing.
For production set --bbox to the full India extent (68.0 8.0 97.5 37.5),
but note that full-India Sentinel-2/Landsat mosaics will be very large.
"""

from django.core.management.base import BaseCommand

from apps.mining.models import DataSource

# Ordered list of STAC sources to seed.
# config_extra is merged into the base config {"bbox": <bbox>}.
STAC_SOURCES = [
    {
        "slug": "worldcover",
        "label": "ESA WorldCover (10 m Land Cover, annual)",
        "config_extra": {},
    },
    {
        "slug": "cop-dem-30",
        "label": "Copernicus DEM GLO-30 (30 m DSM)",
        "config_extra": {},
    },
    {
        "slug": "sentinel-2-l2a",
        "label": "Sentinel-2 L2A RGB (10 m, monthly best scene)",
        "config_extra": {"cloud_cover_threshold": 30},
    },
    {
        "slug": "landsat-c2-l2",
        "label": "Landsat C2 L2 Red Band (30 m, monthly best scene)",
        "config_extra": {"asset_key": "red", "cloud_cover_threshold": 30},
    },
    {
        "slug": "sentinel-1-rtc",
        "label": "Sentinel-1 RTC VV (10 m SAR, monthly most-recent)",
        "config_extra": {},
    },
]

DEFAULT_BBOX = [77.0, 23.0, 77.5, 23.5]  # small region near Bhopal — safe for dev/test


class Command(BaseCommand):
    help = (
        "Seed STAC DataSource records for WorldCover, CopDEM, "
        "Sentinel-2, Landsat, and Sentinel-1 RTC."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--bbox",
            nargs=4,
            type=float,
            metavar=("WEST", "SOUTH", "EAST", "NORTH"),
            default=DEFAULT_BBOX,
            help=(
                "Bounding box as west south east north (decimal degrees). "
                f"Default: {DEFAULT_BBOX} (small India region)."
            ),
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help="Overwrite label and config on already-existing records.",
        )

    def handle(self, *args, **options):
        bbox: list[float] = options["bbox"]
        update: bool = options["update"]

        self.stdout.write(f"bbox: {bbox}")

        for spec in STAC_SOURCES:
            config = {"bbox": bbox, **spec["config_extra"]}
            ds, created = DataSource.objects.get_or_create(
                slug=spec["slug"],
                defaults={
                    "label": spec["label"],
                    "source_type": DataSource.SOURCE_STAC,
                    "is_active": True,
                    "fetch_schedule": "0 5 1 * *",
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
