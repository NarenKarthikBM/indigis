import logging
import os
from abc import ABC, abstractmethod
from datetime import date, timedelta

logger = logging.getLogger(__name__)


class BaseMiningSource(ABC):
    source_slug: str = ""

    def get_periods_to_fetch(self) -> list[tuple[date, date]]:
        """Return list of (start, end) date pairs that still need fetching."""
        from apps.mining.models import MiningJob

        last_done = (
            MiningJob.objects.filter(source__slug=self.source_slug, status="done")
            .order_by("-period_end")
            .first()
        )

        today = date.today()
        start = last_done.period_end if (last_done and last_done.period_end) else today - timedelta(days=30)

        if start >= today:
            return []
        return [(start, today)]

    @abstractmethod
    def fetch(self, period_start: date, period_end: date) -> str:
        """Fetch data for the period and return the absolute disk path of the written COG."""
        raise NotImplementedError

    def run(self) -> None:
        """Orchestrate: compute gaps → create jobs → fetch → register RasterAssets."""
        from django.utils import timezone

        from apps.layers.models import RasterAsset
        from apps.mining.models import DataSource, MiningJob

        try:
            ds = DataSource.objects.get(slug=self.source_slug)
        except DataSource.DoesNotExist:
            logger.warning("DataSource '%s' not found — skipping.", self.source_slug)
            return

        if not ds.is_active:
            logger.info("DataSource '%s' is inactive — skipping.", self.source_slug)
            return

        periods = self.get_periods_to_fetch()
        if not periods:
            logger.info("No new periods to fetch for '%s'.", self.source_slug)
            return

        for period_start, period_end in periods:
            primary_layer = ds.layers.first()

            job = MiningJob.objects.create(
                source=ds,
                layer=primary_layer,
                status=MiningJob.STATUS_RUNNING,
                period_start=period_start,
                period_end=period_end,
                started_at=timezone.now(),
            )
            logger.info("Job %s started: %s [%s–%s]", job.id, self.source_slug, period_start, period_end)

            try:
                cog_path = self.fetch(period_start, period_end)

                # /cogs/mining/... → /data/cogs/mining/... (TiTiler mount)
                cog_url = cog_path.replace("/cogs/", "/data/cogs/", 1)

                job.cog_url = cog_url
                job.status = MiningJob.STATUS_DONE
                job.completed_at = timezone.now()
                job.bytes_written = os.path.getsize(cog_path) if os.path.exists(cog_path) else 0
                job.save()

                if primary_layer:
                    from apps.layers.services import create_raster_asset_and_queue_stats
                    create_raster_asset_and_queue_stats(
                        layer=primary_layer,
                        cog_url=cog_url,
                        period_label=f"{period_start}_{period_end}",
                        data_period_start=period_start,
                        data_period_end=period_end,
                        source="bot",
                        mining_job=job,
                    )

                ds.last_fetched_at = timezone.now()
                ds.save(update_fields=["last_fetched_at"])

                logger.info("Job %s done (%d bytes)", job.id, job.bytes_written or 0)

            except Exception as exc:
                job.status = MiningJob.STATUS_FAILED
                job.error_message = str(exc)
                job.completed_at = timezone.now()
                job.save()
                logger.error("Job %s failed: %s", job.id, exc, exc_info=True)
