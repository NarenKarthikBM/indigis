"""
Management command to backfill the time-series of annual ETCCDI means into the
histogram field of the corresponding trend raster's state/district stats rows.

Run this after:
  1. compute_etccdi (annual assets + zonal stats computed)
  2. compute_climate_trends (trend raster + zonal stats computed)

Usage:
    python manage.py populate_trend_timeseries --indices TXx,TNn,TNx,TXn
"""
from django.core.management.base import BaseCommand, CommandError

from apps.climate.services import ETCCDI_INDICES


class Command(BaseCommand):
    help = "Backfill annual ETCCDI mean time series into trend raster histogram field"

    def add_arguments(self, parser):
        parser.add_argument(
            "--indices",
            default=",".join(ETCCDI_INDICES.keys()),
            help="Comma-separated list of indices (default: all)",
        )

    def handle(self, *args, **options):
        from apps.climate.services import populate_trend_timeseries_service

        indices = [i.strip() for i in options["indices"].split(",") if i.strip()]
        unknown = [i for i in indices if i not in ETCCDI_INDICES]
        if unknown:
            raise CommandError(f"Unknown indices: {unknown}")

        for index_name in indices:
            self.stdout.write(f"Populating time series for {index_name}…")
            try:
                summary = populate_trend_timeseries_service(index_name)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  {index_name}: "
                        f"states {summary['states_updated']} updated / {summary['states_skipped']} skipped, "
                        f"districts {summary['districts_updated']} updated / {summary['districts_skipped']} skipped"
                    )
                )
            except Exception as exc:
                self.stdout.write(self.style.ERROR(f"  {index_name}: FAILED - {exc}"))

        self.stdout.write(self.style.SUCCESS("Done"))
