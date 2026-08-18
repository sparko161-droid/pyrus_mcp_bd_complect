# Use the official Python slim image
FROM python:3.12-slim AS builder
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install uv for fast dependency resolution
RUN pip install --no-cache-dir uv

# Copy dependency files
COPY pyproject.toml README.md ./

# Sync production dependencies into a virtual environment
RUN uv venv /opt/venv && \
    VIRTUAL_ENV=/opt/venv uv pip install -e .

# --- Final hardened stage ---
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

# Create a non-root user and group
RUN groupadd -r pyrus && useradd -r -g pyrus -s /sbin/nologin pyrus

WORKDIR /app

# Copy the virtual environment from the builder
COPY --from=builder /opt/venv /opt/venv

# Copy application source
COPY src/ ./src/

# Chown application files to the non-root user
RUN chown -R pyrus:pyrus /app

USER pyrus

# FastMCP typically binds to a port or uses stdio. 
# We'll use stdio for the MCP standard, or an HTTP port if specified.
# Assuming standard MCP (stdio):
ENTRYPOINT ["pyrus-mcp"]
