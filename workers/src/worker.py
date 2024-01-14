import json
import logging
import numpy as np
import os
import pika
import requests
import tempfile
import time
from abc import ABC, abstractmethod
from requests.adapters import HTTPAdapter, Retry
import traceback 
import random
# Constants
BASE_URL = os.getenv('API_HOST')

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s: %(message)s')

# Utility Functions
def setup_http_session():
    retries = Retry(total=5, backoff_factor=0.1, status_forcelist=[500, 502, 503, 504])
    session = requests.Session()
    session.mount('http://', HTTPAdapter(max_retries=retries))
    return session

s = setup_http_session()

# Abstract Base Class for File Handling
class FileHandler(ABC):
    @abstractmethod
    def get_file(self, file_id):
        pass

    @abstractmethod
    def upload_file(self, file_id, file_path):
        pass

# Local File System File Handling
class LocalFileHandler(FileHandler):
    def get_file(self, file_id):
        try:
            return np.loadtxt(f"{file_id}", delimiter=',')
        except Exception as e:
            raise Exception(f"Error reading file {file_id}: {e}")

    def upload_file(self, file_id, array_data):
        try:
            np.savetxt(file_id, array_data, delimiter=',', fmt='%g')
        except IOError as e:
            raise Exception(f"Error writing file {file_id}: {e}")

# API-based File Handling
class ApiFileHandler(FileHandler):
    def __init__(self, base_url, session):
        self.base_url = base_url
        self.session = session

    def get_file(self, file_id):
        api_url = f"{self.base_url}/api/files/{file_id}"
        response = self.session.get(api_url)
        if response.status_code == 200:
            return response.content
        else:
            traceback.print_exc() 
            raise Exception(f"Failed to retrieve data from {api_url}. Status code: {response.status_code}")

    def upload_file(self, file_id, file_path):
        with open(file_path, 'rb') as file:
            files = {'file': (file_path, file)}
            response = self.session.post(f"{self.base_url}/api/files/{file_id}", files=files)
            if response.status_code != 200:
                traceback.print_exc() 
                raise Exception(f"Failed to upload result to {file_id}. Status code: {response.status_code}")

# Task Management Class
class TaskWorker:
    def __init__(self, file_handler, queue_name):
        self.file_handler = file_handler
        self.queue_name = queue_name

    def acquire_task(self, task_id):
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
    
    def complete_task(self, task_id, output):
        """Call the complete task API endpoint."""
        url = f'{BASE_URL}/tasks/{task_id}/complete'
        data = {'output': output}
        response = s.post(url, json=data)
        return response.json()

    def process_task(self, task):
        try:
            
            task_id = task['id']
            self.acquire_task(task_id)
            filenames = task['input']
            output_file_name = f"{task_id}.csv"

            # if random.random() < 0.5:
            #     print("I am crashing")
            #     raise Exception("Crash!")

            average_array = self.average_files(filenames)
            if average_array is None:
                raise Exception("Error in averaging files")

            self.file_handler.upload_file(f"app/{task_id}.csv", average_array)

            # Assuming there is a method in file_handler to complete the task
            self.complete_task(task_id, [output_file_name])
        except Exception as e:
            traceback.print_exc() 
            logging.error(f"Error processing task {task['id']}: {e}")
            raise e

    def average_files(self, filenames):
        arrays = []
        for file_id in filenames:
            try:
                data = self.file_handler.get_file(f"app/{file_id}")
                arrays.append(data)
            except Exception as e:
                logging.error(f"Error processing file {file_id}: {e}")
                return None

        if not all(a.shape == arrays[0].shape for a in arrays):
            logging.error("Error: All files must have the same number of elements.")
            return None

        stacked_array = np.stack(arrays)
        average_array = np.sum(stacked_array, axis=0)
        return average_array
    
    def on_message_received(self, ch, method, properties, body):
        task = json.loads(body)
        self.process_task(task)
        # if random.random() < 0.7:
        #     # raise Exception("Crash!")
        ch.basic_ack(delivery_tag=method.delivery_tag)
        # else:
        #     print("I not acknowledging")
    
    def start(self, rabbitmq_host):
        connection = pika.BlockingConnection(pika.ConnectionParameters(host=rabbitmq_host))
        channel = connection.channel()
        channel.queue_declare(queue=self.queue_name, durable=True)
        channel.basic_qos(prefetch_count=1)
        channel.basic_consume(queue=self.queue_name, on_message_callback=self.on_message_received)
        logging.info("Worker started. Waiting for tasks...")
        channel.start_consuming()

# Main Function
def main():
    time.sleep(5)
    use_local_fs = os.getenv('USE_LOCAL_FS', 'True').lower() == 'true'
    file_handler = LocalFileHandler() if use_local_fs else ApiFileHandler(BASE_URL, setup_http_session())
    worker = TaskWorker(file_handler, 'task_queue')
    worker.start('rabbit')

if __name__ == '__main__':
    main()
