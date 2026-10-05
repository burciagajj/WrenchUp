export function normalizeFullName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function validateFullName(value: string): string | null {
  const name = normalizeFullName(value);
  if (!name) return "Full name is required";
  if (name.length < 5) return "Please enter your full legal name.";
  if (isEmailLike(name)) return "Please enter your real full name, not your email.";
  const parts = name.split(" ").filter(Boolean);
  if (parts.length < 2) return "Please enter first and last name.";
  if (!parts.every((part) => /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(part))) {
    return "Please enter a valid first and last name.";
  }
  return null;
}
