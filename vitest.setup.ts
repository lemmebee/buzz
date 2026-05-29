import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees between tests so jsdom queries don't see leaked DOM.
afterEach(() => {
  cleanup();
});
