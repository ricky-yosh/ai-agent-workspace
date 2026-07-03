import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerViewer,
  unregisterViewer,
  focusViewer,
  getLastFocusedViewer,
  openFileInViewer,
  setPendingFile,
  consumePendingFile,
  setActiveFilePath,
  getActiveFilePath,
  onActiveFilePathChange,
} from "./viewerRegistry";

// ---------------------------------------------------------------------------
// State cleanup helpers
// ---------------------------------------------------------------------------

const registeredAreas: string[] = [];
const listenerCleanups: Array<() => void> = [];

function reg(areaId: string, workspaceId = "w1") {
  const openFile = vi.fn();
  registeredAreas.push(areaId);
  registerViewer(areaId, openFile, workspaceId);
  return openFile;
}

beforeEach(() => {
  // Unregister all viewers from previous tests
  for (const id of registeredAreas) {
    unregisterViewer(id);
  }
  registeredAreas.length = 0;

  // Clean up any listeners added by previous tests
  for (const fn of listenerCleanups) fn();
  listenerCleanups.length = 0;

  // Reset active file path and pending file
  setActiveFilePath(null);
  consumePendingFile();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe("viewerRegistry", () => {
  describe("registerViewer", () => {
    it("registers a viewer and sets it as last focused", () => {
      reg("area-1");
      const last = getLastFocusedViewer();
      expect(last).not.toBeNull();
      expect(last!.areaId).toBe("area-1");
    });

    it("registering a second viewer makes it the last focused", () => {
      reg("area-1");
      reg("area-2");
      const last = getLastFocusedViewer();
      expect(last!.areaId).toBe("area-2");
    });
  });

  // -----------------------------------------------------------------------
  // Unregister
  // -----------------------------------------------------------------------

  describe("unregisterViewer", () => {
    it("removes a registered viewer", () => {
      reg("area-1");
      unregisterViewer("area-1");
      const last = getLastFocusedViewer();
      // No viewers remain, so last should be null
      expect(last).toBeNull();
    });

    it("falls back to remaining viewer when last-focused is unregistered", () => {
      reg("area-1");
      reg("area-2");
      // area-2 is last focused
      expect(getLastFocusedViewer()!.areaId).toBe("area-2");

      unregisterViewer("area-2");
      const last = getLastFocusedViewer();
      expect(last).not.toBeNull();
      expect(last!.areaId).toBe("area-1");
    });

    it("is a no-op for unknown area ID", () => {
      reg("area-1");
      unregisterViewer("area-unknown");
      expect(getLastFocusedViewer()!.areaId).toBe("area-1");
    });
  });

  // -----------------------------------------------------------------------
  // Focus
  // -----------------------------------------------------------------------

  describe("focusViewer", () => {
    it("updates last focused to the given area", () => {
      reg("area-1");
      reg("area-2");
      expect(getLastFocusedViewer()!.areaId).toBe("area-2");

      focusViewer("area-1");
      expect(getLastFocusedViewer()!.areaId).toBe("area-1");
    });

    it("ignores unknown area ID", () => {
      reg("area-1");
      focusViewer("area-unknown");
      expect(getLastFocusedViewer()!.areaId).toBe("area-1");
    });
  });

  // -----------------------------------------------------------------------
  // getLastFocusedViewer
  // -----------------------------------------------------------------------

  describe("getLastFocusedViewer", () => {
    it("returns null when no viewers are registered", () => {
      expect(getLastFocusedViewer()).toBeNull();
    });

    it("returns last focused viewer without workspace filter", () => {
      reg("area-1");
      reg("area-2");
      focusViewer("area-1");
      expect(getLastFocusedViewer()!.areaId).toBe("area-1");
    });

    it("prefers matching workspace when workspaceId is provided", () => {
      reg("area-1", "ws-a");
      reg("area-2", "ws-b");
      // area-2 is last focused (ws-b)
      expect(getLastFocusedViewer("ws-b")!.areaId).toBe("area-2");
      expect(getLastFocusedViewer("ws-a")!.areaId).toBe("area-1");
    });

    it("falls back to any viewer in workspace when last focused is different workspace", () => {
      reg("area-1", "ws-a");
      reg("area-2", "ws-b");
      // area-2 is last focused (ws-b), but requesting ws-a
      const result = getLastFocusedViewer("ws-a");
      expect(result).not.toBeNull();
      expect(result!.areaId).toBe("area-1");
    });

    it("returns null when no viewer matches the workspace", () => {
      reg("area-1", "ws-a");
      expect(getLastFocusedViewer("ws-z")).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // openFileInViewer
  // -----------------------------------------------------------------------

  describe("openFileInViewer", () => {
    it("dispatches a CustomEvent with the file path", () => {
      const spy = vi.spyOn(window, "dispatchEvent");
      openFileInViewer("src/main.ts");
      expect(spy).toHaveBeenCalledTimes(1);
      const event = spy.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe("viewer:open-file");
      expect(event.detail).toEqual({ filePath: "src/main.ts" });
    });
  });

  // -----------------------------------------------------------------------
  // Pending file
  // -----------------------------------------------------------------------

  describe("pending file", () => {
    it("setPendingFile / consumePendingFile round-trips the value", () => {
      setPendingFile("new-file.ts");
      expect(consumePendingFile()).toBe("new-file.ts");
    });

    it("consumePendingFile returns null after consuming", () => {
      setPendingFile("new-file.ts");
      consumePendingFile();
      expect(consumePendingFile()).toBeNull();
    });

    it("consumePendingFile returns null when nothing was set", () => {
      expect(consumePendingFile()).toBeNull();
    });

    it("overwrites previous pending file", () => {
      setPendingFile("first.ts");
      setPendingFile("second.ts");
      expect(consumePendingFile()).toBe("second.ts");
    });
  });

  // -----------------------------------------------------------------------
  // Active file path
  // -----------------------------------------------------------------------

  describe("active file path", () => {
    it("getActiveFilePath returns null by default", () => {
      expect(getActiveFilePath()).toBeNull();
    });

    it("setActiveFilePath updates getActiveFilePath", () => {
      setActiveFilePath("src/index.ts");
      expect(getActiveFilePath()).toBe("src/index.ts");
    });

    it("setActiveFilePath with same value does not notify listeners", () => {
      setActiveFilePath("src/index.ts");
      const listener = vi.fn();
      const cleanup = onActiveFilePathChange(listener);
      listenerCleanups.push(cleanup);

      // Set the same value — listener should NOT be called
      setActiveFilePath("src/index.ts");
      expect(listener).not.toHaveBeenCalled();
    });

    it("setActiveFilePath notifies listeners on change", () => {
      const listener = vi.fn();
      const cleanup = onActiveFilePathChange(listener);
      listenerCleanups.push(cleanup);

      setActiveFilePath("src/index.ts");
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("onActiveFilePathChange returns a cleanup function", () => {
      const listener = vi.fn();
      const cleanup = onActiveFilePathChange(listener);

      cleanup();

      setActiveFilePath("src/index.ts");
      expect(listener).not.toHaveBeenCalled();
    });

    it("multiple listeners are all notified", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const cleanup1 = onActiveFilePathChange(listener1);
      const cleanup2 = onActiveFilePathChange(listener2);
      listenerCleanups.push(cleanup1, cleanup2);

      setActiveFilePath("src/index.ts");
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it("setting null clears the active file path", () => {
      setActiveFilePath("src/index.ts");
      expect(getActiveFilePath()).toBe("src/index.ts");

      setActiveFilePath(null);
      expect(getActiveFilePath()).toBeNull();
    });

    it("notifies listeners when setting null", () => {
      setActiveFilePath("src/index.ts");
      const listener = vi.fn();
      const cleanup = onActiveFilePathChange(listener);
      listenerCleanups.push(cleanup);

      setActiveFilePath(null);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
