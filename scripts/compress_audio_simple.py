#!/usr/bin/env python3
"""
Audio Compression Script for Helicopter and Transmission Audio
- Converts WAV files to OGG format with appropriate quality settings
- Handles helicopter rotor blades and radio transmissions
"""

import subprocess
import shutil
from pathlib import Path
from datetime import datetime

class AudioCompressor:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.assets_dir = self.project_root / 'public' / 'assets'

        # Create backup directory
        self.backup_dir = self.project_root / 'audio_backup' / datetime.now().strftime('%Y%m%d_%H%M%S')
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    def check_ffmpeg(self):
        """Check if ffmpeg is available"""
        try:
            subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
            print("ffmpeg found")
            return True
        except Exception:
            print("ffmpeg not found - please install ffmpeg first")
            return False

    def backup_original(self, file_path: Path):
        """Create backup of original file"""
        backup_path = self.backup_dir / file_path.name
        shutil.copy2(file_path, backup_path)
        print(f"  Backed up: {file_path.name}")

    def compress_audio(self, input_path: Path, quality: str = '6') -> bool:
        """Convert WAV to OGG with specified quality"""
        output_path = input_path.with_suffix('.ogg')

        try:
            cmd = [
                'ffmpeg',
                '-i', str(input_path),
                '-c:a', 'libvorbis',
                '-q:a', quality,
                '-y',  # Overwrite output file
                str(output_path)
            ]

            result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            if result.returncode == 0 and output_path.exists():
                # Get file sizes
                original_size = input_path.stat().st_size
                compressed_size = output_path.stat().st_size
                reduction = (1 - compressed_size/original_size) * 100

                print(f"  Success: {input_path.name} -> {output_path.name} ({reduction:.1f}% smaller)")

                # Remove original WAV file
                input_path.unlink()
                return True
            else:
                print(f"  Failed to compress {input_path.name}")
                return False

        except Exception as e:
            print(f"  Error compressing {input_path.name}: {e}")
            return False

    def process_helicopter_audio(self):
        """Process helicopter rotor blade audio"""
        rotor_file = self.assets_dir / 'RotorBlades.wav'

        if rotor_file.exists():
            print("\nProcessing helicopter audio:")
            self.backup_original(rotor_file)
            # Use higher quality for helicopter audio (important for immersion)
            success = self.compress_audio(rotor_file, quality='7')
            return success
        else:
            print("  No RotorBlades.wav found")
            return False

    def process_transmissions(self):
        """Process radio transmission audio files"""
        transmissions_dir = self.assets_dir / 'transmissions'

        if not transmissions_dir.exists():
            print("  No transmissions directory found")
            return False

        wav_files = list(transmissions_dir.glob('*.wav'))

        if not wav_files:
            print("  No WAV files found in transmissions directory")
            return False

        print(f"\nProcessing {len(wav_files)} transmission files:")

        success_count = 0
        for wav_file in wav_files:
            self.backup_original(wav_file)
            # Use medium quality for transmissions (they should sound a bit compressed anyway)
            if self.compress_audio(wav_file, quality='5'):
                success_count += 1

        print(f"  Successfully compressed {success_count}/{len(wav_files)} transmission files")
        return success_count > 0

    def run(self):
        """Run the complete audio compression process"""
        print("HELICOPTER & TRANSMISSION AUDIO COMPRESSOR")
        print("=" * 50)

        if not self.check_ffmpeg():
            return False

        print(f"\nBackup directory: {self.backup_dir}")

        # Process helicopter audio
        helicopter_success = self.process_helicopter_audio()

        # Process transmissions
        transmission_success = self.process_transmissions()

        # Summary
        print("\n" + "=" * 50)
        print("COMPRESSION COMPLETE")
        print("=" * 50)

        if helicopter_success:
            print("Helicopter rotor audio compressed")
        else:
            print("Helicopter rotor audio not processed")

        if transmission_success:
            print("Transmission audio files compressed")
        else:
            print("Transmission audio files not processed")

        print(f"\nOriginal files backed up to: {self.backup_dir}")
        print("\nNext steps:")
        print("1. Update AssetLoader to load .ogg files instead of .wav")
        print("2. Wire helicopter audio into HelicopterModel system")
        print("3. Implement random transmission playback system")

        return helicopter_success or transmission_success

def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent

    compressor = AudioCompressor(project_root)
    compressor.run()

if __name__ == "__main__":
    main()
