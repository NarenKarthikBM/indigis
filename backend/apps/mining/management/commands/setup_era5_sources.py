"""
Management command to seed ERA5 CDS DataSource and Layer records.

Usage:
    python manage.py setup_era5_sources
    python manage.py setup_era5_sources --bbox 37.5 68.0 8.0 97.5 --start-year 2020
    python manage.py setup_era5_sources --update

Credentials (do NOT store in DataSource.config):
    export CDS_API_URL=https://cds.climate.copernicus.eu/api
    export CDS_API_KEY=<your_key>
"""

from django.core.management.base import BaseCommand

from apps.layers.models import Layer, LayerCategory
from apps.mining.models import DataSource

# N, W, S, E
DEFAULT_BBOX = [37.5, 68.0, 8.0, 97.5]
DEFAULT_START_YEAR = 2020

# All 11 output layers
LAYER_SPECS = [
    # ── 2m Temperature ────────────────────────────────────────────────────
    {
        "slug": "era5-t2m-daily-mean",
        "label": "ERA5 2m Temperature Daily Mean",
        "temporal_type": Layer.TEMPORAL_DAILY,
        "description": "ERA5 reanalysis 2m air temperature, daily mean (°C). ~28 km grid.",
        "resolution": "~28 km",
    },
    {
        "slug": "era5-t2m-daily-min",
        "label": "ERA5 2m Temperature Daily Minimum",
        "temporal_type": Layer.TEMPORAL_DAILY,
        "description": "ERA5 reanalysis 2m air temperature, daily minimum (°C). ~28 km grid.",
        "resolution": "~28 km",
    },
    {
        "slug": "era5-t2m-daily-max",
        "label": "ERA5 2m Temperature Daily Maximum",
        "temporal_type": Layer.TEMPORAL_DAILY,
        "description": "ERA5 reanalysis 2m air temperature, daily maximum (°C). ~28 km grid.",
        "resolution": "~28 km",
    },
    {
        "slug": "era5-t2m-monthly-mean",
        "label": "ERA5 2m Temperature Monthly Mean",
        "temporal_type": Layer.TEMPORAL_MONTHLY,
        "description": "ERA5 reanalysis 2m air temperature, monthly mean (°C). ~28 km grid.",
        "resolution": "~28 km",
    },
    {
        "slug": "era5-t2m-monthly-max",
        "label": "ERA5 2m Temperature Monthly Maximum",
        "temporal_type": Layer.TEMPORAL_MONTHLY,
        "description": "ERA5 reanalysis 2m air temperature, monthly maximum (°C). ~28 km grid.",
        "resolution": "~28 km",
    },
    {
        "slug": "era5-t2m-yearly-mean",
        "label": "ERA5 2m Temperature Yearly Mean",
        "temporal_type": Layer.TEMPORAL_ANNUAL,
        "description": "ERA5 reanalysis 2m air temperature, annual mean (°C). ~28 km grid.",
        "resolution": "~28 km",
    },
    {
        "slug": "era5-t2m-yearly-min",
        "label": "ERA5 2m Temperature Yearly Minimum",
        "temporal_type": Layer.TEMPORAL_ANNUAL,
        "description": "ERA5 reanalysis 2m air temperature, annual minimum (°C). ~28 km grid.",
        "resolution": "~28 km",
    },
    {
        "slug": "era5-t2m-yearly-max",
        "label": "ERA5 2m Temperature Yearly Maximum",
        "temporal_type": Layer.TEMPORAL_ANNUAL,
        "description": "ERA5 reanalysis 2m air temperature, annual maximum (°C). ~28 km grid.",
        "resolution": "~28 km",
    },
    # ── Total Precipitation ───────────────────────────────────────────────
    {
        "slug": "era5-precip-daily-sum",
        "label": "ERA5 Total Precipitation Daily Sum",
        "temporal_type": Layer.TEMPORAL_DAILY,
        "description": "ERA5 reanalysis total precipitation, daily sum (m). ~28 km grid.",
        "resolution": "~28 km",
    },
    {
        "slug": "era5-precip-monthly-sum",
        "label": "ERA5 Total Precipitation Monthly Sum",
        "temporal_type": Layer.TEMPORAL_MONTHLY,
        "description": "ERA5 reanalysis total precipitation, monthly sum (m). ~28 km grid.",
        "resolution": "~28 km",
    },
    {
        "slug": "era5-precip-yearly-sum",
        "label": "ERA5 Total Precipitation Yearly Sum",
        "temporal_type": Layer.TEMPORAL_ANNUAL,
        "description": "ERA5 reanalysis total precipitation, annual sum (m). ~28 km grid.",
        "resolution": "~28 km",
    },
]

