from django.urls import path
from .views import RegionStatsView, StatsExportView

urlpatterns = [
    path("stats/region/", RegionStatsView.as_view()),
    path("stats/export/", StatsExportView.as_view()),
]
