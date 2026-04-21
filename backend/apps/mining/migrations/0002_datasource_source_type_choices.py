"""
Add opentopo, stac, and earthaccess choices to DataSource.source_type.

The initial migration (0001_initial.py) only included the five original
choices.  This migration brings the DB schema in sync with the choices
already present in models.py (opentopo, stac) and adds the new one
(earthaccess).

This is a Django AlterField - a no-op at the PostgreSQL level since
choices are only enforced in Python, but needed so makemigrations
stays clean.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("mining", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="datasource",
            name="source_type",
            field=models.CharField(
                choices=[
                    ("gee", "GEE"),
                    ("chirps", "CHIRPS"),
                    ("wdpa", "WDPA"),
                    ("osm", "OSM"),
                    ("imd", "IMD"),
                    ("opentopo", "OpenTopography"),
                    ("stac", "STAC Catalogue"),
                    ("earthaccess", "NASA Earthaccess"),
                ],
                max_length=20,
            ),
        ),
    ]
