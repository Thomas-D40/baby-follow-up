--liquibase formatted sql

--changeset tom:017-account-deletion-authors
-- Epic 24 (D24-O, D24-S): deleting an account keeps everything that survives it. author_id stops
-- blocking the deletion (the former "RESTRICT, no account deletion in v1" comments of 003-015 are
-- outdated) and is set to NULL instead; the author is displayed nowhere. Existing rows are untouched.
ALTER TABLE bottle_feeding ALTER COLUMN author_id DROP NOT NULL,
    DROP CONSTRAINT bottle_feeding_author_id_fkey,
    ADD CONSTRAINT bottle_feeding_author_id_fkey FOREIGN KEY (author_id) REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE nap ALTER COLUMN author_id DROP NOT NULL,
    DROP CONSTRAINT nap_author_id_fkey,
    ADD CONSTRAINT nap_author_id_fkey FOREIGN KEY (author_id) REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE stool ALTER COLUMN author_id DROP NOT NULL,
    DROP CONSTRAINT stool_author_id_fkey,
    ADD CONSTRAINT stool_author_id_fkey FOREIGN KEY (author_id) REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE vitamin_intake ALTER COLUMN author_id DROP NOT NULL,
    DROP CONSTRAINT vitamin_intake_author_id_fkey,
    ADD CONSTRAINT vitamin_intake_author_id_fkey FOREIGN KEY (author_id) REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE weight ALTER COLUMN author_id DROP NOT NULL,
    DROP CONSTRAINT weight_author_id_fkey,
    ADD CONSTRAINT weight_author_id_fkey FOREIGN KEY (author_id) REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE urine ALTER COLUMN author_id DROP NOT NULL,
    DROP CONSTRAINT urine_author_id_fkey,
    ADD CONSTRAINT urine_author_id_fkey FOREIGN KEY (author_id) REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE temperature ALTER COLUMN author_id DROP NOT NULL,
    DROP CONSTRAINT temperature_author_id_fkey,
    ADD CONSTRAINT temperature_author_id_fkey FOREIGN KEY (author_id) REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE medical_care ALTER COLUMN author_id DROP NOT NULL,
    DROP CONSTRAINT medical_care_author_id_fkey,
    ADD CONSTRAINT medical_care_author_id_fkey FOREIGN KEY (author_id) REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE breastfeeding ALTER COLUMN author_id DROP NOT NULL,
    DROP CONSTRAINT breastfeeding_author_id_fkey,
    ADD CONSTRAINT breastfeeding_author_id_fkey FOREIGN KEY (author_id) REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE solid_meal ALTER COLUMN author_id DROP NOT NULL,
    DROP CONSTRAINT solid_meal_author_id_fkey,
    ADD CONSTRAINT solid_meal_author_id_fkey FOREIGN KEY (author_id) REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE dish ALTER COLUMN author_id DROP NOT NULL,
    DROP CONSTRAINT dish_author_id_fkey,
    ADD CONSTRAINT dish_author_id_fkey FOREIGN KEY (author_id) REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE medication ALTER COLUMN author_id DROP NOT NULL,
    DROP CONSTRAINT medication_author_id_fkey,
    ADD CONSTRAINT medication_author_id_fkey FOREIGN KEY (author_id) REFERENCES app_user(id) ON DELETE SET NULL;

--changeset tom:017-account-deletion-invitations
-- Epic 24 (D24-I): the sharing invitations an account sent, received or accepted go with it. A pending
-- one must die (410); a consumed one is read nowhere.
ALTER TABLE baby_invitation
    DROP CONSTRAINT baby_invitation_created_by_fkey,
    ADD CONSTRAINT baby_invitation_created_by_fkey FOREIGN KEY (created_by) REFERENCES app_user(id) ON DELETE CASCADE,
    DROP CONSTRAINT baby_invitation_accepted_by_fkey,
    ADD CONSTRAINT baby_invitation_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES app_user(id) ON DELETE CASCADE,
    DROP CONSTRAINT baby_invitation_invitee_user_id_fkey,
    ADD CONSTRAINT baby_invitation_invitee_user_id_fkey FOREIGN KEY (invitee_user_id) REFERENCES app_user(id) ON DELETE CASCADE;
