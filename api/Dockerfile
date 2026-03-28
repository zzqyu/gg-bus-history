FROM python:3.11-slim
WORKDIR /app
# Application code and requirements are mounted at runtime as volumes
# to keep the image minimal. The container will install requirements on start
# if a requirements.txt is present at /app/requirements.txt.
EXPOSE 8000
CMD ["sh", "-c", "if [ -f /app/requirements.txt ]; then pip install --no-cache-dir -r /app/requirements.txt; fi && uvicorn app:app --host 0.0.0.0 --port 8000"]
