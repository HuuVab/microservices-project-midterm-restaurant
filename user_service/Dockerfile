FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY . .

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV SERVICE_NAME=user_service

EXPOSE 5003

CMD ["python", "app.py"]