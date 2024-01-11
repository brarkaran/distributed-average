import pika
import json
import time
import requests
import os
import tempfile
import urllib

BASE_URL = os.getenv('API_HOST')

import numpy as np
from requests.adapters import HTTPAdapter, Retry

s = requests.Session()

retries = Retry(total=5,
                backoff_factor=0.1,
                status_forcelist=[ 500, 502, 503, 504 ])

s.mount('http://', HTTPAdapter(max_retries=retries))

import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s: %(message)s')

def average_files(filenames, output_id):
    arrays = []

    for file_id in filenames:
        try:
            api_url = f"{BASE_URL}/api/files/{file_id}"

            logging.info(f"Fetching data from {api_url}")
            
            # Make a GET request to the API to retrieve the file content
            response = s.get(api_url)
            
            # Check if the request was successful (status code 200)
            if response.status_code == 200:
                # Get the content of the file as binary data
                binary_content = response.content
                with tempfile.NamedTemporaryFile(mode='wb', delete=False) as temp_file:
                    temp_file.write(binary_content)
                
                # Load the CSV data directly from binary content
                data = np.loadtxt(temp_file.name, delimiter=',')
                arrays.append(data)
                logging.info(f"Data fetched and loaded from {api_url}")
            else:
                logging.error(f"Failed to retrieve data from {api_url}. Status code: {response.status_code}")
                return
        except Exception as e:
            logging.error(f"Error reading file {file_id}: {e}")
            return

    # Check if all arrays have the same shape
    if not all(a.shape == arrays[0].shape for a in arrays):
        logging.error("Error: All files must have the same number of elements.")
        return

    logging.info(f"arrays {arrays}")
    # Stack arrays and calculate the mean along the first axis
    stacked_array = np.stack(arrays)
    average_array = np.sum(stacked_array, axis=0)

    # Write the result to the output file
    with tempfile.NamedTemporaryFile(mode='w', delete=False) as temp_file:
        np.savetxt(temp_file, average_array, delimiter=',', fmt='%g')  # Adjust format as needed
        logging.info(f"Result saved to temporary file: {temp_file.name}")

    with open(temp_file.name, 'rb') as file:
        files = {'file': (temp_file.name, file)}
        response = s.post(f"{BASE_URL}/api/files/{output_id}", files=files)
        
        # Check if the POST request was successful (status code 200)
        if response.status_code == 200:
            logging.info(f"Result uploaded to {output_id} successfully.")
        else:
            logging.error(f"Failed to upload result to {output_id}. Status code: {response.status_code}")

    logging.info(f"Averaging completed. Results written to {output_id}")

def acquire_task(task_id):
    """Call the acquire task API endpoint."""
    url = f'{BASE_URL}/tasks/{task_id}/acquire'
    response = s.post(url)
    if response.status_code == 200:
        status = "acquired"
    elif response.status_code == 404:
        status = "completed"
    else:
        status = "error"
    return status

def complete_task(task_id, output):
    """Call the complete task API endpoint."""
    url = f'{BASE_URL}/tasks/{task_id}/complete'
    data = {'output': output}
    response = s.post(url, json=data)
    return response.json()

def process_task(task):
    # Process the task
    try:
        logging.info(f"Processing task: {task}")
        status = acquire_task(task['id'])
        if status == "completed":
            return
        elif status == "error":
            raise Exception("Error acquiring task")
        else:
            average_files(task['input'], task['id'] + '.csv')
        complete_task(task_id=task['id'], output=[task['id'] + '.csv'])
    except Exception as e:
        logging.error(e)

def on_message_received(ch, method, properties, body):
    task = json.loads(body)
 
    process_task(task)
    # Acknowledge that the task was received and processed
    ch.basic_ack(delivery_tag=method.delivery_tag)

def start_worker(rabbitmq_host='rabbit', queue_name='task_queue'):
    # Establish connection to RabbitMQ server
    connection = pika.BlockingConnection(pika.ConnectionParameters(host=rabbitmq_host))
    channel = connection.channel()

    # Declare the queue
    channel.queue_declare(queue=queue_name, durable=True)

    # Set up subscription on the queue
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=queue_name, on_message_callback=on_message_received)

    logging.info("Worker started. Waiting for tasks...")
    channel.start_consuming()

if __name__ == '__main__':
    time.sleep(5)
    start_worker()
