"""
Management command to compute ERA5 baseline percentiles for Tier 2 ETCCDI indices.

Usage:
    python manage.py compute_baseline \\
        --start-year 1991 --end-year 2020

This creates:
  /data/era5_nc/baselines/pctl90_daily_maximum.nc  (for TX90p, WSDI)
  /data/era5_nc/baselines/pctl10_daily_minimum.nc  (for TN10p, CSDI)
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Compute ERA5 calendar-day percentile baselines for Tier 2 ETCCDI indices"

    def add_arguments(self, parser):
        parser.add_argument(
            "--start-year", type=int, default=1991,
            help="First year of baseline period (WMO standard: 1991)",
        )
        parser.add_argument(
            "--end-year", type=int, default=2020,
            help="Last year of baseline period (WMO standard: 2020)",
        )

    def handle(self, *args, **options):
        from apps.climate.services import compute_baseline_percentiles_service

        start_year = options["start_year"]
        end_year = options["end_year"]

        # TX90p / WSDI: 90th percentile of daily maximum
        self.stdout.write("Computing 90th percentile of daily maximum (for TX90p / WSDI)…")
        try:
            path = compute_baseline_percentiles_service(
                cds_stat="daily_maximum",
                pctl=90,
                start_year=start_year,
                end_year=end_year,
            )
            self.stdout.write(self.style.SUCCESS(f"  → {path}"))
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f"  FAILED: {exc}"))

        # TN10p / CSDI: 10th percentile of daily minimum
        self.stdout.write("Computing 10th percentile of daily minimum (for TN10p / CSDI)…")
        try:
            path = compute_baseline_percentiles_service(
                cds_stat="daily_minimum",
                pctl=10,
                start_year=start_year,
                end_year=end_year,
            )
            self.stdout.write(self.style.SUCCESS(f"  → {path}"))
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f"  FAILED: {exc}"))
