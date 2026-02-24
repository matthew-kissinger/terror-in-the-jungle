// Path configuration for assets
// This handles both local development and GitHub Pages deployment

export function getAssetPath(filename: string): string {
  // Use relative path that works with Vite's base configuration
  return `./assets/${filename}`;
}

export function getModelPath(relativePath: string): string {
  // GLB models stored in public/models/, served at ./models/
  return `./models/${relativePath}`;
}

export function getBasePath(): string {
  // This will be replaced by Vite with the correct base path
  return import.meta.env.BASE_URL || '/';
}