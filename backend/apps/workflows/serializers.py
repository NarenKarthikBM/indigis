from rest_framework import serializers
from .models import Workflow, WorkflowRun


class WorkflowSerializer(serializers.ModelSerializer):
    owner_username = serializers.ReadOnlyField(source="owner.username")

    class Meta:
        model = Workflow
        fields = ["id", "name", "description", "owner_username",
                  "graph_data", "created_at", "updated_at"]
        read_only_fields = ["id", "owner_username", "created_at", "updated_at"]


class WorkflowRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowRun
        fields = ["id", "workflow", "status", "result",
                  "error_message", "failed_node_id", "created_at"]
        read_only_fields = fields
