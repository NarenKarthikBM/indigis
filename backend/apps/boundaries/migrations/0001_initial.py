import django.contrib.gis.db.models.fields
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="State",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100)),
                ("code", models.CharField(max_length=10, unique=True)),
                ("geometry", django.contrib.gis.db.models.fields.MultiPolygonField(srid=4326)),
                ("centroid", django.contrib.gis.db.models.fields.PointField(blank=True, null=True, srid=4326)),
                ("area_km2", models.FloatField(blank=True, null=True)),
                ("properties", models.JSONField(blank=True, default=dict)),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="District",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100)),
                ("code", models.CharField(max_length=20)),
                ("geometry", django.contrib.gis.db.models.fields.MultiPolygonField(srid=4326)),
                ("centroid", django.contrib.gis.db.models.fields.PointField(blank=True, null=True, srid=4326)),
                ("area_km2", models.FloatField(blank=True, null=True)),
                ("properties", models.JSONField(blank=True, default=dict)),
                ("state", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="districts", to="boundaries.state")),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.AlterUniqueTogether(
            name="district",
            unique_together={("code", "state")},
        ),
    ]
