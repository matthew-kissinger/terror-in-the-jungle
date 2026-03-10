export class InitialDeployCancelledError extends Error {
  constructor() {
    super('Initial deploy cancelled');
    this.name = 'InitialDeployCancelledError';
  }
}
