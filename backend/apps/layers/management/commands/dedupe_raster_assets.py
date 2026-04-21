"""
Management command to remove duplicate RasterAssets within each layer.

Two assets are considered duplicates when they share the same layer and the same
time period.  Period identity is determined by:

  1. ``period_label`` - if non-blank, assets with the same label under the same
     layer are duplicates.
  2. ``(data_period_start, data_period_end)`` - used as fallback when
     ``period_label`` is blank on both assets.

For each duplicate group the **most-recently created** asset is kept; all older
ones are deleted together with their ``RasterStateStats`` /
``RasterDistrictStats`` records.

Usage
-----
    # Dry run - show what would be deleted
    python manage.py dedupe_raster_assets --dry-run

    # Delete duplicate DB records only (keep COG files on disk)
    python manage.py dedupe_raster_assets

    # Delete DB records AND COG files from disk
    python manage.py dedupe_raster_assets --delete-files

    # Scope to specific layer slugs
    python manage.py dedupe_raster_assets --slugs era5-t2m-annual-mean trend-txx
"""

import os
from collections import defaultdict

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Remove duplicate RasterAssets (same layer + same time period), keeping the newest."

    def add_arguments(self, parser):
        parser.add_argument(
            "--slugs",
            nargs="+",
            metavar="SLUG",
            help="Only inspect layers with these slugs (default: all layers).",
        )
        parser.add_argument(
            "--delete-files",
            action="store_true",
            default=False,
            help="Also delete the COG files of duplicate assets from disk.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Print what would be deleted without making any changes.",
        )

    def handle(self, *args, **options):
        from apps.layers.models import Layer, RasterAsset
        from apps.stats.models import RasterDistrictStats, RasterStateStats

        slugs = options["slugs"]
        delete_files = options["delete_files"]
        dry_run = options["dry_run"]
        prefix = "[DRY RUN] " if dry_run else ""

        layers_qs = Layer.objects.filter(layer_type=Layer.TYPE_RASTER)
        if slugs:
            layers_qs = layers_qs.filter(slug__in=slugs)

        if not layers_qs.exists():
            self.stdout.write("No matching layers found.")
            return

        # Collect all duplicate asset IDs to delete (keep newest per group)
        duplicate_ids: list[int] = []
        duplicate_cog_urls: list[str] = []

        for layer in layers_qs.order_by("slug"):
            assets = list(
                layer.raster_assets.order_by("-created_at").values(
                    "id", "period_label", "data_period_start", "data_period_end", "cog_url"
                )
            )

            # Group by period key
            groups: dict[tuple, list[dict]] = defaultdict(list)
            for asset in assets:
                label = (asset["period_label"] or "").strip()
                if label:
                    key = ("label", label)
                else:
                    key = ("dates", asset["data_period_start"], asset["data_period_end"])
                groups[key].append(asset)

            layer_dupes = 0
            for key, group in groups.items():
                if len(group) <= 1:
                    continue
                # group is already sorted newest-first; keep index 0, drop the rest
                for asset in group[1:]:
                    duplicate_ids.append(asset["id"])
                    duplicate_cog_urls.append(asset["cog_url"])
                    layer_dupes += 1
                    if dry_run:
                        period_desc = key[1] if key[0] == "label" else f"{key[1]}→{key[2]}"
                        self.stdout.write(
                            f"  {layer.slug}  period={period_desc}  "
                            f"asset_id={asset['id']}  cog={asset['cog_url']}"
                        )

            if layer_dupes:
                self.stdout.write(
                    f"{prefix}{layer.slug}: {layer_dupes} duplicate asset(s) found "
                    f"(keeping newest per period)."
                )

        total_dupes = len(duplicate_ids)
        if total_dupes == 0:
            self.stdout.write(self.style.SUCCESS("No duplicate assets found."))
            return

        # Count cascaded stats
        state_stats_count = RasterStateStats.objects.filter(raster_asset_id__in=duplicate_ids).count()
        district_stats_count = RasterDistrictStats.objects.filter(raster_asset_id__in=duplicate_ids).count()

        self.stdout.write(
            f"\n{prefix}Total: {total_dupes} duplicate asset(s) to remove, "
            f"{state_stats_count + district_stats_count} stat record(s) to remove."
        )

        if dry_run:
            return

        # Delete COG files if requested
        if delete_files:
            files_deleted = files_missing = 0
            for url in duplicate_cog_urls:
                file_path = url.replace("/data/cogs/", "/cogs/", 1)
                if os.path.exists(file_path):
                    os.remove(file_path)
                    files_deleted += 1
                else:
                    files_missing += 1
            self.stdout.write(f"Deleted {files_deleted} COG file(s) ({files_missing} already missing).")

        # Delete stat records first, then assets
        RasterStateStats.objects.filter(raster_asset_id__in=duplicate_ids).delete()
        RasterDistrictStats.objects.filter(raster_asset_id__in=duplicate_ids).delete()
        RasterAsset.objects.filter(id__in=duplicate_ids).delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"Removed {total_dupes} duplicate asset(s) and "
                f"{state_stats_count + district_stats_count} stat record(s)."
            )
        )
