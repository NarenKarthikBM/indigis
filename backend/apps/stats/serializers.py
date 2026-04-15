from rest_framework import serializers


class RegionStatsSerializer(serializers.Serializer):
    layer_slug = serializers.CharField()
    layer_label = serializers.CharField()
    period_label = serializers.CharField(allow_null=True)
    available_periods = serializers.ListField(child=serializers.CharField())
    mean = serializers.FloatField(allow_null=True)
    min = serializers.FloatField(allow_null=True)
    max = serializers.FloatField(allow_null=True)
    std = serializers.FloatField(allow_null=True)
    median = serializers.FloatField(allow_null=True)
    p25 = serializers.FloatField(allow_null=True)
    p75 = serializers.FloatField(allow_null=True)
    p95 = serializers.FloatField(allow_null=True)
    count = serializers.IntegerField(allow_null=True)
    sum = serializers.FloatField(allow_null=True)
    cv = serializers.FloatField(allow_null=True)
    histogram = serializers.JSONField(allow_null=True)
