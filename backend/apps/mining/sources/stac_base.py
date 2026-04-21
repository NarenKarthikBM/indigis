"""
Shared STAC helpers for Element84 Earth Search sources.

All new STAC-backed sources inherit from STACSource, which provides:
  - bbox resolution from DataSource.config
  - pystac_client catalog open/search
  - mosaic-to-COG (multiple tiles → merged raster, output in WGS-84)
  - window-to-COG (single remote COG → bbox subset, output in WGS-84)
  - best-item selection by cloud cover (optical sources)
  - COG conversion (deflate, 512×512 tiles)

WorldCoverSource is NOT refactored to use this base - it already works.

Projection note
---------------
STAC imagery has heterogeneous CRS:
  WGS-84 (EPSG:4326) - CopDEM GLO-30, WorldCover
  UTM (various zones)  - Sentinel-2 L2A, Landsat C2 L2, Sentinel-1 RTC

The user-supplied bbox is always in WGS-84.  ``_window_to_cog`` and
``_mosaic_to_cog`` both transform the bbox into the native CRS before
computing the read window / merge bounds, then reproject the output
back to WGS-84 so TiTiler can always serve it without issues.
"""

import logging
import os
from abc import ABC

import numpy as np
import rasterio
import rasterio.windows
from rasterio.merge import merge as rasterio_merge
from rasterio.warp import (
    Resampling,
    calculate_default_transform,
    reproject as warp_reproject,
    transform_bounds,
)
from rio_cogeo.cogeo import cog_translate
from rio_cogeo.profiles import cog_profiles

from .base import BaseMiningSource

logger = logging.getLogger(__name__)

STAC_ENDPOINT = "https://earth-search.aws.element84.com/v1"
WGS84 = "EPSG:4326"


