import os
import shutil
import uuid
from datetime import date

from django.conf import settings
from django.db import connection
from django.utils.text import slugify
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import Layer, LayerCategory, RasterAsset, UploadTask, VectorLayer
from .serializers import LayerCategorySerializer, LayerSerializer, UploadTaskSerializer
from . import services


def build_titiler_url(cog_url, colormap="viridis", rescale=None, titiler_base=None, band_count=1, bidx=None):
    base = titiler_base or settings.TITILER_PUBLIC_URL
    url = f"{base}/cog/tiles/WebMercatorQuad/{{z}}/{{x}}/{{y}}.png?url={cog_url}"
    if bidx:
        # Explicit band selection
        for b in bidx:
            url += f"&bidx={b}"
        if len(bidx) == 1:
            url += f"&colormap_name={colormap}"
            if rescale:
                url += f"&rescale={rescale}"
        else:
            if rescale:
                for _ in bidx:
                    url += f"&rescale={rescale}"
    elif band_count and band_count >= 3:
        # Multi-band: render as RGB (first 3 bands)
        url += "&bidx=1&bidx=2&bidx=3"
        if rescale:
            url += f"&rescale={rescale}&rescale={rescale}&rescale={rescale}"
    else:
        # Single-band or multi-band shown as colormap — always select band 1
        # so TiTiler doesn't receive a multi-band source with a colormap applied.
        url += "&bidx=1"
        url += f"&colormap_name={colormap}"
        if rescale:
            url += f"&rescale={rescale}"
    return url


class LayerCategoryListView(APIView):
    def get(self, request):
        categories = LayerCategory.objects.all()
        serializer = LayerCategorySerializer(categories, many=True)
        return Response(serializer.data)


class LayerListView(APIView):
    def get(self, request):
        layers = Layer.objects.filter(is_active=True).select_related("category").prefetch_related("raster_assets")
        serializer = LayerSerializer(layers, many=True)
        return Response(serializer.data)


class LayerDetailView(APIView):
    def get(self, request, slug):
        try:
            layer = Layer.objects.select_related("category").prefetch_related("raster_assets").get(slug=slug, is_active=True)
        except Layer.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(LayerSerializer(layer).data)


class TileURLView(APIView):
    def get(self, request, slug):
        try:
            layer = Layer.objects.get(slug=slug, is_active=True)
        except Layer.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if layer.layer_type != "raster":
            return Response({"detail": "Not a raster layer."}, status=status.HTTP_400_BAD_REQUEST)

        period_label = request.query_params.get("period_label")
        if period_label:
            asset = layer.raster_assets.filter(period_label=period_label).first()
            if not asset:
                return Response(
                    {"detail": f"No asset with period_label '{period_label}'."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            # Prefer most-recent data period; fall back to creation time for assets
            # without data_period_end (e.g. user-uploaded single assets).
            asset = layer.raster_assets.order_by("-data_period_end", "-created_at").first()

        if not asset:
            return Response({"detail": "No raster asset found."}, status=status.HTTP_404_NOT_FOUND)

        colormap = request.query_params.get("colormap")
        if not colormap:
            colormap = layer.default_colormap.get("name", "viridis")

        rescale = request.query_params.get("rescale")
        if not rescale: 
            if asset.min_value is not None and asset.max_value is not None:
                rescale = f"{asset.min_value},{asset.max_value}"
            if layer.min_value is not None and layer.max_value is not None:
                rescale = f"{layer.min_value},{layer.max_value}"

        bidx_raw = request.query_params.get("bidx")
        bidx = None
        if bidx_raw:
            try:
                bidx = [int(b) for b in bidx_raw.split(",")]
            except ValueError:
                return Response({"detail": "Invalid bidx parameter."}, status=status.HTTP_400_BAD_REQUEST)

        tile_url = build_titiler_url(
            cog_url=asset.cog_url,
            colormap=colormap,
            rescale=rescale,
            band_count=layer.band_count or 1,
            bidx=bidx,
        )

        return Response({
            "tile_url": tile_url,
            "colormap": colormap,
            "min_value": layer.min_value,
            "max_value": layer.max_value,
            "label": layer.label,
        })


class RasterInspectView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "file is required."}, status=400)

        tmp_path = f"/tmp/inspect_{uuid.uuid4().hex}.tif"
        try:
            with open(tmp_path, "wb") as f:
                for chunk in file.chunks():
                    f.write(chunk)
            meta = services.extract_raster_metadata(tmp_path)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=400)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

        # Serialize date objects to ISO strings
        if meta.get("date_start"):
            meta["date_start"] = meta["date_start"].isoformat()
        if meta.get("date_end"):
            meta["date_end"] = meta["date_end"].isoformat()

        return Response(meta, status=200)


class RasterUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get("file")
        label = request.data.get("label", "").strip()
        overlay_type = request.data.get("overlay_type", "").strip()
        category_slug = request.data.get("category_slug", "").strip()
        category_name = request.data.get("category_name", "").strip()
        colormap_name = request.data.get("colormap_name", "viridis").strip()
        description = request.data.get("description", "").strip()
        date_start_raw = request.data.get("date_start", "").strip()
        date_end_raw = request.data.get("date_end", "").strip()

        # Validate required fields
        if not file:
            return Response({"detail": "file is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not label:
            return Response({"detail": "label is required."}, status=status.HTTP_400_BAD_REQUEST)
        if overlay_type not in ("core", "community"):
            return Response({"detail": "overlay_type must be 'core' or 'community'."}, status=status.HTTP_400_BAD_REQUEST)

        # Resolve category
        if category_slug:
            try:
                category = LayerCategory.objects.get(slug=category_slug)
            except LayerCategory.DoesNotExist:
                return Response({"detail": f"Category '{category_slug}' not found."}, status=status.HTTP_404_NOT_FOUND)
        elif category_name:
            derived_slug = slugify(category_name)
            category, _ = LayerCategory.objects.get_or_create(
                slug=derived_slug,
                defaults={"name": category_name, "overlay_type": overlay_type},
            )
        else:
            return Response({"detail": "Provide category_slug or category_name."}, status=status.HTTP_400_BAD_REQUEST)

        # Build a unique layer slug
        layer_slug = slugify(label)
        if Layer.objects.filter(slug=layer_slug).exists():
            layer_slug = f"{layer_slug}-{str(uuid.uuid4())[:6]}"

        tmp_path = f"/tmp/{layer_slug}_raw.tif"
        cog_dir = getattr(settings, "COG_STORAGE_PATH", "/app/media/cogs")
        cog_path = os.path.join(cog_dir, f"{layer_slug}.tif")

        try:
            # Write uploaded file to temp path
            with open(tmp_path, "wb") as f:
                for chunk in file.chunks():
                    f.write(chunk)

            # Extract metadata
            metadata = services.extract_raster_metadata(tmp_path)

            # Convert to COG
            os.makedirs(cog_dir, exist_ok=True)
            services.convert_to_cog(tmp_path, cog_path)

            # Clean up temp file
            os.unlink(tmp_path)

            # Manual date overrides take precedence over TIFF-extracted dates
            try:
                if date_start_raw:
                    metadata["date_start"] = date.fromisoformat(date_start_raw)
                if date_end_raw:
                    metadata["date_end"] = date.fromisoformat(date_end_raw)
            except ValueError:
                pass  # invalid date string — keep whatever was extracted

            # Create Layer and RasterAsset
            layer = Layer.objects.create(
                slug=layer_slug,
                label=label,
                category=category,
                layer_type="raster",
                default_colormap={"name": colormap_name},
                description=description,
                data_source="user_upload",
                **metadata,
            )
            from . import services as layer_services
            layer_services.create_raster_asset_and_queue_stats(
                layer=layer,
                cog_url=f"/data/cogs/{layer_slug}.tif",
            )

        except Exception as exc:
            # Clean up on failure
            for path in (tmp_path, cog_path):
                if os.path.exists(path):
                    os.unlink(path)
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(LayerSerializer(layer).data, status=status.HTTP_201_CREATED)


class RasterUploadAsyncView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        from .tasks import process_raster_upload

        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "file is required."}, status=status.HTTP_400_BAD_REQUEST)

        tmp_dir = getattr(settings, "UPLOAD_TMP_PATH", "/tmp")
        os.makedirs(tmp_dir, exist_ok=True)
        stable_path = os.path.join(tmp_dir, f"upload_{uuid.uuid4().hex}.tif")

        # Use shutil.move for large files that Django already spooled to disk
        if hasattr(file, "temporary_file_path"):
            shutil.move(file.temporary_file_path(), stable_path)
        else:
            with open(stable_path, "wb") as f:
                for chunk in file.chunks():
                    f.write(chunk)

        metadata_json = {
            "label": request.data.get("label", os.path.basename(file.name)).strip(),
            "overlay_type": request.data.get("overlay_type", "community"),
            "category_slug": request.data.get("category_slug", ""),
            "category_name": request.data.get("category_name", ""),
            "colormap_name": request.data.get("colormap_name", "viridis"),
            "description": request.data.get("description", ""),
            "date_start": request.data.get("date_start", ""),
            "date_end": request.data.get("date_end", ""),
        }

        task = UploadTask.objects.create(
            file_path=stable_path,
            file_type=UploadTask.FILE_TYPE_TIFF,
            metadata_json=metadata_json,
            created_by=request.user if request.user.is_authenticated else None,
        )

        process_raster_upload.delay(str(task.id))
        return Response({"task_id": str(task.id)}, status=status.HTTP_202_ACCEPTED)


