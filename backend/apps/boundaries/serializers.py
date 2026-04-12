from rest_framework_gis.serializers import GeoFeatureModelSerializer
from rest_framework import serializers
from .models import State, District


class StateGeoSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = State
        geo_field = "geometry"
        fields = ["id", "name", "code", "area_km2", "centroid"]


class StateSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = State
        fields = ["id", "name", "code", "area_km2"]


class DistrictGeoSerializer(GeoFeatureModelSerializer):
    state_name = serializers.CharField(source="state.name", read_only=True)
    state_code = serializers.CharField(source="state.code", read_only=True)

    class Meta:
        model = District
        geo_field = "geometry"
        fields = ["id", "name", "code", "state_name", "state_code", "area_km2", "centroid"]


class DistrictSummarySerializer(serializers.ModelSerializer):
    state_name = serializers.CharField(source="state.name", read_only=True)

    class Meta:
        model = District
        fields = ["id", "name", "code", "state_name", "area_km2"]
