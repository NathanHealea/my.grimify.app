import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { checkForUpdate, UpdateStateProvider, useUpdateState } from "./update-state";

type FakeWorker = EventTarget & { state: ServiceWorkerState };

function fakeWorker(state: ServiceWorkerState): FakeWorker {
  return Object.assign(new EventTarget(), { state });
}

function moveTo(worker: FakeWorker, state: ServiceWorkerState) {
  worker.state = state;
  worker.dispatchEvent(new Event("statechange"));
}

function fakeRegistration(fields: {
  update?: () => Promise<void>;
  waiting?: FakeWorker | null;
  installing?: FakeWorker | null;
}) {
  return {
    update: fields.update ?? vi.fn(() => Promise.resolve()),
    waiting: fields.waiting ?? null,
    installing: fields.installing ?? null,
  } as unknown as ServiceWorkerRegistration;
}

describe("checkForUpdate asks the registration to update and reports whether one is waiting", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects when there is no registration", async () => {
    await expect(checkForUpdate(undefined)).rejects.toThrow(Error);
  });

  it("asks the registration to update and resolves true when a worker is already waiting", async () => {
    const update = vi.fn(() => Promise.resolve());
    const registration = fakeRegistration({ update, waiting: fakeWorker("installed") });

    await expect(checkForUpdate(registration)).resolves.toBe(true);
    expect(update).toHaveBeenCalledOnce();
  });

  it("resolves false when the update finds nothing new", async () => {
    const update = vi.fn(() => Promise.resolve());
    const registration = fakeRegistration({ update });

    await expect(checkForUpdate(registration)).resolves.toBe(false);
    expect(update).toHaveBeenCalledOnce();
  });

  it("rejects when the registration fails to update", async () => {
    const registration = fakeRegistration({
      update: () => Promise.reject(new Error("network down")),
    });

    await expect(checkForUpdate(registration)).rejects.toThrow("network down");
  });

  it("resolves true when an installing worker finishes installing", async () => {
    const installing = fakeWorker("installing");
    const registration = fakeRegistration({ installing });

    const result = checkForUpdate(registration);
    await new Promise((resolve) => setTimeout(resolve, 0));
    moveTo(installing, "installed");

    await expect(result).resolves.toBe(true);
  });

  it("resolves false when an installing worker becomes redundant", async () => {
    const installing = fakeWorker("installing");
    const registration = fakeRegistration({ installing });

    const result = checkForUpdate(registration);
    await new Promise((resolve) => setTimeout(resolve, 0));
    moveTo(installing, "redundant");

    await expect(result).resolves.toBe(false);
  });

  it("rejects when an installing worker never settles within the timeout", async () => {
    vi.useFakeTimers();
    const installing = fakeWorker("installing");
    const registration = fakeRegistration({ installing });

    const result = checkForUpdate(registration, 1000);
    const assertion = expect(result).rejects.toThrow(Error);
    await vi.advanceTimersByTimeAsync(1000);

    await assertion;
  });
});

describe("UpdateStateProvider", () => {
  function renderUpdateState(registration: ServiceWorkerRegistration | undefined) {
    const apply = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(UpdateStateProvider, { ready: false, apply, registration, children });
    return renderHook(() => useUpdateState(), { wrapper });
  }

  it("offers no check until a service worker is registered", () => {
    const { result } = renderUpdateState(undefined);

    expect(result.current.check).toBeNull();
  });

  it("offers a check that updates the registration once one exists", async () => {
    const update = vi.fn(() => Promise.resolve());
    const { result } = renderUpdateState(fakeRegistration({ update }));

    await expect(result.current.check?.()).resolves.toBe(false);
    expect(update).toHaveBeenCalledOnce();
  });
});
