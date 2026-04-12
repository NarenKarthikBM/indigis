from django.urls import path
from . import views

urlpatterns = [
    path("categories/", views.LayerCategoryListView.as_view(), name="category-list"),
    path("layers/", views.LayerListView.as_view(), name="layer-list"),
    path("layers/inspect/", views.RasterInspectView.as_view(), name="layer-inspect"),
    path("layers/upload/", views.RasterUploadView.as_view(), name="layer-upload"),
    path("layers/<slug:slug>/", views.LayerDetailView.as_view(), name="layer-detail"),
    path("layers/<slug:slug>/tile-url/", views.TileURLView.as_view(), name="layer-tile-url"),
    path("vectors/", views.LayerListView.as_view(), name="vector-list"),
    path("vectors/<slug:slug>/tiles/<int:z>/<int:x>/<int:y>.pbf", views.VectorTileView.as_view(), name="vector-tile"),
]
