# === BASE ===
FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

RUN rm -f /etc/apt/sources.list.d/yarn.list /etc/apt/sources.list.d/yarn.list.save \
    && apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ripgrep \
    python3 \
    python3-venv \
    python3-pip \
    # === PROJECT: content-pipeline === Puppeteer / Chromium dependencies
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# === PROJECT: content-pipeline === Terraform CLI
RUN curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com bookworm main" \
    > /etc/apt/sources.list.d/hashicorp.list \
    && apt-get update && apt-get install -y --no-install-recommends terraform \
    && rm -rf /var/lib/apt/lists/*

# === PROJECT: content-pipeline === Google Cloud SDK
RUN curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    > /etc/apt/sources.list.d/google-cloud-sdk.list \
    && apt-get update && apt-get install -y --no-install-recommends google-cloud-cli \
    && rm -rf /var/lib/apt/lists/*

# === PROJECT: content-pipeline === Puppeteer env vars
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /workspace
