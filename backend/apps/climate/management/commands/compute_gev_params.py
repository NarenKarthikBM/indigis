"""
Fit GEV distribution parameters to each district's annual ETCCDI time series
and store results in DistrictGEVParams.

Unlike compute_gev (which fits per pixel then averages return levels spatially),
this command fits GEV to the district's spatially-averaged annual values.  The
two approaches are complementary: per-pixel is better for spatial heterogeneity;
district-level is the correct interpretation of "what is the return level of the
district-average extreme?"

The stored (loc, scale, shape) parameters let the frontend render smooth GEV
return-level curves at any return period via the exact quantile formula — no
interpolation or client-side refitting needed.

Usage:
    python manage.py compute_gev_params
    python manage.py compute_gev_params --indices TXx,TNn
    python manage.py compute_gev_params --min-years 15
"""
import logging

from django.core.management.base import BaseCommand, CommandError

from apps.climate.services import ETCCDI_INDICES

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Fit district-level GEV parameters from annual ETCCDI time series"

    def add_arguments(self, parser):
        parser.add_argument(
            "--indices",
            default=",".join(ETCCDI_INDICES.keys()),
            help="Comma-separated list of ETCCDI indices (default: all)",
        )
        parser.add_argument(
            "--min-years",
            type=int,
            default=10,
            help="Minimum number of valid annual values required for fitting (default: 10)",
        )

    def handle(self, *args, **options):
        from scipy.stats import genextreme

        from apps.boundaries.models import District
        from apps.climate.models import DistrictGEVParams
        from apps.stats.models import RasterDistrictStats

        indices = [i.strip() for i in options["indices"].split(",") if i.strip()]
        min_years = options["min_years"]

        unknown = [i for i in indices if i not in ETCCDI_INDICES]
        if unknown:
            raise CommandError(f"Unknown indices: {unknown}")

        districts = list(District.objects.all())
        self.stdout.write(
            f"Fitting GEV for {len(indices)} indices × {len(districts)} districts "
            f"(min_years={min_years})"
        )

        total_fitted = 0
        total_skipped = 0

        for index_name in indices:
            etccdi_slug = f"etccdi-{index_name.lower()}"

            # Pull all district annual stats for this index in one query,
            # grouped by district.
            stats_qs = (
                RasterDistrictStats.objects.filter(
                    raster_asset__layer__slug=etccdi_slug,
                    raster_asset__data_period_start__isnull=False,
                )
                .select_related("raster_asset", "district")
                .order_by("district_id", "raster_asset__data_period_start")
                .values_list(
                    "district_id",
                    "raster_asset__data_period_start__year",
                    "mean",
                )
            )

            # Group by district
            from collections import defaultdict
            district_series: dict[int, list[tuple[int, float]]] = defaultdict(list)
            for district_id, year, mean_val in stats_qs:
                if mean_val is not None:
                    district_series[district_id].append((year, mean_val))

            fitted = 0
            skipped = 0
            upserts = []

            for district in districts:
                series = district_series.get(district.pk, [])
                values = [v for _, v in series]
                years = [y for y, _ in series]

                if len(values) < min_years:
                    skipped += 1
                    continue

                try:
                    shape, loc, scale = genextreme.fit(values)
                except Exception as exc:
                    logger.warning(
                        "GEV fit failed for %s / %s: %s", district, index_name, exc
                    )
                    skipped += 1
                    continue

                if scale <= 0:
                    skipped += 1
                    continue

                upserts.append(
                    DistrictGEVParams(
                        district=district,
                        index_name=index_name,
                        loc=loc,
                        scale=scale,
                        shape=shape,
                        n_years=len(values),
                        period_start=min(years),
                        period_end=max(years),
                    )
                )
                fitted += 1

            # Bulk upsert for this index
            DistrictGEVParams.objects.bulk_create(
                upserts,
                update_conflicts=True,
                unique_fields=["district", "index_name"],
                update_fields=["loc", "scale", "shape", "n_years", "period_start", "period_end", "computed_at"],
            )

            total_fitted += fitted
            total_skipped += skipped
            self.stdout.write(
                f"  {index_name}: fitted={fitted}, skipped={skipped}"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Total fitted: {total_fitted}, skipped: {total_skipped}"
            )
        )
