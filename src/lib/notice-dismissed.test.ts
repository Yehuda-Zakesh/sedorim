import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  dismissNotice,
  isNoticeDismissed,
  resetDismissedNotices,
  useNoticeDismissed,
} from "./notice-dismissed";

describe("notice-dismissed", () => {
  beforeEach(() => resetDismissedNotices());

  it("stays dismissed for the whole run, whichever screen asks", () => {
    expect(isNoticeDismissed("upgrade")).toBe(false);
    dismissNotice("upgrade");
    // another screen mounting its own shell later still sees it dismissed
    expect(isNoticeDismissed("upgrade")).toBe(true);
    expect(isNoticeDismissed("legacy-conflict")).toBe(false);
  });

  it("exposes a hook for components", () => {
    expect(typeof useNoticeDismissed).toBe("function");
    const spy = vi.fn();
    dismissNotice("x");
    dismissNotice("x");
    spy();
    expect(isNoticeDismissed("x")).toBe(true);
  });
});
