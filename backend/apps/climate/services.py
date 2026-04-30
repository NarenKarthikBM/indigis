"""
Climate Risk Engine - computation services.

Handles:
- CDO-based ETCCDI index computation (Tier 1 + Tier 2)
- CDO-based baseline percentile computation
- Per-pixel Mann-Kendall trend analysis
- Per-pixel GEV return-period fitting
- Per-pixel Pearson R correlation with teleconnection indices (SOI, MEI, IOD)
- Helper utilities (NC→COG, CDO subprocess wrapper)

ETCCDI result NetCDFs are archived alongside their COGs so that the CDO
``timcor`` correlation path can use them directly without reloading COG stacks
into Python.
"""
import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from datetime import date

import numpy as np

logger = logging.getLogger(__name__)

_NODATA = -9999.0

# ---------------------------------------------------------------------------
# ETCCDI index definitions
# ---------------------------------------------------------------------------

ETCCDI_INDICES = {
    # Tier 1 - no baseline needed
    "TXx": {
        "tier": 1,
        "cds_stat": "daily_maximum",
        "variable": "2m_temperature",
        "nc_var": "t2m",
        "cdo_op": "timmax",
        "label": "Annual Max of Daily Tmax",
        "units": "°C",
        "colormap": "hot_r",
        "description": "Warmest day temperature each year",
    },
    "TNn": {
        "tier": 1,
        "cds_stat": "daily_minimum",
        "variable": "2m_temperature",
        "nc_var": "t2m",
        "cdo_op": "timmin",
        "label": "Annual Min of Daily Tmin",
        "units": "°C",
        "colormap": "Blues_r",
        "description": "Coldest night temperature each year",
    },
    "TNx": {
        "tier": 1,
        "cds_stat": "daily_minimum",
        "variable": "2m_temperature",
        "nc_var": "t2m",
        "cdo_op": "timmax",
        "label": "Annual Max of Daily Tmin",
        "units": "°C",
        "colormap": "YlOrRd",
        "description": "Warmest night temperature each year",
    },
    "TXn": {
        "tier": 1,
        "cds_stat": "daily_maximum",
        "variable": "2m_temperature",
        "nc_var": "t2m",
        "cdo_op": "timmin",
        "label": "Annual Min of Daily Tmax",
        "units": "°C",
        "colormap": "Blues",
        "description": "Coldest day temperature each year",
    },
    # Tier 2 - baseline-dependent
    "TX90p": {
        "tier": 2,
        "cds_stat": "daily_maximum",
        "variable": "2m_temperature",
        "nc_var": "t2m",
        "cdo_op": "eca_tx90p",
        "label": "Warm Days (TX > 90th pct)",
        "units": "%",
        "colormap": "YlOrRd",
        "description": "Percentage of days when Tmax > calendar-day 90th percentile",
        "baseline_pctl": 90,
        "baseline_stat": "daily_maximum",
    },
    "TN10p": {
        "tier": 2,
        "cds_stat": "daily_minimum",
        "variable": "2m_temperature",
        "nc_var": "t2m",
        "cdo_op": "eca_tn10p",
        "label": "Cool Nights (TN < 10th pct)",
        "units": "%",
        "colormap": "Blues",
        "description": "Percentage of days when Tmin < calendar-day 10th percentile",
        "baseline_pctl": 10,
        "baseline_stat": "daily_minimum",
    },
    "WSDI": {
        "tier": 2,
        "cds_stat": "daily_maximum",
        "variable": "2m_temperature",
        "nc_var": "t2m",
        "cdo_op": "etccdi_wsdi",
        "label": "Warm Spell Duration Index",
        "units": "days",
        "colormap": "hot",
        "description": "Annual count of days in warm spells (≥6 consecutive days TX > TX90p)",
        "baseline_pctl": 90,
        "baseline_stat": "daily_maximum",
    },
    "CSDI": {
        "tier": 2,
        "cds_stat": "daily_minimum",
        "variable": "2m_temperature",
        "nc_var": "t2m",
        "cdo_op": "etccdi_csdi",
        "label": "Cold Spell Duration Index",
        "units": "days",
        "colormap": "Blues",
        "description": "Annual count of days in cold spells (≥6 consecutive days TN < TN10p)",
        "baseline_pctl": 10,
        "baseline_stat": "daily_minimum",
    },
    "SDII": {
        "tier": 1,
        "cds_stat": "daily_sum",
        "variable": "total_precipitation",
        "nc_var": "tp",
        "cdo_op": "eca_sdii",
        "label": "Simple Daily Intensity Index",
        "units": "mm/day",
        "colormap": "Blues",
        "description": "Annual total precipitation divided by the number of wet days (PRCP ≥ 1.0 mm)",
    },
    "RX1day": {
        "tier": 1,
        "cds_stat": "daily_sum",
        "variable": "total_precipitation",
        "nc_var": "tp",
        "cdo_op": "eca_rx1day",
        "label": "Max 1-Day Precipitation",
        "units": "mm",
        "colormap": "Purples",
        "description": "Annual maximum 1-day precipitation amount",
    },
    "RX5day": {
        "tier": 1,
        "cds_stat": "daily_sum",
        "variable": "total_precipitation",
        "nc_var": "tp",
        "cdo_op": "eca_rx5day",
        "label": "Max 5-Day Precipitation",
        "units": "mm",
        "colormap": "Purples",
        "description": "Annual maximum consecutive 5-day precipitation amount",
    },
    "R10mm": {
        "tier": 1,
        "cds_stat": "daily_sum",
        "variable": "total_precipitation",
        "nc_var": "tp",
        "cdo_op": "eca_r10mm",
        "label": "Heavy Precipitation Days",
        "units": "days",
        "colormap": "YlOrBr",
        "description": "Annual count of days when daily precipitation ≥ 10 mm",
    },
    "R20mm": {
        "tier": 1,
        "cds_stat": "daily_sum",
        "variable": "total_precipitation",
        "nc_var": "tp",
        "cdo_op": "eca_r20mm",
        "label": "Very Heavy Precipitation Days",
        "units": "days",
        "colormap": "YlOrBr",
        "description": "Annual count of days when daily precipitation ≥ 20 mm",
    },
    "CWD": {
        "tier": 1,
        "cds_stat": "daily_sum",
        "variable": "total_precipitation",
        "nc_var": "tp",
        "cdo_op": "eca_cwd",
        "label": "Consecutive Wet Days",
        "units": "days",
        "colormap": "GnBu",
        "description": "Maximum number of consecutive days with daily precipitation ≥ 1.0 mm",
    },
    "CDD": {
        "tier": 1,
        "cds_stat": "daily_sum",
        "variable": "total_precipitation",
        "nc_var": "tp",
        "cdo_op": "eca_cdd",
        "label": "Consecutive Dry Days",
        "units": "days",
        "colormap": "YlOrBr",
        "description": "Maximum number of consecutive days with daily precipitation < 1.0 mm",
    },
    "R95p": {
        "tier": 2,
        "cds_stat": "daily_sum",
        "variable": "total_precipitation",
        "nc_var": "tp",
        "cdo_op": "eca_r95p",
        "label": "Very Wet Days",
        "units": "days",
        "colormap": "PuBu",
        "description": "Annual count of days with precipitation exceeding the 95th percentile of wet-day amounts",
        "baseline_pctl": 95,
        "baseline_stat": "daily_sum",
    },
    "R99p": {
        "tier": 2,
        "cds_stat": "daily_sum",
        "variable": "total_precipitation",
        "nc_var": "tp",
        "cdo_op": "eca_r99p",
        "label": "Extremely Wet Days",
        "units": "days",
        "colormap": "PuBu",
        "description": "Annual count of days with precipitation exceeding the 99th percentile of wet-day amounts",
        "baseline_pctl": 99,
        "baseline_stat": "daily_sum",
    },
}

# ---------------------------------------------------------------------------
# Teleconnection index definitions
# ---------------------------------------------------------------------------

