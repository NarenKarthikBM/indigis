"""Celery tasks for the climate risk engine."""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    name="apps.climate.tasks.compute_etccdi_index",
    queue="climate",
    bind=True,
    max_retries=2,
    acks_late=True,
    default_retry_delay=120,
)
def compute_etccdi_index(self, index_name: str, year: int, countdown: int = 0):
    """Compute a single ETCCDI index for a given year."""
    from apps.climate.services import compute_etccdi_index_service

    try:
        compute_etccdi_index_service(index_name, year, countdown=countdown)
    except FileNotFoundError as exc:
        # Missing source NC - do not retry (data is not available)
        logger.error("ETCCDI %s/%d: source NC missing - %s", index_name, year, exc)
        raise
    except Exception as exc:
        logger.exception("ETCCDI %s/%d failed: %s", index_name, year, exc)
        raise self.retry(exc=exc)


@shared_task(
    name="apps.climate.tasks.compute_trend_raster",
    queue="climate",
    bind=True,
    max_retries=1,
    acks_late=True,
    default_retry_delay=300,
)
def compute_trend_raster(self, index_name: str, countdown: int = 0):
    """Compute per-pixel Mann-Kendall trend for an ETCCDI index."""
    from apps.climate.services import compute_trend_raster_service

    try:
        compute_trend_raster_service(index_name, countdown=countdown)
    except Exception as exc:
        logger.exception("Trend analysis for %s failed: %s", index_name, exc)
        raise self.retry(exc=exc)


@shared_task(
    name="apps.climate.tasks.compute_gev_raster",
    queue="climate",
    bind=True,
    max_retries=1,
    acks_late=True,
    default_retry_delay=300,
)
def compute_gev_raster(self, index_name: str, return_period: int = 50, countdown: int = 0):
    """Compute per-pixel GEV return-period level for an ETCCDI index."""
    from apps.climate.services import compute_gev_raster_service

    try:
        compute_gev_raster_service(index_name, return_period, countdown=countdown)
    except Exception as exc:
        logger.exception("GEV RP%d for %s failed: %s", return_period, index_name, exc)
        raise self.retry(exc=exc)


@shared_task(
    name="apps.climate.tasks.compute_correlation_raster",
    queue="climate",
    bind=True,
    max_retries=1,
    acks_late=True,
    default_retry_delay=300,
)
def compute_correlation_raster(
    self, etccdi_index: str, tc_name: str, countdown: int = 0
):
    """Compute per-pixel Pearson R correlation between an ETCCDI index and a teleconnection index."""
    from apps.climate.services import compute_correlation_raster_service

    try:
        compute_correlation_raster_service(etccdi_index, tc_name, countdown=countdown)
    except FileNotFoundError as exc:
        # Missing teleconnection JSON - do not retry
        logger.error(
            "Correlation %s/%s: teleconnection data missing - %s", etccdi_index, tc_name, exc
        )
        raise
    except Exception as exc:
        logger.exception(
            "Correlation %s/%s failed: %s", etccdi_index, tc_name, exc
        )
        raise self.retry(exc=exc)


@shared_task(
    name="apps.climate.tasks.compute_seasonal_correlation_raster",
    queue="climate",
    bind=True,
    max_retries=1,
    acks_late=True,
    default_retry_delay=300,
)
def compute_seasonal_correlation_raster(
    self, etccdi_index: str, season: str, countdown: int = 0
):
    """Compute per-pixel Pearson R correlation between an ETCCDI index and seasonal SOI."""
    from apps.climate.services import compute_seasonal_correlation_raster_service

    try:
        compute_seasonal_correlation_raster_service(etccdi_index, season, countdown=countdown)
    except FileNotFoundError as exc:
        logger.error(
            "Seasonal correlation %s/SOI-%s: data missing - %s", etccdi_index, season, exc
        )
        raise
    except Exception as exc:
        logger.exception(
            "Seasonal correlation %s/SOI-%s failed: %s", etccdi_index, season, exc
        )
        raise self.retry(exc=exc)
