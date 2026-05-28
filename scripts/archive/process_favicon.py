#!/usr/bin/env python3
"""
Script to process favicon.png:
- Remove white background outside the black circle
- Keep white elements inside the circle
- Resize to standard favicon sizes
"""

from PIL import Image
import numpy as np
import os
import sys

def process_favicon(input_path, output_dir='public'):
    """Process the favicon image"""

    # Load the image
    img = Image.open(input_path)
    img = img.convert("RGBA")

    # Convert to numpy array
    data = np.array(img)

    # Get dimensions
    height, width = data.shape[:2]

    # Find the center and radius of the circle
    center_x, center_y = width // 2, height // 2

    # Create a mask for the circular area
    # We'll detect the black circle boundary
    y, x = np.ogrid[:height, :width]

    # Calculate distance from center for each pixel
    dist_from_center = np.sqrt((x - center_x)**2 + (y - center_y)**2)

    # Find the radius by detecting where the black circle starts
    # Sample along a horizontal line through the center
    center_row = data[center_y, :, :]

    # Find where black starts from the left
    radius = 0
    for i in range(width):
        pixel = center_row[i]
        # Check if pixel is black (low RGB values)
        if pixel[0] < 50 and pixel[1] < 50 and pixel[2] < 50:
            radius = abs(center_x - i)
            break

    # If we couldn't detect radius, use a default
    if radius == 0:
        radius = min(width, height) // 2 - 10

    print(f"Detected circle radius: {radius}")

    # Create alpha channel
    # Make everything outside the circle transparent
    alpha = np.where(dist_from_center <= radius, 255, 0).astype(np.uint8)

    # Update the alpha channel
    data[:, :, 3] = alpha

    # Create the processed image
    processed = Image.fromarray(data, 'RGBA')

    # Create favicons at different sizes (64x64 minimum to avoid pixelation)
    sizes = [64, 128, 180, 192, 256, 512]

    for size in sizes:
        # Resize with high quality
        resized = processed.resize((size, size), Image.Resampling.LANCZOS)

        # Save PNG versions
        output_path = os.path.join(output_dir, f'favicon-{size}x{size}.png')
        resized.save(output_path, 'PNG')
        print(f"Created {output_path}")

    # Create a standard favicon.ico at 64x64
    ico_size = 64
    resized_ico = processed.resize((ico_size, ico_size), Image.Resampling.LANCZOS)
    output_path = os.path.join(output_dir, 'favicon.ico')
    resized_ico.save(output_path, format='ICO')
    print(f"Created {output_path} ({ico_size}x{ico_size})")

    # Also save a processed version at original size with transparent background
    output_path = os.path.join(output_dir, 'favicon-transparent.png')
    processed.save(output_path, 'PNG')
    print(f"Created {output_path} (original size with transparent background)")

    # Save the main favicon.png at 64x64
    main_favicon = processed.resize((64, 64), Image.Resampling.LANCZOS)
    output_path = os.path.join(output_dir, 'favicon.png')
    main_favicon.save(output_path, 'PNG')
    print(f"Created {output_path} (64x64 main favicon)")

    print("\nFavicon processing complete!")
    print("\nTo use in HTML:")
    print('<link rel="icon" type="image/x-icon" href="/favicon.ico">')
    print('<link rel="icon" type="image/png" sizes="64x64" href="/favicon-64x64.png">')
    print('<link rel="apple-touch-icon" sizes="180x180" href="/favicon-180x180.png">')

if __name__ == "__main__":
    # Default input path
    input_path = "public/assets/favicon.png"

    if len(sys.argv) > 1:
        input_path = sys.argv[1]

    if not os.path.exists(input_path):
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    process_favicon(input_path)
