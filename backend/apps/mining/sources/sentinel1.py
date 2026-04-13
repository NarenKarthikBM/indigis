"""
Sentinel-1 RTC VV polarisation source (10 m SAR, monthly most-recent scene).

For each missing calendar month since 2017-01 the source takes the first
(most-recent) scene in the search results from the Element84 Earth Search
STAC catalogue (collection: sentinel-1-rtc), reads the bbox window from
the "vv" asset (sigma0 backscatter, float32), and writes a COG.

SAR is cloud-independent so no cloud-cover filtering is applied.

DataSource config (optional):
    {
        "bbox": [68.0, 8.0, 97.5, 37.5]   # west, south, east, north — defaults to India
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


class Sentinel1RTCSource(STACSource):
    collection = "sentinel-1-rtc"
    asset_key = "vv"

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
        bbox = self._bbox()
        datetime_str = f"{period_start.isoformat()}/{period_end.isoformat()}"
        logger.info(
            "Sentinel1RTCSource: searching %s bbox=%s datetime=%s",
            self.collection,
            bbox,
            datetime_str,
        )

        items = self._search(bbox, datetime_str)
        if not items:
            raise RuntimeError(
                f"No Sentinel-1 RTC items found for {period_start.strftime('%Y-%m')} in bbox {bbox}"
            )

        # SAR is cloud-independent — take the first (most-recent) item
        item = items[0]
        if self.asset_key not in item.assets:
            raise RuntimeError(f"Item {item.id} has no '{self.asset_key}' asset")

        href = item.assets[self.asset_key].href
        logger.info("Sentinel1RTCSource: using item %s, href=%s", item.id, href)

        dir_path = "/cogs/mining/sentinel-1-rtc"
        os.makedirs(dir_path, exist_ok=True)
        uid = str(uuid.uuid4())[:8]
        label = period_start.strftime("%Y-%m")
        raw_path = os.path.join(dir_path, f"raw_{label}_{uid}.tif")
        cog_path = os.path.join(dir_path, f"{label}_{uid}.tif")

        logger.info("Sentinel1RTCSource: reading bbox window → %s", raw_path)
        self._window_to_cog(href, raw_path, cog_path, bbox)
        if os.path.exists(raw_path):
            os.remove(raw_path)
        logger.info(
            "Sentinel1RTCSource: COG ready %s (%d bytes)", cog_path, os.path.getsize(cog_path)
        )

        return cog_path
