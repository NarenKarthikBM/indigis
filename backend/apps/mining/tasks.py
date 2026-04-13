import glob
import importlib
import logging
import os

from celery import shared_task

logger = logging.getLogger(__name__)

# Registry of slug → dotted class path for all STAC-backed sources.
# Used by mine_stac_sources to dispatch without importing at module level.
_STAC_REGISTRY: dict[str, str] = {
    "worldcover":     "apps.mining.sources.worldcover.WorldCoverSource",
    "cop-dem-30":     "apps.mining.sources.copdem.CopDEMSource",
    "sentinel-2-l2a": "apps.mining.sources.sentinel2.Sentinel2Source",
    "landsat-c2-l2":  "apps.mining.sources.landsat.LandsatSource",
    "sentinel-1-rtc": "apps.mining.sources.sentinel1.Sentinel1RTCSource",
}

# Registry of slug → dotted class path for NASA Earthaccess sources.
_EARTHACCESS_REGISTRY: dict[str, str] = {
    "modis-lst-daily": "apps.mining.sources.modis_lst.MODISLSTSource",
}


def _import_source_class(dotted_path: str):
    module_path, class_name = dotted_path.rsplit(".", 1)
    module = importlib.import_module(module_path)
    return getattr(module, class_name)


@shared_task(name="apps.mining.tasks.mine_chirps", queue="mining")
def mine_chirps():
    from apps.mining.sources.chirps import CHIRPSSource

    CHIRPSSource().run()


@shared_task(name="apps.mining.tasks.mine_wdpa", queue="mining")
def mine_wdpa():
    from apps.mining.sources.wdpa import WDPASource

    WDPASource().run()


@shared_task(name="apps.mining.tasks.mine_osm_transport", queue="mining")
def mine_osm_transport():
    from apps.mining.sources.osm import OSMTransportSource

    OSMTransportSource().run()


@shared_task(name="apps.mining.tasks.mine_opentopo_dems", queue="mining")
def mine_opentopo_dems(slug: str | None = None):
    """
    Fetch DEM(s) from OpenTopography.

    If *slug* is given, runs only that DataSource.
    Otherwise runs all active DataSources with source_type="opentopo".
    """
    from apps.mining.models import DataSource
    from apps.mining.sources.opentopo import OpenTopoSource

    if slug:
        slugs = [slug]
    else:
        slugs = list(
            DataSource.objects.filter(source_type="opentopo", is_active=True).values_list("slug", flat=True)
        )

    logger.info("mine_opentopo_dems: running %d source(s)", len(slugs))
    for ds_slug in slugs:
        OpenTopoSource(ds_slug).run()


@shared_task(name="apps.mining.tasks.mine_stac_sources", queue="mining")
def mine_stac_sources(slug: str | None = None):
    """
    Fetch one or all active STAC-backed DataSources.

    If *slug* is given, runs only that source (must be in _STAC_REGISTRY).
    Otherwise runs every active DataSource with source_type="stac" that
    has a matching entry in _STAC_REGISTRY.
    """
    from apps.mining.models import DataSource

    if slug:
        slugs = [slug]
    else:
        slugs = list(
            DataSource.objects.filter(source_type="stac", is_active=True).values_list("slug", flat=True)
        )

    logger.info("mine_stac_sources: running %d source(s)", len(slugs))
    for ds_slug in slugs:
        dotted = _STAC_REGISTRY.get(ds_slug)
        if dotted is None:
            logger.warning("mine_stac_sources: no class registered for slug '%s' — skipping.", ds_slug)
            continue
        SourceClass = _import_source_class(dotted)
        # WorldCoverSource has a fixed source_slug and no __init__ override;
        # all other STAC sources accept datasource_slug as their first argument.
        if ds_slug == "worldcover":
            SourceClass().run()
        else:
            SourceClass(ds_slug).run()


@shared_task(name="apps.mining.tasks.mine_earthaccess_sources", queue="mining")
def mine_earthaccess_sources(slug: str | None = None):
    """
    Fetch one or all active NASA Earthaccess DataSources.

    If *slug* is given, runs only that source (must be in _EARTHACCESS_REGISTRY).
    Otherwise runs every active DataSource with source_type="earthaccess" that
    has a matching entry in _EARTHACCESS_REGISTRY.

    Requires EARTHDATA_USERNAME and EARTHDATA_PASSWORD environment variables.
    """
    from apps.mining.models import DataSource

    print("Earthdata credentials: %s / %s", os.getenv("EARTHDATA_USERNAME"), os.getenv("EARTHDATA_PASSWORD"))

    if slug:
        slugs = [slug]
    else:
        slugs = list(
            DataSource.objects.filter(source_type="earthaccess", is_active=True).values_list(
                "slug", flat=True
            )
        )

    logger.info("mine_earthaccess_sources: running %d source(s)", len(slugs))
    for ds_slug in slugs:
        dotted = _EARTHACCESS_REGISTRY.get(ds_slug)
        if dotted is None:
            logger.warning(
                "mine_earthaccess_sources: no class registered for slug '%s' — skipping.", ds_slug
            )
            continue
        SourceClass = _import_source_class(dotted)
        SourceClass(ds_slug).run()


@shared_task(name="apps.mining.tasks.mine_worldcover", queue="mining")
def mine_worldcover():
    """Fetch ESA WorldCover. Delegates to mine_stac_sources for consistency."""
    mine_stac_sources.apply(kwargs={"slug": "worldcover"})


@shared_task(name="apps.mining.tasks.cleanup_old_cogs", queue="mining")
def cleanup_old_cogs():
    """Remove COG files under /cogs/mining/ not linked to any RasterAsset."""
    from apps.layers.models import RasterAsset

    logger.info("cleanup_old_cogs: scanning /cogs/mining/")
    all_files = set(glob.glob("/cogs/mining/**/*.tif", recursive=True))

    linked_urls = set(
        RasterAsset.objects.filter(cog_url__startswith="/data/cogs/mining/").values_list("cog_url", flat=True)
    )
    linked_paths = {url.replace("/data/cogs/", "/cogs/", 1) for url in linked_urls}

    orphans = all_files - linked_paths
    removed = 0
    for path in orphans:
        try:
            os.remove(path)
            removed += 1
            logger.info("cleanup_old_cogs: removed %s", path)
        except OSError as exc:
            logger.warning("cleanup_old_cogs: could not remove %s: %s", path, exc)

    logger.info("cleanup_old_cogs: done — removed %d orphaned file(s)", removed)
