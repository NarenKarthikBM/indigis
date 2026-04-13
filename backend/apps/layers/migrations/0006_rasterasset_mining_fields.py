import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("layers", "0005_layer_date_range"),
        ("mining", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="rasterasset",
            name="parameters",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="rasterasset",
            name="data_period_start",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="rasterasset",
            name="data_period_end",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="rasterasset",
            name="source",
            field=models.CharField(
                choices=[("bot", "Bot"), ("user", "User"), ("system", "System")],
                default="user",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="rasterasset",
            name="mining_job",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="raster_assets",
                to="mining.miningjob",
            ),
        ),
    ]
