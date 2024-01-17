import os
import json
import logging
import pika
import requests
import numpy as np
import io
import time
import boto3
from requests.adapters import HTTPAdapter, Retry
from abc import ABC, abstractmethod
from botocore.exceptions import BotoCoreError, ClientError

BASE_URL = os.getenv('API_HOST')
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s: %(message)s')

def setup_http_session():
    retries = Retry(total=5, backoff_factor=0.1, status_forcelist=[500, 502, 503, 504])
    session = requests.Session()
    session.mount('http://', HTTPAdapter(max_retries=retries))
    return session

class FileHandlerInterface(ABC):
    @abstractmethod
    def write(self, data, object_name):
        pass

    @abstractmethod
    def read(self, object_name):
        pass

class S3FileHandler(FileHandlerInterface):
    def __init__(self, bucket_name, aws_access_key_id, aws_secret_access_key, encoding='utf-8'):
        self.s3 = boto3.client('s3', aws_access_key_id=aws_access_key_id, aws_secret_access_key=aws_secret_access_key)
        self.bucket_name = bucket_name
        self.encoding = encoding

    def write(self, data, object_name):
        try:
            self.s3.put_object(Bucket=self.bucket_name, Key=object_name, Body=data.encode(self.encoding))
            logging.info(f"Uploaded {object_name} to {self.bucket_name}")
        except (BotoCoreError, ClientError) as e:
            raise IOError(f"Error uploading {object_name}: {e}")

    def read(self, object_name):
        try:
            with io.BytesIO() as data:
                self.s3.download_fileobj(self.bucket_name, object_name, data)
                data.seek(0)
                return data.read().decode(self.encoding)
        except (BotoCoreError, ClientError) as e:
            raise IOError(f"Error downloading {object_name}: {e}")

class TaskWorker:
    def __init__(self, file_handler, queue_name, worker_id, simulate_slow=False):
        self.file_handler = file_handler
        self.queue_name = queue_name
        self.worker_id = worker_id
        self.simulate_slow = simulate_slow

    def worker_service_notification(self, status):
        try:
            url = f'{BASE_URL}/workers/{self.worker_id}/status'
            data = {'status': status}
            response = requests.post(url, json=data)
            if response.status_code != 200:
                raise requests.HTTPError(f"Failed to update worker status: {response.status_code}")
            logging.info(f"Worker status updated to {status}")
        except requests.RequestException as e:
            logging.error(f"Error in worker_service_notification: {e}")

    def acquire_task(self, task_id, job_id):
        url = f'{BASE_URL}/jobs/{job_id}/tasks/{task_id}/start'
        try:
            logging.info(f"Acquiring task {task_id}...")
            response = requests.post(url)
            if response.status_code != 200:
                raise requests.HTTPError(f"Failed to acquire task: {response.status_code}")
            logging.info(f"Task {task_id} acquired")
            return "acquired"
        except requests.RequestException as e:
            logging.error(f"Error in acquire_task: {e}")
            return "error"

    def complete_task(self, task_id, job_id, output):
        url = f'{BASE_URL}/jobs/{job_id}/tasks/{task_id}/complete'
        try:
            logging.info(f"Completing task {task_id}...")
            data = {'output': output}
            response = requests.post(url, json=data)
            if response.status_code != 200:
                raise requests.HTTPError(f"Failed to complete task: {response.status_code}")
            logging.info(f"Task {task_id} completed successfully")
        except requests.RequestException as e:
            logging.error(f"Error in complete_task: {e}")

    def process_task(self, task):
        try:
            logging.info(f"Processing task {task['id']}...")
            task_id = task['id']
            job_id = task['jobId']
            status = self.acquire_task(task_id, job_id)
            if status != "acquired":
                return

            filenames = task['input']
            output_file_name = f"{task_id}.csv"
            sum_array = self.sum_files(filenames)
            if sum_array is None:
                raise ValueError("Error in averaging files")

            self.file_handler.write(np.array2string(sum_array, separator=',')[1:-1], output_file_name)
            self.complete_task(task_id, job_id, [output_file_name])
            logging.info(f"Task {task_id} processed successfully")
        except Exception as e:
            logging.error(f"Error processing task {task_id}: {e}")
            # Optionally, add a task failure notification here

    def sum_files(self, filenames):
        try:
            arrays = []
            for file_id in filenames:
                file_content = self.file_handler.read(file_id)
                arrays.append(np.fromstring(file_content, dtype=float, sep=','))

            if not all(a.shape == arrays[0].shape for a in arrays):
                raise ValueError("All files must have the same number of elements.")

            return np.sum(np.stack(arrays), axis=0)
        except Exception as e:
            logging.error(f"Error in sum_files: {e}")
            raise

    def on_message_received(self, ch, method, properties, body):
        try:
            task = json.loads(body)
            self.worker_service_notification("BUSY")
            if self.simulate_slow:
                logging.info("Simulating slow worker...")
                time.sleep(10)
            self.process_task(task)
            ch.basic_ack(delivery_tag=method.delivery_tag)
            self.worker_service_notification("IDLE")
        except Exception as e:
            logging.error(f"Error in on_message_received: {e}")

    def start(self, rabbitmq_host):
        connection = pika.BlockingConnection(pika.ConnectionParameters(host=rabbitmq_host))
        channel = connection.channel()
        channel.queue_declare(queue=self.queue_name, durable=True)
        channel.basic_qos(prefetch_count=1)
        channel.basic_consume(queue=self.queue_name, on_message_callback=self.on_message_received)
        logging.info("Worker started. Waiting for tasks...")
        channel.start_consuming()

def main():
    file_handler = S3FileHandler(
        os.getenv('AWS_BUCKET_NAME', 'bucket'), 
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'), 
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
    )
    am_i_slow = os.getenv('AM_I_SLOW', 'false').lower() == 'true'
    worker = TaskWorker(file_handler, 'worker-queue', os.getenv('WORKER_ID'), simulate_slow=am_i_slow)
    worker.start(os.getenv('RABBITMQ_HOST', 'rabbit'))

if __name__ == '__main__':
    main()
