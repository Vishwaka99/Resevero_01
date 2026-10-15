/** The BFF's read side: one builder per screen. */

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
