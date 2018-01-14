#!bash
# Usage: wav_to_flac.sh wav_file dest_dir
filename=$(basename "$1")
filename="${filename%.*}"
ffmpeg -y -i "$1" "$2/$filename.flac"
