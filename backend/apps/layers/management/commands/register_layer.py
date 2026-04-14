import json

from django.core.management.base import BaseCommand, CommandError

from apps.layers.models import Layer, LayerCategory, RasterAsset


class Command(BaseCommand):
    help = "Register a raster layer and its COG URL"

    def add_arguments(self, parser):
        parser.add_argument("--slug", required=True)
        parser.add_argument("--label", required=True)
        parser.add_argument("--category-slug", default="", dest="category_slug")
        parser.add_argument("--cog-url", required=True)
        parser.add_argument("--colormap", default="viridis")
        parser.add_argument("--min", type=float, dest="min_value")
        parser.add_argument("--max", type=float, dest="max_value")
        parser.add_argument("--description", default="")
        parser.add_argument("--data-source", default="")
        parser.add_argument("--resolution", default="")
        parser.add_argument("--temporal-coverage", default="")
        parser.add_argument("--period-label", default="")
        parser.add_argument("--no-stats", action="store_true", dest="no_stats",
                            help="Skip zonal stats computation after registration")

    def handle(self, *args, **options):
        category = None
        if options["category_slug"]:
            try:
                category = LayerCategory.objects.get(slug=options["category_slug"])
            except LayerCategory.DoesNotExist:
                self.stdout.write(self.style.WARNING(f"Category '{options['category_slug']}' not found; layer will have no category."))

        layer, created = Layer.objects.update_or_create(
            slug=options["slug"],
            defaults={
                "label": options["label"],
                "category": category,
                "layer_type": "raster",
                "default_colormap": {"name": options["colormap"]},
                "min_value": options["min_value"],
                "max_value": options["max_value"],
                "description": options["description"],
                "data_source": options["data_source"],
                "resolution": options["resolution"],
                "temporal_coverage": options["temporal_coverage"],
                "is_active": True,
            },
        )

        if options["no_stats"]:
            asset = RasterAsset.objects.create(
                layer=layer,
                cog_url=options["cog_url"],
                period_label=options["period_label"],
            )
        else:
            from apps.layers.services import create_raster_asset_and_queue_stats
            asset = create_raster_asset_and_queue_stats(
                layer=layer,
                cog_url=options["cog_url"],
                period_label=options["period_label"],
            )

        action = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} layer '{layer.label}' (slug: {layer.slug}) with COG: {asset.cog_url}"
            )
        )
