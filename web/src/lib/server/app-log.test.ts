import { afterEach, describe, expect, it } from "vitest";
import { _resetAppLogConfigForTests, shouldEmitAppLog } from "./app-log";

describe("app-log / shouldEmitAppLog", () => {
  afterEach(() => {
    delete process.env.APP_LOG_LEVEL;
    delete process.env.APP_LOG_SCOPES;
    _resetAppLogConfigForTests();
  });

  it("既定は warn まで（info は出ない）", () => {
    expect(shouldEmitAppLog("opening", "error")).toBe(true);
    expect(shouldEmitAppLog("opening", "warn")).toBe(true);
    expect(shouldEmitAppLog("opening", "info")).toBe(false);
    expect(shouldEmitAppLog("opening", "debug")).toBe(false);
  });

  it("APP_LOG_LEVEL=info なら info まで全 scope", () => {
    process.env.APP_LOG_LEVEL = "info";
    _resetAppLogConfigForTests();
    expect(shouldEmitAppLog("opening", "info")).toBe(true);
    expect(shouldEmitAppLog("calendar", "info")).toBe(true);
    expect(shouldEmitAppLog("opening", "debug")).toBe(false);
  });

  it("APP_LOG_SCOPES で info/debug を絞る", () => {
    process.env.APP_LOG_LEVEL = "debug";
    process.env.APP_LOG_SCOPES = "calendar";
    _resetAppLogConfigForTests();
    expect(shouldEmitAppLog("calendar", "debug")).toBe(true);
    expect(shouldEmitAppLog("opening", "debug")).toBe(false);
    expect(shouldEmitAppLog("opening", "warn")).toBe(true);
  });

  it("APP_LOG_LEVEL=off は何も出さない", () => {
    process.env.APP_LOG_LEVEL = "off";
    _resetAppLogConfigForTests();
    expect(shouldEmitAppLog("opening", "error")).toBe(false);
  });
});
