from django.urls import path

from . import views

urlpatterns = [
    path("mining/sources/", views.DataSourceListView.as_view()),
    path("mining/sources/<slug:slug>/", views.DataSourceDetailView.as_view()),
    path("mining/sources/<slug:slug>/trigger/", views.TriggerMiningView.as_view()),
    path("mining/jobs/", views.MiningJobListView.as_view()),
    path("mining/jobs/<uuid:id>/", views.MiningJobDetailView.as_view()),
]
