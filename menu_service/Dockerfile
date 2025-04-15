FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY . .

# Create directory for uploads
RUN mkdir -p static/images/menu

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV SERVICE_NAME=menu_service

EXPOSE 5001

CMD ["python", "app.py"]