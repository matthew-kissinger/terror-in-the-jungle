#!/usr/bin/env python3
"""
Smart Asset Optimization for Terror in the Jungle
- Always creates backups
- Preserves aspect ratios
- Offers multiple optimization strategies
"""

import subprocess
import shutil
from pathlib import Path
from datetime import datetime
from typing import Tuple
import json


try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("Installing Pillow for image processing...")
    subprocess.run(['pip', 'install', 'Pillow'], check=True)
    from PIL import Image
    HAS_PIL = True

class SmartOptimizer:
    def __init__(self, assets_dir: str):
        self.assets_dir = Path(assets_dir)
        self.project_root = self.assets_dir.parent.parent

        # Create folder structure
        self.archive_dir = self.project_root / 'assets_archive' / datetime.now().strftime('%Y%m%d_%H%M%S')
        self.optimized_dir = self.project_root / 'public' / 'assets_optimized'
        self.optimized_resize_dir = self.project_root / 'public' / 'assets_optimized_resized'

        # Create directories
        self.archive_dir.mkdir(parents=True, exist_ok=True)
        self.optimized_dir.mkdir(parents=True, exist_ok=True)
        self.optimized_resize_dir.mkdir(parents=True, exist_ok=True)

        self.stats = {
            'backup_created': False,
            'original_total_size': 0,
            'optimized_size': 0,
            'optimized_resize_size': 0,
            'files': {}
        }

        # Smart sizing rules - preserve aspect ratio
        self.sizing_rules = {
            'soldier': {
                'max_dimension': 1024,  # Still large for detail
                'description': 'Character sprites need detail for combat visibility'
            },
            'tree': {
                'max_dimension': 2048,  # Trees are big in-game
                'description': 'Large vegetation maintains imposing presence'
            },
            'foliage': {
                'max_dimension': 1024,  # Ground cover can be smaller
                'description': 'Ground foliage tiles well at lower res'
            },
            'skybox': {
                'max_dimension': 4096,  # Skybox needs to stay crisp
                'description': 'Skybox wraps entire scene, needs resolution'
            },
            'texture': {
                'max_dimension': 512,   # Repeating textures work fine small
                'description': 'Tiling textures look good at lower res'
            },
            'ui': {
                'max_dimension': 512,   # UI elements don't need huge res
                'description': 'UI scales well at lower resolution'
            }
        }

    def backup_all_assets(self):
        """Create a complete backup of all original assets"""
        print("\nCreating backup archive...")

        # Copy all files to archive
        all_files = list(self.assets_dir.glob('*.*'))
        for file in all_files:
            dest = self.archive_dir / file.name
            shutil.copy2(file, dest)
            self.stats['original_total_size'] += file.stat().st_size

        self.stats['backup_created'] = True
        print(f" Backed up {len(all_files)} files to: {self.archive_dir}")

        # Create a README in the archive
        readme_content = f"""
# Asset Archive - Terror in the Jungle
Created: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Contents
- Original unmodified assets before optimization
- Total size: {self.stats['original_total_size'] / (1024*1024):.2f} MB
- Files: {len(all_files)}

## Restoration
To restore these assets:
1. Copy all files from this folder
2. Paste into public/assets/
3. Overwrite when prompted

## File List
{chr(10).join(['- ' + f.name for f in all_files])}
"""

        readme_path = self.archive_dir / 'README.md'
        readme_path.write_text(readme_content)

        return True

    def detect_content_type(self, filename: str) -> str:
        """Detect what type of content this is"""
        name_lower = filename.lower()

        if any(x in name_lower for x in ['soldier', 'enemy']):
            return 'soldier'
        elif any(x in name_lower for x in ['dipterocarp', 'banyan', 'coconut', 'palm', 'tree']):
            return 'tree'
        elif any(x in name_lower for x in ['fern', 'elephant', 'grass']):
            return 'foliage'
        elif 'skybox' in name_lower:
            return 'skybox'
        elif any(x in name_lower for x in ['floor', 'ground']):
            return 'texture'
        elif 'first-person' in name_lower or 'ui' in name_lower:
            return 'ui'
        else:
            return 'misc'

    def calculate_new_dimensions(self, width: int, height: int, max_dimension: int) -> Tuple[int, int]:
        """
        Calculate new dimensions preserving aspect ratio
        Never upscale, only downscale if needed
        """
        # Don't upscale
        if width <= max_dimension and height <= max_dimension:
            return width, height

        # Calculate scale factor to fit within max_dimension
        aspect_ratio = width / height

        if width > height:
            # Landscape
            new_width = min(width, max_dimension)
            new_height = int(new_width / aspect_ratio)
        else:
            # Portrait or square
            new_height = min(height, max_dimension)
            new_width = int(new_height * aspect_ratio)

        # Ensure dimensions are even numbers (better for compression)
        new_width = new_width - (new_width % 2)
        new_height = new_height - (new_height % 2)

        return new_width, new_height

    def optimize_png_same_size(self, input_path: Path, output_path: Path) -> dict:
        """Optimize PNG keeping exact same dimensions"""
        stats = {
            'original_size': input_path.stat().st_size,
            'optimized_size': 0,
            'dimensions_changed': False
        }

        try:
            # First try pngquant (lossy but effective)
            temp_path = output_path.with_suffix('.tmp.png')

            # Determine quality based on content
            content_type = self.detect_content_type(input_path.name)
            if content_type == 'soldier':
                quality = '95-100'  # Maximum quality for characters
            elif content_type == 'skybox':
                quality = '85-98'   # Skybox can handle slight compression
            else:
                quality = '90-100'  # High quality default

            cmd = [
                'pngquant',
                '--quality=' + quality,
                '--speed=1',
                '--force',
                '--output', str(temp_path),
                str(input_path)
            ]

            result = subprocess.run(cmd, capture_output=True)

            if result.returncode == 0 and temp_path.exists():
                # Success with pngquant
                shutil.move(temp_path, output_path)
            else:
                # Fallback to optipng (lossless)
                shutil.copy2(input_path, output_path)
                cmd = ['optipng', '-o5', '-quiet', str(output_path)]
                subprocess.run(cmd, capture_output=True)

            stats['optimized_size'] = output_path.stat().st_size

        except Exception as e:
            print(f"     Optimization failed: {e}")
            shutil.copy2(input_path, output_path)
            stats['optimized_size'] = output_path.stat().st_size

        return stats

    def optimize_png_smart_resize(self, input_path: Path, output_path: Path) -> dict:
        """Optimize PNG with smart resizing based on content type"""
        stats = {
            'original_size': input_path.stat().st_size,
            'optimized_size': 0,
            'original_dimensions': None,
            'new_dimensions': None,
            'dimensions_changed': False
        }

        if not HAS_PIL:
            print("     PIL not available for resizing")
            return self.optimize_png_same_size(input_path, output_path)

        try:
            # Open image
            with Image.open(input_path) as img:
                stats['original_dimensions'] = f"{img.width}x{img.height}"

                # Determine optimal size based on content
                content_type = self.detect_content_type(input_path.name)
                max_dim = self.sizing_rules.get(content_type, {'max_dimension': 2048})['max_dimension']

                # Calculate new dimensions preserving aspect ratio
                new_width, new_height = self.calculate_new_dimensions(img.width, img.height, max_dim)
                stats['new_dimensions'] = f"{new_width}x{new_height}"

                if new_width != img.width or new_height != img.height:
                    stats['dimensions_changed'] = True

                    # Resize with high quality
                    # Use LANCZOS for downscaling (best quality)
                    resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

                    # Save with optimization
                    resized.save(output_path, 'PNG', optimize=True)
                    resized.close()
                else:
                    # No resize needed, just optimize
                    img.save(output_path, 'PNG', optimize=True)

                # Run pngquant on the result
                temp_path = output_path.with_suffix('.tmp.png')
                quality = '85-98' if content_type != 'soldier' else '95-100'

                cmd = [
                    'pngquant',
                    '--quality=' + quality,
                    '--speed=1',
                    '--force',
                    '--output', str(temp_path),
                    str(output_path)
                ]

                result = subprocess.run(cmd, capture_output=True)
                if result.returncode == 0 and temp_path.exists():
                    shutil.move(temp_path, output_path)

                stats['optimized_size'] = output_path.stat().st_size

        except Exception as e:
            print(f"     Resize failed: {e}")
            return self.optimize_png_same_size(input_path, output_path)

        return stats

    def optimize_audio(self, input_path: Path, output_dir: Path) -> dict:
        """Convert audio to OGG with high quality"""
        stats = {
            'original_size': input_path.stat().st_size,
            'optimized_size': 0
        }

        output_path = output_dir / input_path.with_suffix('.ogg').name

        try:
            # Determine quality based on content
            filename = input_path.name.lower()
            if 'jungle' in filename or 'ambient' in filename:
                quality = '5'  # 160kbps for ambient
            else:
                quality = '7'  # 224kbps for SFX

            cmd = [
                'ffmpeg',
                '-i', str(input_path),
                '-c:a', 'libvorbis',
                '-q:a', quality,
                '-y',
                str(output_path)
            ]

            subprocess.run(cmd, capture_output=True, stderr=subprocess.DEVNULL)
            stats['optimized_size'] = output_path.stat().st_size

        except Exception as e:
            print(f"     Audio conversion failed: {e}")
            shutil.copy2(input_path, output_path)
            stats['optimized_size'] = output_path.stat().st_size

        return stats

    def check_dependencies(self):
        """Check and install required tools"""
        print("\n Checking dependencies...")

        tools_needed = []

        # Check pngquant
        try:
            subprocess.run(['pngquant', '--version'], capture_output=True, check=True)
            print("   pngquant found")
        except FileNotFoundError:
            tools_needed.append('pngquant')
            print("   pngquant not found")

        # Check optipng
        try:
            subprocess.run(['optipng', '--version'], capture_output=True, check=True)
            print("   optipng found")
        except FileNotFoundError:
            tools_needed.append('optipng')
            print("   optipng not found")

        # Check ffmpeg
        try:
            subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
            print("   ffmpeg found")
        except FileNotFoundError:
            tools_needed.append('ffmpeg')
            print("   ffmpeg not found")

        if tools_needed:
            print("\n  Missing tools! To install:")
            if 'pngquant' in tools_needed:
                print("  pngquant: Download from https://pngquant.org/")
            if 'optipng' in tools_needed:
                print("  optipng: Download from http://optipng.sourceforge.net/")
            if 'ffmpeg' in tools_needed:
                print("  ffmpeg: Download from https://ffmpeg.org/download.html")

            return False

        return True

    def run_optimization(self):
        """Run the complete optimization process"""
        print("\n" + "="*70)
        print("TERROR IN THE JUNGLE - SMART ASSET OPTIMIZER")
        print("="*70)

        # Check dependencies
        if not self.check_dependencies():
            print("\nPlease install missing tools first!")
            return

        # Step 1: Backup everything
        if not self.backup_all_assets():
            print(" Backup failed! Aborting.")
            return

        # Step 2: Process PNGs
        png_files = list(self.assets_dir.glob('*.png'))
        print(f"\n Processing {len(png_files)} PNG files...")
        print("-" * 50)

        for png_file in png_files:
            print(f"\n{png_file.name}:")
            content_type = self.detect_content_type(png_file.name)
            print(f"  Type: {content_type}")

            # Version 1: Same dimensions
            print("  Creating dimension-preserved version...", end="")
            output1 = self.optimized_dir / png_file.name
            stats1 = self.optimize_png_same_size(png_file, output1)
            reduction1 = (1 - stats1['optimized_size']/stats1['original_size']) * 100
            print(f" {reduction1:.1f}% smaller")

            # Version 2: Smart resize
            print("  Creating smart-resized version...", end="")
            output2 = self.optimized_resize_dir / png_file.name
            stats2 = self.optimize_png_smart_resize(png_file, output2)
            reduction2 = (1 - stats2['optimized_size']/stats2['original_size']) * 100

            if stats2['dimensions_changed']:
                print(f" {reduction2:.1f}% smaller ({stats2['original_dimensions']} → {stats2['new_dimensions']})")
            else:
                print(f" {reduction2:.1f}% smaller (no resize needed)")

            # Track stats
            self.stats['files'][png_file.name] = {
                'type': content_type,
                'original_size': stats1['original_size'],
                'optimized_size': stats1['optimized_size'],
                'optimized_resize_size': stats2['optimized_size'],
                'dimensions': stats2.get('original_dimensions'),
                'new_dimensions': stats2.get('new_dimensions')
            }

            self.stats['optimized_size'] += stats1['optimized_size']
            self.stats['optimized_resize_size'] += stats2['optimized_size']

        # Step 3: Process Audio
        audio_files = list(self.assets_dir.glob('*.wav'))
        if audio_files:
            print(f"\n Processing {len(audio_files)} audio files...")
            print("-" * 50)

            for audio_file in audio_files:
                print(f"\n{audio_file.name}:")

                # Convert to OGG for both directories
                print("  Converting to OGG...", end="")
                stats1 = self.optimize_audio(audio_file, self.optimized_dir)
                stats2 = self.optimize_audio(audio_file, self.optimized_resize_dir)

                reduction = (1 - stats1['optimized_size']/stats1['original_size']) * 100
                print(f" {reduction:.1f}% smaller")

                self.stats['files'][audio_file.name] = {
                    'type': 'audio',
                    'original_size': stats1['original_size'],
                    'optimized_size': stats1['optimized_size'],
                    'optimized_resize_size': stats2['optimized_size']
                }

                self.stats['optimized_size'] += stats1['optimized_size']
                self.stats['optimized_resize_size'] += stats2['optimized_size']

        # Generate report
        self.generate_report()

    def generate_report(self):
        """Generate optimization report"""
        print("\n" + "="*70)
        print(" OPTIMIZATION COMPLETE")
        print("="*70)

        original_mb = self.stats['original_total_size'] / (1024*1024)
        optimized_mb = self.stats['optimized_size'] / (1024*1024)
        resized_mb = self.stats['optimized_resize_size'] / (1024*1024)

        print("\nOriginal assets backed up to:")
        print(f"   {self.archive_dir}")

        print("\nSize Results:")
        print(f"   Original:                {original_mb:.2f} MB")
        same_reduction = (1-optimized_mb/original_mb)*100
        print(f"   Optimized (same size):   {optimized_mb:.2f} MB ({same_reduction:.1f}% reduction)")
        resize_reduction = (1-resized_mb/original_mb)*100
        print(f"   Optimized (smart resize): {resized_mb:.2f} MB ({resize_reduction:.1f}% reduction)")

        print("\nOutput Locations:")
        print(f"   Same dimensions:  {self.optimized_dir}")
        print(f"   Smart resized:    {self.optimized_resize_dir}")

        # Save detailed report
        report = {
            'timestamp': datetime.now().isoformat(),
            'original_size_mb': original_mb,
            'optimized_size_mb': optimized_mb,
            'optimized_resize_mb': resized_mb,
            'files': self.stats['files'],
            'sizing_rules': self.sizing_rules
        }

        report_path = self.project_root / 'optimization_report.json'
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)

        print(f"\n Detailed report saved to: {report_path}")

        print("\n" + "="*70)
        print(" NEXT STEPS:")
        print("="*70)
        print("1. Test both versions in your game:")
        print(f"   - Copy files from '{self.optimized_dir.name}' for same-size")
        print(f"   - Copy files from '{self.optimized_resize_dir.name}' for smaller")
        print("\n2. Update AssetLoader.ts to load .ogg files instead of .wav")
        print("\n3. If something breaks, restore from:")
        print(f"   {self.archive_dir}")
        print("\n4. Consider using the resized versions - they preserve aspect ratio!")

def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    assets_dir = project_root / 'public' / 'assets'

    if not assets_dir.exists():
        print(f" Assets directory not found: {assets_dir}")
        return

    optimizer = SmartOptimizer(assets_dir)
    optimizer.run_optimization()

if __name__ == "__main__":
    main()
