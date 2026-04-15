"""
Management command to delete all Layer records, their RasterAssets, and optionally
their COG files from disk.

Usage
-----
    # Dry run — show what would be deleted
    python manage.py clear_layers --dry-run

    # Delete DB records only (keep files on disk)
    python manage.py clear_layers

    # Delete DB records AND COG files from disk
    python manage.py clear_layers --delete-files

    # Scope to specific layer slugs
    python manage.py clear_layers --slugs era5-t2m-daily-mean era5-precip-daily-sum
"""

import os

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Clear all layers, their raster assets, and optionally their COG files."

    def add_arguments(self, parser):
        parser.add_argument(
            "--slugs",
            nargs="+",
            metavar="SLUG",
            help="Only clear layers with these slugs (default: all layers).",
        )
        parser.add_argument(
            "--delete-files",
            action="store_true",
            default=False,
            help="Also delete COG files from disk.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Print what would be deleted without making any changes.",
        )

    def handle(self, *args, **options):
        from apps.layers.models import Layer, RasterAsset
        from apps.stats.models import RasterStateStats, RasterDistrictStats

        slugs = options["slugs"]
        delete_files = options["delete_files"]
        dry_run = options["dry_run"]

        layers_qs = Layer.objects.all()
        if slugs:
            layers_qs = layers_qs.filter(slug__in=slugs)

        layer_count = layers_qs.count()
        if layer_count == 0:
            self.stdout.write("No matching layers found.")
            return

        # Collect all raster assets belonging to these layers
        assets_qs = RasterAsset.objects.filter(layer__in=layers_qs)
        asset_count = assets_qs.count()

        # Collect all raster statistics that would be deleted
        state_asset_stats_qs = RasterStateStats.objects.filter(raster_asset__in=assets_qs)
        district_asset_stats_qs = RasterDistrictStats.objects.filter(raster_asset__in=assets_qs)
        asset_stats_count = state_asset_stats_qs.count() + district_asset_stats_qs.count()


        self.stdout.write(
            f"{'[DRY RUN] ' if dry_run else ''}"
            f"Found {layer_count} layer(s) with {asset_count} raster asset(s). "
            f"Also found {asset_stats_count} statistic record(s)."
        )

        if delete_files:
            cog_paths = list(assets_qs.values_list("cog_url", flat=True))
            files_deleted = 0
            files_missing = 0
            for url in cog_paths:
                # cog_url uses /data/cogs/... — map back to filesystem path
                file_path = url.replace("/data/cogs/", "/cogs/", 1)
                if os.path.exists(file_path):
                    if not dry_run:
                        os.remove(file_path)
                    files_deleted += 1
                else:
                    files_missing += 1

            self.stdout.write(
                f"{'Would delete' if dry_run else 'Deleted'} {files_deleted} COG file(s) "
                f"({files_missing} already missing)."
            )

        if not dry_run:
            # Cascade delete: RasterAssets are deleted via ON DELETE CASCADE from Layer
            deleted_layers, _ = layers_qs.delete()
            self.stdout.write(
                self.style.SUCCESS(
                    f"Deleted {layer_count} layer(s) and {asset_count} raster asset(s)."
                )
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"Also deleted {asset_stats_count} statistic record(s)."
                )
            )
        else:
            layer_labels = list(layers_qs.values_list("slug", flat=True))
            self.stdout.write("Layers that would be deleted:")
            for slug in layer_labels:
                self.stdout.write(f"  - {slug}")
