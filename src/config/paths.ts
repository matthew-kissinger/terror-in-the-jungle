// Path configuration for assets
// This handles both local development and Cloudflare Pages deployment

export function getAssetPath(filename: string): string {
  // Use relative path that works with Vite's base configuration
  return `./assets/${filename}`;
}

export function getModelPath(relativePath: string): string {
  // GLB models stored in public/models/, served at ./models/
  return `./models/${relativePath}`;
}
