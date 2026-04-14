from django.contrib import admin

from .models import RasterDistrictStats, RasterStateStats


@admin.register(RasterStateStats)
class RasterStateStatsAdmin(admin.ModelAdmin):
    list_display = ("raster_asset", "state", "mean", "min", "max", "computed_at")
    list_filter = ("state",)
    raw_id_fields = ("raster_asset", "state")


@admin.register(RasterDistrictStats)
class RasterDistrictStatsAdmin(admin.ModelAdmin):
    list_display = ("raster_asset", "district", "mean", "min", "max", "computed_at")
    list_filter = ("district__state",)
    raw_id_fields = ("raster_asset", "district")
