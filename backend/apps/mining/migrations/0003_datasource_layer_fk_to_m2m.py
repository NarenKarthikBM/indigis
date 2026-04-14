from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Replace DataSource.layer (ForeignKey) with DataSource.layers (ManyToManyField).

    A DataSource can now be associated with multiple Layers, which is required
    for sources like ERA5 that produce many output layers per run.
    """

    dependencies = [
        ("mining", "0002_datasource_source_type_choices"),
        ("layers", "0005_layer_date_range"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="datasource",
            name="layer",
        ),
        migrations.AddField(
            model_name="datasource",
            name="layers",
            field=models.ManyToManyField(
                blank=True,
                related_name="data_sources",
                to="layers.layer",
            ),
        ),
    ]
