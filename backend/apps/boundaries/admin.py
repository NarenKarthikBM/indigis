from django.contrib.gis import admin
from .models import State, District


@admin.register(State)
class StateAdmin(admin.GISModelAdmin):
    list_display = ["name", "code", "area_km2"]
    search_fields = ["name", "code"]


@admin.register(District)
class DistrictAdmin(admin.GISModelAdmin):
    list_display = ["name", "code", "state"]
    list_filter = ["state"]
    search_fields = ["name", "code"]
