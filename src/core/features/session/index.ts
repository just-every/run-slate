// The feature's server API. UI modules are imported from `ui/` by the app
// composition root, so a document route never pulls a repository or the DB
// client into the client bundle.
export { createSessionRoutes } from "./routes";
export { createSessionService } from "./service";