# DataSource records — one per CDS variable
DATASOURCE_SPECS = [
    {
        "slug": "era5-2m-temperature",
        "label": "ERA5 2m Temperature (Daily Statistics, CDS)",
        "variable": "2m_temperature",
        "fetch_schedule": "0 2 1 * *",  # monthly, 1st at 02:00
        "layer_slugs": [
            "era5-t2m-daily-mean", "era5-t2m-daily-min", "era5-t2m-daily-max",
            "era5-t2m-monthly-mean", "era5-t2m-monthly-max",
            "era5-t2m-yearly-mean", "era5-t2m-yearly-min", "era5-t2m-yearly-max",
        ],
    },
    {
        "slug": "era5-total-precipitation",
        "label": "ERA5 Total Precipitation (Daily Statistics, CDS)",
        "variable": "total_precipitation",
        "fetch_schedule": "0 3 1 * *",  # monthly, 1st at 03:00
        "layer_slugs": [
            "era5-precip-daily-sum",
            "era5-precip-monthly-sum",
            "era5-precip-yearly-sum",
        ],
    },
]


class Command(BaseCommand):
    help = "Seed ERA5 CDS DataSource and Layer records."

    def add_arguments(self, parser):
        parser.add_argument(
            "--bbox",
            nargs=4,
            type=float,
            metavar=("NORTH", "WEST", "SOUTH", "EAST"),
            default=DEFAULT_BBOX,
            help=(
                "Bounding box as N W S E (decimal degrees). "
                f"Default: {DEFAULT_BBOX}."
            ),
        )
        parser.add_argument(
            "--start-year",
            type=int,
            default=DEFAULT_START_YEAR,
            metavar="YYYY",
            help=f"Earliest year to fetch (default: {DEFAULT_START_YEAR}).",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help="Overwrite config/label on already-existing records.",
        )

    def handle(self, *args, **options):
        bbox: list[float] = options["bbox"]
        start_year: int = options["start_year"]
        update: bool = options["update"]

        self.stdout.write(f"bbox (N W S E): {bbox}  start_year: {start_year}")

        # Resolve or create the 'climate' category
        category, cat_created = LayerCategory.objects.get_or_create(
            slug="climate",
            defaults={"name": "Climate", "overlay_type": LayerCategory.OVERLAY_CORE},
        )
        if cat_created:
            self.stdout.write(self.style.SUCCESS("  created  LayerCategory: climate"))

        # Create Layer records
        self.stdout.write("\nLayers:")
        for spec in LAYER_SPECS:
            defaults = {
                "label": spec["label"],
                "layer_type": Layer.TYPE_RASTER,
                "temporal_type": spec["temporal_type"],
                "category": category,
                "description": spec.get("description", ""),
                "resolution": spec.get("resolution", ""),
                "data_source": "ECMWF ERA5 / Copernicus CDS",
                "is_active": True,
            }
            layer, created = Layer.objects.get_or_create(slug=spec["slug"], defaults=defaults)
            if created:
                self.stdout.write(self.style.SUCCESS(f"  created  {spec['slug']}"))
            elif update:
                for field, value in defaults.items():
                    setattr(layer, field, value)
                layer.save()
                self.stdout.write(self.style.WARNING(f"  updated  {spec['slug']}"))
            else:
                self.stdout.write(f"  exists   {spec['slug']}  (use --update to overwrite)")

        # Create DataSource records and link layers via M2M
        self.stdout.write("\nDataSources:")
        for spec in DATASOURCE_SPECS:
            config = {"variable": spec["variable"], "bbox": bbox, "start_year": start_year}
            defaults = {
                "label": spec["label"],
                "source_type": DataSource.SOURCE_CDS,
                "is_active": True,
                "fetch_schedule": spec["fetch_schedule"],
                "config": config,
            }
            ds, created = DataSource.objects.get_or_create(slug=spec["slug"], defaults=defaults)
            if created:
                self.stdout.write(self.style.SUCCESS(f"  created  {spec['slug']}"))
            elif update:
                ds.label = spec["label"]
                ds.config = config
                ds.save(update_fields=["label", "config"])
                self.stdout.write(self.style.WARNING(f"  updated  {spec['slug']}"))
            else:
                self.stdout.write(f"  exists   {spec['slug']}  (use --update to overwrite)")

            # Always sync M2M layers (idempotent)
            linked_layers = Layer.objects.filter(slug__in=spec["layer_slugs"])
            ds.layers.set(linked_layers)
            self.stdout.write(f"         → linked {linked_layers.count()} layer(s)")

        self.stdout.write(self.style.SUCCESS("\nDone."))
        self.stdout.write(
            self.style.WARNING(
                "\nReminder: set CDS_API_URL and CDS_API_KEY in your environment "
                "(or ensure ~/.cdsapirc exists) before running the mining task."
            )
        )