class STACSource(BaseMiningSource, ABC):
    stac_endpoint: str = STAC_ENDPOINT
    collection: str = ""
    asset_key: str = ""

    DEFAULT_BBOX = (68.0, 8.0, 97.5, 37.5)  # west, south, east, north - India

    def __init__(self, datasource_slug: str):
        self.source_slug = datasource_slug

    # ------------------------------------------------------------------
    # Config helpers
    # ------------------------------------------------------------------

    def _bbox(self) -> tuple:
        from apps.mining.models import DataSource

        try:
            cfg = DataSource.objects.get(slug=self.source_slug).config
            return tuple(cfg.get("bbox", list(self.DEFAULT_BBOX)))
        except DataSource.DoesNotExist:
            return self.DEFAULT_BBOX

    # ------------------------------------------------------------------
    # STAC helpers
    # ------------------------------------------------------------------

    def _open_catalog(self):
        import pystac_client

        return pystac_client.Client.open(self.stac_endpoint)

    def _search(self, bbox: tuple, datetime_str: str | None = None, **kwargs) -> list:
        search_kwargs: dict = {
            "collections": [self.collection],
            "bbox": list(bbox),
        }
        if datetime_str:
            search_kwargs["datetime"] = datetime_str
        search_kwargs.update(kwargs)
        return list(self._open_catalog().search(**search_kwargs).items())

    def _best_item(self, items: list):
        """Return item with lowest eo:cloud_cover (for optical imagery)."""

        def _cloud(item):
            return item.properties.get("eo:cloud_cover", 999)

        return min(items, key=_cloud)

    # ------------------------------------------------------------------
    # Raster helpers
    # ------------------------------------------------------------------

    def _mosaic_to_cog(
        self,
        hrefs: list[str],
        raw_path: str,
        cog_path: str,
        bbox: tuple,
    ) -> None:
        """
        Open all tile hrefs, merge clipped to bbox, write COG in WGS-84.

        If the source tiles are in a projected CRS (UTM etc.) the bbox is
        first transformed into that CRS for the merge, then the result is
        reprojected to WGS-84 before writing.
        """
        west, south, east, north = bbox

        with rasterio.Env(AWS_NO_SIGN_REQUEST="YES"):
            datasets = [rasterio.open(href) for href in hrefs]
            try:
                src_crs = datasets[0].crs
                src_profile = datasets[0].profile.copy()

                if src_crs.is_geographic:
                    # Already WGS-84 - pass bbox directly
                    merge_bounds = (west, south, east, north)
                    merged, merge_transform = rasterio_merge(datasets, bounds=merge_bounds)
                    dst_crs = src_crs
                    dst_transform = merge_transform
                    dst_data = merged
                else:
                    # Projected (e.g. UTM) - transform bbox to source CRS for merge
                    src_west, src_south, src_east, src_north = transform_bounds(
                        WGS84, src_crs, west, south, east, north
                    )
                    merged, merge_transform = rasterio_merge(
                        datasets, bounds=(src_west, src_south, src_east, src_north)
                    )

                    # Reproject merged output to WGS-84
                    dst_crs = WGS84
                    dst_transform, dst_width, dst_height = calculate_default_transform(
                        src_crs, dst_crs,
                        merged.shape[2], merged.shape[1],
                        left=merge_transform.c,
                        bottom=merge_transform.f + merge_transform.e * merged.shape[1],
                        right=merge_transform.c + merge_transform.a * merged.shape[2],
                        top=merge_transform.f,
                    )
                    dst_data = np.zeros(
                        (merged.shape[0], dst_height, dst_width), dtype=merged.dtype
                    )
                    warp_reproject(
                        source=merged,
                        destination=dst_data,
                        src_transform=merge_transform,
                        src_crs=src_crs,
                        dst_transform=dst_transform,
                        dst_crs=dst_crs,
                        resampling=Resampling.bilinear,
                        src_nodata=datasets[0].nodata,
                        dst_nodata=datasets[0].nodata,
                    )
            finally:
                for ds in datasets:
                    ds.close()

        src_profile.update(
            {
                "driver": "GTiff",
                "crs": dst_crs,
                "height": dst_data.shape[1],
                "width": dst_data.shape[2],
                "transform": dst_transform,
                "compress": "deflate",
            }
        )
        with rasterio.open(raw_path, "w", **src_profile) as dst:
            dst.write(dst_data)

        self._to_cog(raw_path, cog_path)

    def _window_to_cog(
        self,
        href: str,
        raw_path: str,
        cog_path: str,
        bbox: tuple,
    ) -> None:
        """
        Read bbox window from a single remote COG and write output COG in WGS-84.

        The bbox is always in WGS-84 (lon/lat degrees).  If the source is in a
        projected CRS (e.g. UTM for Sentinel-2/Landsat/Sentinel-1) the bbox is
        reprojected into the source CRS to compute the pixel window, then the
        extracted window is reprojected back to WGS-84 for the output file so
        TiTiler can serve it without extra configuration.
        """
        west, south, east, north = bbox

        with rasterio.Env(AWS_NO_SIGN_REQUEST="YES"):
            with rasterio.open(href) as src:
                src_crs = src.crs

                if src_crs.is_geographic:
                    # ── WGS-84 source: simple window read, no reprojection ──
                    window = rasterio.windows.from_bounds(
                        west, south, east, north, transform=src.transform
                    )
                    window = window.intersection(
                        rasterio.windows.Window(0, 0, src.width, src.height)
                    )
                    data = src.read(window=window)
                    if data.shape[1] == 0 or data.shape[2] == 0:
                        raise RuntimeError(
                            f"Empty window for WGS-84 bbox {bbox} - "
                            f"scene bounds are {src.bounds}"
                        )
                    win_transform = rasterio.windows.transform(window, src.transform)
                    profile = src.profile.copy()
                    profile.update(
                        {
                            "driver": "GTiff",
                            "height": data.shape[1],
                            "width": data.shape[2],
                            "transform": win_transform,
                            "compress": "deflate",
                        }
                    )
                    with rasterio.open(raw_path, "w", **profile) as out:
                        out.write(data)

                else:
                    # ── Projected source (UTM etc.): transform bbox → read → reproject ──
                    #
                    # Step 1: transform the WGS-84 bbox into the native CRS so that
                    #         from_bounds() uses the right coordinate units (metres).
                    src_west, src_south, src_east, src_north = transform_bounds(
                        WGS84, src_crs, west, south, east, north
                    )
                    window = rasterio.windows.from_bounds(
                        src_west, src_south, src_east, src_north,
                        transform=src.transform,
                    )
                    # Clamp to valid pixel extent (avoids out-of-bounds reads)
                    window = window.intersection(
                        rasterio.windows.Window(0, 0, src.width, src.height)
                    )
                    data = src.read(window=window)
                    if data.shape[1] == 0 or data.shape[2] == 0:
                        raise RuntimeError(
                            f"Empty window for bbox {bbox} in source CRS {src_crs} "
                            f"(transformed: {src_west:.1f},{src_south:.1f},"
                            f"{src_east:.1f},{src_north:.1f}) - "
                            f"scene bounds are {src.bounds}"
                        )
                    win_transform = rasterio.windows.transform(window, src.transform)

                    # Step 2: reproject extracted window to WGS-84
                    dst_transform, dst_width, dst_height = calculate_default_transform(
                        src_crs, WGS84,
                        data.shape[2], data.shape[1],
                        left=win_transform.c,
                        bottom=win_transform.f + win_transform.e * data.shape[1],
                        right=win_transform.c + win_transform.a * data.shape[2],
                        top=win_transform.f,
                    )
                    dst_data = np.zeros(
                        (data.shape[0], dst_height, dst_width), dtype=data.dtype
                    )
                    warp_reproject(
                        source=data,
                        destination=dst_data,
                        src_transform=win_transform,
                        src_crs=src_crs,
                        dst_transform=dst_transform,
                        dst_crs=WGS84,
                        resampling=Resampling.bilinear,
                        src_nodata=src.nodata,
                        dst_nodata=src.nodata,
                    )

                    profile = src.profile.copy()
                    profile.update(
                        {
                            "driver": "GTiff",
                            "crs": WGS84,
                            "count": data.shape[0],
                            "dtype": data.dtype,
                            "height": dst_height,
                            "width": dst_width,
                            "transform": dst_transform,
                            "compress": "deflate",
                            "nodata": src.nodata,
                        }
                    )
                    with rasterio.open(raw_path, "w", **profile) as out:
                        out.write(dst_data)

                    logger.debug(
                        "_window_to_cog: reprojected %s→WGS84, output %dx%d px",
                        src_crs, dst_width, dst_height,
                    )

        self._to_cog(raw_path, cog_path)

    def _to_cog(self, src_path: str, dst_path: str) -> None:
        profile = cog_profiles.get("deflate")
        profile.update({"blockxsize": 512, "blockysize": 512})
        cog_translate(src_path, dst_path, profile, in_memory=False, quiet=True)
