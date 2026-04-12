from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("layers", "0004_rename_derived_to_community"),
    ]

    operations = [
        migrations.AddField(
            model_name="layer",
            name="date_start",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="layer",
            name="date_end",
            field=models.DateField(blank=True, null=True),
        ),
    ]
