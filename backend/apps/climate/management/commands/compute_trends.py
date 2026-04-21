"""
Management command to compute per-pixel Mann-Kendall trend rasters.

Usage:
    python manage.py compute_climate_trends --indices TXx,TNn,TNx,TXn
"""
from django.core.management.base import BaseCommand, CommandError

from apps.climate.services import ETCCDI_INDICES


class Command(BaseCommand):
    help = "Compute Mann-Kendall trend rasters for ETCCDI indices"

    def add_arguments(self, parser):
        parser.add_argument(
            "--indices",
            default=",".join(ETCCDI_INDICES.keys()),
            help="Comma-separated list of indices (default: all)",
        )
        parser.add_argument(
            "--stagger-seconds", type=int, default=60,
            help="Countdown delay between queued tasks (default: 60s)",
        )
        parser.add_argument(
            "--sync", action="store_true",
            help="Run synchronously instead of queuing tasks",
        )

    def handle(self, *args, **options):
        indices = [i.strip() for i in options["indices"].split(",") if i.strip()]
        stagger = options["stagger_seconds"]
        sync_mode = options["sync"]

        unknown = [i for i in indices if i not in ETCCDI_INDICES]
        if unknown:
            raise CommandError(f"Unknown indices: {unknown}")

        countdown = 0
        for index_name in indices:
            if sync_mode:
                from apps.climate.services import compute_trend_raster_service
                self.stdout.write(f"Computing trend for {index_name} (sync)…")
                try:
                    compute_trend_raster_service(index_name)
                    self.stdout.write(self.style.SUCCESS(f"  {index_name}: done"))
                except Exception as exc:
                    self.stdout.write(self.style.ERROR(f"  {index_name}: FAILED - {exc}"))
            else:
                from apps.climate.tasks import compute_trend_raster
                compute_trend_raster.apply_async(
                    args=[index_name],
                    countdown=countdown,
                )
                self.stdout.write(f"Queued trend for {index_name} (countdown={countdown}s)")
                countdown += stagger

        self.stdout.write(self.style.SUCCESS("Done"))
