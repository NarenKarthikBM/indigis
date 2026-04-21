"""
Management command to compute per-pixel Pearson R correlation rasters between
ETCCDI indices and teleconnection indices (SOI, MEI, IOD) or seasonal SOI.

Teleconnection data must be provided as JSON files at TELECONNECTION_DIR
(default: /data/teleconnections/).  File naming: {tc_name.lower()}.json

Expected JSON format::

    {
        "name": "SOI",
        "yearly": {
            "1990": -0.52,
            "1991":  0.34,
            "1992":  1.12,
            ...
        }
    }

Seasonal SOI data (nino_seasonal.json) format::

    {
        "DJF": {"1990": -0.52, ...},
        "MAM": {"1990":  0.34, ...},
        "JJAS": {"1990":  1.12, ...}
    }

Usage:
    python manage.py compute_correlations
    python manage.py compute_correlations --indices TXx,TNn --teleconnections SOI,MEI
    python manage.py compute_correlations --seasonal --seasons DJF,MAM,JJAS
    python manage.py compute_correlations --sync
"""
from django.core.management.base import BaseCommand, CommandError

from apps.climate.services import ETCCDI_INDICES, IOD_SEASONS, TELECONNECTION_INDICES, SOI_SEASONS


class Command(BaseCommand):
    help = "Compute per-pixel Pearson R correlation rasters (ETCCDI × teleconnection / seasonal SOI)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--indices",
            default=",".join(ETCCDI_INDICES.keys()),
            help="Comma-separated ETCCDI indices (default: all)",
        )
        parser.add_argument(
            "--teleconnections",
            default=",".join(TELECONNECTION_INDICES.keys()),
            help="Comma-separated teleconnection indices for annual correlation (default: all)",
        )
        parser.add_argument(
            "--seasonal",
            action="store_true",
            help="Compute seasonal SOI correlations instead of (or in addition to) annual",
        )
        parser.add_argument(
            "--seasons",
            default=",".join(SOI_SEASONS) if SOI_SEASONS else "DJF,MAM,JJAS",
            help="Comma-separated seasons for seasonal SOI correlation (default: all available)",
        )
        parser.add_argument(
            "--annual",
            action="store_true",
            default=False,
            help="Also compute annual teleconnection correlations when --seasonal is set",
        )
        parser.add_argument(
            "--stagger-seconds", type=int, default=60,
            help="Countdown delay between queued tasks (default: 60s)",
        )
        parser.add_argument(
            "--sync", action="store_true",
            help="Run synchronously instead of queuing Celery tasks",
        )

    def handle(self, *args, **options):
        indices = [i.strip() for i in options["indices"].split(",") if i.strip()]
        teleconnections = [t.strip() for t in options["teleconnections"].split(",") if t.strip()]
        seasons = [s.strip() for s in options["seasons"].split(",") if s.strip()]
        stagger = options["stagger_seconds"]
        sync_mode = options["sync"]
        do_seasonal = options["seasonal"]
        do_annual = options["annual"] or not do_seasonal

        unknown_indices = [i for i in indices if i not in ETCCDI_INDICES]
        if unknown_indices:
            raise CommandError(f"Unknown ETCCDI indices: {unknown_indices}")

        unknown_tc = [t for t in teleconnections if t not in TELECONNECTION_INDICES]
        if unknown_tc:
            raise CommandError(
                f"Unknown teleconnection indices: {unknown_tc}. "
                f"Valid: {list(TELECONNECTION_INDICES)}"
            )

        if do_seasonal and not SOI_SEASONS:
            raise CommandError("No seasonal SOI data available in services.py SEASONAL_SOI.")

        if do_seasonal:
            if teleconnections[0] == "SOI":
                unknown_seasons = [s for s in seasons if s not in SOI_SEASONS]      
            else:
                unknown_seasons = [s for s in seasons if s not in IOD_SEASONS]      
            if unknown_seasons:
                raise CommandError(
                    f"Unknown seasons: {unknown_seasons}. Available: {SOI_SEASONS}"
                )

        countdown = 0

        # Annual teleconnection correlations
        if do_annual:
            total = len(indices) * len(teleconnections)
            self.stdout.write(
                f"Computing {total} annual correlation rasters "
                f"({len(indices)} indices × {len(teleconnections)} teleconnections)"
            )
            for tc_name in teleconnections:
                for index_name in indices:
                    label = f"{index_name} × {tc_name}"
                    if sync_mode:
                        from apps.climate.services import compute_correlation_raster_service
                        self.stdout.write(f"  {label} (sync)…")
                        try:
                            compute_correlation_raster_service(index_name, tc_name)
                            self.stdout.write(self.style.SUCCESS(f"  {label}: done"))
                        except FileNotFoundError as exc:
                            self.stdout.write(
                                self.style.WARNING(f"  {label}: skipped - {exc}")
                            )
                        except Exception as exc:
                            self.stdout.write(self.style.ERROR(f"  {label}: FAILED - {exc}"))
                    else:
                        from apps.climate.tasks import compute_correlation_raster
                        compute_correlation_raster.apply_async(
                            args=[index_name, tc_name],
                            countdown=countdown,
                        )
                        self.stdout.write(
                            f"  Queued {label} (countdown={countdown}s)"
                        )
                        countdown += stagger

        # Seasonal SOI correlations
        if do_seasonal:
            total_seasonal = len(indices) * len(seasons)
            teleconnection_name = teleconnections[0]
            self.stdout.write(
                f"Computing {total_seasonal} seasonal {teleconnection_name} correlation rasters "
                f"({len(indices)} indices × {len(seasons)} seasons: {seasons})"
            )
            for season in seasons:
                for index_name in indices:
                    label = f"{index_name} × {teleconnection_name}/{season}"
                    if sync_mode:
                        from apps.climate.services import compute_seasonal_correlation_raster_service
                        self.stdout.write(f"  {label} (sync)…")
                        try:
                            compute_seasonal_correlation_raster_service(index_name, teleconnection_name, season)
                            self.stdout.write(self.style.SUCCESS(f"  {label}: done"))
                        except FileNotFoundError as exc:
                            self.stdout.write(
                                self.style.WARNING(f"  {label}: skipped - {exc}")
                            )
                        except Exception as exc:
                            self.stdout.write(self.style.ERROR(f"  {label}: FAILED - {exc}"))
                    else:
                        from apps.climate.tasks import compute_seasonal_correlation_raster
                        compute_seasonal_correlation_raster.apply_async(
                            args=[index_name, teleconnection_name, season],
                            countdown=countdown,
                        )
                        self.stdout.write(
                            f"  Queued {label} (countdown={countdown}s)"
                        )
                        countdown += stagger

        self.stdout.write(self.style.SUCCESS("Done"))
