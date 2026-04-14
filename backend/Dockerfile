FROM osgeo/gdal:ubuntu-small-3.6.2

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Kolkata

# Install remaining deps (faster, fewer packages)
USER root
RUN apt-get update && apt-get install -y \
    cdo gcc g++ libproj-dev libgeos-dev libhdf4-alt-dev \
    && rm -rf /var/lib/apt/lists/*

# Python env for rasterio (matches your GDAL_VERSION)
ENV GDAL_VERSION=3.6.2
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt --no-binary rasterio

COPY . .

EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]  # Adjust as needed