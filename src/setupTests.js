// jest-dom custom matchers, e.g. expect(el).toBeInTheDocument()
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// jsdom (shipped with CRA's Jest) predates a few web APIs that
// react-router-dom v7 / Firebase expect at import time.
// ---------------------------------------------------------------------------
import { TextDecoder, TextEncoder } from "util";

if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = TextDecoder;
}

// jsdom has no BroadcastChannel (used by the Firebase SDK in some paths).
if (typeof global.BroadcastChannel === "undefined") {
  global.BroadcastChannel = class BroadcastChannel {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
    }
    postMessage() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  };
}
