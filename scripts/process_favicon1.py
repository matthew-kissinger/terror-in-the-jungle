#!/usr/bin/env python3
"""
Script to process favicon1.png:
- Remove white background (make transparent)
- Auto-crop to content
- Resize to standard favicon sizes
"""

from PIL import Image
import numpy as np
import os
import sys

def process_favicon(input_path, output_dir='public'):
    """Process the favicon1 image"""

    # Load the image
    img = Image.open(input_path)
    img = img.convert("RGBA")

    # Convert to numpy array
    data = np.array(img)

    # Get dimensions
    height, width = data.shape[:2]

    # Create alpha channel by making white pixels transparent
    # We'll consider pixels as white if all RGB values are above 240
    red, green, blue, alpha = data.T
    white_areas = (red > 240) & (green > 240) & (blue > 240)

    # Set white pixels to transparent
    data[..., 3] = np.where(white_areas.T, 0, 255)

    # Create image from processed data
    processed = Image.fromarray(data, 'RGBA')

    # Auto-crop to remove transparent borders
    # Get the bounding box of non-transparent pixels
    bbox = processed.getbbox()
    if bbox:
        processed = processed.crop(bbox)
        crop_msg = (
            f"Cropped image from {width}x{height} to "
            f"{processed.width}x{processed.height}"
        )
        print(crop_msg)

    # Add some padding around the content (10% of the smaller dimension)
    padding = min(processed.width, processed.height) // 10

    # Create a new image with padding
    padded_size = (processed.width + 2*padding, processed.height + 2*padding)
    padded = Image.new('RGBA', padded_size, (0, 0, 0, 0))

    # Paste the cropped image centered in the padded image
    paste_pos = (padding, padding)
    padded.paste(processed, paste_pos)

    # Make it square by adding transparent padding
    max_dim = max(padded.width, padded.height)
    square = Image.new('RGBA', (max_dim, max_dim), (0, 0, 0, 0))

    # Center the image in the square
    x_offset = (max_dim - padded.width) // 2
    y_offset = (max_dim - padded.height) // 2
    square.paste(padded, (x_offset, y_offset))

    print(f"Created square image: {max_dim}x{max_dim}")

    # Create favicons at different sizes (64x64 minimum to avoid pixelation)
    sizes = [64, 128, 180, 192, 256, 512]

    for size in sizes:
        # Resize with high quality
        resized = square.resize((size, size), Image.Resampling.LANCZOS)

        # Save PNG versions
        output_path = os.path.join(output_dir, f'favicon-{size}x{size}.png')
        resized.save(output_path, 'PNG', optimize=True)
        print(f"Created {output_path}")

    # Create a standard favicon.ico at 64x64
    ico_size = 64
    resized_ico = square.resize((ico_size, ico_size), Image.Resampling.LANCZOS)
    output_path = os.path.join(output_dir, 'favicon.ico')
    resized_ico.save(output_path, format='ICO')
    print(f"Created {output_path} ({ico_size}x{ico_size})")

    # Also save a processed version at original size with transparent background
    output_path = os.path.join(output_dir, 'favicon-transparent.png')
    square.save(output_path, 'PNG', optimize=True)
    print(f"Created {output_path} (processed square version)")

    # Save the main favicon.png at 64x64
    main_favicon = square.resize((64, 64), Image.Resampling.LANCZOS)
    output_path = os.path.join(output_dir, 'favicon.png')
    main_favicon.save(output_path, 'PNG', optimize=True)
    print(f"Created {output_path} (64x64 main favicon)")

    print("\nFavicon processing complete!")
    print("\nThe favicon has been:")
    print("- Background removed (white made transparent)")
    print("- Auto-cropped to content")
    print("- Padded and made square")
    print("- Resized to multiple standard sizes")

if __name__ == "__main__":
    # Default input path
    input_path = "public/assets/favicon1.png"

    if len(sys.argv) > 1:
        input_path = sys.argv[1]

    if not os.path.exists(input_path):
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    process_favicon(input_path)
