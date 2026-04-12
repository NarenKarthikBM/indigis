import json
from pathlib import Path

from django.contrib.gis.geos import GEOSGeometry
from django.core.management.base import BaseCommand, CommandError

from apps.layers.models import Layer, VectorLayer, VectorFeature


class Command(BaseCommand):
    help = "Load a vector layer from a GeoJSON file"

    def add_arguments(self, parser):
        parser.add_argument("--slug", required=True)
        parser.add_argument("--label", required=True)
        parser.add_argument("--file", required=True)
        parser.add_argument("--geometry-type", default="LineString")
        parser.add_argument("--min-zoom", type=int, default=7)
        parser.add_argument("--max-zoom", type=int, default=18)
        parser.add_argument("--style", default="{}", help="JSON style object")
        parser.add_argument("--attribution", default="")
        parser.add_argument("--clear", action="store_true")

    def handle(self, *args, **options):
        path = Path(options["file"])
        if not path.exists():
            raise CommandError(f"File not found: {options['file']}")

        try:
            style = json.loads(options["style"])
        except json.JSONDecodeError:
            raise CommandError("Invalid JSON for --style")

        layer, _ = Layer.objects.update_or_create(
            slug=options["slug"],
            defaults={
                "label": options["label"],
                "layer_type": "vector",
                "is_active": True,
            },
        )

        vector_layer, _ = VectorLayer.objects.update_or_create(
            layer=layer,
            defaults={
                "geometry_type": options["geometry_type"],
                "min_zoom": options["min_zoom"],
                "max_zoom": options["max_zoom"],
                "default_style": style,
                "source_attribution": options["attribution"],
            },
        )

        if options["clear"]:
            VectorFeature.objects.filter(layer=vector_layer).delete()
            self.stdout.write("Cleared existing features.")

        self.stdout.write(f"Loading features from {path}...")
        with open(path) as f:
            data = json.load(f)

        features = data.get("features", [])
        batch = []
        batch_size = 500

        for feat in features:
            try:
                geom = GEOSGeometry(json.dumps(feat["geometry"]))
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"Skipping invalid geometry: {e}"))
                continue

            batch.append(VectorFeature(
                layer=vector_layer,
                geometry=geom,
                properties=feat.get("properties", {}),
            ))

            if len(batch) >= batch_size:
                VectorFeature.objects.bulk_create(batch)
                batch = []

        if batch:
            VectorFeature.objects.bulk_create(batch)

        count = VectorFeature.objects.filter(layer=vector_layer).count()
        self.stdout.write(self.style.SUCCESS(
            f"Layer '{layer.label}' loaded with {count} features"
        ))
