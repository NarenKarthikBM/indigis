from django.contrib.gis.db import models as gis_models
from django.db import models
from django.db.models import Index


class LayerCategory(models.Model):
    OVERLAY_CORE = "core"
    OVERLAY_COMMUNITY = "community"
    OVERLAY_CHOICES = [(OVERLAY_CORE, "Core"), (OVERLAY_COMMUNITY, "Community")]

    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=100)
    overlay_type = models.CharField(max_length=20, choices=OVERLAY_CHOICES)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["overlay_type", "name"]
        verbose_name_plural = "layer categories"

    def __str__(self):
        return f"{self.name} ({self.overlay_type})"


class Layer(models.Model):
    TYPE_RASTER = "raster"
    TYPE_VECTOR = "vector"
    TYPE_CHOICES = [(TYPE_RASTER, "Raster"), (TYPE_VECTOR, "Vector")]

    TEMPORAL_STATIC = "static"
    TEMPORAL_ANNUAL = "annual"
    TEMPORAL_MONTHLY = "monthly"
    TEMPORAL_CHOICES = [
        (TEMPORAL_STATIC, "Static"),
        (TEMPORAL_ANNUAL, "Annual"),
        (TEMPORAL_MONTHLY, "Monthly"),
    ]

    slug = models.SlugField(unique=True)
    label = models.CharField(max_length=100)
    category = models.ForeignKey(
        LayerCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="layers",
    )
    layer_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_RASTER)
    temporal_type = models.CharField(max_length=20, choices=TEMPORAL_CHOICES, default=TEMPORAL_STATIC)
    default_colormap = models.JSONField(default=dict, blank=True)
    min_value = models.FloatField(null=True, blank=True)
    max_value = models.FloatField(null=True, blank=True)
    description = models.TextField(blank=True)
    data_source = models.CharField(max_length=200, blank=True)
    resolution = models.CharField(max_length=50, blank=True)
    temporal_coverage = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # Metadata fields populated during COG ingestion
    spatial_resolution_m = models.FloatField(null=True, blank=True)
    native_crs = models.CharField(max_length=50, blank=True)
    bbox = models.JSONField(null=True, blank=True)  # {minx, miny, maxx, maxy}
    band_count = models.IntegerField(null=True, blank=True)
    pixel_dtype = models.CharField(max_length=50, blank=True)
    date_start = models.DateField(null=True, blank=True)
    date_end = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["label"]

    def __str__(self):
        return self.label


class RasterAsset(models.Model):
    SOURCE_BOT = "bot"
    SOURCE_USER = "user"
    SOURCE_SYSTEM = "system"
    SOURCE_CHOICES = [(SOURCE_BOT, "Bot"), (SOURCE_USER, "User"), (SOURCE_SYSTEM, "System")]

    layer = models.ForeignKey(Layer, on_delete=models.CASCADE, related_name="raster_assets")
    cog_url = models.CharField(max_length=500)
    period_label = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    parameters = models.JSONField(default=dict, blank=True)
    data_period_start = models.DateField(null=True, blank=True)
    data_period_end = models.DateField(null=True, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_USER)
    mining_job = models.ForeignKey(
        "mining.MiningJob",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="raster_assets",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.layer.label} — {self.period_label or self.created_at}"


class VectorLayer(models.Model):
    layer = models.OneToOneField(Layer, on_delete=models.CASCADE, related_name="vector_layer")
    geometry_type = models.CharField(max_length=50)
    min_zoom = models.IntegerField(default=5)
    max_zoom = models.IntegerField(default=18)
    default_style = models.JSONField(default=dict, blank=True)
    source_attribution = models.CharField(max_length=200, blank=True)

    def __str__(self):
        return f"VectorLayer: {self.layer.label}"


class VectorFeature(models.Model):
    layer = models.ForeignKey(VectorLayer, on_delete=models.CASCADE, related_name="features")
    geometry = gis_models.GeometryField(srid=4326)
    properties = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [
            Index(fields=["layer"]),
        ]
