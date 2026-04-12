import django.contrib.gis.db.models.fields
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Layer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(unique=True)),
                ("label", models.CharField(max_length=100)),
                ("group", models.CharField(choices=[("core", "Core"), ("analytical", "Analytical")], default="core", max_length=20)),
                ("layer_type", models.CharField(choices=[("raster", "Raster"), ("vector", "Vector")], default="raster", max_length=20)),
                ("temporal_type", models.CharField(choices=[("static", "Static"), ("annual", "Annual"), ("monthly", "Monthly")], default="static", max_length=20)),
                ("default_colormap", models.JSONField(blank=True, default=dict)),
                ("min_value", models.FloatField(blank=True, null=True)),
                ("max_value", models.FloatField(blank=True, null=True)),
                ("description", models.TextField(blank=True)),
                ("data_source", models.CharField(blank=True, max_length=200)),
                ("resolution", models.CharField(blank=True, max_length=50)),
                ("temporal_coverage", models.CharField(blank=True, max_length=100)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["group", "label"],
            },
        ),
        migrations.CreateModel(
            name="RasterAsset",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("cog_url", models.URLField(max_length=500)),
                ("period_label", models.CharField(blank=True, max_length=50)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("layer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="raster_assets", to="layers.layer")),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="VectorLayer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("geometry_type", models.CharField(max_length=50)),
                ("min_zoom", models.IntegerField(default=5)),
                ("max_zoom", models.IntegerField(default=18)),
                ("default_style", models.JSONField(blank=True, default=dict)),
                ("source_attribution", models.CharField(blank=True, max_length=200)),
                ("layer", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="vector_layer", to="layers.layer")),
            ],
        ),
        migrations.CreateModel(
            name="VectorFeature",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("geometry", django.contrib.gis.db.models.fields.GeometryField(srid=4326)),
                ("properties", models.JSONField(blank=True, default=dict)),
                ("layer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="features", to="layers.vectorlayer")),
            ],
        ),
        migrations.AddIndex(
            model_name="vectorfeature",
            index=models.Index(fields=["layer"], name="layers_vect_layer_i_idx"),
        ),
        migrations.RunSQL(
            "CREATE INDEX IF NOT EXISTS layers_vectorfeature_geometry_idx ON layers_vectorfeature USING GIST (geometry);",
            "DROP INDEX IF EXISTS layers_vectorfeature_geometry_idx;",
        ),
    ]
