FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install NLTK data
RUN python -m nltk.downloader punkt

# Copy service code
COPY . .

# Create directories
RUN mkdir -p documents
RUN mkdir -p data

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV SERVICE_NAME=chatbot_service

EXPOSE 5006

CMD ["python", "app.py"]