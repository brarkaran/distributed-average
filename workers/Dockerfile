FROM python:3.9 
# Or any preferred Python version.
ADD src/worker.py .
RUN pip install pika requests numpy boto3
CMD ["python", "./worker.py"] 