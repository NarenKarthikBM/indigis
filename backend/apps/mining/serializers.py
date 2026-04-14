from rest_framework import serializers

from .models import DataSource, MiningJob


class MiningJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = MiningJob
        fields = [
            "id",
            "source",
            "layer",
            "status",
            "period_start",
            "period_end",
            "cog_url",
            "error_message",
            "started_at",
            "completed_at",
            "bytes_written",
            "created_at",
        ]


class DataSourceListSerializer(serializers.ModelSerializer):
    last_job_status = serializers.SerializerMethodField()

    class Meta:
        model = DataSource
        fields = [
            "slug",
            "label",
            "source_type",
            "is_active",
            "last_fetched_at",
            "next_fetch_at",
            "last_job_status",
        ]

    def get_last_job_status(self, obj):
        job = obj.jobs.order_by("-created_at").first()
        return job.status if job else None


class DataSourceDetailSerializer(serializers.ModelSerializer):
    recent_jobs = serializers.SerializerMethodField()

    class Meta:
        model = DataSource
        fields = [
            "slug",
            "label",
            "source_type",
            "layers",
            "fetch_schedule",
            "last_fetched_at",
            "next_fetch_at",
            "is_active",
            "config",
            "recent_jobs",
        ]

    def get_recent_jobs(self, obj):
        jobs = obj.jobs.order_by("-created_at")[:10]
        return MiningJobSerializer(jobs, many=True).data
