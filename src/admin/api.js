let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Network error. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith("/api/auth/")) onUnauthorized();
  if (!res.ok) {
    const err = new Error(data.error || "Request failed.");
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  login: (password) => request("POST", "/api/auth/login", { password }),
  logout: () => request("POST", "/api/auth/logout"),
  overview: () => request("GET", "/api/admin/overview"),
  employees: () => request("GET", "/api/admin/employees"),
  addEmployee: (email, name) => request("POST", "/api/admin/employees", { email, name }),
  updateEmployee: (email, changes) => request("PATCH", "/api/admin/employee", { email, ...changes }),
  toolAccess: (toolId) => request("POST", "/api/tools/access", { toolId }),
  logs: () => request("GET", "/api/admin/logs"),
};

// Session check: 200 ok, 401 signed out and 403 denied are all normal answers (not errors).
export async function fetchSession() {
  let res;
  try {
    res = await fetch("/api/auth/session", { credentials: "same-origin" });
  } catch {
    throw new Error("Network error. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 200 || res.status === 401 || res.status === 403) return data;
  throw new Error(data.error || "Could not verify your access. Please try again.");
}
