import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

// Foreground display handler: show notifications as banners even when app is open.
// Safe to call on web (no-op handled inside the lib).
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

let permissionRequested = false;
let permissionGranted = false;

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (permissionRequested) return permissionGranted;
  permissionRequested = true;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "WrenchUp",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: "#F97316",
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    permissionGranted = status === "granted";
  } catch {
    permissionGranted = false;
  }
  return permissionGranted;
}

interface NotifyArgs {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export async function notifyNow({ title, body, data }: NotifyArgs): Promise<void> {
  if (Platform.OS === "web") {
    // Web fallback: console + browser Notification API if granted, otherwise quiet no-op.
    try {
      if (typeof globalThis !== "undefined" && (globalThis as any).Notification) {
        const NotificationCtor = (globalThis as any).Notification;
        if (NotificationCtor.permission === "granted") {
          // eslint-disable-next-line no-new
          new NotificationCtor(title, { body });
        }
      }
    } catch {
      // ignore
    }
    return;
  }
  try {
    const ok = await ensureNotificationPermissions();
    if (!ok) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: body ?? "",
        data: data ?? {},
        sound: false,
      },
      trigger: null, // fire immediately
    });
  } catch {
    // swallow
  }
}
