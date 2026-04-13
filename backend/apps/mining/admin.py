from django.contrib import admin

from .models import DataSource, MiningJob


@admin.register(DataSource)
class DataSourceAdmin(admin.ModelAdmin):
    list_display = ["slug", "label", "source_type", "is_active", "last_fetched_at", "next_fetch_at"]
    list_filter = ["source_type", "is_active"]
    search_fields = ["slug", "label"]
    readonly_fields = ["last_fetched_at"]


@admin.register(MiningJob)
class MiningJobAdmin(admin.ModelAdmin):
    list_display = ["id", "source", "status", "period_start", "period_end", "bytes_written", "created_at"]
    list_filter = ["status", "source"]
    search_fields = ["source__slug"]
    readonly_fields = ["id", "created_at", "started_at", "completed_at"]
