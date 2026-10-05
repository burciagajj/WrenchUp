import { router, type Href } from "expo-router";

/**
 * safe-router.ts (v2)
 * Queues navigation calls until the root layout is confirmed ready.
 * Provides properly typed navigation to avoid `as any` casts.
 */

let isReady = false;
const queue: (() => void)[] = [];

export function setRouterReady() {
  isReady = true;
  queue.forEach((fn) => fn());
  queue.length = 0;
}

function deferNavigate(navigate: () => void) {
  setTimeout(navigate, 0);
}

export function safeReplace(href: Href) {
  const navigate = () => router.replace(href);
  if (isReady) {
    deferNavigate(navigate);
  } else {
    queue.push(() => deferNavigate(navigate));
  }
}

export function safePush(href: Href) {
  const navigate = () => router.push(href);
  if (isReady) {
    deferNavigate(navigate);
  } else {
    queue.push(() => deferNavigate(navigate));
  }
}
