-- A fifth extra capability for staff (plan section 1.7): CAN_VIEW_FORM_RESULTS. Non-teaching staff keep the question bank, the list of forms, the print log and the reports, but read no
-- form results, answers or turn-ins unless a school administrator gives them this. It opens the READ routes of the forms module only (analytics, marking queues and answers, turn-ins),
-- and only for the forms of the holder's own campus (a membership with no campus covers every campus); editing, closing, marking, recording turn-ins and printing stay with the form's
-- creator and the administrators.
--
-- Run it BEFORE the code that names the value is deployed (the additive-migration rule of this repository). It adds one enum value and nothing else: no row is changed, nobody holds the
-- value until an administrator gives it, and the release before it keeps working (it never reads the new value; an old release that reads a membership row holding it would only list a
-- permission it does not know, so give nobody the capability until the release is out).
--
-- TenantMembership_permissions_staff_only already limits permissions to teaching and non-teaching staff, so a pupil, a parent or an administrator row can never hold it.

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'CAN_VIEW_FORM_RESULTS';
