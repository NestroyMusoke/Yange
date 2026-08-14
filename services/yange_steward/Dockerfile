FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp \
    PORT=8080

WORKDIR /app

COPY --chown=65532:65532 pyproject.toml ./
COPY --chown=65532:65532 yange_steward ./yange_steward
RUN pip install --no-cache-dir .

USER 65532:65532
EXPOSE 8080

CMD ["sh", "-c", "adk api_server --host 0.0.0.0 --port ${PORT} ."]
