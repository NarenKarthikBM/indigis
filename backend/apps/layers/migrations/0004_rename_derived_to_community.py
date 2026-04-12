from django.db import migrations, models


def rename_derived_to_community(apps, schema_editor):
    LayerCategory = apps.get_model("layers", "LayerCategory")
    LayerCategory.objects.filter(overlay_type="derived").update(overlay_type="community")


class Migration(migrations.Migration):

    dependencies = [
        ("layers", "0003_layer_metadata_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="layercategory",
            name="overlay_type",
            field=models.CharField(
                max_length=20,
                choices=[("core", "Core"), ("community", "Community")],
            ),
        ),
        migrations.RunPython(rename_derived_to_community, migrations.RunPython.noop),
    ]
