// The product name and domain live here and nowhere else. Every user-facing label
// reads from these, so a rename or a sale is a one line change. The short name is the
// wordmark shown where space is tight, such as a phone's top bar.
export const APP_NAME = 'Handwriting Notes'
export const APP_SHORT = 'Notes'
export const APP_DOMAIN = 'handwriting.notes'

// A filename-safe form of the name, for downloads like backups, so a rename flows here too.
export const APP_SLUG = APP_NAME.toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
