"""
Find RasterAssets with missing zonal statistics and compute them synchronously.

A "missing" asset is one that has fewer state stat rows than there are states,
or fewer district stat rows than there are districts.

Usage:
    # Dry-run: just report what's missing
    python manage.py compute_missing_stats --dry-run

    # Compute all missing stats synchronously (4 workers by default)
    python manage.py compute_missing_stats

    # Control parallelism
    python manage.py compute_missing_stats --workers 8

    # Limit to a specific layer slug
    python manage.py compute_missing_stats --layer etccdi-txx

    # Only recompute assets with zero stats (faster check, skips partial rows)
    python manage.py compute_missing_stats --zero-only
"""
import logging
import multiprocessing

from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)


def _run_in_process(asset_pk: int) -> tuple:
    """Worker executed in a child process - each gets its own GDAL/rasterio state."""
    import django
    django.setup()
    # Forked processes inherit the parent's open DB sockets. Close them all
    # immediately so this process opens fresh connections of its own.
    from django.db import connections
    connections.close_all()
    from apps.stats.services import compute_zonal_stats_for_asset
    try:
        compute_zonal_stats_for_asset(asset_pk)
        return asset_pk, None
    except Exception as exc:
        return asset_pk, exc


class Command(BaseCommand):
    help = "Compute missing zonal statistics for RasterAssets synchronously"

    def add_arguments(self, parser):
        parser.add_argument(
            "--layer",
            default=None,
            help="Filter by layer slug (default: all layers)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report missing assets without computing",
        )
        parser.add_argument(
            "--zero-only",
            action="store_true",
            help="Only process assets with zero stat rows (skip partial)",
        )
        parser.add_argument(
            "--workers",
            type=int,
            default=2,
            help="Number of parallel workers (default: 2)",
        )
        parser.add_argument(
            "--maxtasks",
            type=int,
            default=10,
            help="Restart each worker after this many tasks to free memory (default: 10)",
        )

    def handle(self, *args, **options):
        from apps.boundaries.models import District, State
        from apps.layers.models import RasterAsset
        from apps.stats.models import RasterDistrictStats, RasterStateStats

        n_states = State.objects.count()
        n_districts = District.objects.count()

        if n_states == 0 and n_districts == 0:
            self.stdout.write(self.style.WARNING("No boundaries loaded - nothing to compute."))
            return

        qs = RasterAsset.objects.select_related("layer").order_by("layer__slug", "data_period_start")
        if options["layer"]:
            qs = qs.filter(layer__slug=options["layer"])

        missing = []
        for asset in qs.iterator():
            state_count = RasterStateStats.objects.filter(raster_asset=asset).count()
            district_count = RasterDistrictStats.objects.filter(raster_asset=asset).count()

            if options["zero_only"]:
                state_missing = state_count == 0
                district_missing = district_count == 0
            else:
                state_missing = state_count < n_states if n_states else False
                district_missing = district_count < n_districts if n_districts else False

            if state_missing or district_missing:
                missing.append((asset, state_count, district_count))

        if not missing:
            self.stdout.write(self.style.SUCCESS("All assets have complete zonal statistics."))
            return

        self.stdout.write(
            f"Found {len(missing)} asset(s) with missing stats "
            f"(expected {n_states} states, {n_districts} districts):\n"
        )
        for asset, sc, dc in missing:
            self.stdout.write(
                f"  [{asset.pk}] {asset.layer.slug} / {asset.period_label or asset.pk}"
                f"  - states: {sc}/{n_states}, districts: {dc}/{n_districts}"
            )

        if options["dry_run"]:
            return

        n_workers = min(options["workers"], len(missing))
        maxtasks = options["maxtasks"]
        self.stdout.write(
            f"\nProcessing {len(missing)} asset(s) with {n_workers} worker(s) "
            f"(restart every {maxtasks} tasks)…\n"
        )

        asset_labels = {
            asset.pk: f"[{asset.pk}] {asset.layer.slug} / {asset.period_label or asset.pk}"
            for asset, _, _ in missing
        }
        asset_pks = [asset.pk for asset, _, _ in missing]

        completed = 0
        errors = 0
        total = len(missing)

        with multiprocessing.Pool(processes=n_workers, maxtasksperchild=maxtasks) as pool:
            for pk, exc in pool.imap_unordered(_run_in_process, asset_pks):
                label = asset_labels[pk]
                completed += 1
                if exc:
                    errors += 1
                    self.stdout.write(self.style.ERROR(f"({completed}/{total}) ✗ {label} - {exc}"))
                else:
                    self.stdout.write(self.style.SUCCESS(f"({completed}/{total}) ✓ {label}"))

        self.stdout.write("")
        if errors:
            self.stdout.write(self.style.WARNING(f"Completed with {errors} error(s)."))
        else:
            self.stdout.write(self.style.SUCCESS(f"All {total} asset(s) updated successfully."))
