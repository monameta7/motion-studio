// Responsibility: the one time zone of the app: the zone of the computer's own clock (owner, 2026-11-07, D63: «مبنا را بزار همین ساعت ویندوز من»); schedule times, "today", file dates and every clock on screen use it.
/**
 * The server and the screens run on the same computer (the UI is opened on localhost), so both read the same Windows clock.
 * A machine without a zone (a cloud container) gives UTC.
 */
export const APP_TIMEZONE: string = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
