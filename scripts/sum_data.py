import numpy as np
import os

def sum_numbers_from_files(num_files, count, directory='/Users/neoatom/dev/starship/dynamofl/input'):
    # Initialize an array to hold the sums
    sums = np.zeros(count)

    # Read numbers from each file and update the sums
    for i in range(num_files):
        file_path = os.path.join(directory, f'{i}.txt')
        if os.path.exists(file_path):
            # Load numbers from the file
            numbers = np.loadtxt(file_path)

            # Check if the file contains the correct number of elements
            if numbers.shape[0] != count:
                raise ValueError(f"File {file_path} does not contain the expected number of elements.")

            # Update the sums
            sums += numbers
        else:
            raise FileNotFoundError(f"File {file_path} not found.")

    return sums

print(sum_numbers_from_files(1000, 20))