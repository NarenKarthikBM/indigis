"""
Management command to batch-compute ETCCDI climate indices.

Usage:
    python manage.py compute_etccdi --indices TXx,TNn,TNx,TXn \\
        --start-year 1990 --end-year 2024

For Tier 2 indices (TX90p, TN10p, WSDI, CSDI), run compute_baseline first.
"""
from django.core.management.base import BaseCommand, CommandError

from apps.climate.services import ETCCDI_INDICES, era5_nc_exists


class Command(BaseCommand):
    help = "Compute ETCCDI climate indices from archived ERA5 NetCDF files"

    def add_arguments(self, parser):
        parser.add_argument(
            "--indices",
            default=",".join(ETCCDI_INDICES.keys()),
            help="Comma-separated list of indices to compute (default: all)",
        )
        parser.add_argument(
            "--start-year", type=int, default=1990,
            help="First year to process (default: 1990)",
        )
        parser.add_argument(
            "--end-year", type=int, default=2024,
            help="Last year to process (default: 2024)",
        )
        parser.add_argument(
            "--stagger-seconds", type=int, default=30,
            help="Countdown delay between queued tasks in seconds (default: 30)",
        )
        parser.add_argument(
            "--sync", action="store_true",
            help="Run synchronously instead of queuing Celery tasks",
        )
        parser.add_argument(
            "--skip-existing", action="store_true", default=True,
            help="Skip year/index combinations that already have a RasterAsset",
        )

    def handle(self, *args, **options):
        indices = [i.strip() for i in options["indices"].split(",") if i.strip()]
        start_year = options["start_year"]
        end_year = options["end_year"]
        stagger = options["stagger_seconds"]
        sync_mode = options["sync"]

        # Validate
        unknown = [i for i in indices if i not in ETCCDI_INDICES]
        if unknown:
            raise CommandError(f"Unknown indices: {unknown}. Valid: {list(ETCCDI_INDICES.keys())}")

        from apps.layers.models import RasterAsset

        queued = skipped = missing_nc = 0
        countdown = 0

        for index_name in indices:
            cfg = ETCCDI_INDICES[index_name]
            self.stdout.write(f"\n=== {index_name} (Tier {cfg['tier']}) ===")

            for year in range(start_year, end_year + 1):
                variable = cfg["variable"]
                cds_stat = cfg["cds_stat"]

                # Check if source NC exists
                if not era5_nc_exists(variable, cds_stat, year):
                    self.stdout.write(
                        self.style.WARNING(f"  {year}: source NC missing - skip")
                    )
                    missing_nc += 1
                    continue

                # Skip if already computed
                if options["skip_existing"]:
                    etccdi_slug = f"etccdi-{index_name.lower()}"
                    if RasterAsset.objects.filter(
                        layer__slug=etccdi_slug,
                        period_label=str(year),
                    ).exists():
                        self.stdout.write(f"  {year}: already exists - skip")
                        skipped += 1
                        continue

                if sync_mode:
                    from apps.climate.services import compute_etccdi_index_service
                    self.stdout.write(f"  {year}: computing (sync)…")
                    try:
                        compute_etccdi_index_service(index_name, year)
                        self.stdout.write(self.style.SUCCESS(f"  {year}: done"))
                    except Exception as exc:
                        self.stdout.write(self.style.ERROR(f"  {year}: FAILED - {exc}"))
                else:
                    from apps.climate.tasks import compute_etccdi_index
                    compute_etccdi_index.apply_async(
                        args=[index_name, year],
                        kwargs={"countdown": 0},
                        countdown=countdown,
                    )
                    self.stdout.write(f"  {year}: queued (countdown={countdown}s)")
                    countdown += stagger
                    queued += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. Queued: {queued}, Skipped: {skipped}, Missing NC: {missing_nc}"
            )
        )
