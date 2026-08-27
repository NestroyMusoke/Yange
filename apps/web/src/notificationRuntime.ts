import type { AgentNotification } from "@yange/domain";

const SHOWN_KEY = "yange-browser-notifications-v1";

export type BrowserNotificationState = "unsupported" | "prompt" | "granted" | "denied";

export function browserNotificationState(): BrowserNotificationState {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission === "default" ? "prompt" : Notification.permission;
}

function shownIds(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

export async function requestBrowserNotifications(): Promise<BrowserNotificationState> {
  if (browserNotificationState() === "unsupported") return "unsupported";
  const permission = await Notification.requestPermission();
  return permission === "default" ? "prompt" : permission;
}

export async function showUnseenWardrobeNotifications(notifications: AgentNotification[]): Promise<number> {
  if (browserNotificationState() !== "granted") return 0;
  const shown = shownIds();
  const registration = await navigator.serviceWorker.ready;
  let count = 0;
  for (const notification of notifications.sort((left, right) => left.queuedAt.localeCompare(right.queuedAt))) {
    if (shown.has(notification.id)) continue;
    await registration.showNotification(notification.title, {
      body: notification.body,
      icon: "/brand/yange-app-icon.png",
      badge: "/brand/yange-app-icon.png",
      tag: notification.id,
      data: { url: "/?view=wearcast", notificationId: notification.id },
    });
    shown.add(notification.id);
    count += 1;
  }
  localStorage.setItem(SHOWN_KEY, JSON.stringify([...shown].slice(-100)));
  return count;
}
