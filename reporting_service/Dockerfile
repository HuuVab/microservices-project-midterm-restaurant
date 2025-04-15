FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY . .

# Create directories
RUN mkdir -p data

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV SERVICE_NAME=reporting_service

EXPOSE 5008

CMD ["python", "app.py"]