import json
from django.contrib.gis.db.models.functions import Transform, Centroid
from django.contrib.gis.db.models import GeometryField
from django.contrib.gis.geos import GEOSGeometry
from django.db.models import Func
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import State, District
from .serializers import (
    StateGeoSerializer,
    DistrictGeoSerializer,
    StateSummarySerializer,
    DistrictSummarySerializer,
)

STATE_SIMPLIFY_TOLERANCE = 0.02     # states need less detail
DISTRICT_SIMPLIFY_TOLERANCE = 0.01  # districts need a bit more detail


class SimplifyPreserveTopology(Func):
    function = "ST_SimplifyPreserveTopology"
    output_field = GeometryField()


def _to_feature_collection(qs, geom_attr, props_fn):
    features = []
    for obj in qs:
        geom = getattr(obj, geom_attr, None) or obj.geometry
        features.append({
            "type": "Feature",
            "geometry": json.loads(geom.json) if geom else None,
            "properties": props_fn(obj),
        })
    return {"type": "FeatureCollection", "features": features}


class StateListView(APIView):
    def get(self, request):
        qs = State.objects.annotate(
            simplified_geom=SimplifyPreserveTopology("geometry", STATE_SIMPLIFY_TOLERANCE)
        )
        return Response(_to_feature_collection(
            qs, "simplified_geom",
            lambda s: {"id": s.id, "name": s.name, "code": s.code},
        ))


class DistrictListView(APIView):
    def get(self, request):
        qs = District.objects.select_related("state").annotate(
            simplified_geom=SimplifyPreserveTopology("geometry", DISTRICT_SIMPLIFY_TOLERANCE)
        )
        state_code = request.query_params.get("state")
        if state_code:
            qs = qs.filter(state__code=state_code)
        return Response(_to_feature_collection(
            qs, "simplified_geom",
            lambda d: {"id": d.id, "name": d.name, "code": d.code,
                       "state_name": d.state.name, "state_code": d.state.code},
        ))


class RegionSearchView(APIView):
    def get(self, request):
        q = request.query_params.get("q", "").strip()
        if len(q) < 2:
            return Response({"states": [], "districts": []})

        states = State.objects.filter(name__icontains=q)[:5]
        districts = District.objects.filter(name__icontains=q).select_related("state")[:10]

        return Response({
            "states": StateSummarySerializer(states, many=True).data,
            "districts": DistrictSummarySerializer(districts, many=True).data,
        })
