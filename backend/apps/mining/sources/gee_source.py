import logging
from datetime import date

from .base import BaseMiningSource

logger = logging.getLogger(__name__)


class GEEMiningSource(BaseMiningSource):
    """
    Google Earth Engine data source - NOT YET IMPLEMENTED.

    To wire real GEE access:
    1. Install `earthengine-api` and `geemap`.
    2. Set up service-account credentials in the DataSource.config JSON.
    3. Override `fetch()` to authenticate and export the desired ImageCollection.

    Until then this raises NotImplementedError so subclasses are not accidentally used.
    """

    source_slug = "gee"

    def fetch(self, period_start: date, period_end: date) -> str:
        raise NotImplementedError(
            "GEEMiningSource is a stub. "
            "Wire earthengine-api credentials and implement fetch() before use. "
            "See apps/mining/sources/gee_source.py for instructions."
        )
