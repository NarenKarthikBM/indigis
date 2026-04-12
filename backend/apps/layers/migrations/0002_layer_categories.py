import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("layers", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="LayerCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(unique=True)),
                ("name", models.CharField(max_length=100)),
                ("overlay_type", models.CharField(
                    choices=[("core", "Core"), ("derived", "Derived")],
                    max_length=20,
                )),
                ("description", models.TextField(blank=True)),
            ],
            options={
                "verbose_name_plural": "layer categories",
                "ordering": ["overlay_type", "name"],
            },
        ),
        migrations.RemoveField(
            model_name="layer",
            name="group",
        ),
        migrations.AddField(
            model_name="layer",
            name="category",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="layers",
                to="layers.layercategory",
            ),
        ),
        migrations.AlterModelOptions(
            name="layer",
            options={"ordering": ["label"]},
        ),
    ]
