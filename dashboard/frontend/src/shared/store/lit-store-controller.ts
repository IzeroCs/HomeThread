import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { Store, Unsubscribe } from "@reduxjs/toolkit";

type EqualityFn<T> = (a: T, b: T) => boolean;

export function shallowEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}

export class LitStoreController<S, Selected> implements ReactiveController {
  private readonly host: ReactiveControllerHost;
  private readonly store: Store<S>;
  private readonly selector: (state: S) => Selected;
  private readonly equals: EqualityFn<Selected>;
  private unsubscribe: Unsubscribe | null = null;

  value: Selected;

  constructor(
    host: ReactiveControllerHost,
    store: Store<S>,
    selector: (state: S) => Selected,
    equals: EqualityFn<Selected> = Object.is
  ) {
    this.host = host;
    this.store = store;
    this.selector = selector;
    this.equals = equals;
    this.value = selector(store.getState());
    host.addController(this);
  }

  hostConnected(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.store.subscribe(() => {
      const next = this.selector(this.store.getState());
      if (!this.equals(this.value, next)) {
        this.value = next;
        this.host.requestUpdate();
      }
    });
  }

  hostDisconnected(): void {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
  }
}

