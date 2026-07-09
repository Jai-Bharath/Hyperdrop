/**
 * Request permission and show HTML5 system desktop notifications.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Show a system desktop notification.
 */
export async function showDesktopNotification(title: string, body: string) {
  try {
    if (!('Notification' in window)) return;
    const hasPermission = await requestNotificationPermission();
    if (hasPermission) {
      new Notification(title, {
        body,
        icon: '/icon-192.png',
      });
    }
  } catch (err) {
    console.warn('[Notification] Failed to show notification:', err);
  }
}
