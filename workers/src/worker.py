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

import math

def distribute_work(files, c):
    max_partitions = math.ceil(len(files) / 5)
    res = [0]*c
    for i in range(c):
        for p in range(max_partitions):
            sum_res = read_i_th_line_from_partition(files, i, p)
            res[i] += sum_res
    return res


def read_i_th_line_from_partition(files, i, p):
    """
    Reads the ith line from a range of files defined by the partition number P
    without reading the whole file into memory.

    :param files: Array of file paths.
    :param i: Index of the line to read in each file.
    :param P: Partition number.
    :return: A list containing the ith line from each file in the specified range.
    """
    start_index = 5 * p
    end_index = min(start_index + 5, len(files))  # Ensure we don't exceed the array length
    lines = []

    for file_index in range(start_index, end_index):
        try:
            with open(files[file_index], 'r') as file:
                for line_number, line in enumerate(file):
                    if line_number == i:
                        lines.append(float(line.strip()))
                        break  # Stop reading after the ith line
        except FileNotFoundError:
            print(f"File not found: {files[file_index]}")
        except IndexError:
            print(f"Index out of range in file: {files[file_index]}")

    return sum(lines)

print("I have started")