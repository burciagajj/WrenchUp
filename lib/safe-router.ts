import { router } from "expo-router";

/**
 * safe-router.ts (v1.1)
 * Queues navigation calls until the root layout is confirmed ready.
 * Call setRouterReady() from auth-context once appReady is true.
 */

let isReady = false;
const queue: (() => void)[] = [];

export function setRouterReady() {
  isReady = true;
  queue.forEach((fn) => fn());
  queue.length = 0;
}

export function safeReplace(href: string) {
  const navigate = () => router.replace(href as never);
  if (isReady) {
    navigate();
  } else {
    queue.push(navigate);
  }
}

export function safePush(href: string) {
  const navigate = () => router.push(href as never);
  if (isReady) {
    navigate();
  } else {
    queue.push(navigate);
  }
}
