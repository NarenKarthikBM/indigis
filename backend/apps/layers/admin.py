from django.contrib import admin
from .models import Layer, LayerCategory, RasterAsset, UploadTask, VectorLayer, VectorFeature


class RasterAssetInline(admin.TabularInline):
    model = RasterAsset
    extra = 0


@admin.register(LayerCategory)
class LayerCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "overlay_type"]
    list_filter = ["overlay_type"]
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Layer)
class LayerAdmin(admin.ModelAdmin):
    list_display = ["label", "slug", "category", "layer_type", "is_active"]
    list_filter = ["category__overlay_type", "layer_type", "is_active"]
    search_fields = ["label", "slug"]
    ordering = ["id"]
    inlines = [RasterAssetInline]


@admin.register(VectorLayer)
class VectorLayerAdmin(admin.ModelAdmin):
    list_display = ["layer", "geometry_type", "min_zoom", "max_zoom"]


@admin.register(UploadTask)
class UploadTaskAdmin(admin.ModelAdmin):
    list_display = ["id", "status", "stage", "progress", "file_type", "nc_variable", "created_by", "created_at"]
    list_filter = ["status", "file_type"]
    readonly_fields = ["id", "created_at", "updated_at"]
    search_fields = ["id", "nc_variable", "error_message"]
