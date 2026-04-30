from django.contrib import admin
from .models import DistrictGEVParams

@admin.register(DistrictGEVParams)
class DistrictGEVParamsAdmin(admin.ModelAdmin):
    list_display = ["index_name", "district"]

