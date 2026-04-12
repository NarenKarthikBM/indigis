from django.contrib import admin
from .models import Layer, LayerCategory, RasterAsset, VectorLayer, VectorFeature


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
    inlines = [RasterAssetInline]


@admin.register(VectorLayer)
class VectorLayerAdmin(admin.ModelAdmin):
    list_display = ["layer", "geometry_type", "min_zoom", "max_zoom"]
