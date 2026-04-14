from django.db import models


class RasterStateStats(models.Model):
    raster_asset = models.ForeignKey(
        "layers.RasterAsset",
        on_delete=models.CASCADE,
        related_name="state_stats",
    )
    state = models.ForeignKey(
        "boundaries.State",
        on_delete=models.CASCADE,
        related_name="raster_stats",
    )
    mean = models.FloatField(null=True)
    min = models.FloatField(null=True)
    max = models.FloatField(null=True)
    std = models.FloatField(null=True)
    variance = models.FloatField(null=True)
    median = models.FloatField(null=True)
    p25 = models.FloatField(null=True)
    p75 = models.FloatField(null=True)
    p95 = models.FloatField(null=True)
    count = models.BigIntegerField(null=True)
    sum = models.FloatField(null=True)
    cv = models.FloatField(null=True)
    histogram = models.JSONField(null=True)  # {"bins": [...], "counts": [...]}
    computed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("raster_asset", "state")]

    def __str__(self):
        return f"{self.raster_asset} / {self.state}"


class RasterDistrictStats(models.Model):
    raster_asset = models.ForeignKey(
        "layers.RasterAsset",
        on_delete=models.CASCADE,
        related_name="district_stats",
    )
    district = models.ForeignKey(
        "boundaries.District",
        on_delete=models.CASCADE,
        related_name="raster_stats",
    )
    mean = models.FloatField(null=True)
    min = models.FloatField(null=True)
    max = models.FloatField(null=True)
    std = models.FloatField(null=True)
    variance = models.FloatField(null=True)
    median = models.FloatField(null=True)
    p25 = models.FloatField(null=True)
    p75 = models.FloatField(null=True)
    p95 = models.FloatField(null=True)
    count = models.BigIntegerField(null=True)
    sum = models.FloatField(null=True)
    cv = models.FloatField(null=True)
    histogram = models.JSONField(null=True)  # {"bins": [...], "counts": [...]}
    computed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("raster_asset", "district")]

    def __str__(self):
        return f"{self.raster_asset} / {self.district}"
