"""
OpenTopography global DEM source.

Each DEM type becomes its own DataSource record (slug: opentopo-<demtype-lower>).
The DataSource.config dict must contain:

    {
        "demtype":  "SRTMGL1",   # required - one of DEM_TYPES
        "south":    23.0,        # required - bounding box in WGS84 decimal degrees
        "north":    23.5,
        "west":     77.0,
        "east":     77.5,
        "api_key":  "..."        # optional - falls back to settings.OPENTOPO_API_KEY
    }

Note on bbox size: high-resolution products (SRTMGL1, COP30, AW3D30) produce very
large files over wide regions. Keep the bbox to a manageable area or increase the
Celery task time-limit (CELERYD_TASK_SOFT_TIME_LIMIT) accordingly.
"""

import logging
import os
import uuid
from datetime import date, timedelta

import requests

from .base import BaseMiningSource

logger = logging.getLogger(__name__)

OPENTOPO_API_URL = "https://portal.opentopography.org/API/globaldem"

DEM_TYPES: list[tuple[str, str]] = [
    ("SRTMGL3",        "SRTM GL3 90m"),
    ("SRTMGL1",        "SRTM GL1 30m"),
    ("SRTMGL1_E",      "SRTM GL1 Ellipsoidal 30m"),
    ("AW3D30",         "ALOS World 3D 30m"),
    ("AW3D30_E",       "ALOS World 3D Ellipsoidal 30m"),
    ("SRTM15Plus",     "Global Bathymetry SRTM15+ V2.1 500m"),
    ("NASADEM",        "NASADEM Global DEM"),
    ("COP30",          "Copernicus Global DSM 30m"),
    ("COP90",          "Copernicus Global DSM 90m"),
    ("EU_DTM",         "EU DTM 30m"),
    ("GEDI_L3",        "GEDI DTM 1000m"),
    ("GEBCOIceTopo",   "GEBCO Ice Topo 500m"),
    ("GEBCOSubIceTopo","GEBCO Sub-Ice Topo 500m"),
    ("CA_MRDEM_DSM",   "Canada MRDEM DSM 30m"),
    ("CA_MRDEM_DTM",   "Canada MRDEM DTM 30m"),
]

# Canonical slug for each demtype: "opentopo-srtmgl1", "opentopo-cop30", …
def demtype_to_slug(demtype: str) -> str:
    return f"opentopo-{demtype.lower().replace('_', '-')}"


class OpenTopoSource(BaseMiningSource):
    """
    Fetches a single DEM type from the OpenTopography /API/globaldem endpoint,
    converts the raw GeoTIFF to COG, and registers a RasterAsset.

    Instantiate with the DataSource slug, e.g.:
        OpenTopoSource("opentopo-srtmgl1").run()
    """

    def __init__(self, datasource_slug: str):
        self.source_slug = datasource_slug

    # ------------------------------------------------------------------
    # Period logic - DEMs are (mostly) static; re-fetch once a year
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
                    "%s: last successful fetch was %d days ago - skipping.", self.source_slug, days_since
                )
                return []

        # Use today as a single-day "period" - DEMs have no meaningful time range
        return [(today, today)]

    # ------------------------------------------------------------------
    # Fetch
    # ------------------------------------------------------------------

    def fetch(self, period_start: date, period_end: date) -> str:
        from django.conf import settings

        from apps.mining.models import DataSource

        ds = DataSource.objects.get(slug=self.source_slug)
        cfg = ds.config

        demtype = cfg.get("demtype")
        if not demtype:
            raise ValueError(f"DataSource '{self.source_slug}' config is missing 'demtype'.")

        south = cfg.get("south", 8.4)
        north = cfg.get("north", 35.0)
        west = cfg.get("west", 68.1)
        east = cfg.get("east", 97.4)
        if any(v is None for v in [south, north, west, east]):
            raise ValueError(
                f"DataSource '{self.source_slug}' config is missing bounding box "
                "fields: south, north, west, east."
            )

        api_key = cfg.get("api_key") or getattr(settings, "OPENTOPO_API_KEY", "demoapikeyot2022")
        if not api_key:
            raise ValueError(
                "OpenTopography API key not found. "
                "Set OPENTOPO_API_KEY in settings or add 'api_key' to the DataSource config."
            )

        params = {
            "demtype": demtype,
            "south": south,
            "north": north,
            "west": west,
            "east": east,
            "outputFormat": "GTiff",
            "API_Key": api_key,
        }

        primary_layer = ds.layers.first()
        layer_slug = primary_layer.slug if primary_layer else demtype_to_slug(demtype)
        dir_path = f"/cogs/mining/{layer_slug}"
        os.makedirs(dir_path, exist_ok=True)

        uid = str(uuid.uuid4())[:8]
        raw_path = os.path.join(dir_path, f"raw_{period_start.strftime('%Y-%m')}_{uid}.tif")
        cog_path = os.path.join(dir_path, f"{period_start.strftime('%Y-%m')}_{uid}.tif")

        logger.info("Downloading %s from OpenTopography (bbox: %s/%s/%s/%s)…", demtype, south, north, west, east)
        self._download(params, raw_path)
        logger.info("Downloaded → %s (%d bytes)", raw_path, os.path.getsize(raw_path))

        logger.info("Converting to COG → %s", cog_path)
        self._to_cog(raw_path, cog_path)
        os.remove(raw_path)
        logger.info("COG ready: %s (%d bytes)", cog_path, os.path.getsize(cog_path))

        return cog_path

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _download(self, params: dict, output_path: str) -> None:
        with requests.get(OPENTOPO_API_URL, params=params, stream=True, timeout=600) as r:
            if not r.ok:
                body = r.text[:2000]
                print(f"OpenTopography {r.status_code} {r.reason}\nparams={params}\nbody={body}")
                logger.error("OpenTopography %d %s | params=%s | body=%s", r.status_code, r.reason, params, body)
            r.raise_for_status()

            # OpenTopography returns a JSON error body on bad requests
            content_type = r.headers.get("Content-Type", "")
            if "json" in content_type or "text/html" in content_type:
                body = r.text[:1000]
                raise RuntimeError(
                    f"OpenTopography returned a non-binary response (possible API error):\n{body}"
                )

            with open(output_path, "wb") as fh:
                for chunk in r.iter_content(chunk_size=65536):
                    if chunk:
                        fh.write(chunk)

    def _to_cog(self, src_path: str, dst_path: str) -> None:
        from rio_cogeo.cogeo import cog_translate
        from rio_cogeo.profiles import cog_profiles

        profile = cog_profiles.get("deflate")
        profile.update({"blockxsize": 512, "blockysize": 512})
        cog_translate(src_path, dst_path, profile, in_memory=False, quiet=True)
