FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY . .

# Create directories
RUN mkdir -p static/images/promo
RUN mkdir -p static/content

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV SERVICE_NAME=content_service

EXPOSE 5009

CMD ["python", "app.py"]