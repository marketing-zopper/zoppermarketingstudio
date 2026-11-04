// Validation rules for the Croma x Zopper feedback form.
// Imported by BOTH the React form (instant inline feedback) and the API (the real enforcement),
// so the two can never drift apart.

export const LIMITS = {
  nameMin: 2,
  nameMax: 80,
  feedbackMin: 3,
  feedbackMax: 1000,
};

export const RATING_LABELS = {
  1: "Very unhappy",
  2: "Unhappy",
  3: "Okay",
  4: "Happy",
  5: "Very happy",
};

export const STORE_ID_RE = /^A[0-9]{3}$/;
export const PHONE_RE = /^[6-9][0-9]{9}$/; // Indian mobile numbers, digits after +91
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const len = (s) => [...s].length; // count characters, not UTF-16 units

export function cleanText(value, { multiline = false } = {}) {
  let s = String(value ?? "").normalize("NFC").replace(/\r\n?/g, "\n").replace(CONTROL_RE, "");
  s = multiline ? s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return s.trim();
}

// Accepts what a person might type/paste: "98765 43210", "+91 98765-43210", "09876543210"
export function cleanPhone(value) {
  let d = String(value ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

// Returns { values, errors }. `errors` is { field: message } and empty when everything is valid.
// `isKnownStore` lets the client check against the loaded list; the server checks the database.
export function validateFeedback(input, { isKnownStore } = {}) {
  const errors = {};
  const name = cleanText(input?.name);
  const phone = cleanPhone(input?.phone);
  const feedback = cleanText(input?.feedback, { multiline: true });
  const storeId = String(input?.storeId ?? "").trim().toUpperCase();
  const rating = typeof input?.rating === "string" && /^\d+$/.test(input.rating) ? Number(input.rating) : input?.rating;

  if (!name) errors.name = "Please enter your name.";
  else if (len(name) < LIMITS.nameMin) errors.name = "Your name looks too short.";
  else if (len(name) > LIMITS.nameMax) errors.name = `Please keep your name under ${LIMITS.nameMax} characters.`;
  else if (!NAME_RE.test(name)) errors.name = "Please use letters only in your name.";

  if (!storeId) errors.storeId = "Please select your Croma store.";
  else if (!STORE_ID_RE.test(storeId) || (isKnownStore && !isKnownStore(storeId))) {
    errors.storeId = "Please pick a store from the list.";
  }

  if (!phone) errors.phone = "Please enter your mobile number.";
  else if (!PHONE_RE.test(phone)) errors.phone = "Enter a valid 10-digit Indian mobile number.";

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = "Please tell us how your experience has been.";

  if (!feedback) errors.feedback = "Please share your feedback with us.";
  else if (len(feedback) < LIMITS.feedbackMin) errors.feedback = "Please add a little more detail.";
  else if (len(feedback) > LIMITS.feedbackMax) errors.feedback = `Please keep your feedback under ${LIMITS.feedbackMax} characters.`;

  return { values: { name, storeId, phone, rating, feedback }, errors };
}
