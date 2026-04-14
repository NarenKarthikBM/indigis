import logging

import numpy as np

logger = logging.getLogger(__name__)

_NODATA = -9999.0
_STATS_LIST = [
    "mean", "min", "max", "std", "count", "sum",
    "median", "percentile_25", "percentile_75", "percentile_95",
]


def _cog_path_from_url(cog_url: str) -> str:
    return cog_url.replace("/data/cogs/", "/cogs/", 1)


def _build_histogram_adder(global_min: float, global_max: float, n_bins: int = 100):
    """Return a rasterstats add_stats callable that computes a fixed-range histogram."""
    import numpy as _np

    def _histogram(x):
        arr = _np.asarray(x)
        arr = arr[~_np.isnan(arr)]
        if arr.size == 0:
            return None
        counts, bin_edges = _np.histogram(arr, bins=n_bins, range=(global_min, global_max))
        return {"bins": bin_edges.tolist(), "counts": counts.tolist()}

    return {"histogram": _histogram}


def _result_to_record(result: dict, global_min=None, global_max=None) -> dict:
    """Convert a rasterstats result dict to a flat record dict."""
    std = result.get("std")
    mean = result.get("mean")

    variance = (std ** 2) if std is not None else None
    cv = (std / mean) if (std is not None and mean not in (None, 0)) else None

    histogram = result.get("histogram")

    return {
        "mean": mean,
        "min": result.get("min"),
        "max": result.get("max"),
        "std": std,
        "variance": variance,
        "median": result.get("median"),
        "p25": result.get("percentile_25"),
        "p75": result.get("percentile_75"),
        "p95": result.get("percentile_95"),
        "count": result.get("count"),
        "sum": result.get("sum"),
        "cv": cv,
        "histogram": histogram,
    }


def compute_zonal_stats_for_asset(raster_asset_id: int) -> None:
    from rasterstats import zonal_stats

    from apps.boundaries.models import District, State
    from apps.layers.models import RasterAsset
    from apps.stats.models import RasterDistrictStats, RasterStateStats

    asset = RasterAsset.objects.select_related("layer").get(pk=raster_asset_id)
    cog_path = _cog_path_from_url(asset.cog_url)

    global_min = asset.layer.min_value
    global_max = asset.layer.max_value
    use_histogram = global_min is not None and global_max is not None

    add_stats = _build_histogram_adder(global_min, global_max) if use_histogram else {}

    # ── States ────────────────────────────────────────────────────────────────
    states = list(State.objects.all())
    if states:
        state_geoms = [s.geometry.wkt for s in states]
        logger.info("Computing state zonal stats for asset %s (%d states)", asset.pk, len(states))
        state_results = zonal_stats(
            state_geoms,
            cog_path,
            stats=_STATS_LIST,
            nodata=_NODATA,
            add_stats=add_stats,
            geojson_out=False,
        )

        state_records = []
        for state, result in zip(states, state_results):
            rec = _result_to_record(result)
            state_records.append(
                RasterStateStats(raster_asset=asset, state=state, **rec)
            )

        RasterStateStats.objects.filter(raster_asset=asset).delete()
        RasterStateStats.objects.bulk_create(state_records, batch_size=50)
        logger.info("Saved %d state stat rows for asset %s", len(state_records), asset.pk)

    # ── Districts ─────────────────────────────────────────────────────────────
    districts = list(District.objects.select_related("state").all())
    if districts:
        district_geoms = [d.geometry.wkt for d in districts]
        logger.info("Computing district zonal stats for asset %s (%d districts)", asset.pk, len(districts))
        district_results = zonal_stats(
            district_geoms,
            cog_path,
            stats=_STATS_LIST,
            nodata=_NODATA,
            add_stats=add_stats,
            geojson_out=False,
        )

        district_records = []
        for district, result in zip(districts, district_results):
            rec = _result_to_record(result)
            district_records.append(
                RasterDistrictStats(raster_asset=asset, district=district, **rec)
            )

        RasterDistrictStats.objects.filter(raster_asset=asset).delete()
        RasterDistrictStats.objects.bulk_create(district_records, batch_size=100)
        logger.info("Saved %d district stat rows for asset %s", len(district_records), asset.pk)
