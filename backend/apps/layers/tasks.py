import os
import shutil
import traceback
import uuid
from datetime import date

from celery import shared_task
from django.conf import settings
from django.utils.text import slugify

from . import services
from .models import Layer, LayerCategory, RasterAsset, UploadTask


def _get_cog_dir() -> str:
    return getattr(settings, "COG_STORAGE_PATH", "/cogs")


def _resolve_category(metadata_json: dict) -> LayerCategory | None:
    overlay_type = metadata_json.get("overlay_type", "community")
    category_slug = metadata_json.get("category_slug", "")
    category_name = metadata_json.get("category_name", "")

    if category_slug:
        try:
            return LayerCategory.objects.get(slug=category_slug)
        except LayerCategory.DoesNotExist:
            pass

    if category_name:
        derived_slug = slugify(category_name)
        category, _ = LayerCategory.objects.get_or_create(
            slug=derived_slug,
            defaults={"name": category_name, "overlay_type": overlay_type},
        )
        return category

    return None


def _make_unique_slug(base: str) -> str:
    slug = slugify(base)
    if Layer.objects.filter(slug=slug).exists():
        slug = f"{slug}-{str(uuid.uuid4())[:6]}"
    return slug


@shared_task(
    name="apps.layers.tasks.process_raster_upload",
    queue="uploads",
    bind=True,
    max_retries=0,
    acks_late=True,
)
def process_raster_upload(self, task_id: str):
    try:
        task = UploadTask.objects.get(pk=task_id)
    except UploadTask.DoesNotExist:
        return

    cog_path = None
    try:
        UploadTask.objects.filter(pk=task_id).update(status=UploadTask.STATUS_PROCESSING)

        # ── 1. Extract metadata ────────────────────────────────────────────
        services._update_task_stage(task_id, UploadTask.STAGE_EXTRACTING, 10)
        metadata = services.extract_raster_metadata(task.file_path)

        # ── 2. Convert to COG ──────────────────────────────────────────────
        services._update_task_stage(task_id, UploadTask.STAGE_CONVERTING, 30)
        meta = task.metadata_json
        label = meta.get("label", os.path.basename(task.file_path))
        layer_slug = _make_unique_slug(label)
        cog_dir = _get_cog_dir()
        os.makedirs(cog_dir, exist_ok=True)
        cog_path = os.path.join(cog_dir, f"{layer_slug}.tif")
        services.convert_to_cog(task.file_path, cog_path)

        # ── 3. Register layer ──────────────────────────────────────────────
        services._update_task_stage(task_id, UploadTask.STAGE_REGISTERING, 90)

        # Manual date overrides take precedence over TIFF-extracted dates
        try:
            if meta.get("date_start"):
                metadata["date_start"] = date.fromisoformat(meta["date_start"])
            if meta.get("date_end"):
                metadata["date_end"] = date.fromisoformat(meta["date_end"])
        except (ValueError, TypeError):
            pass

        category = _resolve_category(meta)
        colormap_name = meta.get("colormap_name", "viridis")

        layer = Layer.objects.create(
            slug=layer_slug,
            label=label,
            category=category,
            layer_type="raster",
            default_colormap={"name": colormap_name},
            description=meta.get("description", ""),
            data_source="user_upload",
            **metadata,
        )
        services.create_raster_asset_and_queue_stats(
            layer=layer,
            cog_url=f"/data/cogs/{layer_slug}.tif",
            source=RasterAsset.SOURCE_USER,
        )

        # ── 4. Clean up tmp file ───────────────────────────────────────────
        if os.path.exists(task.file_path):
            os.unlink(task.file_path)

        UploadTask.objects.filter(pk=task_id).update(
            status=UploadTask.STATUS_DONE,
            stage=UploadTask.STAGE_DONE,
            progress=100,
            layer=layer,
        )

    except Exception as exc:
        err_msg = f"{exc}\n{traceback.format_exc()}"
        UploadTask.objects.filter(pk=task_id).update(
            status=UploadTask.STATUS_FAILED,
            error_message=err_msg[:2000],
        )
        for path in filter(None, [getattr(task, "file_path", None), cog_path]):
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except OSError:
                    pass


