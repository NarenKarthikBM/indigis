from django.db import models


class DistrictGEVParams(models.Model):
    """
    Pre-computed GEV distribution parameters for a district's annual time series.

    Fitted via scipy MLE (genextreme.fit) on the district's spatially-averaged
    annual ETCCDI values.  These parameters let the frontend render an exact
    GEV return-level curve at any return period without re-fitting.

    shape (ξ) follows scipy's sign convention:
      shape > 0  →  Fréchet  (heavy / unbounded upper tail)
      shape ≈ 0  →  Gumbel   (light tail, exponential decay)
      shape < 0  →  Weibull  (bounded upper tail)
    """

    district = models.ForeignKey(
        "boundaries.District",
        on_delete=models.CASCADE,
        related_name="gev_params",
    )
    index_name = models.CharField(max_length=20)
    loc = models.FloatField(help_text="GEV location parameter μ")
    scale = models.FloatField(help_text="GEV scale parameter σ (> 0)")
    shape = models.FloatField(help_text="GEV shape parameter ξ (scipy sign convention)")
    n_years = models.IntegerField(help_text="Number of annual values used in the fit")
    period_start = models.IntegerField(help_text="First year in the fitted series")
    period_end = models.IntegerField(help_text="Last year in the fitted series")
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("district", "index_name")]
        indexes = [models.Index(fields=["index_name"])]

    def __str__(self) -> str:
        return f"{self.district} {self.index_name} GEV(ξ={self.shape:.3f})"
