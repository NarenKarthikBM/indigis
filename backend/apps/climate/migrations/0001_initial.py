from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("boundaries", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="DistrictGEVParams",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "district",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="gev_params",
                        to="boundaries.district",
                    ),
                ),
                ("index_name", models.CharField(max_length=20)),
                ("loc", models.FloatField(help_text="GEV location parameter μ")),
                ("scale", models.FloatField(help_text="GEV scale parameter σ (> 0)")),
                ("shape", models.FloatField(help_text="GEV shape parameter ξ (scipy sign convention)")),
                ("n_years", models.IntegerField(help_text="Number of annual values used in the fit")),
                ("period_start", models.IntegerField(help_text="First year in the fitted series")),
                ("period_end", models.IntegerField(help_text="Last year in the fitted series")),
                ("computed_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "unique_together": {("district", "index_name")},
            },
        ),
        migrations.AddIndex(
            model_name="districtgevparams",
            index=models.Index(fields=["index_name"], name="climate_gev_index_name_idx"),
        ),
    ]
