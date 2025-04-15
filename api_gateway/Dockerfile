FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Don't try to copy static and templates here
# They will be mounted as volumes in docker-compose.yml

COPY . .

EXPOSE 5000

CMD ["python", "app.py"]