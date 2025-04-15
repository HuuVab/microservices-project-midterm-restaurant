import pika
import json
import os
import time
import logging
import uuid

logger = logging.getLogger(__name__)

# RabbitMQ connection parameters
RABBITMQ_HOST = os.getenv('RABBITMQ_HOST', 'rabbitmq')
RABBITMQ_PORT = int(os.getenv('RABBITMQ_PORT', 5672))
RABBITMQ_USER = os.getenv('RABBITMQ_USER', 'guest')
RABBITMQ_PASS = os.getenv('RABBITMQ_PASS', 'guest')
EXCHANGE_NAME = 'restaurant_events'

def get_connection():
    """Create a connection to RabbitMQ"""
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        credentials=credentials,
        heartbeat=600,
        blocked_connection_timeout=300
    )
    
    retry_count = 0
    max_retries = 5
    
    while retry_count < max_retries:
        try:
            connection = pika.BlockingConnection(parameters)
            logger.info(f"Connected to RabbitMQ at {RABBITMQ_HOST}")
            return connection
        except Exception as e:
            retry_count += 1
            wait_time = 2 ** retry_count  # Exponential backoff
            logger.warning(f"Failed to connect to RabbitMQ: {e}. Retrying in {wait_time}s...")
            time.sleep(wait_time)
    
    logger.error(f"Failed to connect to RabbitMQ after {max_retries} attempts")
    raise Exception("Could not connect to RabbitMQ")

def publish_event(event_type, payload):
    """Publish an event to the event bus"""
    try:
        connection = get_connection()
        channel = connection.channel()
        
        # Declare the exchange
        channel.exchange_declare(
            exchange=EXCHANGE_NAME,
            exchange_type='topic',
            durable=True
        )
        
        # Create the message with metadata
        message = {
            "event_id": str(uuid.uuid4()),
            "event_type": event_type,
            "timestamp": int(time.time()),
            "service": os.getenv('SERVICE_NAME', 'unknown'),
            "payload": payload
        }
        
        # Publish the message
        channel.basic_publish(
            exchange=EXCHANGE_NAME,
            routing_key=event_type,
            body=json.dumps(message),
            properties=pika.BasicProperties(
                delivery_mode=2,  # Make message persistent
                content_type='application/json'
            )
        )
        
        logger.info(f"Published event {event_type}: {payload}")
        connection.close()
        return True
    
    except Exception as e:
        logger.error(f"Failed to publish event {event_type}: {e}")
        return False