TELECONNECTION_INDICES = {
    "SOI": {
        "label": "Southern Oscillation Index",
        "description": "Standardized anomaly of the mean sea-level pressure difference between Tahiti and Darwin (ENSO proxy)",
        "source": "NOAA Climate Prediction Center",
        "yearly": {
            "1951": -0.27,
            "1952": -0.01,
            "1953": -0.41,
            "1954": 0.45,
            "1955": 1.03,
            "1956": 1.09,
            "1957": -0.18,
            "1958": -0.15,
            "1959": 0.14,
            "1960": 0.5,
            "1961": 0.18,
            "1962": 0.53,
            "1963": -0.04,
            "1964": 0.62,
            "1965": -0.51,
            "1966": -0.22,
            "1967": 0.48,
            "1968": 0.39,
            "1969": -0.35,
            "1970": 0.48,
            "1971": 1.11,
            "1972": -0.48,
            "1973": 0.74,
            "1974": 1.1,
            "1975": 1.33,
            "1976": 0.32,
            "1977": -0.63,
            "1978": -0.07,
            "1979": 0.14,
            "1980": -0.07,
            "1981": 0.24,
            "1982": -0.88,
            "1983": -0.76,
            "1984": 0.14,
            "1985": 0.28,
            "1986": -0.08,
            "1987": -0.93,
            "1988": 0.82,
            "1989": 0.71,
            "1990": -0.12,
            "1991": -0.58,
            "1992": -0.83,
            "1993": -0.65,
            "1994": -0.83,
            "1995": -0.02,
            "1996": 0.67,
            "1997": -0.73,
            "1998": -0.03,
            "1999": 0.85,
            "2000": 0.85,
            "2001": 0.26,
            "2002": -0.33,
            "2003": -0.09,
            "2004": -0.26,
            "2005": -0.18,
            "2006": 0.03,
            "2007": 0.27,
            "2008": 1.12,
            "2009": 0.17,
            "2010": 0.91,
            "2011": 1.4,
            "2012": 0.13,
            "2013": 0.45,
            "2014": -0.13,
            "2015": -0.79,
            "2016": -0.19,
            "2017": 0.36,
            "2018": 0.27,
            "2019": -0.5,
            "2020": 0.47,
            "2021": 0.92,
            "2022": 1.31,
            "2023": -0.12,
            "2024": 0.18,
            "2025": 0.57
        }   
    },
    "MEI": {
        "label": "Multivariate ENSO Index v2",
        "description": "Leading principal component of six surface variables over the tropical Pacific",
        "source": "NOAA/ESRL Physical Sciences Laboratory",
    },
    "IOD": {
        "label": "Dipole Mode Index (DMI)",
        "description": "Dipole Mode Index: SST anomaly difference between western and eastern tropical Indian Ocean",
        "source": "JAMSTEC / NOAA",
    },
}

# ---------------------------------------------------------------------------
# Directories
# ---------------------------------------------------------------------------

# Directory for archived ERA5 NetCDF files
ERA5_NC_DIR = os.environ.get("ERA5_NC_DIR", "/data/era5_nc")
# Directory for baseline percentile files
BASELINE_DIR = os.path.join(ERA5_NC_DIR, "baselines")
# Directory for archived ETCCDI result NetCDFs (kept alongside COGs for CDO timcor)
ETCCDI_NC_DIR = os.path.join(ERA5_NC_DIR, "etccdi")
# Directory for teleconnection JSON timeseries files
TELECONNECTION_DIR = os.environ.get("TELECONNECTION_DIR", "/data/teleconnections")
# Directory for climate product COGs
CLIMATE_COG_DIR = "/cogs/climate"

# ---------------------------------------------------------------------------
# Seasonal Teleconnection data
# ---------------------------------------------------------------------------

SEASONAL_TELECONNECTION_DATA = {
    "SOI": {
        "DJF": {
            1990: 26.660, 1991: 27.017, 1992: 28.400, 1993: 26.763, 1994: 26.737, 1995: 27.637, 1996: 25.743, 1997: 26.113,
            1998: 28.867, 1999: 25.067, 2000: 24.950, 2001: 25.870, 2002: 26.430, 2003: 27.503, 2004: 26.940, 2005: 27.220,
            2006: 25.797, 2007: 27.287, 2008: 24.983, 2009: 25.787, 2010: 28.140, 2011: 25.213, 2012: 25.763, 2013: 26.197,
            2014: 26.207, 2015: 27.177, 2016: 29.127, 2017: 26.297, 2018: 25.720, 2019: 27.380, 2020: 27.130, 2021: 25.580,
            2022: 25.667, 2023: 25.957, 2024: 28.413, 2025: 26.040,
        },
        "MAM": {
            1990: 27.750, 1991: 27.843, 1992: 28.887, 1993: 28.263, 1994: 27.903, 1995: 27.890, 1996: 27.190, 1997: 27.867,
            1998: 28.577, 1999: 26.607, 2000: 26.773, 2001: 27.243, 2002: 27.790, 2003: 27.550, 2004: 27.763, 2005: 28.017,
            2006: 27.307, 2007: 27.353, 2008: 26.663, 2009: 27.350, 2010: 28.030, 2011: 26.940, 2012: 27.200, 2013: 27.377,
            2014: 27.717, 2015: 28.373, 2016: 28.617, 2017: 27.883, 2018: 27.173, 2019: 28.337, 2020: 27.867, 2021: 27.017,
            2022: 26.610, 2023: 27.840, 2024: 28.387, 2025: 27.590,
        },
        "JJA": {
            1990: 27.363, 1991: 27.943, 1992: 27.573, 1993: 27.530, 1994: 27.653, 1995: 26.967, 1996: 26.927, 1997: 28.810,
            1998: 26.403, 1999: 26.097, 2000: 26.647, 2001: 27.197, 2002: 28.063, 2003: 27.350, 2004: 27.753, 2005: 27.210,
            2006: 27.397, 2007: 26.740, 2008: 26.917, 2009: 27.747, 2010: 26.243, 2011: 26.810, 2012: 27.537, 2013: 26.893,
            2014: 27.337, 2015: 28.813, 2016: 26.930, 2017: 27.433, 2018: 27.377, 2019: 27.573, 2020: 26.880, 2021: 26.890,
            2022: 26.487, 2023: 28.363, 2024: 27.323, 2025: 27.100,
        },
        "SON": {
            1990: 26.893, 1991: 27.540, 1992: 26.497, 1993: 26.850, 1994: 27.493, 1995: 25.773, 1996: 26.277, 1997: 29.017,
            1998: 25.317, 1999: 25.410, 2000: 26.047, 2001: 26.473, 2002: 27.980, 2003: 27.057, 2004: 27.443, 2005: 26.480,
            2006: 27.473, 2007: 25.367, 2008: 26.363, 2009: 27.720, 2010: 25.070, 2011: 25.703, 2012: 26.980, 2013: 26.540,
            2014: 27.210, 2015: 29.143, 2016: 26.020, 2017: 26.060, 2018: 27.473, 2019: 27.057, 2020: 25.543, 2021: 25.900,
            2022: 25.727, 2023: 28.493, 2024: 26.447, 2025: 26.160,
        },
    },
    "IOD": {
        "DJF": {
            1990: -0.185, 1991: -0.010, 1992: -0.209, 1993: -0.159, 1994: -0.109, 1995: 0.189, 1996: 0.012, 1997: -0.148,
            1998: 0.603, 1999: -0.168, 2000: -0.094, 2001: -0.232, 2002: -0.097, 2003: -0.127, 2004: 0.116, 2005: -0.272,
            2006: -0.247, 2007: 0.182, 2008: -0.061, 2009: 0.047, 2010: 0.159, 2011: 0.074, 2012: -0.053, 2013: 0.131,
            2014: -0.016, 2015: -0.133, 2016: 0.143, 2017: -0.098, 2018: 0.041, 2019: 0.371, 2020: 0.157, 2021: 0.108,
            2022: -0.086, 2023: 0.058, 2024: 0.648
        },
        "MAM": {
            1990: -0.292, 1991: 0.210, 1992: -0.591, 1993: -0.168, 1994: 0.366, 1995: -0.174, 1996: -0.240, 1997: 0.041,
            1998: 0.044, 1999: -0.029, 2000: 0.131, 2001: 0.088, 2002: -0.224, 2003: -0.101, 2004: -0.189, 2005: -0.127,
            2006: -0.149, 2007: 0.162, 2008: 0.041, 2009: 0.161, 2010: 0.266, 2011: 0.144, 2012: -0.205, 2013: -0.240,
            2014: -0.100, 2015: -0.003, 2016: 0.008, 2017: 0.464, 2018: -0.027, 2019: 0.340, 2020: 0.102, 2021: 0.175,
            2022: -0.094, 2023: 0.473, 2024: 0.386
        },
        "JJA": {
            1990: -0.402, 1991: 0.197, 1992: -0.703, 1993: -0.188, 1994: 0.600, 1995: -0.130, 1996: -0.573, 1997: 0.388,
            1998: -0.273, 1999: -0.003, 2000: 0.062, 2001: -0.105, 2002: -0.219, 2003: 0.126, 2004: -0.272, 2005: -0.302,
            2006: 0.070, 2007: 0.104, 2008: 0.195, 2009: -0.065, 2010: -0.068, 2011: 0.207, 2012: 0.400, 2013: -0.290,
            2014: -0.254, 2015: 0.363, 2016: -0.548, 2017: 0.431, 2018: 0.110, 2019: 0.546, 2020: 0.197, 2021: -0.110,
            2022: -0.259, 2023: 0.663, 2024: 0.166
        },
        "SON": {
            1990: -0.207, 1991: 0.036, 1992: -0.620, 1993: -0.158, 1994: 0.508, 1995: -0.280, 1996: -0.872, 1997: 0.974,
            1998: -0.631, 1999: -0.119, 2000: -0.181, 2001: -0.306, 2002: 0.262, 2003: -0.154, 2004: -0.088, 2005: -0.414,
            2006: 0.502, 2007: 0.093, 2008: -0.004, 2009: -0.061, 2010: -0.400, 2011: 0.298, 2012: 0.154, 2013: -0.093,
            2014: 0.002, 2015: 0.375, 2016: -0.397, 2017: 0.113, 2018: 0.596, 2019: 0.897, 2020: -0.032, 2021: -0.027,
            2022: -0.427, 2023: 0.890, 2024: -0.155
        },
    }
}
AVAILABLE_SEASONAL_INDICES = list(SEASONAL_TELECONNECTION_DATA.keys())
AVAILABLE_SEASONS = list(SEASONAL_TELECONNECTION_DATA.get("SOI", {}).keys())

