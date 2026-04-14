import uuid

from django.db import models


class DataSource(models.Model):
    SOURCE_GEE = "gee"
    SOURCE_CHIRPS = "chirps"
    SOURCE_WDPA = "wdpa"
    SOURCE_OSM = "osm"
    SOURCE_IMD = "imd"
    SOURCE_OPENTOPO = "opentopo"
    SOURCE_STAC = "stac"
    SOURCE_EARTHACCESS = "earthaccess"
    SOURCE_CDS = "cds"
    SOURCE_TYPE_CHOICES = [
        (SOURCE_GEE, "GEE"),
        (SOURCE_CHIRPS, "CHIRPS"),
        (SOURCE_WDPA, "WDPA"),
        (SOURCE_OSM, "OSM"),
        (SOURCE_IMD, "IMD"),
        (SOURCE_OPENTOPO, "OpenTopography"),
        (SOURCE_STAC, "STAC Catalogue"),
        (SOURCE_EARTHACCESS, "NASA Earthaccess"),
        (SOURCE_CDS, "Copernicus Data Store"),
    ]

    slug = models.SlugField(unique=True)
    label = models.CharField(max_length=100)
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPE_CHOICES)
    layer = models.ForeignKey(
        "layers.Layer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="data_sources",
    )
    fetch_schedule = models.CharField(max_length=100, blank=True)
    last_fetched_at = models.DateTimeField(null=True, blank=True)
    next_fetch_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    config = models.JSONField(default=dict)

    class Meta:
        ordering = ["label"]

    def __str__(self):
        return f"{self.label} ({self.source_type})"


class MiningJob(models.Model):
    STATUS_PENDING = "pending"
    STATUS_RUNNING = "running"
    STATUS_DONE = "done"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_RUNNING, "Running"),
        (STATUS_DONE, "Done"),
        (STATUS_FAILED, "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name="jobs")
    layer = models.ForeignKey(
        "layers.Layer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mining_jobs",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    cog_url = models.CharField(max_length=500, null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    bytes_written = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.source.slug} [{self.status}] {self.period_start}–{self.period_end}"
