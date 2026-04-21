from django.urls import path
from apps.climate import views

urlpatterns = [
    path("climate/indices/", views.indices_list, name="climate-indices"),
    path("climate/choropleth/", views.choropleth, name="climate-choropleth"),
    path("climate/profile/<str:district_code>/", views.district_profile, name="climate-district-profile"),
    path("climate/rankings/", views.rankings, name="climate-rankings"),
]
