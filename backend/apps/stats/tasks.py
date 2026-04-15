from celery import shared_task


@shared_task(
    name="apps.stats.tasks.compute_raster_zonal_stats",
    queue="uploads",
    bind=True,
    max_retries=2,
    acks_late=True,
    default_retry_delay=60,
    # Allow at most 2 stats computations per minute per worker to prevent
    # CPU/EBS saturation when many assets are queued simultaneously (e.g. NetCDF uploads).
    rate_limit="2/m",
)
def compute_raster_zonal_stats(self, raster_asset_id: int):
    from apps.stats.services import compute_zonal_stats_for_asset

    try:
        compute_zonal_stats_for_asset(raster_asset_id)
    except Exception as exc:
        raise self.retry(exc=exc)
