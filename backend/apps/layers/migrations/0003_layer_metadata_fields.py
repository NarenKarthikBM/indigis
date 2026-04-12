from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("layers", "0002_layer_categories"),
    ]

    operations = [
        migrations.AddField(
            model_name="layer",
            name="spatial_resolution_m",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="layer",
            name="native_crs",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name="layer",
            name="bbox",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="layer",
            name="band_count",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="layer",
            name="pixel_dtype",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AlterField(
            model_name="rasterasset",
            name="cog_url",
            field=models.CharField(max_length=500),
        ),
    ]
