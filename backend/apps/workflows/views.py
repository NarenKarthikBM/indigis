import json
import os
import uuid

from django.contrib.gis.geos import GEOSGeometry
from django.utils.text import slugify
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from .executor import execute_graph, WorkflowError
from .models import Workflow, WorkflowRun
from .serializers import WorkflowSerializer


class WorkflowListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        workflows = Workflow.objects.filter(owner=request.user)
        serializer = WorkflowSerializer(workflows, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = WorkflowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(owner=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkflowDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_workflow(self, pk, user):
        try:
            wf = Workflow.objects.get(pk=pk)
        except Workflow.DoesNotExist:
            return None
        if wf.owner != user:
            return None
        return wf

    def get(self, request, pk):
        wf = self._get_workflow(pk, request.user)
        if not wf:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(WorkflowSerializer(wf).data)

    def put(self, request, pk):
        wf = self._get_workflow(pk, request.user)
        if not wf:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = WorkflowSerializer(wf, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        wf = self._get_workflow(pk, request.user)
        if not wf:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        wf.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkflowExecuteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        nodes = request.data.get("nodes", [])
        edges = request.data.get("edges", [])
        workflow_id = request.data.get("workflow_id")

        if not nodes:
            return Response(
                {"detail": "No nodes provided.", "status": "failed"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create a WorkflowRun record if linked to a saved workflow
        run = None
        if workflow_id:
            try:
                workflow = Workflow.objects.get(pk=workflow_id, owner=request.user)
                run = WorkflowRun.objects.create(
                    workflow=workflow,
                    executed_by=request.user,
                    status="running",
                    graph_snapshot={"nodes": nodes, "edges": edges},
                )
            except Workflow.DoesNotExist:
                pass  # proceed without recording the run

        try:
            result = execute_graph(nodes, edges)
        except WorkflowError as exc:
            if run:
                run.status = "failed"
                run.error_message = str(exc)
                run.failed_node_id = exc.failed_node_id or ""
                run.save()
            return Response(
                {
                    "status": "failed",
                    "error": str(exc),
                    "failed_node_id": exc.failed_node_id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            if run:
                run.status = "failed"
                run.error_message = str(exc)
                run.save()
            return Response(
                {"status": "failed", "error": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if result is None:
            if run:
                run.status = "failed"
                run.error_message = "Workflow produced no output."
                run.save()
            return Response(
                {"status": "failed", "error": "Workflow produced no output."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result_type = result.get("result_type") or result.get("type")

        if result_type == "raster":
            response_data = {
                "status": "completed",
                "result_type": "raster",
                "tile_url": result.get("tile_url"),
                "bbox": result.get("bbox"),
                "min_value": result.get("min_value"),
                "max_value": result.get("max_value"),
            }
        elif result_type == "vector":
            response_data = {
                "status": "completed",
                "result_type": "vector",
                "geojson": result.get("geojson"),
                "bbox": result.get("bbox"),
            }
        else:
            if run:
                run.status = "failed"
                run.error_message = f"Unknown result type: {result_type}"
                run.save()
            return Response(
                {"status": "failed", "error": f"Unknown result type: {result_type}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Record successful run
        if run:
            run.status = "completed"
            run.result = response_data
            run.save()

        return Response(response_data)


class SaveAsLayerView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        from django.conf import settings as django_settings
        from apps.layers.models import Layer, RasterAsset, VectorLayer, VectorFeature
        from apps.layers.serializers import LayerSerializer
        from apps.layers import services as layer_services

        # Get the workflow
        try:
            workflow = Workflow.objects.get(pk=pk, owner=request.user)
        except Workflow.DoesNotExist:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)

        # Get the latest completed run
        run = workflow.runs.filter(status="completed").first()
        if not run or not run.result:
            return Response(
                {"detail": "No completed run found. Execute the workflow first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        name = request.data.get("name", "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)

        colormap = request.data.get("colormap", "viridis")
        result_data = run.result
        result_type = result_data.get("result_type")

        layer_slug = slugify(name)
        if Layer.objects.filter(slug=layer_slug).exists():
            layer_slug = f"{layer_slug}-{str(uuid.uuid4())[:6]}"

        try:
            if result_type == "raster":
                layer = self._save_raster_layer(
                    name, layer_slug, colormap, result_data, layer_services, django_settings,
                    Layer, RasterAsset,
                )
            elif result_type == "vector":
                layer = self._save_vector_layer(
                    name, layer_slug, result_data,
                    Layer, VectorLayer, VectorFeature,
                )
            else:
                return Response(
                    {"detail": f"Unsupported result type: {result_type}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(LayerSerializer(layer).data, status=status.HTTP_201_CREATED)

    def _save_raster_layer(self, name, slug, colormap, result_data, layer_services, settings,
                           Layer, RasterAsset):
        """Create a Layer + RasterAsset from a workflow raster result."""
        tile_url = result_data.get("tile_url", "")
        # Extract the COG path from the tile_url query parameter
        # tile_url contains ?url=/data/cogs/workflow_results/{uuid}.tif
        cog_url = None
        if "url=" in tile_url:
            cog_url = tile_url.split("url=")[1].split("&")[0]

        if not cog_url:
            raise ValueError("Could not determine COG path from result.")

        # Resolve the actual path on the backend filesystem for metadata extraction
        # TiTiler sees /data/cogs/..., backend sees /cogs/...
        backend_path = cog_url.replace("/data/cogs/", "/cogs/")
        cog_storage = getattr(settings, "COG_STORAGE_PATH", "/cogs")
        if not backend_path.startswith(cog_storage):
            backend_path = os.path.join(cog_storage, backend_path.lstrip("/cogs/"))

        # Extract metadata
        metadata = {}
        if os.path.exists(backend_path):
            try:
                metadata = layer_services.extract_raster_metadata(backend_path)
            except Exception:
                pass

        bbox = metadata.get("bbox") or result_data.get("bbox")
        min_value = metadata.get("min_value") or result_data.get("min_value")
        max_value = metadata.get("max_value") or result_data.get("max_value")

        layer = Layer.objects.create(
            slug=slug,
            label=name,
            layer_type="raster",
            default_colormap={"name": colormap},
            description=f"Generated from workflow",
            data_source="workflow",
            min_value=min_value,
            max_value=max_value,
            bbox=bbox,
            band_count=metadata.get("band_count"),
            pixel_dtype=metadata.get("pixel_dtype", ""),
            native_crs=metadata.get("native_crs", ""),
            spatial_resolution_m=metadata.get("spatial_resolution_m"),
        )
        RasterAsset.objects.create(
            layer=layer,
            cog_url=cog_url,
        )
        return layer

    def _save_vector_layer(self, name, slug, result_data, Layer, VectorLayer, VectorFeature):
        """Create a Layer + VectorLayer + VectorFeatures from a workflow vector result."""
        geojson = result_data.get("geojson")
        if not geojson or not geojson.get("features"):
            raise ValueError("No GeoJSON features in result.")

        # Determine geometry type from first feature
        first_geom_type = geojson["features"][0].get("geometry", {}).get("type", "Geometry")

        layer = Layer.objects.create(
            slug=slug,
            label=name,
            layer_type="vector",
            description=f"Generated from workflow",
            data_source="workflow",
        )

        vector_layer = VectorLayer.objects.create(
            layer=layer,
            geometry_type=first_geom_type,
        )

        for feature in geojson["features"]:
            geom_data = feature.get("geometry")
            if not geom_data:
                continue
            geom = GEOSGeometry(json.dumps(geom_data), srid=4326)
            VectorFeature.objects.create(
                layer=vector_layer,
                geometry=geom,
                properties=feature.get("properties", {}),
            )

        return layer
