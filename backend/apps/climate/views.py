"""Climate risk API views."""
import gzip
import json
import logging

from django.http import HttpResponse, JsonResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.climate.services import ETCCDI_INDICES, TELECONNECTION_INDICES, SOI_SEASONS, IOD_SEASONS

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_layer_slug(index: str, metric: str) -> str | None:
    """Map (index, metric) → Layer slug."""
    if metric == "trend_slope":
        return f"trend-{index.lower()}"
    if metric.startswith("rp") and metric[2:].isdigit():
        rp = metric[2:]
        return f"gev-rp{rp}-{index.lower()}"
    if metric == "latest_value":
        return f"etccdi-{index.lower()}"
    # Teleconnection correlations: metric = "corr_soi" | "corr_mei" | "corr_iod"
    # Seasonal SOI:              metric = "corr_soi_djf" | "corr_soi_mam" | "corr_soi_jjas"
    if metric.startswith("corr_"):
        parts = metric[5:].split("_")  # e.g. ["soi"] or ["soi", "djf"]
        if len(parts) == 1:
            tc = parts[0].upper()
            if tc in TELECONNECTION_INDICES:
                return f"corr-{tc.lower()}-{index.lower()}"
        elif len(parts) == 2 and parts[0].upper() == "SOI":
            season = parts[1].upper()
            if season in SOI_SEASONS:
                return f"corr-soi-{season.lower()}-{index.lower()}"
        elif len(parts) == 2 and parts[0].upper() == "IOD":
            season = parts[1].upper()
            if season in IOD_SEASONS:
                return f"corr-iod-{season.lower()}-{index.lower()}"
    return None


def _latest_asset(layer_slug: str, period_label: str | None = None):
    """Return the most recent RasterAsset for a layer, optionally filtered by period_label."""
    from apps.layers.models import RasterAsset

    qs = RasterAsset.objects.filter(layer__slug=layer_slug)
    if period_label:
        qs = qs.filter(period_label=period_label)
    return qs.order_by("-data_period_start", "-created_at").first()


# ---------------------------------------------------------------------------
# GET /api/v1/climate/indices/
# ---------------------------------------------------------------------------

@api_view(["GET"])
def indices_list(request):
    """Return metadata for all ETCCDI indices and their availability."""
    from apps.layers.models import RasterAsset

    result = []
    for name, cfg in ETCCDI_INDICES.items():
        etccdi_slug = f"etccdi-{name.lower()}"
        trend_slug = f"trend-{name.lower()}"

        available_years = list(
            RasterAsset.objects.filter(layer__slug=etccdi_slug)
            .exclude(data_period_start__isnull=True)
            .order_by("data_period_start")
            .values_list("data_period_start__year", flat=True)
            .distinct()
        )

        has_trend = RasterAsset.objects.filter(layer__slug=trend_slug).exists()
        has_gev = RasterAsset.objects.filter(
            layer__slug__startswith="gev-rp"
        ).filter(layer__slug__endswith=f"-{name.lower()}").exists()

        # Which teleconnection correlations have been computed
        has_correlation = {
            tc: RasterAsset.objects.filter(
                layer__slug=f"corr-{tc.lower()}-{name.lower()}"
            ).exists()
            for tc in TELECONNECTION_INDICES
        }

        # Which seasonal SOI correlations have been computed
        has_seasonal_correlation = {
            season: RasterAsset.objects.filter(
                layer__slug=f"corr-soi-{season.lower()}-{name.lower()}"
            ).exists()
            for season in SOI_SEASONS
        }

        result.append({
            "name": name,
            "label": cfg["label"],
            "units": cfg["units"],
            "description": cfg.get("description", ""),
            "tier": cfg["tier"],
            "colormap": cfg["colormap"],
            "has_trend": has_trend,
            "has_gev": has_gev,
            "has_correlation": has_correlation,
            "has_seasonal_correlation": has_seasonal_correlation,
            "available_years": available_years,
        })

    return Response(result)


# ---------------------------------------------------------------------------
# GET /api/v1/climate/choropleth/?index=TXx&metric=trend_slope&level=district
# ---------------------------------------------------------------------------

