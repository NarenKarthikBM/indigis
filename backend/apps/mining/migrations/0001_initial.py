import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("layers", "0005_layer_date_range"),
    ]

    operations = [
        migrations.CreateModel(
            name="DataSource",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(unique=True)),
                ("label", models.CharField(max_length=100)),
                (
                    "source_type",
                    models.CharField(
                        choices=[
                            ("gee", "GEE"),
                            ("chirps", "CHIRPS"),
                            ("wdpa", "WDPA"),
                            ("osm", "OSM"),
                            ("imd", "IMD"),
                        ],
                        max_length=20,
                    ),
                ),
                (
                    "layer",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="data_sources",
                        to="layers.layer",
                    ),
                ),
                ("fetch_schedule", models.CharField(blank=True, max_length=100)),
                ("last_fetched_at", models.DateTimeField(blank=True, null=True)),
                ("next_fetch_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("config", models.JSONField(default=dict)),
            ],
            options={"ordering": ["label"]},
        ),
        migrations.CreateModel(
            name="MiningJob",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "source",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="jobs",
                        to="mining.datasource",
                    ),
                ),
                (
                    "layer",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="mining_jobs",
                        to="layers.layer",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("running", "Running"),
                            ("done", "Done"),
                            ("failed", "Failed"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("period_start", models.DateField(blank=True, null=True)),
                ("period_end", models.DateField(blank=True, null=True)),
                ("cog_url", models.CharField(blank=True, max_length=500, null=True)),
                ("error_message", models.TextField(blank=True, null=True)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("bytes_written", models.BigIntegerField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
