import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement hasPointerCapture/setPointerCapture which Radix UI needs
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Mock Electron IPC APIs used by layout components
Object.defineProperty(window, "logApi", {
  value: { query: () => Promise.resolve([]) },
  writable: true,
});
