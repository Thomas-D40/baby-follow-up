--liquibase formatted sql

--changeset tom:016-baby-invitation-invitee
-- Epic 17: an invitation now names its recipient (D17-B). Pending links are invalidated first (D17-J);
-- NOT NULL also covers consumed rows, so accepted ones are backfilled with their de facto recipient and
-- never-accepted ones (all dead after the invalidation) are dropped (D17-W).
UPDATE baby_invitation SET used_at = now() WHERE used_at IS NULL;
ALTER TABLE baby_invitation ADD COLUMN invitee_user_id UUID REFERENCES app_user(id);
ALTER TABLE baby_invitation ADD COLUMN invitee_first_name TEXT;
UPDATE baby_invitation i
   SET invitee_user_id = i.accepted_by,
       invitee_first_name = COALESCE(u.first_name, '')
  FROM app_user u
 WHERE u.id = i.accepted_by;
DELETE FROM baby_invitation WHERE invitee_user_id IS NULL;
ALTER TABLE baby_invitation ALTER COLUMN invitee_user_id SET NOT NULL;
ALTER TABLE baby_invitation ALTER COLUMN invitee_first_name SET NOT NULL;

--changeset tom:016-baby-invitation-active-index
-- At most one active invitation per baby AND recipient (D17-I): inviting someone else no longer voids
-- the pending invitation of another person.
DROP INDEX uq_active_baby_invitation;
CREATE UNIQUE INDEX uq_active_baby_invitation
    ON baby_invitation (baby_id, invitee_user_id) WHERE used_at IS NULL;

--changeset tom:016-app-user-activated-at
-- Explicit activation marker (D17-V): the unusable placeholder is a real BCrypt hash, so the state
-- cannot be read from password_hash. Existing accounts count as activated unless an activation token
-- is still unused.
ALTER TABLE app_user ADD COLUMN activated_at TIMESTAMPTZ;
UPDATE app_user SET activated_at = created_at
 WHERE id NOT IN (SELECT app_user_id FROM activation_token WHERE used_at IS NULL);
