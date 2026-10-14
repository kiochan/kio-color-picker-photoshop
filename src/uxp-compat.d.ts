// The Adobe 7.3 declarations omit these supported globals. Keep this bridge
// limited to APIs actually used by the panel; do not add browser DOM or Node globals.
declare const window: {
  innerWidth: number;
  innerHeight: number;
  addEventListener(name: string, callback: () => void): void;
};
declare const console: { error(...values: unknown[]): void };
declare function setTimeout(callback: () => void, milliseconds: number): number;
declare function clearTimeout(id: number): void;
declare function setInterval(callback: () => void, milliseconds: number): number;
declare function clearInterval(id: number): void;
declare class ResizeObserver {
  constructor(callback: () => void);
  observe(element: Element): void;
}
interface HTMLElement {
  title: string;
  readonly classList: {
    toggle(name: string, force?: boolean): boolean;
    add(name: string): void;
    remove(name: string): void;
  };
}
interface HTMLInputElement {
  select(): void;
}
interface Document {
  readonly readyState: string;
}
