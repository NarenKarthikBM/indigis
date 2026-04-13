"""
Management command to diagnose COG files linked to RasterAsset records.

Reports CRS, bounds, shape, nodata, emptiness, and COG validity for
every asset — or for a specific layer slug / directory.

Usage:
    python manage.py diagnose_cogs
    python manage.py diagnose_cogs --layer sentinel-2-l2a
    python manage.py diagnose_cogs --path /cogs/mining/sentinel-2-l2a
    python manage.py diagnose_cogs --layer sentinel-2-l2a --delete-empty
"""

import glob
import os

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Inspect COG files for projection, emptiness, and validity issues."

    def add_arguments(self, parser):
        parser.add_argument(
            "--layer",
            metavar="SLUG",
            help="Only inspect assets linked to this Layer slug.",
        )
        parser.add_argument(
            "--path",
            metavar="DIR",
            help="Scan all *.tif files under this directory instead of DB assets.",
        )
        parser.add_argument(
            "--delete-empty",
            action="store_true",
            help="Delete COG files (and their RasterAsset records) that contain only nodata.",
        )

    def handle(self, *args, **options):
        import rasterio
        import numpy as np

        layer_slug = options.get("layer")
        scan_path = options.get("path")
        delete_empty = options["delete_empty"]

        if scan_path:
            paths = glob.glob(os.path.join(scan_path, "**", "*.tif"), recursive=True)
            self._check_files(paths, delete_empty)
            return

        # Resolve paths from DB RasterAsset records
        from apps.layers.models import RasterAsset

        qs = RasterAsset.objects.select_related("layer")
        if layer_slug:
            qs = qs.filter(layer__slug=layer_slug)

        if not qs.exists():
            self.stdout.write(self.style.WARNING("No RasterAsset records found."))
            return

        bad = 0
        for asset in qs.order_by("layer__slug", "data_period_start"):
            # cog_url is stored as /data/cogs/... but files live at /cogs/...
            fs_path = asset.cog_url.replace("/data/cogs/", "/cogs/", 1)
            self.stdout.write(
                f"\n[asset {asset.id}] layer={asset.layer.slug}  "
                f"period={asset.period_label or '—'}"
            )
            self.stdout.write(f"  db cog_url : {asset.cog_url}")
            self.stdout.write(f"  fs path    : {fs_path}")

            if not os.path.exists(fs_path):
                self.stdout.write(self.style.ERROR("  ✗ FILE NOT FOUND"))
                bad += 1
                continue

            size_mb = os.path.getsize(fs_path) / 1_048_576
            self.stdout.write(f"  size       : {size_mb:.2f} MB")

            try:
                with rasterio.open(fs_path) as r:
                    self.stdout.write(f"  CRS        : {r.crs}")
                    self.stdout.write(f"  bounds     : {r.bounds}")
                    self.stdout.write(f"  shape      : {r.height}x{r.width}  bands={r.count}")
                    self.stdout.write(f"  dtype      : {r.dtypes[0]}")
                    self.stdout.write(f"  nodata     : {r.nodata}")

                    # Check if every pixel is nodata / zero
                    data = r.read(1, out_shape=(min(r.height, 256), min(r.width, 256)))
                    if r.nodata is not None:
                        valid_pixels = np.sum(data != r.nodata)
                    else:
                        valid_pixels = np.sum(data != 0)

                    if valid_pixels == 0:
                        self.stdout.write(
                            self.style.ERROR("  ✗ EMPTY — all pixels are nodata/zero")
                        )
                        bad += 1
                        if delete_empty:
                            os.remove(fs_path)
                            asset.delete()
                            self.stdout.write(
                                self.style.WARNING("    → deleted file + RasterAsset record")
                            )
                    else:
                        self.stdout.write(
                            self.style.SUCCESS(f"  ✓ OK  ({valid_pixels} valid sample pixels)")
                        )

                    # Projection warning
                    if r.crs and not r.crs.is_geographic:
                        self.stdout.write(
                            self.style.WARNING(
                                f"  ⚠ Non-geographic CRS ({r.crs}).  "
                                "TiTiler can serve this but the source file was likely "
                                "created with the old projection bug — re-run mining to regenerate."
                            )
                        )

            except Exception as exc:
                self.stdout.write(self.style.ERROR(f"  ✗ OPEN ERROR: {exc}"))
                bad += 1

        self.stdout.write(
            f"\n{'─'*60}\n"
            + (self.style.ERROR(f"{bad} problem(s) found") if bad else self.style.SUCCESS("All OK"))
        )

    def _check_files(self, paths, delete_empty):
        """Scan raw file paths (no DB lookup)."""
        import rasterio
        import numpy as np

        self.stdout.write(f"Scanning {len(paths)} file(s)...\n")
        bad = 0
        for path in sorted(paths):
            self.stdout.write(f"\n{path}")
            size_mb = os.path.getsize(path) / 1_048_576
            self.stdout.write(f"  size  : {size_mb:.2f} MB")
            try:
                with rasterio.open(path) as r:
                    self.stdout.write(f"  CRS   : {r.crs}")
                    self.stdout.write(f"  bounds: {r.bounds}")
                    self.stdout.write(f"  shape : {r.height}x{r.width}  bands={r.count}")
                    data = r.read(1, out_shape=(min(r.height, 256), min(r.width, 256)))
                    valid = int(np.sum(data != (r.nodata or 0)))
                    if valid == 0:
                        self.stdout.write(self.style.ERROR("  ✗ EMPTY"))
                        bad += 1
                        if delete_empty:
                            os.remove(path)
                            self.stdout.write(self.style.WARNING("    → deleted"))
                    else:
                        self.stdout.write(self.style.SUCCESS(f"  ✓ {valid} valid sample px"))
                    if r.crs and not r.crs.is_geographic:
                        self.stdout.write(self.style.WARNING(f"  ⚠ Non-geographic CRS"))
            except Exception as exc:
                self.stdout.write(self.style.ERROR(f"  ✗ OPEN ERROR: {exc}"))
                bad += 1

        self.stdout.write(
            f"\n{'─'*60}\n"
            + (self.style.ERROR(f"{bad} problem(s) found") if bad else self.style.SUCCESS("All OK"))
        )
