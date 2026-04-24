from .base import *  # noqa
from .base import BASE_REST_FRAMEWORK

DEBUG = True
ALLOWED_HOSTS = ["*"]
SECURE_CROSS_ORIGIN_OPENER_POLICY = None

CORS_ALLOW_ALL_ORIGINS = True

REST_FRAMEWORK = {
    **BASE_REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}
