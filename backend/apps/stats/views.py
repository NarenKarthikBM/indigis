import csv

from django.http import StreamingHttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.layers.models import RasterAsset
from .models import RasterDistrictStats, RasterStateStats
from .serializers import RegionStatsSerializer


def _get_assets(layer_slug):
    return RasterAsset.objects.filter(
        layer__slug=layer_slug, layer__is_active=True
    ).order_by("-created_at").select_related("layer")


def _build_stats_payload(stats_obj, asset, available_periods):
    return {
        "layer_slug": asset.layer.slug,
        "layer_label": asset.layer.label,
        "period_label": asset.period_label,
        "available_periods": available_periods,
        "mean": stats_obj.mean,
        "min": stats_obj.min,
        "max": stats_obj.max,
        "std": stats_obj.std,
        "median": stats_obj.median,
        "p25": stats_obj.p25,
        "p75": stats_obj.p75,
        "p95": stats_obj.p95,
        "count": stats_obj.count,
        "sum": stats_obj.sum,
        "cv": stats_obj.cv,
        "histogram": stats_obj.histogram,
    }


class RegionStatsView(APIView):
    def get(self, request):
        layer_slug = request.query_params.get("layer_slug")
        state_code = request.query_params.get("state_code")
        district_code = request.query_params.get("district_code")
        period_label = request.query_params.get("period_label")

        if not layer_slug:
            return Response({"error": "layer_slug is required"}, status=400)
        if not state_code and not district_code:
            return Response({"error": "state_code or district_code is required"}, status=400)

        assets = _get_assets(layer_slug)
        if not assets.exists():
            return Response({"error": "Layer not found or has no assets"}, status=404)

        available_periods = list(assets.values_list("period_label", flat=True))
        asset = assets.filter(period_label=period_label).first() if period_label else assets.first()
        if asset is None:
            return Response({"error": "No asset found for the given period"}, status=404)

        try:
            if state_code:
                stats_obj = RasterStateStats.objects.get(
                    raster_asset=asset, state__code=state_code
                )
            else:
                stats_obj = RasterDistrictStats.objects.get(
                    raster_asset=asset, district__code=district_code
                )
        except (RasterStateStats.DoesNotExist, RasterDistrictStats.DoesNotExist):
            return Response({"error": "No stats available for this region"}, status=404)

        payload = _build_stats_payload(stats_obj, asset, available_periods)
        serializer = RegionStatsSerializer(payload)
        return Response(serializer.data)


class Echo:
    """A write-compatible object for StreamingHttpResponse."""
    def write(self, value):
        return value


class StatsExportView(APIView):
    def get(self, request):
        layer_slug = request.query_params.get("layer_slug")
        state_code = request.query_params.get("state_code")
        district_code = request.query_params.get("district_code")
        period_label = request.query_params.get("period_label")
        scope = request.query_params.get("scope", "region")

        if not layer_slug:
            return Response({"error": "layer_slug is required"}, status=400)

        assets = _get_assets(layer_slug)
        if not assets.exists():
            return Response({"error": "Layer not found or has no assets"}, status=404)

        stat_fields = ["mean", "min", "max", "std", "median", "p25", "p75", "p95", "count", "sum", "cv"]

        if scope == "all":
            is_district = bool(district_code)
            rows = self._rows_all(assets, is_district, stat_fields, layer_slug)
            filename = f"stats_all_{'districts' if is_district else 'states'}_{layer_slug}.csv"
        else:
            if not state_code and not district_code:
                return Response({"error": "state_code or district_code is required for scope=region"}, status=400)
            rows = self._rows_region(assets, state_code, district_code, period_label, stat_fields)
            region_slug = (state_code or district_code or "region").lower().replace(" ", "_")
            filename = f"stats_{region_slug}_{layer_slug}.csv"

        pseudo_buffer = Echo()
        writer = csv.writer(pseudo_buffer)

        def stream():
            yield writer.writerow(next(rows))  # header row
            for row in rows:
                yield writer.writerow(row)

        response = StreamingHttpResponse(stream(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    def _rows_region(self, assets, state_code, district_code, period_label, stat_fields):
        header = ["name", "code"]
        if district_code:
            header.append("state_name")
        header += stat_fields + ["period_label"]
        yield header

        for asset in assets:
            if period_label and asset.period_label != period_label:
                continue
            try:
                if state_code:
                    s = RasterStateStats.objects.select_related("state").get(
                        raster_asset=asset, state__code=state_code
                    )
                    row = [s.state.name, s.state.code]
                else:
                    s = RasterDistrictStats.objects.select_related("district__state").get(
                        raster_asset=asset, district__code=district_code
                    )
                    row = [s.district.name, s.district.code, s.district.state.name]
                row += [getattr(s, f) for f in stat_fields]
                row.append(asset.period_label or "")
                yield row
            except (RasterStateStats.DoesNotExist, RasterDistrictStats.DoesNotExist):
                continue

    def _rows_all(self, assets, is_district, stat_fields, layer_slug):
        header = ["name", "code"]
        if is_district:
            header.append("state_name")
        header += stat_fields + ["period_label"]
        yield header

        # Latest asset only for "all" scope
        asset = assets.first()
        if asset is None:
            return

        if is_district:
            qs = RasterDistrictStats.objects.filter(
                raster_asset=asset
            ).select_related("district__state").order_by("district__name")
            for s in qs:
                row = [s.district.name, s.district.code, s.district.state.name]
                row += [getattr(s, f) for f in stat_fields]
                row.append(asset.period_label or "")
                yield row
        else:
            qs = RasterStateStats.objects.filter(
                raster_asset=asset
            ).select_related("state").order_by("state__name")
            for s in qs:
                row = [s.state.name, s.state.code]
                row += [getattr(s, f) for f in stat_fields]
                row.append(asset.period_label or "")
                yield row
