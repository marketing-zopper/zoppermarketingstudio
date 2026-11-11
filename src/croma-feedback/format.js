// Feedback timestamps are shown in Indian Standard Time (the Croma teams' and Marketing team's timezone).
const TZ = "Asia/Kolkata";
const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

export const formatDate = (iso) => dateFmt.format(new Date(iso));
export const formatTime = (iso) => timeFmt.format(new Date(iso)).toUpperCase();
export const formatDateTime = (iso) => `${formatDate(iso)}, ${formatTime(iso)} IST`;

// "+919876543210" -> "+91 98765 43210"
export const formatPhone = (p) => (/^\+91\d{10}$/.test(p || "") ? `+91 ${p.slice(3, 8)} ${p.slice(8)}` : p || "");

export const RATING_LABELS = { 1: "Very poor", 2: "Poor", 3: "Okay", 4: "Good", 5: "Excellent" };
