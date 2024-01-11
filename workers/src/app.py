# import redis

# class RedisClient:
#     def __init__(self, host='localhost', port=6379, password=None):
#         self._client = redis.Redis(host=host, port=port, password=password)

#     def set(self, key, value):
#         """Set a value in the Redis store."""
#         self._client.set(key, value)

#     def get(self, key):
#         """Get a value from the Redis store."""
#         return self._client.get(key)

#     def delete(self, key):
#         """Delete a key from the Redis store."""
#         self._client.delete(key)
    
#     def incr(self, key, amount=1):
#         self._client.incr(key, amount)

#     def ping(self):
#         return self._client.ping()
    
# client = RedisClient()

# # Testing the connection
# try:
#     response = client.ping()
#     if response:
#         print("Connected to Redis")
# except redis.ConnectionError:
#     print("Failed to connect to Redis")

# client.set("hash1", 123)

# client.incr("hash1", 5)

# print(float(client.get("hash1").decode("utf-8")))

# import math

# def distribute_work(files, c):
#     max_partitions = math.ceil(len(files) / 5)
#     res = [0]*c
#     for i in range(c):
#         for p in range(max_partitions):
#             sum_res = read_i_th_line_from_partition(files, i, p)
#             res[i] += sum_res
#     return res


# def read_i_th_line_from_partition(files, i, p):
#     """
#     Reads the ith line from a range of files defined by the partition number P
#     without reading the whole file into memory.

#     :param files: Array of file paths.
#     :param i: Index of the line to read in each file.
#     :param P: Partition number.
#     :return: A list containing the ith line from each file in the specified range.
#     """
#     start_index = 5 * p
#     end_index = min(start_index + 5, len(files))  # Ensure we don't exceed the array length
#     lines = []

#     for file_index in range(start_index, end_index):
#         try:
#             with open(files[file_index], 'r') as file:
#                 for line_number, line in enumerate(file):
#                     if line_number == i:
#                         lines.append(float(line.strip()))
#                         break  # Stop reading after the ith line
#         except FileNotFoundError:
#             print(f"File not found: {files[file_index]}")
#         except IndexError:
#             print(f"Index out of range in file: {files[file_index]}")

#     return sum(lines)
# while True:
    
# print("I have started")
import uuid
import pika
import json

def split_files_into_tasks(files, jobId):
    # Split the files array into chunks of size 5 or less
    chunk_size = 5
    tasks = []
    for i in range(0, len(files), chunk_size):
        file_chunk = files[i:i + chunk_size]
        task = {"taskId": str(uuid.uuid4()), "files": file_chunk, "jobId": jobId}
        tasks.append(task)
    return tasks

def send_tasks_to_workers(tasks, rabbitmq_host='rabbit', queue_name='task_queue'):
    # Establish a connection to RabbitMQ server
    print('connection to rabbit mq host')
    connection = pika.BlockingConnection(pika.ConnectionParameters(host=rabbitmq_host))
    channel = connection.channel()

    # Declare a queue for tasks
    channel.queue_declare(queue=queue_name, durable=True)

    # Send each task to the queue
    for task in tasks:
        message = json.dumps(task)  # Convert task dict to a JSON string
        channel.basic_publish(
            exchange='',
            routing_key=queue_name,
            body=message,
            properties=pika.BasicProperties(
                delivery_mode=2,  # Make message persistent
            ))

    print(f"Sent {len(tasks)} tasks to the queue '{queue_name}'")

    # Close the connection
    connection.close()

class Orchestration:
    def __init__(self):
        self.jobs = dict() # jobId -> {tasksInProgress: [{taskId, filesForTask}], filesWaitingToBeBatched: [waiting files]} 

    def createJob(self, files):
        jobId = str(uuid.uuid4())
        tasks = split_files_into_tasks(files, jobId)
        self.jobs[jobId] = {
            "tasksInProgress": tasks,
            "filesWaitingToBeBatched": []
        }
        send_tasks_to_workers(tasks)

    def completeTask(self, task):
        jobId = task['jobId']
        # print(f"Task completed: {task}")
        # print(f"Current state: {self.jobs}")
        if not any(t['taskId'] == task['taskId'] for t in self.jobs[jobId]['tasksInProgress']):
            return
        self.jobs[jobId]['tasksInProgress'] = list(filter(lambda x: x['taskId'] != task['taskId'], self.jobs[jobId]['tasksInProgress']))

        self.jobs[jobId]['filesWaitingToBeBatched'].append(task['file'])
        if len(self.jobs[jobId]['filesWaitingToBeBatched']) > 1:
            tasks = split_files_into_tasks(self.jobs[jobId]['filesWaitingToBeBatched'], jobId)
            self.jobs[jobId]['filesWaitingToBeBatched'] = []
            self.jobs[jobId]['tasksInProgress'].extend(tasks)
            send_tasks_to_workers(tasks)
        elif len(self.jobs[jobId]['tasksInProgress']) == 0:
            print(f"\nOMG THE RESULT for {jobId} IS {task['file']}")

from flask import Flask, request, jsonify
import uuid 

app = Flask(__name__)

# Initialize the Orchestration instance
# Replace None with the actual worker queue if necessary
orchestration = Orchestration()

@app.route('/createJob', methods=['POST'])
def create_job():
    data = request.json
    files = data.get('files', [])
    if not files:
        return jsonify({'error': 'No files provided'}), 400

    job_id = str(uuid.uuid4())
    orchestration.createJob(files)
    return jsonify({'message': 'Job created', 'jobId': job_id}), 200

@app.route('/completeTask', methods=['POST'])
def complete_task():
    data = request.json
    task = data.get('task')
    if not task:
        return jsonify({'error': 'No task provided'}), 400

    orchestration.completeTask(task)
    return jsonify({'message': 'Task completed'}), 200

if __name__ == '__main__':
    app.run(debug=True)  # Runs the server in debug mode
