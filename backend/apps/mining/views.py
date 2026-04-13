from rest_framework import generics, status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DataSource, MiningJob
from .serializers import DataSourceDetailSerializer, DataSourceListSerializer, MiningJobSerializer

# Slug → task name for sources that have a dedicated task (non-parametric).
_TASK_MAP = {
    "chirps": "apps.mining.tasks.mine_chirps",
    "wdpa": "apps.mining.tasks.mine_wdpa",
    "osm-transport": "apps.mining.tasks.mine_osm_transport",
    "worldcover": "apps.mining.tasks.mine_worldcover",
}


class DataSourceListView(generics.ListAPIView):
    queryset = DataSource.objects.all()
    serializer_class = DataSourceListSerializer


class DataSourceDetailView(generics.RetrieveAPIView):
    queryset = DataSource.objects.all()
    serializer_class = DataSourceDetailSerializer
    lookup_field = "slug"


class TriggerMiningView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, slug):
        try:
            ds = DataSource.objects.get(slug=slug)
        except DataSource.DoesNotExist:
            return Response({"error": f"DataSource '{slug}' not found."}, status=status.HTTP_404_NOT_FOUND)

        from celery import current_app

        # OpenTopography sources share one parametric task
        if ds.source_type == DataSource.SOURCE_OPENTOPO:
            current_app.send_task(
                "apps.mining.tasks.mine_opentopo_dems",
                kwargs={"slug": slug},
                queue="mining",
            )
            return Response({"status": "queued", "source": slug}, status=status.HTTP_202_ACCEPTED)

        # STAC sources share one parametric task
        if ds.source_type == DataSource.SOURCE_STAC:
            current_app.send_task(
                "apps.mining.tasks.mine_stac_sources",
                kwargs={"slug": slug},
                queue="mining",
            )
            return Response({"status": "queued", "source": slug}, status=status.HTTP_202_ACCEPTED)

        # NASA Earthaccess sources share one parametric task
        if ds.source_type == DataSource.SOURCE_EARTHACCESS:
            current_app.send_task(
                "apps.mining.tasks.mine_earthaccess_sources",
                kwargs={"slug": slug},
                queue="mining",
            )
            return Response({"status": "queued", "source": slug}, status=status.HTTP_202_ACCEPTED)

        task_name = _TASK_MAP.get(slug)
        if task_name is None:
            return Response(
                {"error": f"No task registered for source '{slug}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        current_app.send_task(task_name, queue="mining")
        return Response({"status": "queued", "source": slug}, status=status.HTTP_202_ACCEPTED)


class MiningJobListView(generics.ListAPIView):
    serializer_class = MiningJobSerializer

    def get_queryset(self):
        return MiningJob.objects.select_related("source", "layer").order_by("-created_at")[:50]


class MiningJobDetailView(generics.RetrieveAPIView):
    queryset = MiningJob.objects.select_related("source", "layer")
    serializer_class = MiningJobSerializer
    lookup_field = "id"
