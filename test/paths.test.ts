import { describe, expect, it } from "vitest";
import { getAppPaths } from "../src/config/paths.js";

describe("getAppPaths", () => {
  it("derives the managed state files under ~/.baliclaw", () => {
    const paths = getAppPaths("/tmp/example-home");
    expect(paths.rootDir).toBe("/tmp/example-home/.baliclaw");
    expect(paths.configFile).toBe("/tmp/example-home/.baliclaw/config.json5");
    expect(paths.socketFile).toBe("/tmp/example-home/.baliclaw/baliclaw.sock");
  });
});
