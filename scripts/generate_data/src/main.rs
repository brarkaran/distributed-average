use ndarray::Array2;
use rand::distributions::{Distribution, Uniform};
use rand::rngs::StdRng;
use rand::SeedableRng;
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::Path;
use rayon::prelude::*;

fn create_files_and_sum_numbers_vectorized(num_files: usize, count: usize) -> Vec<f64> {
    let directory = "/Users/neoatom/dev/starship/dynamofl/input";
    let path = Path::new(directory);
    if !path.exists() {
        fs::create_dir_all(path).expect("Failed to create directory");
    }

    let between = Uniform::from(0.0..1.0);

    let numbers: Vec<_> = (0..num_files).into_par_iter().map(|i| {
        let mut rng = StdRng::from_entropy(); // Create a new RNG for each thread
        let mut row = Vec::with_capacity(count);
        for _ in 0..count {
            row.push(between.sample(&mut rng));
        }

        let file_path = format!("{}/{}.txt", directory, i);
        let file = File::create(&file_path).expect("Failed to create file");
        let mut writer = BufWriter::new(file);
        for &num in &row {
            writeln!(writer, "{:.6}", num).expect("Failed to write to file");
        }
        println!("{}", file_path);

        row
    }).collect();

    let mut sums = vec![0.0; count];
    for row in numbers {
        for (sum, &num) in sums.iter_mut().zip(row.iter()) {
            *sum += num;
        }
    }

    sums
}

fn main() {
    let num_files = 2000;
    let count = 2000000;
    let sums = create_files_and_sum_numbers_vectorized(num_files, count);
    println!("Sums: {:?}", sums);
}
