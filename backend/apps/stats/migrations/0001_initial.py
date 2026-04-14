import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("boundaries", "0001_initial"),
        ("layers", "0007_uploadtask"),
    ]

    operations = [
        migrations.CreateModel(
            name="RasterStateStats",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("mean", models.FloatField(null=True)),
                ("min", models.FloatField(null=True)),
                ("max", models.FloatField(null=True)),
                ("std", models.FloatField(null=True)),
                ("variance", models.FloatField(null=True)),
                ("median", models.FloatField(null=True)),
                ("p25", models.FloatField(null=True)),
                ("p75", models.FloatField(null=True)),
                ("p95", models.FloatField(null=True)),
                ("count", models.BigIntegerField(null=True)),
                ("sum", models.FloatField(null=True)),
                ("cv", models.FloatField(null=True)),
                ("histogram", models.JSONField(null=True)),
                ("computed_at", models.DateTimeField(auto_now_add=True)),
                (
                    "raster_asset",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="state_stats",
                        to="layers.rasterasset",
                    ),
                ),
                (
                    "state",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="raster_stats",
                        to="boundaries.state",
                    ),
                ),
            ],
            options={
                "unique_together": {("raster_asset", "state")},
            },
        ),
        migrations.CreateModel(
            name="RasterDistrictStats",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("mean", models.FloatField(null=True)),
                ("min", models.FloatField(null=True)),
                ("max", models.FloatField(null=True)),
                ("std", models.FloatField(null=True)),
                ("variance", models.FloatField(null=True)),
                ("median", models.FloatField(null=True)),
                ("p25", models.FloatField(null=True)),
                ("p75", models.FloatField(null=True)),
                ("p95", models.FloatField(null=True)),
                ("count", models.BigIntegerField(null=True)),
                ("sum", models.FloatField(null=True)),
                ("cv", models.FloatField(null=True)),
                ("histogram", models.JSONField(null=True)),
                ("computed_at", models.DateTimeField(auto_now_add=True)),
                (
                    "raster_asset",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="district_stats",
                        to="layers.rasterasset",
                    ),
                ),
                (
                    "district",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="raster_stats",
                        to="boundaries.district",
                    ),
                ),
            ],
            options={
                "unique_together": {("raster_asset", "district")},
            },
        ),
    ]
