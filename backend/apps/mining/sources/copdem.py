"""
Copernicus DEM GLO-30 source (30 m global DSM, effectively static).

Fetches all tiles covering the configured bbox from the Element84
Earth Search STAC catalogue (collection: cop-dem-glo-30) and mosaics
them into a single COG.  Re-fetches only if the last successful job
is older than 365 days (same strategy as OpenTopoSource).

DataSource config (optional):
    {
        "bbox": [68.0, 8.0, 97.5, 37.5]   # west, south, east, north - defaults to India
    }
"""

import logging
import os
import uuid
from datetime import date

from .stac_base import STACSource

logger = logging.getLogger(__name__)


class CopDEMSource(STACSource):
    collection = "cop-dem-glo-30"
    asset_key = "data"

    # ------------------------------------------------------------------
    # Period logic - static DEM, re-fetch once a year at most
    # ------------------------------------------------------------------

    def get_periods_to_fetch(self) -> list[tuple[date, date]]:
        from apps.mining.models import MiningJob

        last_done = (
            MiningJob.objects.filter(source__slug=self.source_slug, status="done")
            .order_by("-completed_at")
            .first()
        )

        today = date.today()
        if last_done and last_done.completed_at:
            days_since = (today - last_done.completed_at.date()).days
            if days_since < 365:
                logger.info(
                    "%s: last successful fetch was %d days ago - skipping.",
                    self.source_slug,
                    days_since,
                )
                return []

        return [(today, today)]

    # ------------------------------------------------------------------
    # Fetch
    # ------------------------------------------------------------------

    def fetch(self, period_start: date, period_end: date) -> str:
        bbox = self._bbox()
        logger.info("CopDEMSource: searching STAC for tiles in bbox %s", bbox)

        # CopDEM is a static dataset - no datetime filter needed
        items = self._search(bbox)
        if not items:
            raise RuntimeError(f"No CopDEM STAC items found in bbox {bbox}")

        logger.info("CopDEMSource: %d tile(s) found", len(items))

        hrefs = []
        for item in items:
            if self.asset_key not in item.assets:
                logger.warning("Item %s has no '%s' asset - skipping.", item.id, self.asset_key)
                continue
            hrefs.append(item.assets[self.asset_key].href)

        if not hrefs:
            raise RuntimeError(f"No usable '{self.asset_key}' assets in CopDEM items for bbox {bbox}")

        dir_path = "/cogs/mining/cop-dem-30"
        os.makedirs(dir_path, exist_ok=True)
        uid = str(uuid.uuid4())[:8]
        label = period_start.strftime("%Y-%m-%d")
        raw_path = os.path.join(dir_path, f"raw_{label}_{uid}.tif")
        cog_path = os.path.join(dir_path, f"{label}_{uid}.tif")

        logger.info("CopDEMSource: merging %d tile(s) → %s", len(hrefs), raw_path)
        self._mosaic_to_cog(hrefs, raw_path, cog_path, bbox)
        if os.path.exists(raw_path):
            os.remove(raw_path)
        logger.info("CopDEMSource: COG ready %s (%d bytes)", cog_path, os.path.getsize(cog_path))

        return cog_path
