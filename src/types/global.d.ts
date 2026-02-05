/**
 * Type declarations for requestIdleCallback/cancelIdleCallback
 * These are standard browser APIs but not included in TypeScript's default lib
 */

interface IdleDeadline {
  didTimeout: boolean;
  timeRemaining(): number;
}

interface IdleRequestOptions {
  timeout?: number;
}

interface Window {
  requestIdleCallback?(
    callback: (deadline: IdleDeadline) => void,
    options?: IdleRequestOptions
  ): number;
  cancelIdleCallback?(handle: number): void;
}
