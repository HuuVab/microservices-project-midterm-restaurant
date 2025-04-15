FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY . .

# Create directories
RUN mkdir -p translations
RUN mkdir -p static/images/flags

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV SERVICE_NAME=translation_service

EXPOSE 5007

CMD ["python", "app.py"]