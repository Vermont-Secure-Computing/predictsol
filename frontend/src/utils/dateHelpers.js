export function toDatetimeLocal(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function parseDatetimeLocal(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(value, days) {
  const d = parseDatetimeLocal(value);
  if (!d) return "";
  d.setDate(d.getDate() + days);
  return toDatetimeLocal(d);
}

export function maxDatetimeLocal(a, b) {
  const da = parseDatetimeLocal(a);
  const db = parseDatetimeLocal(b);
  if (!da) return b || "";
  if (!db) return a || "";
  return da >= db ? a : b;
}
