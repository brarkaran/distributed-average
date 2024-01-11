import numpy as np
import os

def create_files_and_sum_numbers_vectorized(num_files, count):
    # Create the directory if it doesn't exist
    directory = '/Users/neoatom/dev/starship/dynamofl/input'
    if not os.path.exists(directory):
        os.makedirs(directory)

    # Generate a 2D NumPy array of random numbers (num_files x count)
    numbers = np.random.rand(num_files, count)

    # Write the numbers to files
    for i in range(num_files):
        np.savetxt(f'{directory}/{i}.txt', numbers[i, :], fmt='%f')
        print(f'"{directory}/{i}.txt"')

    # Sum across the first axis (summing each index across all files)
    sums = np.sum(numbers, axis=0)

    return sums.tolist()

print(create_files_and_sum_numbers_vectorized(1000, 200))