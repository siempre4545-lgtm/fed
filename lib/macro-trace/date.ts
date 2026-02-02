export const toYmd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

export const parseYmd = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isThursday = (value: string) => {
  const date = parseYmd(value);
  if (!date) return false;
  return date.getDay() === 4;
};

export const getMostRecentThursday = (base = new Date()) => {
  const date = new Date(base);
  const day = date.getDay();
  const diff = (day + 7 - 4) % 7;
  date.setDate(date.getDate() - diff);
  return date;
};

export const coerceToThursday = (value: string) => {
  const date = parseYmd(value);
  if (!date) return toYmd(getMostRecentThursday());
  if (date.getDay() === 4) return value;
  return toYmd(getMostRecentThursday(date));
};
