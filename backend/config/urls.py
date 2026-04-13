from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.users.urls")),
    path("api/v1/", include("apps.boundaries.urls")),
    path("api/v1/", include("apps.layers.urls")),
    path("api/v1/", include("apps.workflows.urls")),
    path("api/v1/", include("apps.mining.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
