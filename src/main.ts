// UI Engine theme - CSS custom properties available globally before any UI creates
import './ui/engine/theme.css';

import { bootstrapGame } from './core/bootstrap';

bootstrapGame().catch((err) => {
  console.error('[bootstrap]', err);
});
