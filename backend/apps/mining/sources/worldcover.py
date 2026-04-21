"""
ESA WorldCover land cover source (10 m, annual).

Fetches WorldCover tiles covering India from the Element84 Earth Search STAC
catalogue (collection: esa-worldcover) and mosaics them into a single COG.

Available years: 2020 onwards. Data for a given year is typically released
12-18 months after the reference year, so we never attempt to fetch the
current calendar year.

DataSource config (optional):
    {
        "bbox": [68.0, 8.0, 97.5, 37.5]   # west, south, east, north - defaults to India
    }
"""

import logging
import os
import uuid
from datetime import date

import rasterio
from rasterio.merge import merge as rasterio_merge
from rio_cogeo.cogeo import cog_translate
from rio_cogeo.profiles import cog_profiles

from .base import BaseMiningSource

logger = logging.getLogger(__name__)

STAC_ENDPOINT = "https://earth-search.aws.element84.com/v1"
COLLECTION = "esa-worldcover"
FIRST_YEAR = 2020
DEFAULT_BBOX = (68.0, 8.0, 97.5, 37.5)  # west, south, east, north - India


class WorldCoverSource(BaseMiningSource):
    source_slug = "worldcover"

    # ------------------------------------------------------------------
    # Period logic - one job per missing year
    # ------------------------------------------------------------------

    def get_periods_to_fetch(self) -> list[tuple[date, date]]:
        from apps.mining.models import MiningJob

        done_years = set(
            MiningJob.objects.filter(source__slug=self.source_slug, status="done")
            .exclude(period_start=None)
            .values_list("period_start__year", flat=True)
        )

        # Never attempt the current year - data hasn't been released yet
        last_available = date.today().year - 1
        missing = [y for y in range(FIRST_YEAR, last_available + 1) if y not in done_years]

        if not missing:
            logger.info("WorldCoverSource: all years up to %d already fetched.", last_available)

        return [(date(y, 1, 1), date(y, 12, 31)) for y in missing]

    # ------------------------------------------------------------------
    # Fetch
    # ------------------------------------------------------------------

    def fetch(self, period_start: date, period_end: date) -> str:
        import pystac_client

        from apps.mining.models import DataSource

        year = period_start.year
        logger.info("WorldCoverSource: fetching year %d", year)

        try:
            ds = DataSource.objects.get(slug=self.source_slug)
            bbox = tuple(ds.config.get("bbox", list(DEFAULT_BBOX)))
        except DataSource.DoesNotExist:
            bbox = DEFAULT_BBOX

        catalog = pystac_client.Client.open(STAC_ENDPOINT)
        items = list(
            catalog.search(
                collections=[COLLECTION],
                bbox=list(bbox),
                datetime=f"{year}-01-01T00:00:00Z/{year}-12-31T23:59:59Z",
            ).items()
        )

        if not items:
            raise RuntimeError(f"No WorldCover STAC items found for year {year} in bbox {bbox}")

        logger.info("WorldCoverSource: %d tile(s) found for %d", len(items), year)

        hrefs = []
        for item in items:
            if "map" not in item.assets:
                logger.warning("Item %s has no 'map' asset - skipping.", item.id)
                continue
            hrefs.append(item.assets["map"].href)

        if not hrefs:
            raise RuntimeError(f"No usable 'map' assets in WorldCover items for year {year}")

        dir_path = "/cogs/mining/worldcover"
        os.makedirs(dir_path, exist_ok=True)
        uid = str(uuid.uuid4())[:8]
        raw_path = os.path.join(dir_path, f"raw_{year}_{uid}.tif")
        cog_path = os.path.join(dir_path, f"{year}_{uid}.tif")

        logger.info("WorldCoverSource: merging %d tile(s) → %s", len(hrefs), raw_path)
        self._merge_tiles(hrefs, raw_path, bbox)
        logger.info("WorldCoverSource: merge done (%d bytes)", os.path.getsize(raw_path))

        logger.info("WorldCoverSource: converting to COG → %s", cog_path)
        self._to_cog(raw_path, cog_path)
        os.remove(raw_path)
        logger.info("WorldCoverSource: COG ready %s (%d bytes)", cog_path, os.path.getsize(cog_path))

        return cog_path

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _merge_tiles(self, hrefs: list[str], output_path: str, bbox: tuple) -> None:
        west, south, east, north = bbox
        datasets = [rasterio.open(href) for href in hrefs]
        try:
            src_profile = datasets[0].profile.copy()
            merged, transform = rasterio_merge(datasets, bounds=(west, south, east, north))
        finally:
            for ds in datasets:
                ds.close()

        src_profile.update(
            {
                "driver": "GTiff",
                "height": merged.shape[1],
                "width": merged.shape[2],
                "transform": transform,
                "compress": "deflate",
            }
        )
        with rasterio.open(output_path, "w", **src_profile) as dst:
            dst.write(merged)

    def _to_cog(self, src_path: str, dst_path: str) -> None:
        profile = cog_profiles.get("deflate")
        profile.update({"blockxsize": 512, "blockysize": 512})
        cog_translate(src_path, dst_path, profile, in_memory=False, quiet=True)
