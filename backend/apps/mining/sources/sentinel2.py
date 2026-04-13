"""
Sentinel-2 L2A RGB source (10 m, monthly best scene).

For each missing calendar month since 2017-01 the source selects the
least-cloudy scene from the Element84 Earth Search STAC catalogue
(collection: sentinel-2-l2a), reads the bbox window from the "visual"
(true-colour RGB) asset, and writes a COG.

Months where even the best available scene exceeds the cloud-cover
threshold are skipped with an error so the job is marked "failed"
rather than producing a bad product.

DataSource config (optional):
    {
        "bbox": [68.0, 8.0, 97.5, 37.5],   # west, south, east, north
        "cloud_cover_threshold": 30          # default 30 %
    }
"""

import logging
import os
import uuid
from calendar import monthrange
from datetime import date

from .stac_base import STACSource

logger = logging.getLogger(__name__)

FIRST_YEAR = 2017
FIRST_MONTH = 1


class Sentinel2Source(STACSource):
    collection = "sentinel-2-l2a"
    asset_key = "visual"

    # ------------------------------------------------------------------
    # Period logic — one period per missing calendar month
    # ------------------------------------------------------------------

    def get_periods_to_fetch(self) -> list[tuple[date, date]]:
        from apps.mining.models import MiningJob

        done_months: set[tuple[int, int]] = set(
            MiningJob.objects.filter(source__slug=self.source_slug, status="done")
            .exclude(period_start=None)
            .values_list("period_start__year", "period_start__month")
        )

        today = date.today()
        periods: list[tuple[date, date]] = []
        year, month = FIRST_YEAR, FIRST_MONTH
        while (year, month) < (today.year, today.month):
            if (year, month) not in done_months:
                last_day = monthrange(year, month)[1]
                periods.append((date(year, month, 1), date(year, month, last_day)))
            month += 1
            if month > 12:
                month = 1
                year += 1
        return periods

    # ------------------------------------------------------------------
    # Fetch
    # ------------------------------------------------------------------

    def fetch(self, period_start: date, period_end: date) -> str:
        from apps.mining.models import DataSource

        bbox = self._bbox()
        try:
            cfg = DataSource.objects.get(slug=self.source_slug).config
            cloud_threshold = cfg.get("cloud_cover_threshold", 30)
        except DataSource.DoesNotExist:
            cloud_threshold = 30

        datetime_str = f"{period_start.isoformat()}/{period_end.isoformat()}"
        logger.info(
            "Sentinel2Source: searching %s bbox=%s datetime=%s",
            self.collection,
            bbox,
            datetime_str,
        )

        items = self._search(bbox, datetime_str)
        if not items:
            raise RuntimeError(
                f"No Sentinel-2 items found for {period_start.strftime('%Y-%m')} in bbox {bbox}"
            )

        best = self._best_item(items)
        cloud_cover = best.properties.get("eo:cloud_cover", 999)
        if cloud_cover > cloud_threshold:
            raise RuntimeError(
                f"Best Sentinel-2 scene for {period_start.strftime('%Y-%m')} has "
                f"{cloud_cover:.1f}% cloud cover (threshold: {cloud_threshold}%)"
            )

        if self.asset_key not in best.assets:
            raise RuntimeError(f"Item {best.id} has no '{self.asset_key}' asset")

        href = best.assets[self.asset_key].href
        logger.info(
            "Sentinel2Source: best item %s (cloud_cover=%.1f%%), href=%s",
            best.id,
            cloud_cover,
            href,
        )

        dir_path = "/cogs/mining/sentinel-2-l2a"
        os.makedirs(dir_path, exist_ok=True)
        uid = str(uuid.uuid4())[:8]
        label = period_start.strftime("%Y-%m")
        raw_path = os.path.join(dir_path, f"raw_{label}_{uid}.tif")
        cog_path = os.path.join(dir_path, f"{label}_{uid}.tif")

        logger.info("Sentinel2Source: reading bbox window → %s", raw_path)
        self._window_to_cog(href, raw_path, cog_path, bbox)
        if os.path.exists(raw_path):
            os.remove(raw_path)
        logger.info("Sentinel2Source: COG ready %s (%d bytes)", cog_path, os.path.getsize(cog_path))

        return cog_path
