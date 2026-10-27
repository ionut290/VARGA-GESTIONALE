FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv/vg
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home vg
COPY backend ./backend
USER vg
EXPOSE 8098
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8098", "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"]