# Keep for backward compatibility
SEASONAL_SOI: dict = SEASONAL_TELECONNECTION_DATA.get("SOI", {})
SOI_SEASONS: list = list(SEASONAL_SOI.keys())

SEASONAL_IOD: dict = SEASONAL_TELECONNECTION_DATA.get("IOD", {})
IOD_SEASONS: list = list(SEASONAL_IOD.keys())

# ---------------------------------------------------------------------------
# CDO helpers
# ---------------------------------------------------------------------------

def _cdo_run(*args: str) -> None:
    """Run a CDO command, raising on failure."""
    cmd = ["cdo"] + list(args)
    logger.debug("CDO: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"CDO failed ({' '.join(cmd)}): {result.stderr}")


def _nc_to_cog(nc_path: str, cog_path: str, variable: str) -> None:
    """Convert a single-band NetCDF to a COG at cog_path, selecting by variable name."""
    import xarray as xr
    import rioxarray  # noqa: F401
    from apps.layers.services import convert_to_cog

    ds = xr.open_dataset(nc_path, decode_times=False)
    if variable not in ds:
        data_vars = [v for v in ds.data_vars]
        if len(data_vars) == 1:
            variable = data_vars[0]
            logger.debug("Variable auto-detected as '%s' in %s", variable, nc_path)
        else:
            # CDO etccdi_* operators produce an <index>ETCCDI var alongside diagnostics
            etccdi_vars = [v for v in data_vars if str(v).endswith("ETCCDI")]
            if len(etccdi_vars) == 1:
                variable = etccdi_vars[0]
                logger.debug("Variable auto-detected as '%s' in %s", variable, nc_path)
            else:
                # CDO ECA operators (e.g. eca_rx5day) put the primary quantity first
                variable = data_vars[0]
                logger.debug("Variable auto-detected (first) as '%s' in %s", variable, nc_path)

    da = ds[variable]

    # Collapse time dimension if present
    if "valid_time" in da.dims:
        da = da.isel(valid_time=0)

    # Rename ERA5 spatial dimensions
    rename_map = {}
    if "latitude" in da.dims:
        rename_map["latitude"] = "lat"
    if "longitude" in da.dims:
        rename_map["longitude"] = "lon"
    if rename_map:
        da = da.rename(rename_map)

    da = da.rio.set_spatial_dims(x_dim="lon", y_dim="lat", inplace=True)
    da = da.rio.write_crs("EPSG:4326")

    # Replace fill value with NaN, then cast to float32
    fill_val = da.attrs.get("_FillValue") or da.attrs.get("missing_value")
    if fill_val is not None:
        da = da.where(da != fill_val)

    da = da.astype(np.float32)

    os.makedirs(os.path.dirname(cog_path), exist_ok=True)
    tmp_tif = cog_path + ".raw.tmp.tif"
    try:
        da.rio.to_raster(tmp_tif, nodata=_NODATA, driver="GTiff")
        ds.close()
        convert_to_cog(tmp_tif, cog_path)
    finally:
        if os.path.exists(tmp_tif):
            os.remove(tmp_tif)
        try:
            ds.close()
        except Exception:
            pass


def _compute_min_max(cog_path: str) -> tuple[float | None, float | None]:
    """Return (min, max) of valid pixels using a downsampled read."""
    import rasterio

    try:
        with rasterio.open(cog_path) as src:
            shape = (src.count, max(1, src.height // 16), max(1, src.width // 16))
            data = src.read(out_shape=shape, masked=True)
            valid = data.compressed()
            if valid.size == 0:
                return None, None
            return round(float(np.min(valid)), 6), round(float(np.max(valid)), 6)
    except Exception as exc:
        logger.warning("_compute_min_max failed for %s: %s", cog_path, exc)
        return None, None


# ---------------------------------------------------------------------------
# ERA5 NC archive path helpers
# ---------------------------------------------------------------------------

def get_era5_nc_path(variable: str, cds_stat: str, year: int) -> str:
    """Return the expected archive path for an ERA5 yearly NC file."""
    return os.path.join(ERA5_NC_DIR, variable, f"{variable}_{cds_stat}_{year}.nc")


def get_baseline_nc_path(cds_stat: str, pctl: int) -> str:
    """Return path for the baseline calendar-day percentile NetCDF."""
    return os.path.join(BASELINE_DIR, f"pctl{pctl}_{cds_stat}.nc")


def era5_nc_exists(variable: str, cds_stat: str, year: int) -> bool:
    return os.path.exists(get_era5_nc_path(variable, cds_stat, year))


def get_etccdi_nc_path(index_name: str, year: int) -> str:
    """Return the archive path for a computed ETCCDI result NetCDF."""
    return os.path.join(ETCCDI_NC_DIR, index_name.lower(), f"{index_name.lower()}_{year}.nc")


# ---------------------------------------------------------------------------
# Layer helpers
# ---------------------------------------------------------------------------

def get_or_create_etccdi_layer(index_name: str):
    """Get or create a Layer record for an ETCCDI index."""
    from apps.layers.models import Layer, LayerCategory

    cfg = ETCCDI_INDICES[index_name]
    slug = f"etccdi-{index_name.lower()}"

    category, _ = LayerCategory.objects.get_or_create(
        slug="climate-etccdi",
        defaults={
            "name": "ETCCDI Climate Indices",
            "overlay_type": LayerCategory.OVERLAY_CORE,
            "description": "Expert Team on Climate Change Detection and Indices",
        },
    )

    layer, created = Layer.objects.get_or_create(
        slug=slug,
        defaults={
            "label": cfg["label"],
            "category": category,
            "layer_type": Layer.TYPE_RASTER,
            "temporal_type": Layer.TEMPORAL_ANNUAL,
            "default_colormap": {"name": cfg["colormap"]},
            "description": cfg.get("description", ""),
            "data_source": "ERA5 via CDO ECA operators",
            "resolution": "0.25°",
        },
    )
    if created:
        logger.info("Created Layer: %s", slug)
    return layer


def get_or_create_trend_layer(index_name: str):
    """Get or create a Layer for Mann-Kendall trend slopes."""
    from apps.layers.models import Layer, LayerCategory

    slug = f"trend-{index_name.lower()}"
    cfg = ETCCDI_INDICES[index_name]
    units = cfg["units"]
    per_decade_units = f"{units}/decade" if units != "%" else "pp/decade"

    category, _ = LayerCategory.objects.get_or_create(
        slug="climate-trends",
        defaults={
            "name": "Climate Trends",
            "overlay_type": LayerCategory.OVERLAY_CORE,
            "description": "Mann-Kendall trend analysis of ETCCDI indices",
        },
    )

    layer, created = Layer.objects.get_or_create(
        slug=slug,
        defaults={
            "label": f"Trend: {cfg['label']}",
            "category": category,
            "layer_type": Layer.TYPE_RASTER,
            "temporal_type": Layer.TEMPORAL_STATIC,
            "default_colormap": {"name": "RdBu_r"},
            "description": f"Sen's slope of {cfg['label']} ({per_decade_units}), 1990-2024",
            "data_source": "ERA5 ETCCDI via pymannkendall",
            "resolution": "0.25°",
        },
    )
    if created:
        logger.info("Created Layer: %s", slug)
    return layer


def get_or_create_gev_layer(index_name: str, return_period: int):
    """Get or create a Layer for GEV return-period levels."""
    from apps.layers.models import Layer, LayerCategory

    slug = f"gev-rp{return_period}-{index_name.lower()}"
    cfg = ETCCDI_INDICES[index_name]

    category, _ = LayerCategory.objects.get_or_create(
        slug="climate-gev",
        defaults={
            "name": "Climate Extremes (GEV)",
            "overlay_type": LayerCategory.OVERLAY_CORE,
            "description": "GEV-fitted return-period levels for ETCCDI indices",
        },
    )

    layer, created = Layer.objects.get_or_create(
        slug=slug,
        defaults={
            "label": f"RP{return_period}: {cfg['label']}",
            "category": category,
            "layer_type": Layer.TYPE_RASTER,
            "temporal_type": Layer.TEMPORAL_STATIC,
            "default_colormap": {"name": cfg["colormap"]},
            "description": f"{return_period}-year return level of {cfg['label']} (GEV fit, 1990-2024)",
            "data_source": "ERA5 ETCCDI via scipy GEV",
            "resolution": "0.25°",
        },
    )
    if created:
        logger.info("Created Layer: %s", slug)
    return layer


def get_or_create_correlation_layer(etccdi_index: str, tc_name: str):
    """Get or create a Layer for Pearson R correlation with a teleconnection index."""
    from apps.layers.models import Layer, LayerCategory

    slug = f"corr-{tc_name.lower()}-{etccdi_index.lower()}"
    cfg = ETCCDI_INDICES[etccdi_index]
    tc_cfg = TELECONNECTION_INDICES[tc_name]

    category, _ = LayerCategory.objects.get_or_create(
        slug="climate-teleconnections",
        defaults={
            "name": "Climate Teleconnections",
            "overlay_type": LayerCategory.OVERLAY_CORE,
            "description": "Pearson R correlation between ETCCDI indices and teleconnection indices",
        },
    )

    layer, created = Layer.objects.get_or_create(
        slug=slug,
        defaults={
            "label": f"Corr({tc_name}): {cfg['label']}",
            "category": category,
            "layer_type": Layer.TYPE_RASTER,
            "temporal_type": Layer.TEMPORAL_STATIC,
            "default_colormap": {"name": "RdBu_r"},
            "description": (
                f"Pearson R correlation between {cfg['label']} and {tc_cfg['label']}. "
                f"Values range from -1 (anti-correlated) to +1 (correlated)."
            ),
            "data_source": "ERA5 ETCCDI + teleconnection indices",
            "resolution": "0.25°",
            "min_value": -1.0,
            "max_value": 1.0,
        },
    )
    if created:
        logger.info("Created Layer: %s", slug)
    return layer


def get_or_create_seasonal_correlation_layer(etccdi_index: str, tc_name: str, season: str):
    """Get or create a Layer for Pearson R correlation with seasonal SOI."""
    from apps.layers.models import Layer, LayerCategory

    slug = f"corr-{tc_name.lower()}-{season.lower()}-{etccdi_index.lower()}"
    cfg = ETCCDI_INDICES[etccdi_index]

    category, _ = LayerCategory.objects.get_or_create(
        slug="climate-teleconnections",
        defaults={
            "name": "Climate Teleconnections",
            "overlay_type": LayerCategory.OVERLAY_CORE,
            "description": "Pearson R correlation between ETCCDI indices and teleconnection indices",
        },
    )

    layer, created = Layer.objects.get_or_create(
        slug=slug,
        defaults={
            "label": f"Corr({tc_name}/{season}): {cfg['label']}",
            "category": category,
            "layer_type": Layer.TYPE_RASTER,
            "temporal_type": Layer.TEMPORAL_STATIC,
            "default_colormap": {"name": "RdBu_r"},
            "description": (
                f"Pearson R correlation between {cfg['label']} and {tc_name} ({season}). "
                f"Values range from -1 (anti-correlated) to +1 (correlated)."
            ),
            "data_source": "ERA5 ETCCDI + seasonal SOI",
            "resolution": "0.25°",
            "min_value": -1.0,
            "max_value": 1.0,
        },
    )
    if created:
        logger.info("Created Layer: %s", slug)
    return layer


# ---------------------------------------------------------------------------
# Teleconnection data helpers
# ---------------------------------------------------------------------------

def get_teleconnection_data(tc_name: str, years: list) -> dict:
    """
    Load yearly teleconnection values for the given years.

    For indices with seasonal data (SOI, IOD), the annual value is derived as
    the mean across all available seasons for that year from
    SEASONAL_TELECONNECTION_DATA.  This avoids using pre-computed yearly means
    that may differ in methodology from the seasonal values.

    Returns a ``{year: float}`` dict for years that have data in all seasons.
    """
    if tc_name in SEASONAL_TELECONNECTION_DATA:
        seasonal = SEASONAL_TELECONNECTION_DATA[tc_name]
        result = {}
        for year in years:
            season_vals = [v for season_data in seasonal.values() if (v := season_data.get(year)) is not None]
            if season_vals:
                result[int(year)] = float(sum(season_vals) / len(season_vals))
        return result

    data = TELECONNECTION_INDICES.get(tc_name)
    yearly = data.get("yearly", {})
    result = {}
    for year in years:
        v = yearly.get(str(year))
        if v is not None:
            result[int(year)] = float(v)
    return result


def get_seasonal_teleconnection_data(tc_name: str, season: str, years: list) -> dict:
    """
    Extract seasonal teleconnection data for a given index, season, and list of years.
    """
    if tc_name not in SEASONAL_TELECONNECTION_DATA:
        raise ValueError(f"No seasonal data for teleconnection index: {tc_name}")
    if season not in SEASONAL_TELECONNECTION_DATA[tc_name]:
        raise ValueError(f"No data for season '{season}' in '{tc_name}'")

    data = SEASONAL_TELECONNECTION_DATA[tc_name][season]
    return {year: data[year] for year in years if year in data}


# ---------------------------------------------------------------------------
# ETCCDI computation
# ---------------------------------------------------------------------------

def compute_etccdi_index_service(index_name: str, year: int, countdown: int = 0) -> None:
    """
    Compute a single ETCCDI index for a given year from archived ERA5 NetCDF files
    and register the resulting COG as a RasterAsset (queuing zonal stats).
    """
    if index_name not in ETCCDI_INDICES:
        raise ValueError(f"Unknown ETCCDI index: {index_name}")

    cfg = ETCCDI_INDICES[index_name]
    variable = cfg["variable"]
    cds_stat = cfg["cds_stat"]
    cdo_op = cfg["cdo_op"]
    tier = cfg["tier"]

    source_nc = get_era5_nc_path(variable, cds_stat, year)
    if not os.path.exists(source_nc):
        raise FileNotFoundError(
            f"ERA5 source NC not found: {source_nc}. "
            "Run ERA5 mining pipeline first (make sure ERA5_NC_DIR is set)."
        )

    uid8 = uuid.uuid4().hex[:8]
    cog_path = os.path.join(CLIMATE_COG_DIR, f"etccdi-{index_name.lower()}", f"{year}_{uid8}.tif")
    os.makedirs(os.path.dirname(cog_path), exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"etccdi_{index_name}_{year}_") as tmpdir:
        is_precip = variable == "total_precipitation"
        if is_precip:
            # ERA5 total_precipitation is in m/day; CDO ECA operators expect mm/day
            work_nc = os.path.join(tmpdir, "precip_mm.nc")
            _cdo_run("mulc,1000", source_nc, work_nc)
        else:
            # Convert K → C for temperature inputs
            work_nc = os.path.join(tmpdir, "celsius.nc")
            _cdo_run("subc,273.15", source_nc, work_nc)

        if tier == 1:
            result_nc = os.path.join(tmpdir, "result.nc")
            # cdo_op may be a space-separated CDO chain (e.g. "-yearsum -setrtomiss,-1,0.9999")
            _cdo_run(*cdo_op.split(), work_nc, result_nc)
        else:
            # Tier 2: requires baseline percentile
            pctl = cfg["baseline_pctl"]
            baseline_stat = cfg["baseline_stat"]
            baseline_nc = get_baseline_nc_path(baseline_stat, pctl)
            if not os.path.exists(baseline_nc):
                raise FileNotFoundError(
                    f"Baseline percentile NC not found: {baseline_nc}. "
                    "Run: python manage.py compute_baseline"
                )
            result_nc = os.path.join(tmpdir, "result.nc")
            _cdo_run(*cdo_op.split(), work_nc, baseline_nc, result_nc)

        # Archive result NC alongside the COG for downstream CDO use (e.g. timcor)
        archive_nc = get_etccdi_nc_path(index_name, year)
        os.makedirs(os.path.dirname(archive_nc), exist_ok=True)
        shutil.copy2(result_nc, archive_nc)

        _nc_to_cog(result_nc, cog_path, cfg["nc_var"])

    min_val, max_val = _compute_min_max(cog_path)
    layer = get_or_create_etccdi_layer(index_name)

    # Update layer min/max using running min/max across all assets
    _update_layer_range(layer, min_val, max_val)

    cog_url = cog_path.replace("/cogs/", "/data/cogs/", 1)
    from apps.layers.services import create_raster_asset_and_queue_stats
    create_raster_asset_and_queue_stats(
        layer=layer,
        cog_url=cog_url,
        period_label=str(year),
        data_period_start=date(year, 1, 1),
        data_period_end=date(year, 12, 31),
        source="bot",
        min_value=min_val,
        max_value=max_val,
        parameters={
            "index": index_name,
            "cdo_op": cdo_op,
            "tier": tier,
            "units": cfg["units"],
        },
        countdown=countdown,
    )
    logger.info("Registered ETCCDI %s for year %d → %s", index_name, year, cog_path)


# ---------------------------------------------------------------------------
# Baseline percentile computation (for Tier 2 ETCCDI)
# ---------------------------------------------------------------------------

def compute_baseline_percentiles_service(
    cds_stat: str,
    pctl: int,
    start_year: int = 1991,
    end_year: int = 2020,
    variable: str = "2m_temperature",
) -> str:
    """
    Merge ERA5 daily NC files for baseline years, compute calendar-day percentile,
    and save to BASELINE_DIR. Returns path to the baseline NC.

    For temperature (``2m_temperature``): converts K→C before computing percentile.
    For precipitation (``total_precipitation``): converts m→mm before computing percentile.
    """
    os.makedirs(BASELINE_DIR, exist_ok=True)
    output_nc = get_baseline_nc_path(cds_stat, pctl)

    # Collect available NC files for the baseline period
    nc_files = []
    for year in range(start_year, end_year + 1):
        p = get_era5_nc_path(variable, cds_stat, year)
        if os.path.exists(p):
            nc_files.append(p)
        else:
            logger.warning("Missing baseline year %d for %s/%s - skipping", year, variable, cds_stat)

    if len(nc_files) < 10:
        raise RuntimeError(
            f"Only {len(nc_files)} years available for baseline (need ≥10). "
            "Ensure ERA5 data is archived."
        )

    is_precip = variable == "total_precipitation"

    with tempfile.TemporaryDirectory(prefix=f"baseline_{cds_stat}_") as tmpdir:
        merged_raw = os.path.join(tmpdir, "merged_raw.nc")
        merged_work = os.path.join(tmpdir, "merged_work.nc")
        _cdo_run("mergetime", *nc_files, merged_raw)

        if is_precip:
            # ERA5 precipitation is in m/day; convert to mm/day
            _cdo_run("mulc,1000", merged_raw, merged_work)
        else:
            # Convert K → C for temperature
            _cdo_run("subc,273.15", merged_raw, merged_work)

        # Compute calendar-day percentile (requires min+max reference files)
        min_nc = os.path.join(tmpdir, "ydaymin.nc")
        max_nc = os.path.join(tmpdir, "ydaymax.nc")
        _cdo_run("ydaymin", merged_work, min_nc)
        _cdo_run("ydaymax", merged_work, max_nc)
        _cdo_run(f"ydaypctl,{pctl}", merged_work, min_nc, max_nc, output_nc)

    logger.info(
        "Baseline %dth percentile for %s/%s written to %s (%d years)",
        pctl, variable, cds_stat, output_nc, len(nc_files),
    )
    return output_nc


# ---------------------------------------------------------------------------
# Trend analysis (per-pixel Mann-Kendall)
# ---------------------------------------------------------------------------

def compute_trend_raster_service(index_name: str, countdown: int = 0) -> None:
    """
    Compute per-pixel Mann-Kendall trend (Sen's slope) across all annual ETCCDI
    COGs and register the slope raster as a RasterAsset.
    """
    import pymannkendall as mk
    import rasterio
    from rasterio.transform import from_bounds

    from apps.layers.models import RasterAsset
    from apps.layers.services import convert_to_cog, create_raster_asset_and_queue_stats

    index_slug = f"etccdi-{index_name.lower()}"
    assets = list(
        RasterAsset.objects.filter(layer__slug=index_slug)
        .order_by("data_period_start")
        .values_list("cog_url", "data_period_start")
    )

    if len(assets) < 10:
        logger.warning("Not enough data for trend analysis of %s: need ≥10 years, got %d", index_name, len(assets))
        raise RuntimeError(
            f"Need ≥10 years of {index_name} data for trend analysis, got {len(assets)}"
        )

    logger.info("Computing trend raster for %s using %d years of data", index_name, len(assets))
    # Convert cog_url → local disk path
    cog_paths = [url.replace("/data/cogs/", "/cogs/", 1) for url, _ in assets]
    years = [d.year for _, d in assets]

    logger.debug("COG paths for trend analysis: %s", cog_paths)
    # Load all rasters into a 3D stack (n_years, height, width)
    with rasterio.open(cog_paths[0]) as src:
        profile = src.profile.copy()
        H, W = src.height, src.width
        nodata = src.nodata or _NODATA
        transform = src.transform
        crs = src.crs

    stack = np.full((len(cog_paths), H, W), np.nan, dtype=np.float32)
    for i, p in enumerate(cog_paths):
        with rasterio.open(p) as src:
            arr = src.read(1).astype(np.float32)
            nd = src.nodata if src.nodata is not None else _NODATA
            arr[arr == nd] = np.nan
            stack[i] = arr

    # Per-pixel Mann-Kendall test
    slope_raster = np.full((H, W), _NODATA, dtype=np.float32)
    pvalue_raster = np.full((H, W), _NODATA, dtype=np.float32)

    for i in range(H):
        for j in range(W):
            series = stack[:, i, j]
            valid = series[~np.isnan(series)]
            if len(valid) >= 10:
                res = mk.original_test(series[~np.isnan(series)])
                slope_raster[i, j] = float(res.slope) * 10  # per decade
                pvalue_raster[i, j] = float(res.p)

    # Save slope raster as COG
    uid8 = uuid.uuid4().hex[:8]
    slope_cog = os.path.join(CLIMATE_COG_DIR, f"trend-{index_name.lower()}", f"slope_{uid8}.tif")
    pval_cog = os.path.join(CLIMATE_COG_DIR, f"trend-{index_name.lower()}", f"pvalue_{uid8}.tif")
    os.makedirs(os.path.dirname(slope_cog), exist_ok=True)

    out_profile = profile.copy()
    out_profile.update(dtype="float32", nodata=_NODATA, count=1)

    for arr, out_path in [(slope_raster, slope_cog), (pvalue_raster, pval_cog)]:
        tmp_tif = out_path + ".raw.tmp.tif"
        with rasterio.open(tmp_tif, "w", **out_profile) as dst:
            dst.write(arr, 1)
        convert_to_cog(tmp_tif, out_path)
        os.remove(tmp_tif)

    cfg = ETCCDI_INDICES[index_name]
    units = cfg["units"]
    per_decade_units = f"{units}/decade" if units != "%" else "pp/decade"

    slope_min, slope_max = _compute_min_max(slope_cog)
    layer = get_or_create_trend_layer(index_name)
    _update_layer_range(layer, slope_min, slope_max)

    slope_url = slope_cog.replace("/cogs/", "/data/cogs/", 1)
    pval_url = pval_cog.replace("/cogs/", "/data/cogs/", 1)

    create_raster_asset_and_queue_stats(
        layer=layer,
        cog_url=slope_url,
        period_label=f"{years[0]}-{years[-1]}",
        data_period_start=date(years[0], 1, 1),
        data_period_end=date(years[-1], 12, 31),
        source="bot",
        min_value=slope_min,
        max_value=slope_max,
        parameters={
            "analysis_type": "mann_kendall_trend",
            "index": index_name,
            "period": [years[0], years[-1]],
            "n_years": len(years),
            "units": per_decade_units,
            "p_value_raster_url": pval_url,
        },
        countdown=countdown,
    )
    logger.info("Registered trend raster for %s (%d years)", index_name, len(years))


# ---------------------------------------------------------------------------
# GEV return-period fitting (per-pixel)
# ---------------------------------------------------------------------------

def compute_gev_raster_service(
    index_name: str,
    return_period: int = 50,
    countdown: int = 0,
) -> None:
    """
    Fit a GEV distribution per pixel across all annual ETCCDI COGs and
    register the return-level raster as a RasterAsset.
    """
    from scipy.stats import genextreme
    import rasterio

    from apps.layers.models import RasterAsset
    from apps.layers.services import convert_to_cog, create_raster_asset_and_queue_stats

    index_slug = f"etccdi-{index_name.lower()}"
    assets = list(
        RasterAsset.objects.filter(layer__slug=index_slug)
        .order_by("data_period_start")
        .values_list("cog_url", "data_period_start")
    )

    if len(assets) < 15:
        raise RuntimeError(
            f"Need ≥15 years of {index_name} data for GEV fitting, got {len(assets)}"
        )

    cog_paths = [url.replace("/data/cogs/", "/cogs/", 1) for url, _ in assets]
    years = [d.year for _, d in assets]

    with rasterio.open(cog_paths[0]) as src:
        profile = src.profile.copy()
        H, W = src.height, src.width

    stack = np.full((len(cog_paths), H, W), np.nan, dtype=np.float32)
    for i, p in enumerate(cog_paths):
        with rasterio.open(p) as src:
            arr = src.read(1).astype(np.float32)
            nd = src.nodata if src.nodata is not None else _NODATA
            arr[arr == nd] = np.nan
            stack[i] = arr

    rp_raster = np.full((H, W), _NODATA, dtype=np.float32)

    for i in range(H):
        for j in range(W):
            series = stack[:, i, j]
            valid = series[~np.isnan(series)]
            if len(valid) >= 15:
                try:
                    shape, loc, scale = genextreme.fit(valid)
                    rp_raster[i, j] = float(
                        genextreme.isf(1.0 / return_period, shape, loc=loc, scale=scale)
                    )
                except Exception:
                    pass  # leave as nodata

    uid8 = uuid.uuid4().hex[:8]
    rp_cog = os.path.join(
        CLIMATE_COG_DIR,
        f"gev-rp{return_period}-{index_name.lower()}",
        f"rp{return_period}_{uid8}.tif",
    )
    os.makedirs(os.path.dirname(rp_cog), exist_ok=True)

    out_profile = profile.copy()
    out_profile.update(dtype="float32", nodata=_NODATA, count=1)
    tmp_tif = rp_cog + ".raw.tmp.tif"
    from apps.layers.services import convert_to_cog
    with rasterio.open(tmp_tif, "w", **out_profile) as dst:
        dst.write(rp_raster, 1)
    convert_to_cog(tmp_tif, rp_cog)
    os.remove(tmp_tif)

    rp_min, rp_max = _compute_min_max(rp_cog)
    layer = get_or_create_gev_layer(index_name, return_period)
    _update_layer_range(layer, rp_min, rp_max)

    cfg = ETCCDI_INDICES[index_name]
    rp_url = rp_cog.replace("/cogs/", "/data/cogs/", 1)

    from apps.layers.services import create_raster_asset_and_queue_stats
    create_raster_asset_and_queue_stats(
        layer=layer,
        cog_url=rp_url,
        period_label=f"rp{return_period}",
        data_period_start=date(years[0], 1, 1),
        data_period_end=date(years[-1], 12, 31),
        source="bot",
        min_value=rp_min,
        max_value=rp_max,
        parameters={
            "analysis_type": "gev_return_period",
            "index": index_name,
            "return_period_years": return_period,
            "n_years_fitted": len(years),
            "period": [years[0], years[-1]],
            "units": cfg["units"],
        },
        countdown=countdown,
    )
    logger.info(
        "Registered GEV RP%d raster for %s (%d years)", return_period, index_name, len(years)
    )


# ---------------------------------------------------------------------------
# Pearson R correlation (per-pixel, ETCCDI vs teleconnection index)
# ---------------------------------------------------------------------------

def compute_correlation_raster_service(
    etccdi_index: str,
    tc_name: str,
    countdown: int = 0,
) -> None:
    """
    Compute per-pixel Pearson R correlation between annual ETCCDI NetCDFs and a
    teleconnection index yearly timeseries using ``cdo timcor``.

    Requires archived ETCCDI result NCs (written by ``compute_etccdi_index_service``
    alongside each COG). The teleconnection scalar is broadcast to a spatially
    uniform field per year via ``cdo addc,{val} -mulc,0`` before merging.

    P-values are derived from the R raster vectorised with the t-distribution
    (no per-pixel Python loop).
    """
    from apps.layers.models import RasterAsset
    from apps.layers.services import create_raster_asset_and_queue_stats

    if etccdi_index not in ETCCDI_INDICES:
        raise ValueError(f"Unknown ETCCDI index: {etccdi_index}")
    if tc_name not in TELECONNECTION_INDICES:
        raise ValueError(
            f"Unknown teleconnection index: {tc_name}. "
            f"Valid choices: {list(TELECONNECTION_INDICES)}"
        )

    # Collect years that have both a RasterAsset and an archived ETCCDI NC
    index_slug = f"etccdi-{etccdi_index.lower()}"
    asset_years = list(
        RasterAsset.objects.filter(layer__slug=index_slug)
        .exclude(data_period_start__isnull=True)
        .order_by("data_period_start")
        .values_list("data_period_start__year", flat=True)
        .distinct()
    )

    if len(asset_years) < 10:
        raise RuntimeError(
            f"Need ≥10 years of {etccdi_index} data for correlation, got {len(asset_years)}"
        )

    tc_data = get_teleconnection_data(tc_name, asset_years)

    # Only years where both the TC value and the ETCCDI NC file exist
    common_years = sorted(
        y for y in asset_years
        if y in tc_data and os.path.exists(get_etccdi_nc_path(etccdi_index, y))
    )
    if len(common_years) < 10:
        raise RuntimeError(
            f"Only {len(common_years)} overlapping years for {etccdi_index}×{tc_name} "
            f"(need ≥10). Ensure ETCCDI NCs are archived and teleconnection JSON covers "
            f"the same period."
        )

    etccdi_nc_files = [get_etccdi_nc_path(etccdi_index, y) for y in common_years]
    n_years = len(common_years)

    uid8 = uuid.uuid4().hex[:8]
    corr_dir = os.path.join(CLIMATE_COG_DIR, f"corr-{tc_name.lower()}-{etccdi_index.lower()}")
    os.makedirs(corr_dir, exist_ok=True)
    r_cog = os.path.join(corr_dir, f"r_{uid8}.tif")
    pval_cog = os.path.join(corr_dir, f"pvalue_{uid8}.tif")

    with tempfile.TemporaryDirectory(prefix=f"corr_{etccdi_index}_{tc_name}_") as tmpdir:
        # Build spatially uniform TC field for each year:
        # cdo addc,{val} -mulc,0 etccdi_year.nc tc_year.nc
        tc_nc_files = []
        for year, etccdi_nc in zip(common_years, etccdi_nc_files):
            tc_nc = os.path.join(tmpdir, f"tc_{year}.nc")
            _cdo_run(f"addc,{tc_data[year]}", "-mulc,0", etccdi_nc, tc_nc)
            tc_nc_files.append(tc_nc)

        # Merge both stacks into multi-time NCs
        merged_etccdi = os.path.join(tmpdir, "merged_etccdi.nc")
        merged_tc = os.path.join(tmpdir, "merged_tc.nc")
        _cdo_run("mergetime", *etccdi_nc_files, merged_etccdi)
        _cdo_run("mergetime", *tc_nc_files, merged_tc)

        # Per-pixel Pearson R via CDO timcor
        corr_nc = os.path.join(tmpdir, "correlation.nc")
        _cdo_run("timcor", merged_etccdi, merged_tc, corr_nc)

        _nc_to_cog(corr_nc, r_cog, ETCCDI_INDICES[etccdi_index]["nc_var"])

    # Vectorised p-values from R raster (no per-pixel Python loop)
    _compute_correlation_pvalues(r_cog, n_years, pval_cog)

    r_min, r_max = _compute_min_max(r_cog)
    layer = get_or_create_correlation_layer(etccdi_index, tc_name)
    _update_layer_range(layer, r_min, r_max)

    r_url = r_cog.replace("/cogs/", "/data/cogs/", 1)
    pval_url = pval_cog.replace("/cogs/", "/data/cogs/", 1)

    create_raster_asset_and_queue_stats(
        layer=layer,
        cog_url=r_url,
        period_label=f"{common_years[0]}-{common_years[-1]}",
        data_period_start=date(common_years[0], 1, 1),
        data_period_end=date(common_years[-1], 12, 31),
        source="bot",
        min_value=r_min,
        max_value=r_max,
        parameters={
            "analysis_type": "pearson_correlation",
            "etccdi_index": etccdi_index,
            "teleconnection": tc_name,
            "period": [common_years[0], common_years[-1]],
            "n_years": n_years,
            "units": "Pearson R",
            "p_value_raster_url": pval_url,
        },
        countdown=countdown,
    )
    logger.info(
        "Registered Pearson R(%s, %s) raster via CDO timcor (%d years)",
        etccdi_index, tc_name, n_years,
    )


def compute_seasonal_correlation_raster_service(
    etccdi_index: str,
    teleconnection_name: str,
    season: str,
    countdown: int = 0,
) -> None:
    """
    Compute per-pixel Pearson R correlation between annual ETCCDI NetCDFs and
    a seasonal SOI timeseries (DJF, MAM, JJAS, etc.) using ``cdo timcor``.

    For each year the annual ETCCDI extreme index value is correlated against
    the SOI value for the given meteorological season of that year.

    Requires archived ETCCDI result NCs and nino_seasonal.json at
    TELECONNECTION_DIR/nino_seasonal.json.
    """
    from apps.layers.models import RasterAsset
    from apps.layers.services import create_raster_asset_and_queue_stats

    if etccdi_index not in ETCCDI_INDICES:
        raise ValueError(f"Unknown ETCCDI index: {etccdi_index}")
    
    if season not in SEASONAL_SOI and teleconnection_name == "SOI":
        raise FileNotFoundError(
            f"Seasonal SOI data not found for season '{season}'. "
            f"Available: {SOI_SEASONS}."
        )
    elif season not in SEASONAL_IOD and teleconnection_name == "IOD":
        raise FileNotFoundError(
            f"Seasonal IOD data not found for season '{season}'. "
            f"Available: {IOD_SEASONS}."
        )

    index_slug = f"etccdi-{etccdi_index.lower()}"
    asset_years = list(
        RasterAsset.objects.filter(layer__slug=index_slug)
        .exclude(data_period_start__isnull=True)
        .order_by("data_period_start")
        .values_list("data_period_start__year", flat=True)
        .distinct()
    )

    if len(asset_years) < 10:
        raise RuntimeError(
            f"Need ≥10 years of {etccdi_index} data for correlation, got {len(asset_years)}"
        )

    tc_data = get_seasonal_teleconnection_data(teleconnection_name, season, asset_years)

    common_years = sorted(
        y for y in asset_years
        if y in tc_data and os.path.exists(get_etccdi_nc_path(etccdi_index, y))
    )
    if len(common_years) < 10:
        raise RuntimeError(
            f"Only {len(common_years)} overlapping years for {etccdi_index}×SOI/{season} "
            f"(need ≥10). Ensure ETCCDI NCs are archived and nino_seasonal.json covers "
            f"the same period."
        )

    etccdi_nc_files = [get_etccdi_nc_path(etccdi_index, y) for y in common_years]
    n_years = len(common_years)

    uid8 = uuid.uuid4().hex[:8]
    corr_dir = os.path.join(CLIMATE_COG_DIR, f"corr-{teleconnection_name.lower()}-{season.lower()}-{etccdi_index.lower()}")
    os.makedirs(corr_dir, exist_ok=True)
    r_cog = os.path.join(corr_dir, f"r_{uid8}.tif")
    pval_cog = os.path.join(corr_dir, f"pvalue_{uid8}.tif")

    with tempfile.TemporaryDirectory(prefix=f"corr_{teleconnection_name.lower()}_{season}_{etccdi_index}_") as tmpdir:
        tc_nc_files = []
        for year, etccdi_nc in zip(common_years, etccdi_nc_files):
            tc_nc = os.path.join(tmpdir, f"tc_{year}.nc")
            _cdo_run(f"addc,{tc_data[year]}", "-mulc,0", etccdi_nc, tc_nc)
            tc_nc_files.append(tc_nc)

        merged_etccdi = os.path.join(tmpdir, "merged_etccdi.nc")
        merged_tc = os.path.join(tmpdir, "merged_tc.nc")
        _cdo_run("mergetime", *etccdi_nc_files, merged_etccdi)
        _cdo_run("mergetime", *tc_nc_files, merged_tc)

        corr_nc = os.path.join(tmpdir, "correlation.nc")
        _cdo_run("timcor", merged_etccdi, merged_tc, corr_nc)

        _nc_to_cog(corr_nc, r_cog, ETCCDI_INDICES[etccdi_index]["nc_var"])

    _compute_correlation_pvalues(r_cog, n_years, pval_cog)

    r_min, r_max = _compute_min_max(r_cog)
    layer = get_or_create_seasonal_correlation_layer(etccdi_index, teleconnection_name, season)
    _update_layer_range(layer, r_min, r_max)

    r_url = r_cog.replace("/cogs/", "/data/cogs/", 1)
    pval_url = pval_cog.replace("/cogs/", "/data/cogs/", 1)

    create_raster_asset_and_queue_stats(
        layer=layer,
        cog_url=r_url,
        period_label=f"{common_years[0]}-{common_years[-1]}",
        data_period_start=date(common_years[0], 1, 1),
        data_period_end=date(common_years[-1], 12, 31),
        source="bot",
        min_value=r_min,
        max_value=r_max,
        parameters={
            "analysis_type": "pearson_correlation_seasonal",
            "etccdi_index": etccdi_index,
            "teleconnection": teleconnection_name,
            "season": season,
            "period": [common_years[0], common_years[-1]],
            "n_years": n_years,
            "units": "Pearson R",
            "p_value_raster_url": pval_url,
        },
        countdown=countdown,
    )
    logger.info(
        "Registered Pearson R(%s, %s/%s) raster via CDO timcor (%d years)",
        etccdi_index, teleconnection_name, season, n_years,
    )


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _compute_correlation_pvalues(r_cog: str, n_years: int, pval_cog: str) -> None:
    """
    Derive a p-value raster from an R raster using the t-distribution.

    t = r * sqrt((n-2) / (1 - r²)),  df = n - 2
    p = 2 * (1 - CDF(|t|, df))

    Fully vectorised - no per-pixel Python loop.
    """
    import rasterio
    from scipy.stats import t as t_dist
    from apps.layers.services import convert_to_cog

    with rasterio.open(r_cog) as src:
        profile = src.profile.copy()
        r_arr = src.read(1).astype(np.float64)
        nd = src.nodata if src.nodata is not None else _NODATA

    valid = r_arr != nd
    # Clamp to avoid divide-by-zero at ±1
    r_c = np.where(valid, np.clip(r_arr, -1 + 1e-7, 1 - 1e-7), 0.0)
    t_stat = np.where(valid, r_c * np.sqrt((n_years - 2) / (1.0 - r_c ** 2)), 0.0)
    p_arr = np.where(
        valid,
        2.0 * (1.0 - t_dist.cdf(np.abs(t_stat), df=n_years - 2)),
        _NODATA,
    ).astype(np.float32)

    out_profile = profile.copy()
    out_profile.update(dtype="float32", nodata=_NODATA, count=1)
    tmp_tif = pval_cog + ".raw.tmp.tif"
    with rasterio.open(tmp_tif, "w", **out_profile) as dst:
        dst.write(p_arr, 1)
    convert_to_cog(tmp_tif, pval_cog)
    os.remove(tmp_tif)


# ---------------------------------------------------------------------------
# Time series backfill (annual ETCCDI means → trend raster histogram field)
# ---------------------------------------------------------------------------

def populate_trend_timeseries_service(index_name: str) -> dict:
    """
    For each state and district, collect the yearly mean values from all annual
    ETCCDI RasterAsset stats and write them into the ``histogram`` field of the
    corresponding trend raster's stats rows.

    Format stored: ``{"years": [1990, 1991, ...], "values": [28.3, 29.1, ...]}``

    Rows with no annual data are skipped silently.
    Returns a summary dict with counts of updated/skipped rows.
    """
    from apps.layers.models import RasterAsset
    from apps.stats.models import RasterStateStats, RasterDistrictStats

    if index_name not in ETCCDI_INDICES:
        raise ValueError(f"Unknown ETCCDI index: {index_name}")

    etccdi_slug = f"etccdi-{index_name.lower()}"
    trend_slug = f"trend-{index_name.lower()}"

    # Fetch the single trend RasterAsset (most recent, static layer)
    try:
        trend_asset = (
            RasterAsset.objects.filter(layer__slug=trend_slug)
            .order_by("-created_at")
            .first()
        )
    except Exception:
        trend_asset = None

    if trend_asset is None:
        raise RuntimeError(
            f"No trend RasterAsset found for slug '{trend_slug}'. "
            "Run compute_climate_trends first."
        )

    # Gather annual assets ordered by year
    annual_assets = list(
        RasterAsset.objects.filter(layer__slug=etccdi_slug)
        .exclude(data_period_start__isnull=True)
        .order_by("data_period_start")
        .values_list("id", "data_period_start__year")
    )

    if not annual_assets:
        raise RuntimeError(f"No annual ETCCDI assets found for '{etccdi_slug}'.")

    annual_asset_ids = [aid for aid, _ in annual_assets]
    year_by_asset = {aid: yr for aid, yr in annual_assets}

    # ---- States ----
    state_rows = (
        RasterStateStats.objects.filter(raster_asset_id__in=annual_asset_ids)
        .values("state_id", "raster_asset_id", "mean")
    )

    # Group: state_id → {year: mean}
    state_series: dict[int, dict[int, float | None]] = {}
    for row in state_rows:
        sid = row["state_id"]
        yr = year_by_asset[row["raster_asset_id"]]
        state_series.setdefault(sid, {})[yr] = row["mean"]

    state_updated = state_skipped = 0
    for sid, year_means in state_series.items():
        years_sorted = sorted(year_means)
        values = [year_means[y] for y in years_sorted]
        if not any(v is not None for v in values):
            logger.debug("State %s: all-None annual means for %s - skipping", sid, index_name)
            state_skipped += 1
            continue
        updated = RasterStateStats.objects.filter(
            raster_asset=trend_asset, state_id=sid
        ).update(histogram={"years": years_sorted, "values": values})
        if updated:
            state_updated += 1
        else:
            logger.debug(
                "State %s: trend stats row not yet computed for %s - skipping", sid, index_name
            )
            state_skipped += 1

    # ---- Districts ----
    district_rows = (
        RasterDistrictStats.objects.filter(raster_asset_id__in=annual_asset_ids)
        .values("district_id", "raster_asset_id", "mean")
    )

    district_series: dict[int, dict[int, float | None]] = {}
    for row in district_rows:
        did = row["district_id"]
        yr = year_by_asset[row["raster_asset_id"]]
        district_series.setdefault(did, {})[yr] = row["mean"]

    district_updated = district_skipped = 0
    for did, year_means in district_series.items():
        years_sorted = sorted(year_means)
        values = [year_means[y] for y in years_sorted]
        if not any(v is not None for v in values):
            logger.debug(
                "District %s: all-None annual means for %s - skipping", did, index_name
            )
            district_skipped += 1
            continue
        updated = RasterDistrictStats.objects.filter(
            raster_asset=trend_asset, district_id=did
        ).update(histogram={"years": years_sorted, "values": values})
        if updated:
            district_updated += 1
        else:
            logger.debug(
                "District %s: trend stats row not yet computed for %s - skipping",
                did, index_name,
            )
            district_skipped += 1

    summary = {
        "index": index_name,
        "states_updated": state_updated,
        "states_skipped": state_skipped,
        "districts_updated": district_updated,
        "districts_skipped": district_skipped,
    }
    logger.info("populate_trend_timeseries %s: %s", index_name, summary)
    return summary


def _update_layer_range(layer, new_min, new_max) -> None:
    """Expand Layer.min_value / max_value to include new_min / new_max."""
    from apps.layers.models import Layer

    update_fields = []
    if new_min is not None and (layer.min_value is None or new_min < layer.min_value):
        layer.min_value = new_min
        update_fields.append("min_value")
    if new_max is not None and (layer.max_value is None or new_max > layer.max_value):
        layer.max_value = new_max
        update_fields.append("max_value")
    if update_fields:
        layer.save(update_fields=update_fields)