@api_view(["GET"])
def choropleth(request):
    """
    Return a GeoJSON FeatureCollection of district or state geometries
    with the requested climate metric as the `value` property.
    """
    index = request.GET.get("index", "TXx")
    metric = request.GET.get("metric", "trend_slope")
    level = request.GET.get("level", "district")
    year = request.GET.get("year")  # optional - only for latest_value

    if index not in ETCCDI_INDICES:
        return Response({"error": f"Unknown index: {index}"}, status=400)

    layer_slug = _get_layer_slug(index, metric)
    if not layer_slug:
        return Response({"error": f"Unknown metric: {metric}"}, status=400)

    asset = _latest_asset(layer_slug, period_label=year)
    if asset is None:
        return JsonResponse(
            {"type": "FeatureCollection", "features": [], "message": "No data available"},
            status=200,
        )

    if level == "state":
        from apps.stats.models import RasterStateStats
        stats_qs = RasterStateStats.objects.filter(
            raster_asset=asset
        ).select_related("state")

        features = []
        for stat in stats_qs:
            geom = stat.state.geometry.simplify(0.01, preserve_topology=True)
            features.append({
                "type": "Feature",
                "geometry": json.loads(geom.geojson),
                "properties": {
                    "code": stat.state.code,
                    "name": stat.state.name,
                    "value": stat.mean,
                    "parameters": asset.parameters,
                },
            })
    else:
        from apps.stats.models import RasterDistrictStats
        stats_qs = RasterDistrictStats.objects.filter(
            raster_asset=asset
        ).select_related("district__state")

        features = []
        for stat in stats_qs:
            geom = stat.district.geometry.simplify(0.01, preserve_topology=True)
            features.append({
                "type": "Feature",
                "geometry": json.loads(geom.geojson),
                "properties": {
                    "code": stat.district.code,
                    "name": stat.district.name,
                    "state": stat.district.state.name,
                    "state_code": stat.district.state.code,
                    "value": stat.mean,
                    "parameters": asset.parameters,
                },
            })

    return JsonResponse({
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "index": index,
            "metric": metric,
            "level": level,
            "asset_id": asset.pk,
            "period_label": asset.period_label,
            "parameters": asset.parameters,
        },
    })


# ---------------------------------------------------------------------------
# GET /api/v1/climate/profile/<district_code>/
# ---------------------------------------------------------------------------

