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
            with open(file_id, 'rb') as file:
                return file.read()
        except IOError as e:
            raise Exception(f"Error reading file {file_id}: {e}")

    def upload_file(self, file_id, file_path):
        try:
            with open(file_id, 'wb') as file:
                file.write(open(file_path, 'rb').read())
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
            raise Exception(f"Failed to retrieve data from {api_url}. Status code: {response.status_code}")

    def upload_file(self, file_id, file_path):
        with open(file_path, 'rb') as file:
            files = {'file': (file_path, file)}
            response = self.session.post(f"{self.base_url}/api/files/{file_id}", files=files)
            if response.status_code != 200:
                raise Exception(f"Failed to upload result to {file_id}. Status code: {response.status_code}")

# Task Management Class
class TaskWorker:
    def __init__(self, file_handler, queue_name):
        self.file_handler = file_handler
        self.queue_name = queue_name

    def process_task(self, task):
        try:
            task_id = task['id']
            filenames = task['input']
            output_file_name = f"{task_id}.csv"

            average_array = self.average_files(filenames)
            if average_array is None:
                raise Exception("Error in averaging files")

            with tempfile.NamedTemporaryFile(mode='w', delete=False) as temp_file:
                np.savetxt(temp_file, average_array, delimiter=',', fmt='%g')
                self.file_handler.upload_file(output_file_name, temp_file.name)

            # Assuming there is a method in file_handler to complete the task
            self.file_handler.complete_task(task_id, output_file_name)
        except Exception as e:
            logging.error(f"Error processing task {task['id']}: {e}")

    def average_files(self, filenames):
        arrays = []
        for file_id in filenames:
            try:
                binary_content = self.file_handler.get_file(file_id)
                with tempfile.NamedTemporaryFile(mode='wb', delete=False) as temp_file:
                    temp_file.write(binary_content)
                    data = np.loadtxt(temp_file.name, delimiter=',')
                    arrays.append(data)
            except Exception as e:
                logging.error(f"Error processing file {file_id}: {e}")
                return None

        if not all(a.shape == arrays[0].shape for a in arrays):
            logging.error("Error: All files must have the same number of elements.")
            return None

        stacked_array = np.stack(arrays)
        average_array = np.mean(stacked_array, axis=0)
        return average_array

# Main Function
def main():
    time.sleep(5)
    use_local_fs = os.getenv('USE_LOCAL_FS', 'True').lower() == 'true'
    file_handler = LocalFileHandler() if use_local_fs else ApiFileHandler(BASE_URL, setup_http_session())
    worker = TaskWorker(file_handler, 'task_queue')
    worker.start('rabbit')

if __name__ == '__main__':
    main()
