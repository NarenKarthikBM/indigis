"""
Management command to compute per-pixel GEV return-period rasters.

Usage:
    python manage.py compute_gev --indices TXx,TNn --return-periods 10,25,50,100
"""
from django.core.management.base import BaseCommand, CommandError

from apps.climate.services import ETCCDI_INDICES


class Command(BaseCommand):
    help = "Compute GEV return-period level rasters for ETCCDI indices"

    def add_arguments(self, parser):
        parser.add_argument(
            "--indices",
            default=",".join(ETCCDI_INDICES.keys()),
            help="Comma-separated list of indices (default: Tier 1 only)",
        )
        parser.add_argument(
            "--return-periods",
            default="10,25,50,100",
            help="Comma-separated list of return periods in years (default: 10,25,50,100)",
        )
        parser.add_argument(
            "--stagger-seconds", type=int, default=90,
            help="Countdown delay between queued tasks (default: 90s)",
        )
        parser.add_argument(
            "--sync", action="store_true",
            help="Run synchronously instead of queuing tasks",
        )

    def handle(self, *args, **options):
        indices = [i.strip() for i in options["indices"].split(",") if i.strip()]
        return_periods = [int(rp.strip()) for rp in options["return_periods"].split(",")]
        stagger = options["stagger_seconds"]
        sync_mode = options["sync"]

        unknown = [i for i in indices if i not in ETCCDI_INDICES]
        if unknown:
            raise CommandError(f"Unknown indices: {unknown}")

        countdown = 0
        for index_name in indices:
            for rp in return_periods:
                if sync_mode:
                    from apps.climate.services import compute_gev_raster_service
                    self.stdout.write(f"Computing GEV RP{rp} for {index_name} (sync)…")
                    try:
                        compute_gev_raster_service(index_name, rp)
                        self.stdout.write(self.style.SUCCESS(f"  {index_name} RP{rp}: done"))
                    except Exception as exc:
                        self.stdout.write(self.style.ERROR(f"  {index_name} RP{rp}: FAILED - {exc}"))
                else:
                    from apps.climate.tasks import compute_gev_raster
                    compute_gev_raster.apply_async(
                        args=[index_name, rp],
                        countdown=countdown,
                    )
                    self.stdout.write(
                        f"Queued GEV RP{rp} for {index_name} (countdown={countdown}s)"
                    )
                    countdown += stagger

        self.stdout.write(self.style.SUCCESS("Done"))