class NetCDFInspectView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "file is required."}, status=status.HTTP_400_BAD_REQUEST)

        tmp_dir = getattr(settings, "UPLOAD_TMP_PATH", "/tmp")
        os.makedirs(tmp_dir, exist_ok=True)
        tmp_nc_path = os.path.join(tmp_dir, f"nc_{uuid.uuid4().hex}.nc")

        if hasattr(file, "temporary_file_path"):
            shutil.move(file.temporary_file_path(), tmp_nc_path)
        else:
            with open(tmp_nc_path, "wb") as f:
                for chunk in file.chunks():
                    f.write(chunk)

        try:
            variables = services.inspect_netcdf(tmp_nc_path)
        except Exception as exc:
            if os.path.exists(tmp_nc_path):
                os.unlink(tmp_nc_path)
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"tmp_nc_path": tmp_nc_path, "variables": variables})


class NetCDFUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request):
        from .tasks import process_netcdf_variable

        tmp_nc_path = request.data.get("tmp_nc_path", "")
        variables = request.data.get("variables", [])
        metadata = request.data.get("metadata", {})

        tmp_dir = getattr(settings, "UPLOAD_TMP_PATH", "/tmp")
        if not tmp_nc_path.startswith(tmp_dir):
            return Response({"detail": "Invalid tmp_nc_path."}, status=status.HTTP_400_BAD_REQUEST)
        if not os.path.exists(tmp_nc_path):
            return Response({"detail": "File not found. Re-upload the .nc file."}, status=status.HTTP_400_BAD_REQUEST)
        if not variables:
            return Response({"detail": "At least one variable is required."}, status=status.HTTP_400_BAD_REQUEST)

        tasks_created = []
        for variable in variables:
            task = UploadTask.objects.create(
                file_path=tmp_nc_path,
                file_type=UploadTask.FILE_TYPE_NC,
                nc_variable=variable,
                metadata_json=metadata,
                created_by=request.user if request.user.is_authenticated else None,
            )
            process_netcdf_variable.delay(str(task.id))
            tasks_created.append({"variable": variable, "task_id": str(task.id)})

        return Response({"tasks": tasks_created}, status=status.HTTP_202_ACCEPTED)


class UploadTaskStatusView(APIView):
    def get(self, request, task_id):
        try:
            task = UploadTask.objects.select_related("layer").get(pk=task_id)
        except UploadTask.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(UploadTaskSerializer(task).data)


class VectorTileView(APIView):
    def get(self, request, slug, z, x, y):
        try:
            vector_layer = VectorLayer.objects.select_related("layer").get(layer__slug=slug)
        except VectorLayer.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if z < vector_layer.min_zoom:
            return Response(b"", content_type="application/x-protobuf", status=200)

        sql = """
            SELECT ST_AsMVT(q, %s, 4096, 'geom')
            FROM (
                SELECT
                    vf.id,
                    vf.properties,
                    ST_AsMVTGeom(
                        ST_Transform(vf.geometry, 3857),
                        ST_TileEnvelope(%s, %s, %s),
                        4096, 64, true
                    ) AS geom
                FROM layers_vectorfeature vf
                WHERE vf.layer_id = %s
                  AND ST_Intersects(
                      vf.geometry,
                      ST_Transform(ST_TileEnvelope(%s, %s, %s), 4326)
                  )
            ) q
        """

        from django.http import HttpResponse

        with connection.cursor() as cursor:
            cursor.execute(sql, [slug, z, x, y, vector_layer.id, z, x, y])
            row = cursor.fetchone()

        tile_data = bytes(row[0]) if row and row[0] else b""
        return HttpResponse(tile_data, content_type="application/x-protobuf")