@api_view(["GET"])
def district_profile(request, district_code: str):
    """
    Return a full climate profile for a district:
    time series + trend + GEV return periods for all (or selected) indices.
    """
    from apps.boundaries.models import District
    from apps.layers.models import RasterAsset
    from apps.stats.models import RasterDistrictStats

    try:
        district = District.objects.select_related("state").get(code=district_code)
    except District.DoesNotExist:
        return Response({"error": f"District not found: {district_code}"}, status=404)

    requested_indices = request.GET.get("indices", "").split(",")
    requested_indices = [i.strip() for i in requested_indices if i.strip()]
    indices_to_process = requested_indices if requested_indices else list(ETCCDI_INDICES.keys())

    profile_data = {}
    for index_name in indices_to_process:
        if index_name not in ETCCDI_INDICES:
            continue
        cfg = ETCCDI_INDICES[index_name]
        etccdi_slug = f"etccdi-{index_name.lower()}"

        # Time series
        ts_stats = (
            RasterDistrictStats.objects.filter(
                district=district,
                raster_asset__layer__slug=etccdi_slug,
            )
            .select_related("raster_asset")
            .order_by("raster_asset__data_period_start")
        )
        time_series = [
            {"year": s.raster_asset.data_period_start.year, "value": s.mean}
            for s in ts_stats
            if s.raster_asset.data_period_start
        ]

        latest_value = time_series[-1]["value"] if time_series else None

        # Trend
        trend_asset = _latest_asset(f"trend-{index_name.lower()}")
        trend_data = None
        if trend_asset:
            trend_stat = RasterDistrictStats.objects.filter(
                raster_asset=trend_asset, district=district
            ).first()
            params = trend_asset.parameters
            trend_data = {
                "slope": trend_stat.mean if trend_stat else None,
                "p_value": params.get("p_value"),
                "units": params.get("units", ""),
                "period": params.get("period", []),
            }

        # GEV return periods
        gev_data = {}
        for rp in [10, 25, 50, 100]:
            gev_asset = _latest_asset(f"gev-rp{rp}-{index_name.lower()}")
            if gev_asset:
                gev_stat = RasterDistrictStats.objects.filter(
                    raster_asset=gev_asset, district=district
                ).first()
                gev_data[f"rp_{rp}"] = gev_stat.mean if gev_stat else None

        # Teleconnection correlations (annual)
        correlations = {}
        for tc_name in TELECONNECTION_INDICES:
            corr_asset = _latest_asset(f"corr-{tc_name.lower()}-{index_name.lower()}")
            if corr_asset:
                corr_stat = RasterDistrictStats.objects.filter(
                    raster_asset=corr_asset, district=district
                ).first()
                params = corr_asset.parameters
                correlations[tc_name] = {
                    "r": corr_stat.mean if corr_stat else None,
                    "period": params.get("period", []),
                    "n_years": params.get("n_years"),
                }

        # Seasonal SOI correlations
        for season in SOI_SEASONS:
            corr_asset = _latest_asset(f"corr-soi-{season.lower()}-{index_name.lower()}")
            if corr_asset:
                corr_stat = RasterDistrictStats.objects.filter(
                    raster_asset=corr_asset, district=district
                ).first()
                params = corr_asset.parameters
                correlations[f"SOI_{season}"] = {
                    "r": corr_stat.mean if corr_stat else None,
                    "period": params.get("period", []),
                    "n_years": params.get("n_years"),
                    "season": season,
                }

        # Seasonal DMI/IOD correlations
        for season in IOD_SEASONS:
            corr_asset = _latest_asset(f"corr-iod-{season.lower()}-{index_name.lower()}")
            if corr_asset:
                corr_stat = RasterDistrictStats.objects.filter(
                    raster_asset=corr_asset, district=district
                ).first()
                params = corr_asset.parameters
                correlations[f"DMI_{season}"] = {
                    "r": corr_stat.mean if corr_stat else None,
                    "period": params.get("period", []),
                    "n_years": params.get("n_years"),
                    "season": season,
                }

        profile_data[index_name] = {
            "time_series": time_series,
            "trend": trend_data,
            "return_periods": gev_data if gev_data else None,
            "correlations": correlations if correlations else None,
            "latest_value": latest_value,
            "units": cfg["units"],
        }

    return Response({
        "district": {
            "code": district.code,
            "name": district.name,
            "state_name": district.state.name,
            "state_code": district.state.code,
        },
        "indices": profile_data,
    })


# ---------------------------------------------------------------------------
# GET /api/v1/climate/rankings/?index=TXx&metric=trend_slope&level=district&limit=20
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# GET /api/v1/climate/boundaries/?level=district|state
# ---------------------------------------------------------------------------

@api_view(["GET"])
def boundaries(request):
    """
    Return GeoJSON geometries only (no climate values) for a given level.
    All simplification and GeoJSON serialisation is done in PostgreSQL to
    avoid loading heavy geometry objects into Python.
    Intended to be fetched once per level and cached long-term in the frontend.
    """
    from django.db import connection

    level = request.GET.get("level", "district")

    if level == "state":
        sql = """
            SELECT
                s.code,
                s.name,
                ST_AsGeoJSON(ST_SimplifyPreserveTopology(s.geometry, 0.01)) AS geojson
            FROM boundaries_state s
            ORDER BY s.name
        """
        with connection.cursor() as cursor:
            cursor.execute(sql)
            rows = cursor.fetchall()

        features = [
            {
                "type": "Feature",
                "geometry": json.loads(geojson),
                "properties": {"code": code, "name": name},
            }
            for code, name, geojson in rows
        ]
    else:
        sql = """
            SELECT
                d.code,
                d.name,
                s.name  AS state_name,
                s.code  AS state_code,
                ST_AsGeoJSON(ST_SimplifyPreserveTopology(d.geometry, 0.01)) AS geojson
            FROM boundaries_district d
            INNER JOIN boundaries_state s ON d.state_id = s.id
            ORDER BY d.name
        """
        with connection.cursor() as cursor:
            cursor.execute(sql)
            rows = cursor.fetchall()

        features = [
            {
                "type": "Feature",
                "geometry": json.loads(geojson),
                "properties": {
                    "code": code,
                    "name": name,
                    "state": state_name,
                    "state_code": state_code,
                },
            }
            for code, name, state_name, state_code, geojson in rows
        ]

    body = json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"))

    # Gzip if client supports it — boundary GeoJSON can be several MB
    accept_encoding = request.META.get("HTTP_ACCEPT_ENCODING", "")
    if "gzip" in accept_encoding:
        compressed = gzip.compress(body.encode("utf-8"), compresslevel=6)
        response = HttpResponse(compressed, content_type="application/json")
        response["Content-Encoding"] = "gzip"
        response["Content-Length"] = len(compressed)
    else:
        response = HttpResponse(body, content_type="application/json")

    response["Cache-Control"] = "public, max-age=86400"
    return response


