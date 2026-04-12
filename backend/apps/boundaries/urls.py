from django.urls import path
from . import views

urlpatterns = [
    path("boundaries/states/", views.StateListView.as_view(), name="state-list"),
    path("boundaries/districts/", views.DistrictListView.as_view(), name="district-list"),
    path("boundaries/search/", views.RegionSearchView.as_view(), name="region-search"),
]
