# microservices-project-midterm-restaurant
## Overview
This is a microservices project for a restaurant managment sysyem, midterm for SOA subject

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Python 3.x
  
### Installation
```bash
git clone https://github.com/HuuVab/microservices-project-midterm-restaurant.git
cd microservices-project-midterm-restaurant
```

2. Start the services using Docker Compose
```bash
docker-compose up -d
```

### Production
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```
## Documentation
In the report.doc

## Project Structure
```
├── api_gateway/
├── chatbot_service/
├── common/
├── content_service/
├── menu_service/
├── notification_service/
├── order_service/
├── payment_service/
├── reporting_service/
├── static/
├── templates/
├── translation_service/
├── uploads/
├── user_service/
├── docker-compose.yml
└── README.md
```
