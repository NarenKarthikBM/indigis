from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include, re_path
from django.http import FileResponse, Http404

def serve_react(request):
    index = settings.BASE_DIR / "frontend" / "dist" / "index.html"
    if not index.exists():
        raise Http404("Frontend not built")
    return FileResponse(open(index, "rb"), content_type="text/html")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.users.urls")),
    path("api/v1/", include("apps.boundaries.urls")),
    path("api/v1/", include("apps.layers.urls")),
    path("api/v1/", include("apps.workflows.urls")),
    path("api/v1/", include("apps.mining.urls")),
    path("api/v1/", include("apps.stats.urls")),
    path("api/v1/", include("apps.climate.urls")),
    # Serve React app for all non-API routes
    re_path(r"^(?!api/|admin/|static/|media/).*$", serve_react),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
