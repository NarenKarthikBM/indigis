import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("layers", "0006_rasterasset_mining_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="UploadTask",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("processing", "Processing"),
                            ("done", "Done"),
                            ("failed", "Failed"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                (
                    "stage",
                    models.CharField(
                        choices=[
                            ("queued", "Queued"),
                            ("extracting_metadata", "Extracting Metadata"),
                            ("converting_cog", "Converting COG"),
                            ("registering", "Registering"),
                            ("done", "Done"),
                        ],
                        default="queued",
                        max_length=30,
                    ),
                ),
                ("progress", models.IntegerField(default=0)),
                ("file_path", models.CharField(max_length=500)),
                (
                    "file_type",
                    models.CharField(
                        choices=[("tiff", "TIFF"), ("nc", "NetCDF")],
                        default="tiff",
                        max_length=10,
                    ),
                ),
                ("nc_variable", models.CharField(blank=True, max_length=200)),
                ("metadata_json", models.JSONField(blank=True, default=dict)),
                ("error_message", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "layer",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="upload_tasks",
                        to="layers.layer",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="upload_tasks",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
