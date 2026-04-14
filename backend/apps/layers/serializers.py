from rest_framework import serializers
from .models import Layer, LayerCategory, RasterAsset, UploadTask, VectorLayer


class LayerCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = LayerCategory
        fields = ["slug", "name", "overlay_type", "description"]


class RasterAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = RasterAsset
        fields = ["id", "cog_url", "period_label", "data_period_start", "data_period_end", "created_at"]


class VectorLayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = VectorLayer
        fields = ["geometry_type", "min_zoom", "max_zoom", "default_style", "source_attribution"]


class LayerSerializer(serializers.ModelSerializer):
    raster_assets = RasterAssetSerializer(many=True, read_only=True)
    vector_layer = VectorLayerSerializer(read_only=True)
    category = LayerCategorySerializer(read_only=True)
    category_slug = serializers.SlugRelatedField(
        source="category",
        slug_field="slug",
        queryset=LayerCategory.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Layer
        fields = [
            "id", "slug", "label", "category", "category_slug", "layer_type", "temporal_type",
            "default_colormap", "min_value", "max_value",
            "description", "data_source", "resolution", "temporal_coverage",
            "is_active", "raster_assets", "vector_layer",
            "spatial_resolution_m", "native_crs", "bbox", "band_count", "pixel_dtype",
            "date_start", "date_end",
        ]


class UploadTaskSerializer(serializers.ModelSerializer):
    layer = serializers.SerializerMethodField()
    layer_id = serializers.PrimaryKeyRelatedField(source="layer", read_only=True)

    class Meta:
        model = UploadTask
        fields = [
            "id", "status", "stage", "progress", "error_message",
            "layer_id", "layer", "nc_variable", "created_at",
        ]

    def get_layer(self, obj):
        if obj.status == "done" and obj.layer_id is not None:
            return LayerSerializer(obj.layer).data
        return None
