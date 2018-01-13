#!bash
# Usage: unzip.sh zip_file dest_dir
mkdir -p "$2"
unzip -o "$1" -d "$2"
