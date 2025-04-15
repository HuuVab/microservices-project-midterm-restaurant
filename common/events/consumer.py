import pika
import json
import os
import threading
import logging
from functools import partial
import time

logger = logging.getLogger(__name__)

# RabbitMQ connection parameters
RABBITMQ_HOST = os.getenv('RABBITMQ_HOST', 'rabbitmq')
RABBITMQ_PORT = int(os.getenv('RABBITMQ_PORT', 5672))
RABBITMQ_USER = os.getenv('RABBITMQ_USER', 'guest')
RABBITMQ_PASS = os.getenv('RABBITMQ_PASS', 'guest')
EXCHANGE_NAME = 'restaurant_events'
QUEUE_NAME_PREFIX = os.getenv('SERVICE_NAME', 'unknown')

# Event handlers registry
event_handlers = {}

def register_event_handler(event_type, handler_function):
    """Register a handler function for a specific event type"""
    if event_type not in event_handlers:
        event_handlers[event_type] = []
    
    event_handlers[event_type].append(handler_function)
    logger.info(f"Registered handler for event type: {event_type}")

def event_callback(ch, method, properties, body, event_types):
    """Callback function for event processing"""
    try:
        message = json.loads(body)
        event_type = message.get('event_type')
        
        logger.info(f"Received event: {event_type}")
        
        # Process the event with all registered handlers
        if event_type in event_handlers:
            for handler in event_handlers[event_type]:
                try:
                    handler(message.get('payload', {}))
                except Exception as e:
                    logger.error(f"Error in event handler for {event_type}: {e}")
        
        # Acknowledge the message
        ch.basic_ack(delivery_tag=method.delivery_tag)
    
    except Exception as e:
        logger.error(f"Error processing event: {e}")
        # Reject the message with requeue=False if it can't be processed
        ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)

def get_connection():
    """Create a connection to RabbitMQ with retry logic"""
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

def start_consumer(event_types):
    """Start a consumer thread for the specified event types"""
    def consumer_thread():
        connection = None
        channel = None
        
        while True:
            try:
                # Connect to RabbitMQ
                if connection is None or connection.is_closed:
                    connection = get_connection()
                    channel = connection.channel()
                    
                    # Declare the exchange
                    channel.exchange_declare(
                        exchange=EXCHANGE_NAME,
                        exchange_type='topic',
                        durable=True
                    )
                    
                    # Create a unique queue name for this service
                    queue_name = f"{QUEUE_NAME_PREFIX}-{'-'.join(event_types)}"
                    
                    # Declare a queue specific to this service
                    result = channel.queue_declare(
                        queue=queue_name,
                        durable=True,
                        exclusive=False,
                        auto_delete=False
                    )
                    queue_name = result.method.queue
                    
                    # Bind the queue to the exchange for each event type
                    for event_type in event_types:
                        channel.queue_bind(
                            exchange=EXCHANGE_NAME,
                            queue=queue_name,
                            routing_key=event_type
                        )
                    
                    # Set up the callback
                    callback = partial(event_callback, event_types=event_types)
                    channel.basic_consume(
                        queue=queue_name,
                        on_message_callback=callback,
                        auto_ack=False
                    )
                    
                    logger.info(f"Consumer ready for events: {', '.join(event_types)}")
                
                # Start consuming
                channel.start_consuming()
                
            except pika.exceptions.AMQPConnectionError as e:
                logger.error(f"AMQP Connection error: {e}")
                if connection and not connection.is_closed:
                    connection.close()
                connection = None
                channel = None
                time.sleep(5)  # Wait before reconnecting
                
            except pika.exceptions.ChannelClosedByBroker as e:
                logger.error(f"Channel closed by broker: {e}")
                if channel and channel.is_open:
                    channel.close()
                channel = None
                time.sleep(5)  # Wait before reconnecting
                
            except Exception as e:
                logger.error(f"Consumer thread error: {e}")
                if connection and not connection.is_closed:
                    connection.close()
                connection = None
                channel = None
                time.sleep(5)  # Wait before reconnecting
    
    # Start the consumer in a separate thread
    thread = threading.Thread(target=consumer_thread, daemon=True)
    thread.start()
    return thread

def setup_consumer(event_types):
    """Setup the consumer for specified event types"""
    if not event_types:
        logger.warning("No event types specified, consumer will not start")
        return None
        
    thread = start_consumer(event_types)
    logger.info(f"Event consumer setup for: {', '.join(event_types)}")
    return thread