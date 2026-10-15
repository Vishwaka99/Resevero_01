/**
 * Whether a booking has to be approved before it is anyone's.
 *
 * Currently: all of them. Every reservation starts as a request and an admin
 * decides, whichever resource it is.
 *
 * `resources.requires_approval` is still carried and still editable, because
 * it is the per-resource answer this used to return. Reverting means giving
 * this function the resource again and returning that flag; nothing else in
 * the application asks the question.
 *
 * Worth knowing what this moves rather than what it adds. Only a *confirmed*
 * reservation holds a slot — that is what the Postgres exclusion constraint
 * is scoped to, and what BLOCKING_STATUSES says in the in-memory adapter. A
 * pending request is a bid, not a hold. So with every booking pending, two
 * people can ask for the same time and the clash is settled when an admin
 * confirms one: `approveRequest` rejects the others in the same transaction.
 * Double-booking is still impossible; the guarantee simply lands at approval
 * rather than at submission.
 */
export function needsApproval(): boolean {
  return true;
}
