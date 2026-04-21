import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("indigis")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "mine-chirps-daily": {
        "task": "apps.mining.tasks.mine_chirps",
        "schedule": crontab(hour=1, minute=30),
    },
    "mine-wdpa-monthly": {
        "task": "apps.mining.tasks.mine_wdpa",
        "schedule": crontab(hour=6, minute=0, day_of_month="15"),
    },
    "mine-osm-transport-monthly": {
        "task": "apps.mining.tasks.mine_osm_transport",
        "schedule": crontab(hour=6, minute=30, day_of_month="2"),
    },
    "cleanup-old-cogs-weekly": {
        "task": "apps.mining.tasks.cleanup_old_cogs",
        "schedule": crontab(hour=0, minute=0, day_of_week="sunday"),
    },
    # OpenTopography DEMs - monthly on day 1 at 07:00.
    # The source re-fetches only if the last successful job is >365 days old,
    # so running monthly is safe and ensures new datasets are picked up quickly.
    "mine-opentopo-dems-monthly": {
        "task": "apps.mining.tasks.mine_opentopo_dems",
        "schedule": crontab(hour=7, minute=0, day_of_month="1"),
    },
    # STAC sources - WorldCover and CopDEM are (effectively) static datasets;
    # annual refresh on Jan 1/5 is sufficient.
    "mine-worldcover-annual": {
        "task": "apps.mining.tasks.mine_worldcover",
        "schedule": crontab(hour=5, minute=0, day_of_month="1", month_of_year="1"),
    },
    "mine-cop-dem-annual": {
        "task": "apps.mining.tasks.mine_stac_sources",
        "schedule": crontab(hour=5, minute=0, day_of_month="5", month_of_year="1"),
        "kwargs": {"slug": "cop-dem-30"},
    },
    # Sentinel-2, Landsat, Sentinel-1 - monthly on day 10 (gives enough time
    # for the previous month's imagery to be processed and available).
    "mine-sentinel2-monthly": {
        "task": "apps.mining.tasks.mine_stac_sources",
        "schedule": crontab(hour=4, minute=0, day_of_month="10"),
        "kwargs": {"slug": "sentinel-2-l2a"},
    },
    "mine-landsat-monthly": {
        "task": "apps.mining.tasks.mine_stac_sources",
        "schedule": crontab(hour=4, minute=30, day_of_month="10"),
        "kwargs": {"slug": "landsat-c2-l2"},
    },
    "mine-sentinel1-monthly": {
        "task": "apps.mining.tasks.mine_stac_sources",
        "schedule": crontab(hour=5, minute=0, day_of_month="10"),
        "kwargs": {"slug": "sentinel-1-rtc"},
    },
    # MODIS Terra daily LST - runs every day at 03:00 to back-fill the previous
    # day's granules (MOD11A1 is typically available with ~1 day latency).
    "mine-modis-lst-daily": {
        "task": "apps.mining.tasks.mine_earthaccess_sources",
        "schedule": crontab(hour=3, minute=0),
        "kwargs": {"slug": "modis-lst-daily"},
    },
}
