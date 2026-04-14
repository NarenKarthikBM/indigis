from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("layers", "0007_uploadtask"),
    ]

    operations = [
        migrations.AddField(
            model_name="rasterasset",
            name="min_value",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="rasterasset",
            name="max_value",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
