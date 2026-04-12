from django.urls import path
from .views import (
    WorkflowListCreateView,
    WorkflowDetailView,
    WorkflowExecuteView,
    SaveAsLayerView,
)

urlpatterns = [
    path("workflows/", WorkflowListCreateView.as_view(), name="workflow-list"),
    path("workflows/<int:pk>/", WorkflowDetailView.as_view(), name="workflow-detail"),
    path("workflows/execute/", WorkflowExecuteView.as_view(), name="workflow-execute"),
    path("workflows/<int:pk>/save-as-layer/", SaveAsLayerView.as_view(), name="workflow-save-as-layer"),
]
