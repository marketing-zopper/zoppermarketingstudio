import { readJson, send } from "../_lib/http.js";
import { feedbackRoute, can } from "../_lib/feedbackAccess.js";
import { rpc } from "../_lib/supabase.js";
import { ADMIN_EMAIL } from "../_lib/auth.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMENT_MAX = 1000;

// Display name stored with a comment: the employee's name from the Admin Portal, else a tidy version of their email.
function authorName(user) {
  const named = String(user.employee?.name || "").trim();
  if (named) return named.slice(0, 80);
  if (user.email === ADMIN_EMAIL) return "Marketing Admin";
  return user.email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

//   GET   ?id=<uuid>                     -> one submission with its comments            (view)
//   POST  { id, body }                   -> add an internal comment (active feedback)    (comment)
//   PATCH { id, archived: true|false }   -> archive / restore                            (archive; Admin only)
//   DELETE ?commentId=<uuid>             -> delete a comment: its author, or an Admin / Global Super Admin  (comment)
// The comment author, the archive actor and the deleting user are ALWAYS taken from the verified session, never
// from the request. Whether the caller may delete a given comment is decided here and again in the database call.
export default feedbackRoute(
  { methods: ["GET", "POST", "PATCH", "DELETE"], cap: { GET: "view", POST: "comment", PATCH: "archive", DELETE: "comment" } },
  async (req, res, { user, role }) => {
    if (req.method === "DELETE") {
      const commentId = String(new URL(req.url, "http://localhost").searchParams.get("commentId") || "");
      if (!UUID.test(commentId)) return send(res, 400, { error: "Invalid comment id." });
      const out = await rpc("croma_feedback_delete_comment", {
        p_comment: commentId,
        p_actor: user.email,
        p_is_admin: can(role, "archive"),
      });
      if (out.status === "not_found") return send(res, 404, { error: "Comment not found." });
      if (out.status === "forbidden") return send(res, 403, { error: "You can only delete your own comments.", code: "not_comment_owner" });
      return send(res, 200, { deleted: true, submissionId: out.submission_id });
    }

    const body = req.method === "GET" ? {} : await readJson(req);
    const id = String(req.method === "GET" ? new URL(req.url, "http://localhost").searchParams.get("id") || "" : body.id || "");
    if (!UUID.test(id)) return send(res, 400, { error: "Invalid feedback id." });

    if (req.method === "GET") {
      const item = await rpc("croma_feedback_detail", { p_id: id });
      // Archived feedback is invisible to anyone who can't archive/restore.
      if (!item || (item.archived && !can(role, "archive"))) return send(res, 404, { error: "Feedback not found." });
      // Admins may delete any comment; everyone else only their own.
      item.comments = item.comments.map((c) => ({ ...c, canDelete: can(role, "archive") || c.author_email === user.email }));
      return send(res, 200, { item, canComment: can(role, "comment"), canArchive: can(role, "archive") });
    }

    if (req.method === "POST") {
      const text = typeof body.body === "string" ? body.body.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim() : "";
      if (!text) return send(res, 400, { error: "Write a comment first." });
      if ([...text].length > COMMENT_MAX) return send(res, 400, { error: `Comments can be up to ${COMMENT_MAX} characters.` });
      const out = await rpc("croma_feedback_add_comment", {
        p_id: id,
        p_email: user.email,
        p_name: authorName(user),
        p_body: text,
      });
      if (out.status === "not_found") return send(res, 404, { error: "Feedback not found." });
      if (out.status === "archived") {
        // Archived feedback is invisible to roles that can't archive/restore; don't confirm it exists.
        if (!can(role, "archive")) return send(res, 404, { error: "Feedback not found." });
        return send(res, 409, { error: "This feedback is archived. Restore it to add comments." });
      }
      return send(res, 201, { comment: { ...out.comment, canDelete: true } }); // you may always delete your own
    }

    // PATCH
    if (typeof body.archived !== "boolean") return send(res, 400, { error: "Invalid request." });
    const out = await rpc("croma_feedback_set_archived", { p_id: id, p_archive: body.archived, p_actor: user.email });
    if (out.status === "not_found") return send(res, 404, { error: "Feedback not found." });
    return send(res, 200, { archived: out.archived, changed: out.changed });
  }
);
