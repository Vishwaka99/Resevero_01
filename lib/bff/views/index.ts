/**
 * The BFF's read side: one builder per screen.
 *
 * Server components call these directly — a page render is already one request
 * from the browser, so going out over HTTP to the app's own route handler would
 * add a round trip and buy nothing. The route handlers under `app/api/bff`
 * expose exactly the same builders for clients that are not this render: the
 * live availability check the booking form polls, the CSV export, and anything
 * that wants the view model as JSON.
 */

export { buildDashboardView, type DashboardView } from "./dashboard";
export { buildScheduleView, type ScheduleView } from "./schedule";
export { buildBrowseResourcesView, buildResourceDetailView, type BrowseResourcesView, type ResourceCard, type ResourceDetailView } from "./resources";
export { buildAvailabilityAnswer, buildReservationFormView, type AvailabilityAnswer, type ReservationFormView } from "./reservation-form";
export { buildMyReservationsView, type MyReservationsTab, type MyReservationsView } from "./my-reservations";
export {
  buildApprovalsView,
  buildManageResourcesView,
  buildReportsView,
  buildUsersView,
  type ApprovalsView,
  type ManageResourcesView,
  type ReportsView,
  type UsersView,
} from "./admin";
export { buildActivityView, type ActivityView } from "./activity";
export { navSections, tabBarItems, toReservationRow, type NavItem, type NavSection, type ReservationRow } from "./shared";
