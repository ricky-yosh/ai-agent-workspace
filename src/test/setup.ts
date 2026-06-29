import "@testing-library/jest-dom/vitest";

// jsdom does not implement scrollIntoView; add a no-op polyfill for tests.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
