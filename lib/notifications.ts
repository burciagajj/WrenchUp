import { Platform } from "react-native";
import Constants from "expo-constants";

type NotificationsModule = typeof import("expo-notifications");

let modulePromise: Promise<NotificationsModule | null> | null = null;
let handlerConfigured = false;
let permissionRequested = false;
let permissionGranted = false;

export function isNativePushAvailable(): boolean {
  if (Platform.OS === "web") return false;
  if (Constants.appOwnership === "expo" && Platform.OS === "android") return false;
  return true;
}

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (!isNativePushAvailable()) return null;
  if (!modulePromise) {
    modulePromise = import("expo-notifications")
      .then(async (mod) => {
        if (!handlerConfigured) {
          handlerConfigured = true;
          mod.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
            }),
          });
        }
        return mod;
      })
      .catch(() => null);
  }
  return modulePromise;
}

export async function subscribeNotificationResponses(
  handle: (response: import("expo-notifications").NotificationResponse | null) => void,
): Promise<() => void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return () => {};
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
  return () => subscription.remove();
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!isNativePushAvailable()) return false;
  if (permissionRequested) return permissionGranted;
  permissionRequested = true;
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return false;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "WrenchUp",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: "#F97316",
        sound: "default",
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
        android: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
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
    const Notifications = await loadNotifications();
    if (!Notifications) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: body ?? "",
        data: data ?? {},
        sound: "default",
      },
      trigger: null,
    });
  } catch {
    // swallow
  }
}

interface ScheduleArgs {
  title: string;
  body?: string;
  at: Date;
  data?: Record<string, unknown>;
}

export async function scheduleNotificationAt({ title, body, at, data }: ScheduleArgs): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const ok = await ensureNotificationPermissions();
    if (!ok) return null;
    if (at.getTime() <= Date.now()) return null;
    const Notifications = await loadNotifications();
    if (!Notifications) return null;
    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: body ?? "",
        data: data ?? {},
        sound: "default",
      },
      trigger: at as any,
    });
  } catch {
    return null;
  }
}

export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!isNativePushAvailable()) return null;
  try {
    const ok = await ensureNotificationPermissions();
    if (!ok) return null;
    const Notifications = await loadNotifications();
    if (!Notifications) return null;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      null;
    if (!projectId) return null;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data || null;
  } catch (error) {
    console.warn("[notifications] Could not get Expo push token:", error);
    return null;
  }
}