# ---------------------------------------------------------------------------
# GET /api/v1/climate/values/?index=TXx&metric=trend_slope&level=district
# ---------------------------------------------------------------------------

@api_view(["GET"])
def choropleth_values(request):
    """
    Return {code: value} dict without geometry. Much lighter than choropleth/.
    """
    index = request.GET.get("index", "TXx")
    metric = request.GET.get("metric", "trend_slope")
    level = request.GET.get("level", "district")
    year = request.GET.get("year")

    if index not in ETCCDI_INDICES:
        return Response({"error": f"Unknown index: {index}"}, status=400)

    layer_slug = _get_layer_slug(index, metric)
    if not layer_slug:
        return Response({"error": f"Unknown metric: {metric}"}, status=400)

    asset = _latest_asset(layer_slug, period_label=year)
    if asset is None:
        return Response({"values": {}, "meta": {"message": "No data available"}})

    if level == "state":
        from apps.stats.models import RasterStateStats
        values = {
            s.state.code: s.mean
            for s in RasterStateStats.objects.filter(raster_asset=asset).select_related("state")
        }
    else:
        from apps.stats.models import RasterDistrictStats
        values = {
            s.district.code: s.mean
            for s in RasterDistrictStats.objects.filter(raster_asset=asset).select_related("district")
        }

    return Response({
        "values": values,
        "meta": {
            "index": index,
            "metric": metric,
            "level": level,
            "asset_id": asset.pk,
            "period_label": asset.period_label,
            "parameters": asset.parameters,
        },
    })


# ---------------------------------------------------------------------------
# GET /api/v1/climate/rankings/?index=TXx&metric=trend_slope&level=district&limit=20
# ---------------------------------------------------------------------------

@api_view(["GET"])
def rankings(request):
    """Return sorted district/state ranking for a climate metric."""
    index = request.GET.get("index", "TXx")
    metric = request.GET.get("metric", "trend_slope")
    level = request.GET.get("level", "district")
    limit = int(request.GET.get("limit", 20))
    ascending = request.GET.get("ascending", "false").lower() == "true"

    if index not in ETCCDI_INDICES:
        return Response({"error": f"Unknown index: {index}"}, status=400)

    layer_slug = _get_layer_slug(index, metric)
    if not layer_slug:
        return Response({"error": f"Unknown metric: {metric}"}, status=400)

    asset = _latest_asset(layer_slug)
    if asset is None:
        return Response({"results": [], "message": "No data available"})

    order = "mean" if ascending else "-mean"

    if level == "state":
        from apps.stats.models import RasterStateStats
        stats_qs = (
            RasterStateStats.objects.filter(raster_asset=asset, mean__isnull=False)
            .select_related("state")
            .order_by(order)[:limit]
        )
        results = [
            {
                "rank": i + 1,
                "district_code": s.state.code,
                "district_name": s.state.name,
                "state_name": s.state.name,
                "value": s.mean,
            }
            for i, s in enumerate(stats_qs)
        ]
    else:
        from apps.stats.models import RasterDistrictStats
        stats_qs = (
            RasterDistrictStats.objects.filter(raster_asset=asset, mean__isnull=False)
            .select_related("district__state")
            .order_by(order)[:limit]
        )
        results = [
            {
                "rank": i + 1,
                "district_code": s.district.code,
                "district_name": s.district.name,
                "state_name": s.district.state.name,
                "value": s.mean,
            }
            for i, s in enumerate(stats_qs)
        ]

    return Response({
        "results": results,
        "meta": {
            "index": index,
            "metric": metric,
            "level": level,
            "asset_id": asset.pk,
            "period_label": asset.period_label,
        },
    })
