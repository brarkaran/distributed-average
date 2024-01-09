FROM python:3.9 
# Or any preferred Python version.
ADD src/worker.py .
RUN pip install redis
CMD [“python”, “./worker.py”] 