@shared_task(
    name="apps.layers.tasks.process_netcdf_variable",
    queue="uploads",
    bind=True,
    max_retries=0,
    acks_late=True,
)
def process_netcdf_variable(self, task_id: str):
    try:
        task = UploadTask.objects.get(pk=task_id)
    except UploadTask.DoesNotExist:
        return

    out_dir = f"/tmp/{task_id}"
    try:
        UploadTask.objects.filter(pk=task_id).update(status=UploadTask.STATUS_PROCESSING)
        services._update_task_stage(task_id, UploadTask.STAGE_EXTRACTING, 10)

        variable = task.nc_variable
        meta = task.metadata_json

        # ── 1. Extract variable to per-time-step TIFFs ────────────────────
        extracted_tifs = services.extract_nc_variable_to_tiffs(task.file_path, variable, out_dir)
        tif_list = extracted_tifs["rasters"]

        # ── 2. Create one Layer for this variable ─────────────────────────
        services._update_task_stage(task_id, UploadTask.STAGE_REGISTERING, 40)
        label_prefix = meta.get("label_prefix", "")
        label = f"{label_prefix} {variable}".strip() if label_prefix else variable
        layer_slug = _make_unique_slug(label)
        category = _resolve_category(meta)
        colormap_name = meta.get("colormap_name", "viridis")

        layer = Layer.objects.create(
            slug=layer_slug,
            label=label,
            category=category,
            min_value=extracted_tifs.get("min"),
            max_value=extracted_tifs.get("max"),
            layer_type="raster",
            default_colormap={"name": colormap_name},
            description=meta.get("description", ""),
            data_source="user_upload_nc",
        )

        # ── 3. Convert each TIFF to COG + create RasterAsset ─────────────
        cog_dir = _get_cog_dir()
        os.makedirs(cog_dir, exist_ok=True)
        total = len(tif_list)

        for i, tif in enumerate(tif_list):
            period_label = tif["period_label"]
            asset_slug = f"{layer_slug}_{period_label}" if period_label else layer_slug
            cog_path = os.path.join(cog_dir, f"{asset_slug}.tif")
            services.extract_raster_metadata(tif["path"])  # validates the file
            services.convert_to_cog(tif["path"], cog_path)

            time_val = tif["time"]
            period_date = None
            if time_val is not None:
                try:
                    import pandas as pd
                    period_date = pd.Timestamp(time_val).date()
                except Exception:
                    pass

            services.create_raster_asset_and_queue_stats(
                layer=layer,
                cog_url=f"/data/cogs/{asset_slug}.tif",
                period_label=period_label,
                data_period_start=period_date,
                data_period_end=period_date,
                source=RasterAsset.SOURCE_USER,
            )

            scaled_progress = 40 + int(((i + 1) / total) * 50)
            services._update_task_stage(task_id, UploadTask.STAGE_CONVERTING, scaled_progress)

        # ── 4. Cleanup ─────────────────────────────────────────────────────
        shutil.rmtree(out_dir, ignore_errors=True)

        # If all sibling tasks for this NC file are finished, remove the NC
        nc_path = task.file_path
        siblings = UploadTask.objects.filter(file_path=nc_path)
        all_done = not siblings.exclude(
            status__in=[UploadTask.STATUS_DONE, UploadTask.STATUS_FAILED]
        ).exclude(pk=task_id).exists()
        if all_done and os.path.exists(nc_path):
            try:
                os.unlink(nc_path)
            except OSError:
                pass

        UploadTask.objects.filter(pk=task_id).update(
            status=UploadTask.STATUS_DONE,
            stage=UploadTask.STAGE_DONE,
            progress=100,
            layer=layer,
        )

    except Exception as exc:
        err_msg = f"{exc}\n{traceback.format_exc()}"
        UploadTask.objects.filter(pk=task_id).update(
            status=UploadTask.STATUS_FAILED,
            error_message=err_msg[:2000],
        )
        shutil.rmtree(out_dir, ignore_errors=True)
