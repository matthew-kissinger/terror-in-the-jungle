import { bootstrapGame } from './core/bootstrap';

bootstrapGame().catch((err) => {
  console.error('[bootstrap]', err);
});
