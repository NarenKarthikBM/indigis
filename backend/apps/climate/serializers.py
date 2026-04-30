"""Serializers for the climate risk API."""
from rest_framework import serializers

from apps.climate.services import ETCCDI_INDICES


class ETCCDIIndexSerializer(serializers.Serializer):
    name = serializers.CharField()
    label = serializers.CharField()
    units = serializers.CharField()
    description = serializers.CharField()
    tier = serializers.IntegerField()
    colormap = serializers.CharField()
    has_trend = serializers.BooleanField()
    has_gev = serializers.BooleanField()
    available_years = serializers.ListField(child=serializers.IntegerField())


class ChoroplethFeaturePropertiesSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    state = serializers.CharField()
    value = serializers.FloatField(allow_null=True)
    parameters = serializers.DictField()


class TimeSeriesPointSerializer(serializers.Serializer):
    year = serializers.IntegerField()
    value = serializers.FloatField(allow_null=True)


class TrendSerializer(serializers.Serializer):
    slope = serializers.FloatField(allow_null=True)
    p_value = serializers.FloatField(allow_null=True)
    units = serializers.CharField()
    period = serializers.ListField(child=serializers.IntegerField())


class ReturnPeriodSerializer(serializers.Serializer):
    rp_10 = serializers.FloatField(allow_null=True)
    rp_25 = serializers.FloatField(allow_null=True)
    rp_50 = serializers.FloatField(allow_null=True)
    rp_100 = serializers.FloatField(allow_null=True)


class GEVParamsSerializer(serializers.Serializer):
    """Fitted GEV distribution parameters for a district's annual time series."""
    loc = serializers.FloatField()
    scale = serializers.FloatField()
    shape = serializers.FloatField()
    n_years = serializers.IntegerField()
    period_start = serializers.IntegerField()
    period_end = serializers.IntegerField()


class IndexProfileSerializer(serializers.Serializer):
    time_series = TimeSeriesPointSerializer(many=True)
    trend = TrendSerializer(allow_null=True)
    return_periods = ReturnPeriodSerializer(allow_null=True)
    gev_params = GEVParamsSerializer(allow_null=True)
    latest_value = serializers.FloatField(allow_null=True)
    units = serializers.CharField()


class DistrictSummarySerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    state_name = serializers.CharField()
    state_code = serializers.CharField()


class DistrictProfileSerializer(serializers.Serializer):
    district = DistrictSummarySerializer()
    indices = serializers.DictField(child=IndexProfileSerializer())


class RankingRowSerializer(serializers.Serializer):
    rank = serializers.IntegerField()
    district_code = serializers.CharField()
    district_name = serializers.CharField()
    state_name = serializers.CharField()
    value = serializers.FloatField(allow_null=True)
