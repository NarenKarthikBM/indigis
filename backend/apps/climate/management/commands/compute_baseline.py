"""
Management command to compute ERA5 baseline percentiles for Tier 2 ETCCDI indices.

Usage:
    python manage.py compute_baseline \\
        --start-year 1991 --end-year 2020

    # Compute only specific baselines:
    python manage.py compute_baseline --baselines TX90p,TN10p
    python manage.py compute_baseline --baselines R95p
    python manage.py compute_baseline --baselines TX90p,TN10p,R95p,R99p

This creates:
  /data/era5_nc/baselines/pctl90_daily_maximum.nc  (for TX90p, WSDI)
  /data/era5_nc/baselines/pctl10_daily_minimum.nc  (for TN10p, CSDI)
  /data/era5_nc/baselines/pctl95_daily_sum.nc      (for R95p)
  /data/era5_nc/baselines/pctl99_daily_sum.nc      (for R99p)
"""
from django.core.management.base import BaseCommand, CommandError

ALL_BASELINES = ["TX90p", "TN10p", "R95p", "R99p"]

BASELINE_CONFIGS = {
    "TX90p": dict(
        label="90th percentile of daily maximum (for TX90p / WSDI)",
        cds_stat="daily_maximum",
        pctl=90,
        variable="2m_temperature",
    ),
    "TN10p": dict(
        label="10th percentile of daily minimum (for TN10p / CSDI)",
        cds_stat="daily_minimum",
        pctl=10,
        variable="2m_temperature",
    ),
    "R95p": dict(
        label="95th percentile of daily precipitation sum (for R95p)",
        cds_stat="daily_sum",
        pctl=95,
        variable="total_precipitation",
    ),
    "R99p": dict(
        label="99th percentile of daily precipitation sum (for R99p)",
        cds_stat="daily_sum",
        pctl=99,
        variable="total_precipitation",
    ),
}


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
        parser.add_argument(
            "--baselines",
            type=str,
            default=None,
            help=(
                "Comma-separated list of baselines to compute. "
                f"Choices: {', '.join(ALL_BASELINES)}. "
                "Defaults to all baselines."
            ),
        )

    def handle(self, *args, **options):
        from apps.climate.services import compute_baseline_percentiles_service

        start_year = options["start_year"]
        end_year = options["end_year"]

        if options["baselines"]:
            requested = [b.strip() for b in options["baselines"].split(",")]
            invalid = [b for b in requested if b not in BASELINE_CONFIGS]
            if invalid:
                raise CommandError(
                    f"Unknown baseline(s): {', '.join(invalid)}. "
                    f"Valid choices: {', '.join(ALL_BASELINES)}"
                )
            selected = requested
        else:
            selected = ALL_BASELINES

        for name in selected:
            cfg = BASELINE_CONFIGS[name]
            self.stdout.write(f"Computing {cfg['label']}…")
            try:
                path = compute_baseline_percentiles_service(
                    cds_stat=cfg["cds_stat"],
                    pctl=cfg["pctl"],
                    start_year=start_year,
                    end_year=end_year,
                    variable=cfg["variable"],
                )
                self.stdout.write(self.style.SUCCESS(f"  → {path}"))
            except Exception as exc:
                self.stdout.write(self.style.ERROR(f"  FAILED: {exc}"))
