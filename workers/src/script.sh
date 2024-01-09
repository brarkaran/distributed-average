#!/bin/bash

for i in {1..10}; do
    file="file$i.txt"
    >$file  # Create an empty file or clear it if it already exists
    for j in {1..20}; do
        echo $j >> $file
    done
done