from django.contrib.gis.db import models


class State(models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=10, unique=True)
    geometry = models.MultiPolygonField(srid=4326)
    centroid = models.PointField(srid=4326, null=True, blank=True)
    area_km2 = models.FloatField(null=True, blank=True)
    properties = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.geometry and not self.centroid:
            self.centroid = self.geometry.centroid
        super().save(*args, **kwargs)


class District(models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)
    state = models.ForeignKey(State, on_delete=models.CASCADE, related_name="districts")
    geometry = models.MultiPolygonField(srid=4326)
    centroid = models.PointField(srid=4326, null=True, blank=True)
    area_km2 = models.FloatField(null=True, blank=True)
    properties = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["name"]
        unique_together = [("code", "state")]

    def __str__(self):
        return f"{self.name}, {self.state.name}"

    def save(self, *args, **kwargs):
        if self.geometry and not self.centroid:
            self.centroid = self.geometry.centroid
        super().save(*args, **kwargs)
