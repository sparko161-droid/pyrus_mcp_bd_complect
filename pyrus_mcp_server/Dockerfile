FROM python:3.12-slim

WORKDIR /app

# Устанавливаем зависимости для сборки (если нужно для pydantic и пр.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Копируем метаданные проекта
COPY pyproject.toml README.md ./
# Копируем исходники
COPY src/ ./src/

# Устанавливаем проект
RUN pip install --no-cache-dir -e .

EXPOSE 8000

# Запускаем сервер
CMD ["python", "-m", "pyrus_mcp.server"]
