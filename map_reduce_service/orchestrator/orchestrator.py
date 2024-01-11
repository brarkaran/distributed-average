import threading
import uuid
import json
import redis
import pika
from flask import Flask, jsonify, request
from datetime import datetime

app = Flask(__name__)

# Setup Redis connection
redis_client = redis.Redis()

# Setup RabbitMQ connection
rabbitmq_connection = pika.BlockingConnection(pika.ConnectionParameters('localhost'))
rabbitmq_channel = rabbitmq_connection.channel()
rabbitmq_channel.queue_declare(queue='job_queue')

def partition_job(job_id, job_data):
    # Implement job partitioning logic
    return [job_data]  # Placeholder

def rabbitmq_callback(ch, method, properties, body):
    job = json.loads(body)
    job_id = job['job_id']
    job_data = job['data']
    task_ids = []

    for task_data in partition_job(job_id, job_data):
        task_id = str(uuid.uuid4())
        task_ids.append(task_id)
        redis_client.hmset(task_id, {'status': 'pending', 'start_time': '', 'end_time': '', 'result': ''})
    
    redis_client.hmset(job_id, {'tasks': ','.join(task_ids), 'completed': 0, 'total': len(task_ids)})

rabbitmq_channel.basic_consume(queue='job_queue', on_message_callback=rabbitmq_callback, auto_ack=True)

@app.route('/submitJob', methods=['POST'])
def submit_job():
    if redis_client.exists('current_job'):
        return jsonify({'message': 'A job is already in progress'}), 409

    job_data = request.json
    job_id = str(uuid.uuid4())
    redis_client.set('current_job', job_id)

    rabbitmq_channel.basic_publish(exchange='', routing_key='job_queue', body=json.dumps({'job_id': job_id, 'data': job_data}))
    return jsonify({'job_id': job_id}), 202

@app.route('/assignTask', methods=['GET'])
def assign_task():
    current_job = redis_client.get('current_job')
    if not current_job:
        return jsonify({'message': 'No job in progress'}), 404

    current_job = current_job.decode('utf-8')
    tasks = redis_client.hget(current_job, 'tasks').decode('utf-8').split(',')

    for task_id in tasks:
        task = redis_client.hgetall(task_id)
        if task[b'status'].decode('utf-8') == 'pending':
            redis_client.hmset(task_id, {'status': 'in_progress', 'start_time': datetime.now().isoformat()})
            return jsonify({'task_id': task_id, 'data': task[b'data'].decode('utf-8')})

    return jsonify({'message': 'No tasks available'}), 404

@app.route('/submitTask', methods=['POST'])
def submit_task():
    task_result = request.json
    task_id = task_result['task_id']
    result = task_result['result']

    task = redis_client.hgetall(task_id)

    if not task or task[b'status'].decode('utf-8') != 'in_progress':
        return jsonify({'message': 'Invalid task ID or task not in progress'}), 400

    redis_client.hmset(task_id, {'status': 'completed', 'end_time': datetime.now().isoformat(), 'result': result})
    check_and_update_job_completion(task_id)
    return jsonify({'message': 'Task completed'}), 200

def check_and_update_job_completion(task_id):
    job_id = redis_client.get('current_job').decode('utf-8')
    tasks = redis_client.hget(job_id, 'tasks').decode('utf-8').split(',')
    completed = sum(1 for task in tasks if redis_client.hget(task, 'status').decode('utf-8') == 'completed')

    if completed == len(tasks):
        redis_client.delete('current_job')
        # Here you can implement additional logic to notify about job completion

threading.Thread(target=lambda: rabbitmq_channel.start_consuming(), daemon=True).start()

if __name__ == '__main__':
    app.run(port=5000)
