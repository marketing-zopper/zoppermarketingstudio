import { route, send } from "../_lib/http.js";
import { listLogs } from "../_lib/store.js";

export default route({ methods: ["GET"] }, async (req, res) => {
  send(res, 200, { logs: await listLogs(200) });
});
