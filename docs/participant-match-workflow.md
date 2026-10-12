# Participant and match workflow update

## Apply the database migration

The workflow update adds stable profile usernames, captain-added squad members, optional-reason RPC wrappers, and the admin umpire desk. Follow-up migrations add account search by UUID, editable random bracket previews, UUID-based membership writes, and a profile username editor. Apply pending migrations after pulling the code:

```powershell
npx supabase migration list
npx supabase db push
```

This migration does not delete tournament, membership, fixture, or official-assignment data. Existing profiles receive a generated username based on their name or email plus a short UUID suffix. New accounts receive the same style of username through the profile creation trigger.

## Team membership

The auth UUID is the immutable account key used by all membership and role relationships. Usernames are mutable, unique, case-insensitive profile handles used for discovery; changing one does not alter team memberships, roles, or historical records. Users can change their username from the profile section of the dashboard. The database validates its format and enforces uniqueness through a unique index.

While registration is open and the roster is unlocked, a captain can search eligible accounts by username, full name, or complete UUID, review the unique UUID, select the correct account, and add them. The membership write receives only that immutable UUID and does not resolve a username. The database checks captain authority, roster capacity, and active or pending membership conflicts. A prior rejected or withdrawn membership can be reactivated. The addition is recorded in the audit log and sends a notification.

## Schedule publication and progress

Only approved teams with locked rosters are eligible for knockout fixture generation. An admin can generate a randomized pairing preview while registration is open or closed; generating a replacement is allowed only while the bracket remains unpublished and has no match official assignments. The admin can swap teams between two opening-round matches, then selects **Fix & publish schedule** to make the schedule public and close registration. The current playable round is highlighted; future participants display as TBA until source matches finish. Published schedule changes are handled through schedule/reschedule operations and are audited.

Team participants can open the published tournament schedule from **My teams**. The public bracket shows published fixtures, venues, results, eliminated teams, and bracket progress. Ball-by-ball scoreboards and player leaderboards are not included in this update because scoring has not been implemented.

## Minimal umpire desk

An admin can open **Umpire desk**, select a published tournament and match, and join as that match's umpire if no active official is assigned. Only the assigned admin can submit a winner through the umpire desk. The database validates the assignment, records the result, and advances the winner. The umpire desk does not include ball-by-ball scoring or a match-start control.

## Optional reasons

Rejection, cancellation, reschedule, abandonment, result, and roster-override notes are optional. The existing audited operation still runs. When a note is omitted, the database stores a short generic reason so the action remains distinguishable in audit history.
