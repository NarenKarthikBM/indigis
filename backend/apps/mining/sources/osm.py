import logging
import os
import uuid
from datetime import date, timedelta

from .base import BaseMiningSource

logger = logging.getLogger(__name__)


class OSMTransportSource(BaseMiningSource):
    """OSM transport network (monthly snapshot). Stub - real Overpass/PBF fetch wired later."""

    source_slug = "osm-transport"

    def get_periods_to_fetch(self) -> list[tuple[date, date]]:
        """Monthly granularity: one period covering the last gap."""
        from apps.mining.models import MiningJob

        last_done = (
            MiningJob.objects.filter(source__slug=self.source_slug, status="done")
            .order_by("-period_end")
            .first()
        )

        today = date.today()
        start = last_done.period_end if (last_done and last_done.period_end) else today - timedelta(days=31)

        if start >= today:
            return []
        return [(start, today)]

    def fetch(self, period_start: date, period_end: date) -> str:
        """[STUB] Log and write a placeholder file so the pipeline runs end-to-end."""
        logger.warning(
            "[STUB] OSMTransportSource.fetch(%s, %s) - placeholder file only; wire real Overpass fetch later.",
            period_start,
            period_end,
        )

        layer_slug = self._layer_slug()
        dir_path = f"/cogs/mining/{layer_slug}"
        os.makedirs(dir_path, exist_ok=True)

        filename = f"{period_start.strftime('%Y-%m')}_{str(uuid.uuid4())[:8]}.tif"
        cog_path = os.path.join(dir_path, filename)

        with open(cog_path, "wb") as fh:
            fh.write(b"STUB:OSM_TRANSPORT:")
            fh.write(f"{period_start}_{period_end}".encode())

        return cog_path

    def _layer_slug(self) -> str:
        from apps.layers.models import Layer

        try:
            return Layer.objects.get(slug="osm-transport").slug
        except Layer.DoesNotExist:
            return "osm-transport"
