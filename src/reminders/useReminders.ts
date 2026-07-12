// Local note reminders. A reminder pairs a note with a time; while the app is open a scheduler
// watches the clock and, when one comes due, raises a browser notification and an in-app note so
// the writing is not forgotten. Reminders live entirely on the device — there is no server to
// deliver them in the background, so they fire when the app is open (a background channel arrives
// with the backend). State is module-level so the whole app shares one list and one scheduler.
import { ref } from 'vue'
import type { Reminder } from '@/types'
import { uid } from '@/util/id'
import { getAllReminders, putReminder, deleteReminder } from '@/store/persistence'

const reminders = ref<Reminder[]>([])
// The reminder that just came due, for an in-app banner the app can show and clear.
const justFired = ref<Reminder | null>(null)
const permission = ref<NotificationPermission>(typeof Notification !== 'undefined' ? Notification.permission : 'denied')

let started = false
let timer: ReturnType<typeof setInterval> | null = null

// How often the scheduler wakes to look for reminders that have come due. A reminder is set to the
// minute, so half-minute checks raise it promptly without busy-spinning.
const CHECK_MS = 30_000

function notify(reminder: Reminder): void {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('Reminder', { body: reminder.title, tag: reminder.id })
    } catch {
      // Some browsers only allow notifications from a service worker; the in-app banner still shows.
    }
  }
  justFired.value = reminder
}

// Raise every reminder that has come due and has not fired yet, marking each done so it is never
// raised twice.
async function check(): Promise<void> {
  const now = Date.now()
  for (const reminder of reminders.value) {
    if (reminder.done || reminder.due > now) continue
    const done = { ...reminder, done: true }
    await putReminder(done)
    const i = reminders.value.findIndex((r) => r.id === reminder.id)
    if (i !== -1) reminders.value[i] = done
    notify(done)
  }
}

export function useReminders() {
  async function refresh(): Promise<void> {
    reminders.value = await getAllReminders()
  }

  // Ask for notification permission the first time it matters, so a reminder can reach the writer
  // even when the tab is in the background. Returns whether notifications are allowed afterwards.
  async function requestPermission(): Promise<boolean> {
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'default') permission.value = await Notification.requestPermission()
    else permission.value = Notification.permission
    return permission.value === 'granted'
  }

  async function add(noteId: string, title: string, due: number): Promise<void> {
    const reminder: Reminder = { id: uid('rem'), noteId, title: title.trim() || 'Untitled note', due }
    await putReminder(reminder)
    reminders.value = [...reminders.value, reminder]
    await requestPermission()
  }

  async function remove(id: string): Promise<void> {
    await deleteReminder(id)
    reminders.value = reminders.value.filter((r) => r.id !== id)
  }

  // The reminders still ahead, soonest first.
  function upcoming(now = Date.now()): Reminder[] {
    return reminders.value.filter((r) => !r.done && r.due > now).sort((a, b) => a.due - b.due)
  }

  // The reminders that have already fired, most recent first, for a "past" section.
  function past(): Reminder[] {
    return reminders.value.filter((r) => r.done).sort((a, b) => b.due - a.due)
  }

  // Begin watching the clock. Safe to call from more than one place; only the first starts it.
  function start(): void {
    if (started) return
    started = true
    void refresh().then(check)
    timer = setInterval(() => void check(), CHECK_MS)
  }

  function dismissBanner(): void {
    justFired.value = null
  }

  return {
    reminders,
    justFired,
    permission,
    refresh,
    requestPermission,
    add,
    remove,
    upcoming,
    past,
    start,
    dismissBanner,
  }
}

// Release the scheduler; used when the app tears down.
export function stopReminders(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}
