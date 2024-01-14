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

from concurrent.futures import ThreadPoolExecutor

class FileProcessor:
    def __init__(self):

        self.executor = ThreadPoolExecutor()

    def read_file_sync(self, file_path):
        try:
            # Reading file directly, synchronously
            data = np.loadtxt(file_path, delimiter=',')
            # Create a memory-mapped array for the data
            # memmap_array = np.memmap(file_path, dtype=data.dtype, mode='r', shape=data.shape)
            # print(f"MMAP RESULT {memmap_array}")
            return data
        except Exception as e:
            logging.error(f"Error processing file {file_path}: {e}")
            return None

    def average_files(self, file_paths):
        def process_batch(batch):
            total_array = np.zeros(self.read_file_sync(f"app/{batch[0]}").shape, dtype=np.float64)
            count = 0

            for file_path in batch:
                data = self.read_file_sync(f"app/{file_path}")
                if data is not None:
                    total_array += data
                    count += 1
                    del data  # Release the memory

            return total_array, count

        batch_size = 5
        total_sum = None
        total_count = 0

        for i in range(0, len(file_paths), batch_size):
            batch = file_paths[i:i + batch_size]
            batch_sum, batch_count = process_batch(batch)

            if total_sum is None:
                total_sum = batch_sum
            else:
                total_sum += batch_sum

            total_count += batch_count

        if total_count > 0:
            return total_sum
        else:
            logging.error("No files processed.")
            return None
    
    def upload_file(self, file_id, array_data):
        try:
            np.savetxt(file_id, array_data, delimiter=',', fmt='%g')
        except IOError as e:
            raise Exception(f"Error writing file {file_id}: {e}")


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


from abc import ABC, abstractmethod
import numpy as np
class FileHandlerInterface(ABC):
    
    @abstractmethod
    def write(self, data, object_name):
        pass

    @abstractmethod
    def read(self, object_name):
        pass

import boto3
import io
from concurrent.futures import ThreadPoolExecutor

class S3FileHandler(FileHandlerInterface):
    def __init__(self, bucket_name, aws_access_key_id='AKIA3ATNYIT3WISENLXD', aws_secret_access_key='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', encoding='utf-8'):
        self.session = boto3.Session(
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key
        )
        self.s3 = self.session.client('s3')
        self.bucket_name = bucket_name
        self.encoding = encoding

    def write(self, data, object_name):
        try:
            self.s3.put_object(Bucket=self.bucket_name, Key=object_name, Body=data.encode(self.encoding))
            print(f"Uploaded {object_name} to {self.bucket_name}")
        except Exception as e:
            print(f"Error uploading {object_name}: {e}")

    def read(self, object_name):
        try:
            with io.BytesIO() as data:
                self.s3.download_fileobj(self.bucket_name, object_name, data)
                data.seek(0)
                return data.read().decode(self.encoding)
        except Exception as e:
            print(f"Error downloading {object_name}: {e}")
            return None

# Task Management Class
class TaskWorker:
    def __init__(self, file_handler, queue_name):
        self.file_handler = file_handler
        self.queue_name = queue_name

    def acquire_task(self, task_id, job_id):
        """Call the acquire task API endpoint."""
        url = f'{BASE_URL}/job/{job_id}/task/{task_id}/start'
        print(url)
        response = s.post(url)
        print(response)
        if response.status_code == 200:
            status = "acquired"
        elif response.status_code == 404:
            status = "completed"
        else:
            status = "error"
        print(f"STATUS {status}")
        return status
    
    def complete_task(self, task_id, job_id, output):
        """Call the complete task API endpoint."""
        url = f'{BASE_URL}/job/{job_id}/task/{task_id}/complete'
        data = {'output': output}
        response = s.post(url, json=data)
        print(f"RESPONSE {response}")
        return response.json()

    def process_task(self, task):
        try:
            
            task_id = task['id']
            job_id = task['jobId']
            self.acquire_task(task_id, job_id) # Handler responses of acquire task
            filenames = task['input']
            output_file_name = f"{task_id}.csv"

            # if random.random() < 0.5:
            #     print("I am crashing")
            #     raise Exception("Crash!")

            average_array = self.average_files(filenames)
            if average_array is None:
                raise Exception("Error in averaging files")

            self.file_handler.write(np.array2string(average_array, separator=',')[1:-1], f"{task_id}.csv")

            # Assuming there is a method in file_handler to complete the task
            self.complete_task(task_id, job_id, [output_file_name])
        except Exception as e:
            traceback.print_exc() 
            logging.error(f"Error processing task {task['id']}: {e}")
            raise e

    def average_files(self, filenames):
        arrays = []
        for file_id in filenames:
            try:
                data = np.fromstring(self.file_handler.read(f"{file_id}"), dtype=float, sep=',')
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
    file_processor = S3FileHandler(os.getenv('AWS_BUCKET_NAME', 'codebucker'))
    worker = TaskWorker(file_processor, 'worker-queue')
    worker.start('rabbit')

if __name__ == '__main__':
    main()
