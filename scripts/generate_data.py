import random

def create_files_and_sum_numbers(num_files, count):
    # Initialize a list to store the sums of each index
    sums = [0] * count

    # Loop to create each file
    for i in range(num_files):
        with open(f'/Users/neoatom/dev/starship/dynamofl/input/{i}.txt', 'w') as file:
            print(f'"/Users/neoatom/dev/starship/dynamofl/input/{i}.txt",')
            # Generate 'count' random numbers and write them to the file
            numbers = [random.random() for _ in range(count)]
            file.write('\n'.join(map(str, numbers)))

            # Update the sums list by adding the current numbers index-wise
            sums = [sum(x) for x in zip(sums, numbers)]


    return sums

print(create_files_and_sum_numbers(10000, 2))