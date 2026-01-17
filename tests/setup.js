import { beforeAll, afterAll } from 'vitest';

// Fail-safe: Block any real network requests during tests
// This catches any test that forgets to mock fetch
const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = async (url, options) => {
    throw new Error(
      `Unmocked fetch call detected!\n` +
        `URL: ${url}\n` +
        `Method: ${options?.method || 'GET'}\n` +
        `Tests must mock all network requests.`
    );
  };
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});
