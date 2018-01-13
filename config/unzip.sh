#!bash
# Usage: unzip.sh zip_file dest_dir
mkdir -p "$2"
unzip "$1" -d "$2"
