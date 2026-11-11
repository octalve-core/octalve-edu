-- The baseline (task 0050, 2026-11-11): the whole migration history as ONE migration.
--
-- It is the final schema of the 50 migrations that existed before it (20260927053552_init ... 20261122090000_progress_promotion_results), written out by pg_dump --schema-only from a
-- database those 50 had been applied to, one file at a time, as Prisma does. Every table, column, constraint, index, row-level-security policy, trigger, function and grant is in it; the
-- 50 migrations wrote no data, so nothing is lost. What it does NOT keep is the comments that explained each hand-written statement and the order they were made in: those are in the git
-- history (the last commit that still has the 50 files is 8406b25, `git show 8406b25:prisma/migrations/<name>/migration.sql`) and in the task records under docs/tasks.
--
-- Nothing hosted had applied any of those migrations (the maintainer had no production or preview database), which is the ONLY reason this is allowed: an applied migration is never edited
-- or merged. Do not do this again once a hosted database exists. A database that applied the old 50 must be dropped or reset, not migrated.
--
-- Three edits were made to the dump. (1) The psql-only lines and the settings that would outlive the migration were removed. (2) `ALTER DEFAULT PRIVILEGES FOR ROLE <migrator>` is written without
-- the role, and (3) the 18 "owner" policies are written `TO CURRENT_USER` instead of the migrator's name, exactly as the migrations made them (`format(... TO %I, current_user)`), so both
-- apply to whichever role runs this file.
-- Also: the string literals that hold a carriage return, a form feed or a non-breaking space (the trim sets of some CHECK constraints) are written as E'...' escapes, as the original
-- migrations wrote them, so that no tool that normalises line endings or invisible characters can change them. The enum values added by the old migrations (e.g. "Role" CAMPUS_ADMIN) are simply part of the
-- type here; a later migration must not add a value and use it in the same file (a new enum value cannot be used in the transaction that adds it).

SET check_function_bodies = false;

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET check_function_bodies = false;

--
-- Name: AnnouncementStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AnnouncementStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);

--
-- Name: ApprovalScopeKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ApprovalScopeKind" AS ENUM (
    'GENERAL',
    'SECTION',
    'CLASS'
);

--
-- Name: AssignmentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AssignmentStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);

--
-- Name: AttendanceSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AttendanceSource" AS ENUM (
    'ONLINE',
    'OFFLINE_SYNC'
);

--
-- Name: AttendanceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AttendanceStatus" AS ENUM (
    'PRESENT',
    'ABSENT',
    'LATE',
    'EXCUSED'
);

--
-- Name: BankItemStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BankItemStatus" AS ENUM (
    'DRAFT',
    'PENDING',
    'APPROVED',
    'REJECTED',
    'RETIRED'
);

--
-- Name: BankKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BankKind" AS ENUM (
    'ASSESSMENT',
    'QUESTIONNAIRE'
);

--
-- Name: BankQuestionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BankQuestionType" AS ENUM (
    'SINGLE',
    'MULTI',
    'TRUE_FALSE',
    'SHORT',
    'RATING',
    'TEXT'
);

--
-- Name: BankReviewOutcome; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BankReviewOutcome" AS ENUM (
    'APPROVED',
    'EDITED',
    'REJECTED',
    'RETIRED'
);

--
-- Name: BankReviewerScope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BankReviewerScope" AS ENUM (
    'GENERAL',
    'SUBJECT'
);

--
-- Name: BankVisibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BankVisibility" AS ENUM (
    'PRACTICE',
    'TEACHERS_ONLY',
    'TEACHERS_ONLY_UNTIL'
);

--
-- Name: BillingCycle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BillingCycle" AS ENUM (
    'PER_TERM',
    'PER_SESSION'
);

--
-- Name: CertificateStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CertificateStatus" AS ENUM (
    'DRAFT',
    'ISSUED',
    'REVOKED'
);

--
-- Name: CourseRegStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CourseRegStatus" AS ENUM (
    'REGISTERED',
    'DROPPED',
    'COMPLETED'
);

--
-- Name: DiscountWorkflowMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DiscountWorkflowMode" AS ENUM (
    'MANUAL_OVERRIDE',
    'APPROVAL_REQUIRED'
);

--
-- Name: DomainStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DomainStatus" AS ENUM (
    'PENDING_VERIFICATION',
    'ACTIVE',
    'FAILED'
);

--
-- Name: EnrollmentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EnrollmentStatus" AS ENUM (
    'ACTIVE',
    'PROMOTED',
    'REPEATED',
    'WITHDRAWN',
    'TRANSFERRED',
    'ALUMNI',
    'EXPELLED',
    'CANCELLED'
);

--
-- Name: FeeCostBearer; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FeeCostBearer" AS ENUM (
    'SCHOOL_ABSORBS',
    'PASSED_TO_PARENT'
);

--
-- Name: FormAudienceKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FormAudienceKind" AS ENUM (
    'MEMBERS',
    'PUBLIC'
);

--
-- Name: FormKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FormKind" AS ENUM (
    'PRACTICE_SET',
    'QUESTIONNAIRE',
    'PAPER_WORK'
);

--
-- Name: FormMarkingMethod; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FormMarkingMethod" AS ENUM (
    'AUTO',
    'MANUAL'
);

--
-- Name: FormMarkingStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FormMarkingStatus" AS ENUM (
    'NOT_REQUIRED',
    'PENDING',
    'PARTIALLY_MARKED',
    'MARKED'
);

--
-- Name: FormResponseStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FormResponseStatus" AS ENUM (
    'IN_PROGRESS',
    'COMPLETED',
    'ABANDONED'
);

--
-- Name: FormStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FormStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'CLOSED',
    'ARCHIVED'
);

--
-- Name: Gender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Gender" AS ENUM (
    'MALE',
    'FEMALE'
);

--
-- Name: GuardianLinkStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GuardianLinkStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REVOKED'
);

--
-- Name: InvoiceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InvoiceStatus" AS ENUM (
    'UNPAID',
    'PARTIALLY_PAID',
    'PAID',
    'WAIVED'
);

--
-- Name: NotificationChannel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationChannel" AS ENUM (
    'EMAIL',
    'SMS',
    'WHATSAPP',
    'IN_APP'
);

--
-- Name: NotificationDispatchStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationDispatchStatus" AS ENUM (
    'QUEUED',
    'PROCESSING',
    'SENT',
    'FAILED',
    'RETRYING'
);

--
-- Name: ParticipantKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ParticipantKind" AS ENUM (
    'STUDENT',
    'STAFF',
    'GUARDIAN',
    'ADULT',
    'CHILD'
);

--
-- Name: PaymentProvider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PaymentProvider" AS ENUM (
    'PAYSTACK',
    'FLUTTERWAVE'
);

--
-- Name: PaymentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PaymentStatus" AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED'
);

--
-- Name: PeriodKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PeriodKind" AS ENUM (
    'TERM',
    'SEMESTER',
    'COHORT'
);

--
-- Name: Permission; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Permission" AS ENUM (
    'CAN_APPROVE_RESULTS',
    'CAN_MANAGE_FINANCE',
    'CAN_PUBLISH_CONTENT',
    'CAN_MANAGE_USERS',
    'CAN_VIEW_FORM_RESULTS'
);

--
-- Name: PracticeFeedbackMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PracticeFeedbackMode" AS ENUM (
    'EACH',
    'END'
);

--
-- Name: PrintTargetKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PrintTargetKind" AS ENUM (
    'QUESTION_BANK_ITEM',
    'FORM',
    'QUIZ',
    'PRACTICE_SESSION',
    'FORM_RESPONSE'
);

--
-- Name: ProgramAssessmentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramAssessmentStatus" AS ENUM (
    'DRAFT',
    'OPEN',
    'MARKED',
    'PUBLISHED',
    'ARCHIVED'
);

--
-- Name: ProgramCertificateStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramCertificateStatus" AS ENUM (
    'ISSUED',
    'REVOKED'
);

--
-- Name: ProgramFeeBilledTo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramFeeBilledTo" AS ENUM (
    'PARTICIPANT',
    'GUARDIAN'
);

--
-- Name: ProgramFeeFrequency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramFeeFrequency" AS ENUM (
    'ONCE',
    'MONTHLY',
    'YEARLY'
);

--
-- Name: ProgramFeeStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramFeeStatus" AS ENUM (
    'ACTIVE',
    'ARCHIVED'
);

--
-- Name: ProgramKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramKind" AS ENUM (
    'ONGOING',
    'FIXED_TERM'
);

--
-- Name: ProgramPaymentSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramPaymentSource" AS ENUM (
    'MANUAL',
    'GATEWAY'
);

--
-- Name: ProgramPlaceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramPlaceStatus" AS ENUM (
    'ACTIVE',
    'WITHDRAWN',
    'COMPLETED'
);

--
-- Name: ProgramScoreCode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramScoreCode" AS ENUM (
    'ABSENT',
    'EXCUSED',
    'EXEMPT',
    'NOT_SITTING'
);

--
-- Name: ProgramStaffRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramStaffRole" AS ENUM (
    'ADMIN',
    'SUPERVISOR',
    'TEACHER',
    'RECORDER'
);

--
-- Name: ProgramStaffStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramStaffStatus" AS ENUM (
    'ACTIVE',
    'ENDED'
);

--
-- Name: ProgramStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgramStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'COMPLETED',
    'ARCHIVED'
);

--
-- Name: ProgressEntryStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgressEntryStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'VERIFIED'
);

--
-- Name: ProgressGuardianDetail; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgressGuardianDetail" AS ENUM (
    'SUMMARY',
    'FULL'
);

--
-- Name: ProgressWriters; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProgressWriters" AS ENUM (
    'TEACHERS',
    'ASSIGNED',
    'BOTH'
);

--
-- Name: PromotionDecision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PromotionDecision" AS ENUM (
    'PROMOTED',
    'REPEATED',
    'GRADUATED',
    'WITHDRAWN'
);

--
-- Name: PromotionDecisionMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PromotionDecisionMode" AS ENUM (
    'AUTOMATIC',
    'OVERRIDDEN'
);

--
-- Name: QuestionReportOutcome; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."QuestionReportOutcome" AS ENUM (
    'FIXED',
    'NOT_AN_ERROR',
    'NEEDS_DISCUSSION'
);

--
-- Name: QuestionReportStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."QuestionReportStatus" AS ENUM (
    'OPEN',
    'RESOLVED',
    'DISMISSED'
);

--
-- Name: QuestionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."QuestionType" AS ENUM (
    'MULTIPLE_CHOICE',
    'TRUE_FALSE',
    'SHORT_ANSWER'
);

--
-- Name: QuizStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."QuizStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);

--
-- Name: Relationship; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Relationship" AS ENUM (
    'MOTHER',
    'FATHER',
    'GUARDIAN',
    'OTHER'
);

--
-- Name: ResultStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ResultStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'PUBLISHED',
    'LOCKED'
);

--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'TEACHING_STAFF',
    'NON_TEACHING_STAFF',
    'STUDENT',
    'PARENT',
    'CAMPUS_ADMIN'
);

--
-- Name: RolloverMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RolloverMode" AS ENUM (
    'AUTOMATIC',
    'ADMIN_CONFIRMED'
);

--
-- Name: SchoolType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SchoolType" AS ENUM (
    'K12',
    'HIGHER_ED',
    'VOCATIONAL'
);

--
-- Name: SessionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionStatus" AS ENUM (
    'PLANNED',
    'ACTIVE',
    'CLOSED'
);

--
-- Name: StaffCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StaffCategory" AS ENUM (
    'TEACHING',
    'NON_TEACHING'
);

--
-- Name: StandingEventAction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StandingEventAction" AS ENUM (
    'SUSPENDED',
    'EXPELLED',
    'TERMINATED',
    'LIFTED',
    'REINSTATED'
);

--
-- Name: StandingState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StandingState" AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'EXPELLED',
    'TERMINATED'
);

--
-- Name: StandingSubject; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StandingSubject" AS ENUM (
    'STUDENT',
    'STAFF',
    'PARTICIPANT'
);

--
-- Name: SubmissionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SubmissionStatus" AS ENUM (
    'PENDING',
    'SUBMITTED',
    'LATE',
    'GRADED',
    'RESUBMIT_REQUESTED'
);

--
-- Name: TurnInStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TurnInStatus" AS ENUM (
    'PENDING',
    'HANDED_IN',
    'LATE'
);

--
-- Name: UnsectionedClassApproval; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UnsectionedClassApproval" AS ENUM (
    'GENERAL_OR_CLASS_ONLY',
    'ANY_SECTION_APPROVER'
);

--
-- Name: app_grant_runtime_privileges(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_grant_runtime_privileges() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    RAISE NOTICE 'role app_user does not exist: runtime privileges NOT granted (create it, then run: SELECT app_grant_runtime_privileges())';
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA public TO app_user;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
  IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    REVOKE ALL ON TABLE public."_prisma_migrations" FROM app_user;
  END IF;
  REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."AuditLog" FROM app_user;
  IF to_regclass('public."ResultAudit"') IS NOT NULL THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."ResultAudit" FROM app_user;
  END IF;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
END
$$;

--
-- Name: app_invitation_hash(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_invitation_hash() RETURNS text
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.invitation_hash', true), '') $$;

--
-- Name: app_share_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_share_token() RETURNS text
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.share_token', true), '') $$;

--
-- Name: app_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_tenant_id() RETURNS text
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '') $$;

--
-- Name: app_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_user_id() RETURNS text
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.user_id', true), '') $$;

--
-- Name: app_verification_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_verification_token() RETURNS text
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.verification_token', true), '') $$;

--
-- Name: assessment_component_locked_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assessment_component_locked_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  locked timestamp(3);
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT "lockedAt" INTO locked FROM "AssessmentScheme" WHERE "id" = COALESCE(NEW."schemeId", OLD."schemeId");
  IF locked IS NOT NULL THEN
    RAISE EXCEPTION 'assessment scheme % is locked: its components cannot change', COALESCE(NEW."schemeId", OLD."schemeId") USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;

--
-- Name: assessment_scheme_locked_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assessment_scheme_locked_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD."lockedAt" IS NOT NULL AND (NEW."name", NEW."totalMax", NEW."examMax", NEW."examName", NEW."version", NEW."classGroupId", NEW."supersedesId", NEW."lockedAt")
     IS DISTINCT FROM (OLD."name", OLD."totalMax", OLD."examMax", OLD."examName", OLD."version", OLD."classGroupId", OLD."supersedesId", OLD."lockedAt") THEN
    RAISE EXCEPTION 'assessment scheme % is locked: a change is a new version', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

--
-- Name: grade_band_locked_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grade_band_locked_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  locked timestamp(3);
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT "lockedAt" INTO locked FROM "GradeScale" WHERE "id" = COALESCE(NEW."scaleId", OLD."scaleId");
  IF locked IS NOT NULL THEN
    RAISE EXCEPTION 'grade scale % is locked: its bands cannot change', COALESCE(NEW."scaleId", OLD."scaleId") USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;

--
-- Name: grade_scale_locked_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grade_scale_locked_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD."lockedAt" IS NOT NULL AND (NEW."name", NEW."version", NEW."supersedesId", NEW."lockedAt")
     IS DISTINCT FROM (OLD."name", OLD."version", OLD."supersedesId", OLD."lockedAt") THEN
    RAISE EXCEPTION 'grade scale % is locked: a change is a new version', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

--
-- Name: platform_assert_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_assert_admin() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  uid text := app_user_id();
BEGIN
  IF uid IS NULL OR NOT EXISTS (SELECT 1 FROM "User" WHERE id = uid AND "isPlatformAdmin") THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;
  RETURN uid;
END
$$;

--
-- Name: platform_authorize_first_admin_invite(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_authorize_first_admin_invite(p_tenant_id text, p_email text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  uid text := platform_assert_admin();
  previous text := current_setting('app.tenant_id', true);
  admins int;
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'platform_invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Tenant" WHERE id = p_tenant_id) THEN
    RETURN false;
  END IF;
  PERFORM set_config('app.tenant_id', p_tenant_id, true);
  SELECT count(*)::int INTO admins FROM "TenantMembership" WHERE "tenantId" = p_tenant_id AND role = 'ADMIN' AND "deactivatedAt" IS NULL;
  PERFORM set_config('app.tenant_id', COALESCE(previous, ''), true);
  IF admins > 0 THEN
    RAISE EXCEPTION 'platform_school_has_admin' USING ERRCODE = '23514';
  END IF;
  INSERT INTO "PlatformAuditLog" (id, "actorUserId", action, "targetTenantId", "afterValue")
    VALUES ('p' || replace(gen_random_uuid()::text, '-', ''), uid, 'FIRST_ADMIN_REINVITED', p_tenant_id,
            jsonb_build_object('email', lower(trim(p_email))));
  RETURN true;
END
$$;

--
-- Name: platform_create_school(text, text, public."SchoolType"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_create_school(p_code text, p_name text, p_school_type public."SchoolType") RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  uid text := platform_assert_admin();
  new_id text := 'p' || replace(gen_random_uuid()::text, '-', '');
  previous text := current_setting('app.tenant_id', true);
BEGIN
  IF p_code IS NULL OR p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'platform_invalid_input' USING ERRCODE = '22023';
  END IF;
  -- The tenant row's trigger creates the school's settings row, which is under FORCE row-level security: the new school's context is set
  -- for this insert only.
  PERFORM set_config('app.tenant_id', new_id, true);
  INSERT INTO "Tenant" (id, code, name, "schoolType") VALUES (new_id, p_code, trim(p_name), p_school_type);
  PERFORM set_config('app.tenant_id', COALESCE(previous, ''), true);
  INSERT INTO "PlatformAuditLog" (id, "actorUserId", action, "targetTenantId", "afterValue")
    VALUES ('p' || replace(gen_random_uuid()::text, '-', ''), uid, 'SCHOOL_CREATED', new_id,
            jsonb_build_object('code', p_code, 'name', trim(p_name), 'schoolType', p_school_type));
  RETURN new_id;
END
$$;

--
-- Name: platform_list_audit(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_list_audit(p_limit integer) RETURNS TABLE(id text, actor_user_id text, action text, target_tenant_id text, reason text, created_at timestamp without time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM platform_assert_admin();
  RETURN QUERY SELECT a.id, a."actorUserId", a.action, a."targetTenantId", a.reason, a."createdAt"
    FROM "PlatformAuditLog" a ORDER BY a."createdAt" DESC, a.id LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END
$$;

--
-- Name: platform_list_schools(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_list_schools() RETURNS TABLE(id text, code text, name text, school_type public."SchoolType", created_at timestamp without time zone, suspended_at timestamp without time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM platform_assert_admin();
  RETURN QUERY SELECT t.id, t.code, t.name, t."schoolType", t."createdAt", t."suspendedAt" FROM "Tenant" t ORDER BY t."createdAt" DESC, t.id;
END
$$;

--
-- Name: platform_school_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_school_stats() RETURNS TABLE(tenant_id text, active_members integer, active_admins integer, students integer, campuses integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM platform_assert_admin();
  RETURN QUERY SELECT t.id, COALESCE(s."activeMembers", 0), COALESCE(s."activeAdmins", 0), COALESCE(s."students", 0), COALESCE(s."campuses", 0)
    FROM "Tenant" t LEFT JOIN "TenantStats" s ON s."tenantId" = t.id ORDER BY t.id;
END
$$;

--
-- Name: platform_set_school_suspended(text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_set_school_suspended(p_tenant_id text, p_suspended boolean, p_reason text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  uid text := platform_assert_admin();
  was timestamp(3);
BEGIN
  IF p_suspended AND (p_reason IS NULL OR length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'platform_reason_required' USING ERRCODE = '22023';
  END IF;
  SELECT "suspendedAt" INTO was FROM "Tenant" WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF (was IS NOT NULL) = p_suspended THEN RETURN true; END IF;
  UPDATE "Tenant" SET "suspendedAt" = CASE WHEN p_suspended THEN now() ELSE NULL END WHERE id = p_tenant_id;
  INSERT INTO "PlatformAuditLog" (id, "actorUserId", action, "targetTenantId", "reason")
    VALUES ('p' || replace(gen_random_uuid()::text, '-', ''), uid,
            CASE WHEN p_suspended THEN 'SCHOOL_SUSPENDED' ELSE 'SCHOOL_REINSTATED' END, p_tenant_id, NULLIF(trim(p_reason), ''));
  RETURN true;
END
$$;

--
-- Name: platform_set_school_type(text, public."SchoolType"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_set_school_type(p_tenant_id text, p_school_type public."SchoolType") RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  uid text := platform_assert_admin();
  old_type "SchoolType";
  previous text := current_setting('app.tenant_id', true);
  periods int;
BEGIN
  SELECT "schoolType" INTO old_type FROM "Tenant" WHERE id = p_tenant_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF old_type = p_school_type THEN RETURN true; END IF;
  PERFORM set_config('app.tenant_id', p_tenant_id, true);
  SELECT count(*) INTO periods FROM "AcademicPeriod" WHERE "tenantId" = p_tenant_id;
  PERFORM set_config('app.tenant_id', COALESCE(previous, ''), true);
  IF periods > 0 THEN
    RAISE EXCEPTION 'platform_school_has_periods' USING ERRCODE = '23514';
  END IF;
  UPDATE "Tenant" SET "schoolType" = p_school_type WHERE id = p_tenant_id;
  INSERT INTO "PlatformAuditLog" (id, "actorUserId", action, "targetTenantId", "beforeValue", "afterValue")
    VALUES ('p' || replace(gen_random_uuid()::text, '-', ''), uid, 'SCHOOL_TYPE_CHANGED', p_tenant_id,
            jsonb_build_object('schoolType', old_type), jsonb_build_object('schoolType', p_school_type));
  RETURN true;
END
$$;

--
-- Name: platform_support_grants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_support_grants() RETURNS TABLE(tenant_id text, grant_id text, areas text[], expires_at timestamp without time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  uid text := platform_assert_admin();
BEGIN
  RETURN QUERY
    SELECT g."tenantId", g.id, g.areas, g."expiresAt"
      FROM "SupportGrant" g JOIN "Tenant" t ON t.id = g."tenantId"
     WHERE g."revokedAt" IS NULL AND g."expiresAt" > now() AND t."suspendedAt" IS NULL AND (g."granteeUserId" IS NULL OR g."granteeUserId" = uid)
     ORDER BY g."expiresAt";
END
$$;

--
-- Name: platform_support_record(text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_support_record(p_tenant_id text, p_grant_id text, p_action text, p_detail jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  uid text := platform_assert_admin();
  previous text := current_setting('app.tenant_id', true);
BEGIN
  IF p_action NOT IN ('SUPPORT_OPENED', 'SUPPORT_ACCESS', 'SUPPORT_CLOSED') THEN
    RAISE EXCEPTION 'platform_support_record: unknown action' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "SupportGrant" g JOIN "Tenant" t ON t.id = g."tenantId"
     WHERE g.id = p_grant_id AND g."tenantId" = p_tenant_id AND g."revokedAt" IS NULL AND g."expiresAt" > now() AND t."suspendedAt" IS NULL
       AND (g."granteeUserId" IS NULL OR g."granteeUserId" = uid)
  ) THEN
    RETURN false;
  END IF;
  PERFORM set_config('app.tenant_id', p_tenant_id, true);
  INSERT INTO "AuditLog" (id, "tenantId", "actorUserId", action, "targetType", "targetId", "afterValue")
    VALUES (md5(random()::text || clock_timestamp()::text), p_tenant_id, uid, p_action, 'SupportGrant', p_grant_id, p_detail);
  PERFORM set_config('app.tenant_id', COALESCE(previous, ''), true);
  INSERT INTO "PlatformAuditLog" (id, "actorUserId", action, "targetTenantId", "afterValue")
    VALUES (md5(random()::text || clock_timestamp()::text), uid, p_action, p_tenant_id, p_detail);
  RETURN true;
END
$$;

--
-- Name: question_bank_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.question_bank_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$;

--
-- Name: question_bank_image_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.question_bank_image_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."itemId" = OLD."itemId" THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM "QuestionBankItem" WHERE "tenantId" = NEW."tenantId" AND "id" = NEW."itemId" FOR UPDATE;
  IF (SELECT count(*) FROM "QuestionBankImage" WHERE "tenantId" = NEW."tenantId" AND "itemId" = NEW."itemId") >= 4 THEN
    RAISE EXCEPTION 'A question bank item can have at most 4 images' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

--
-- Name: question_bank_visibility_forward(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.question_bank_visibility_forward() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  old_rank integer;
  new_rank integer;
  -- "visibleFrom" is a TIMESTAMP without a time zone that holds UTC (that is how Prisma writes it); now() is compared in the session's zone, so on a server set to any zone but
  -- UTC the two were an hour or more apart (found in AlEemaan). Compare like with like.
  utc_now timestamp := (now() AT TIME ZONE 'UTC');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."visibility" = OLD."visibility" AND NEW."visibleFrom" IS NOT DISTINCT FROM OLD."visibleFrom" THEN
    RETURN NEW; -- nothing about visibility changes
  END IF;

  -- a date that is set or moved is in the future (a date that has passed is PRACTICE, and is set as PRACTICE)
  IF NEW."visibility" = 'TEACHERS_ONLY_UNTIL'
     AND (TG_OP = 'INSERT' OR OLD."visibility" <> 'TEACHERS_ONLY_UNTIL' OR NEW."visibleFrom" IS DISTINCT FROM OLD."visibleFrom")
     AND NEW."visibleFrom" <= utc_now THEN
    RAISE EXCEPTION 'The date a question becomes visible must be in the future' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_rank := CASE OLD."visibility" WHEN 'TEACHERS_ONLY' THEN 0 WHEN 'TEACHERS_ONLY_UNTIL' THEN 1 ELSE 2 END;
    new_rank := CASE NEW."visibility" WHEN 'TEACHERS_ONLY' THEN 0 WHEN 'TEACHERS_ONLY_UNTIL' THEN 1 ELSE 2 END;
    IF new_rank < old_rank THEN
      RAISE EXCEPTION 'A question may appear later, never disappear: visibility only moves forward' USING ERRCODE = 'check_violation';
    END IF;
    -- its date has passed, so pupils can already see it: it cannot be pushed back (the check above already refused a new date in the past)
    IF OLD."visibility" = 'TEACHERS_ONLY_UNTIL' AND OLD."visibleFrom" <= utc_now AND NEW."visibility" = 'TEACHERS_ONLY_UNTIL' THEN
      RAISE EXCEPTION 'A question may appear later, never disappear: its date has passed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

--
-- Name: school_settings_for_new_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.school_settings_for_new_tenant() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  previous text := current_setting('app.tenant_id', true);
BEGIN
  PERFORM set_config('app.tenant_id', NEW."id", true);
  INSERT INTO "SchoolSettings" ("tenantId") VALUES (NEW."id") ON CONFLICT ("tenantId") DO NOTHING;
  PERFORM set_config('app.tenant_id', COALESCE(previous, ''), true);
  RETURN NEW;
END
$$;

--
-- Name: support_grant_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.support_grant_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."granteeUserId" IS DISTINCT FROM OLD."granteeUserId"
     OR NEW."areas" IS DISTINCT FROM OLD."areas" OR NEW."reason" IS DISTINCT FROM OLD."reason" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
    RAISE EXCEPTION 'support_grant_immutable: a support grant can only be revoked' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

--
-- Name: tenant_stats_apply(text, integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenant_stats_apply(p_tenant_id text, d_members integer, d_admins integer, d_students integer, d_campuses integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF d_members = 0 AND d_admins = 0 AND d_students = 0 AND d_campuses = 0 THEN
    RETURN;
  END IF;
  INSERT INTO "TenantStats" ("tenantId", "activeMembers", "activeAdmins", "students", "campuses")
    SELECT p_tenant_id, d_members, d_admins, d_students, d_campuses WHERE EXISTS (SELECT 1 FROM "Tenant" WHERE id = p_tenant_id)
  ON CONFLICT ("tenantId") DO UPDATE SET
    "activeMembers" = "TenantStats"."activeMembers" + EXCLUDED."activeMembers",
    "activeAdmins" = "TenantStats"."activeAdmins" + EXCLUDED."activeAdmins",
    "students" = "TenantStats"."students" + EXCLUDED."students",
    "campuses" = "TenantStats"."campuses" + EXCLUDED."campuses",
    "updatedAt" = now();
END
$$;

--
-- Name: tenant_stats_from_campus(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenant_stats_from_campus() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM tenant_stats_apply(NEW."tenantId", 0, 0, 0, 1);
  ELSE
    PERFORM tenant_stats_apply(OLD."tenantId", 0, 0, 0, -1);
  END IF;
  RETURN NULL;
END
$$;

--
-- Name: tenant_stats_from_membership(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenant_stats_from_membership() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  old_m int := 0;
  old_a int := 0;
  new_m int := 0;
  new_a int := 0;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD."deactivatedAt" IS NULL THEN
    old_m := 1;
    IF OLD.role = 'ADMIN' THEN old_a := 1; END IF;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW."deactivatedAt" IS NULL THEN
    new_m := 1;
    IF NEW.role = 'ADMIN' THEN new_a := 1; END IF;
  END IF;
  PERFORM tenant_stats_apply(COALESCE(NEW."tenantId", OLD."tenantId"), new_m - old_m, new_a - old_a, 0, 0);
  RETURN NULL;
END
$$;

--
-- Name: tenant_stats_from_student(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenant_stats_from_student() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  old_s int := 0;
  new_s int := 0;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD."archivedAt" IS NULL THEN old_s := 1; END IF;
  IF TG_OP <> 'DELETE' AND NEW."archivedAt" IS NULL THEN new_s := 1; END IF;
  PERFORM tenant_stats_apply(COALESCE(NEW."tenantId", OLD."tenantId"), 0, 0, new_s - old_s, 0);
  RETURN NULL;
END
$$;

--
-- Name: tenant_stats_recompute(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenant_stats_recompute(p_tenant_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  previous text := current_setting('app.tenant_id', true);
  m int;
  a int;
  s int;
  c int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Tenant" WHERE id = p_tenant_id) THEN
    RETURN;
  END IF;
  PERFORM set_config('app.tenant_id', p_tenant_id, true);
  SELECT count(*) FILTER (WHERE "deactivatedAt" IS NULL)::int,
         count(*) FILTER (WHERE "deactivatedAt" IS NULL AND role = 'ADMIN')::int
    INTO m, a FROM "TenantMembership" WHERE "tenantId" = p_tenant_id;
  SELECT count(*)::int INTO s FROM "StudentRecord" WHERE "tenantId" = p_tenant_id AND "archivedAt" IS NULL;
  SELECT count(*)::int INTO c FROM "Campus" WHERE "tenantId" = p_tenant_id;
  PERFORM set_config('app.tenant_id', COALESCE(previous, ''), true);
  INSERT INTO "TenantStats" ("tenantId", "activeMembers", "activeAdmins", "students", "campuses")
    VALUES (p_tenant_id, m, a, s, c)
  ON CONFLICT ("tenantId") DO UPDATE SET
    "activeMembers" = EXCLUDED."activeMembers",
    "activeAdmins" = EXCLUDED."activeAdmins",
    "students" = EXCLUDED."students",
    "campuses" = EXCLUDED."campuses",
    "updatedAt" = now();
END
$$;

--
-- Name: AcademicPeriod; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AcademicPeriod" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "sessionId" text NOT NULL,
    kind public."PeriodKind" NOT NULL,
    ordinal integer NOT NULL,
    label text NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date,
    "isCurrent" boolean DEFAULT false NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "AcademicPeriod_dates_ordered" CHECK ((("endDate" IS NULL) OR ("endDate" > "startDate"))),
    CONSTRAINT "AcademicPeriod_end_required_unless_cohort" CHECK (((kind = 'COHORT'::public."PeriodKind") OR ("endDate" IS NOT NULL))),
    CONSTRAINT "AcademicPeriod_label_not_blank" CHECK (((length(btrim(label)) >= 1) AND (length(btrim(label)) <= 60))),
    CONSTRAINT "AcademicPeriod_ordinal_positive" CHECK ((ordinal >= 1))
);

ALTER TABLE ONLY public."AcademicPeriod" FORCE ROW LEVEL SECURITY;

--
-- Name: AcademicSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AcademicSession" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    label text NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date NOT NULL,
    status public."SessionStatus" DEFAULT 'PLANNED'::public."SessionStatus" NOT NULL,
    "copiedFromId" text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "closeAt" timestamp(3) without time zone,
    "closeRequestedById" text,
    "closeForced" boolean DEFAULT false NOT NULL,
    CONSTRAINT "AcademicSession_close_has_requester" CHECK ((("closeAt" IS NULL) OR ("closeRequestedById" IS NOT NULL))),
    CONSTRAINT "AcademicSession_dates_ordered" CHECK (("endDate" > "startDate")),
    CONSTRAINT "AcademicSession_label_not_blank" CHECK (((length(btrim(label)) >= 1) AND (length(btrim(label)) <= 40)))
);

ALTER TABLE ONLY public."AcademicSession" FORCE ROW LEVEL SECURITY;

--
-- Name: AdmissionCounter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AdmissionCounter" (
    "tenantId" text NOT NULL,
    year integer NOT NULL,
    next integer DEFAULT 1 NOT NULL,
    CONSTRAINT "AdmissionCounter_range" CHECK ((((year >= 1900) AND (year <= 9999)) AND (next >= 1)))
);

ALTER TABLE ONLY public."AdmissionCounter" FORCE ROW LEVEL SECURITY;

--
-- Name: Announcement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Announcement" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    "classArmId" text,
    title text NOT NULL,
    body text NOT NULL,
    "targetRoles" public."Role"[] DEFAULT ARRAY[]::public."Role"[] NOT NULL,
    status public."AnnouncementStatus" DEFAULT 'PUBLISHED'::public."AnnouncementStatus" NOT NULL,
    "isPinned" boolean DEFAULT false NOT NULL,
    "authorUserId" text NOT NULL,
    "publishedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."Announcement" FORCE ROW LEVEL SECURITY;

--
-- Name: AssessmentComponent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssessmentComponent" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "schemeId" text NOT NULL,
    name text NOT NULL,
    "maxScore" numeric(6,2) NOT NULL,
    "sortOrder" integer NOT NULL,
    CONSTRAINT "AssessmentComponent_max_positive" CHECK (("maxScore" > (0)::numeric)),
    CONSTRAINT "AssessmentComponent_name_not_blank" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 40))),
    CONSTRAINT "AssessmentComponent_sort_range" CHECK ((("sortOrder" >= 0) AND ("sortOrder" <= 99)))
);

ALTER TABLE ONLY public."AssessmentComponent" FORCE ROW LEVEL SECURITY;

--
-- Name: AssessmentScheme; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssessmentScheme" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "classGroupId" text,
    name text NOT NULL,
    "totalMax" numeric(6,2) DEFAULT 100 NOT NULL,
    "examMax" numeric(6,2) NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "lockedAt" timestamp(3) without time zone,
    "supersedesId" text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "examName" text,
    CONSTRAINT "AssessmentScheme_examName_length" CHECK ((("examName" IS NULL) OR ((char_length(btrim("examName")) >= 1) AND (char_length(btrim("examName")) <= 40)))),
    CONSTRAINT "AssessmentScheme_name_not_blank" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 60))),
    CONSTRAINT "AssessmentScheme_totals" CHECK ((("totalMax" > (0)::numeric) AND ("examMax" >= (0)::numeric) AND ("examMax" <= "totalMax"))),
    CONSTRAINT "AssessmentScheme_version_positive" CHECK ((version >= 1))
);

ALTER TABLE ONLY public."AssessmentScheme" FORCE ROW LEVEL SECURITY;

--
-- Name: Assignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Assignment" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    "subjectId" text NOT NULL,
    "classGroupId" text,
    "classArmId" text,
    title text NOT NULL,
    description text,
    instructions text,
    "dueDate" timestamp(3) without time zone,
    "totalPoints" integer DEFAULT 100 NOT NULL,
    status public."AssignmentStatus" DEFAULT 'DRAFT'::public."AssignmentStatus" NOT NULL,
    "allowLate" boolean DEFAULT true NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdById" text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."Assignment" FORCE ROW LEVEL SECURITY;

--
-- Name: AssignmentSubmission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssignmentSubmission" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "assignmentId" text NOT NULL,
    "studentId" text NOT NULL,
    content text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    status public."SubmissionStatus" DEFAULT 'PENDING'::public."SubmissionStatus" NOT NULL,
    score double precision,
    feedback text,
    "gradedById" text,
    "gradedAt" timestamp(3) without time zone,
    "submittedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."AssignmentSubmission" FORCE ROW LEVEL SECURITY;

--
-- Name: AttendanceRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AttendanceRecord" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "studentId" text NOT NULL,
    "classArmId" text NOT NULL,
    date date NOT NULL,
    status public."AttendanceStatus" NOT NULL,
    remarks text,
    "markedByUserId" text,
    "markedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    source public."AttendanceSource" DEFAULT 'ONLINE'::public."AttendanceSource" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "AttendanceRecord_remarks_len" CHECK (((remarks IS NULL) OR (length(remarks) <= 500)))
);

ALTER TABLE ONLY public."AttendanceRecord" FORCE ROW LEVEL SECURITY;

--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "actorUserId" text NOT NULL,
    action text NOT NULL,
    "targetType" text NOT NULL,
    "targetId" text NOT NULL,
    "beforeValue" jsonb,
    "afterValue" jsonb,
    reason text,
    "correlationId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."AuditLog" FORCE ROW LEVEL SECURITY;

--
-- Name: Campus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Campus" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL
);

ALTER TABLE ONLY public."Campus" FORCE ROW LEVEL SECURITY;

--
-- Name: Certificate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Certificate" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "studentId" text NOT NULL,
    "periodId" text,
    title text NOT NULL,
    "certificateNo" text NOT NULL,
    "issueDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "verificationHash" text NOT NULL,
    metadata jsonb,
    status public."CertificateStatus" DEFAULT 'ISSUED'::public."CertificateStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "verificationToken" text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL
);

ALTER TABLE ONLY public."Certificate" FORCE ROW LEVEL SECURITY;

--
-- Name: ClassArm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ClassArm" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "classGroupId" text NOT NULL,
    name text NOT NULL,
    capacity integer,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ClassArm_capacity_positive" CHECK (((capacity IS NULL) OR ((capacity >= 1) AND (capacity <= 1000)))),
    CONSTRAINT "ClassArm_name_not_blank" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 30)))
);

ALTER TABLE ONLY public."ClassArm" FORCE ROW LEVEL SECURITY;

--
-- Name: ClassGroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ClassGroup" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "sectionId" text,
    "streamName" text,
    CONSTRAINT "ClassGroup_name_not_blank" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 60))),
    CONSTRAINT "ClassGroup_sort_order_range" CHECK ((("sortOrder" >= 0) AND ("sortOrder" <= 999))),
    CONSTRAINT "ClassGroup_streamName_check" CHECK ((("streamName" IS NULL) OR (((char_length("streamName") >= 1) AND (char_length("streamName") <= 40)) AND ("streamName" = btrim("streamName")))))
);

ALTER TABLE ONLY public."ClassGroup" FORCE ROW LEVEL SECURITY;

--
-- Name: Course; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Course" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "departmentId" text NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    "creditUnits" integer DEFAULT 3 NOT NULL,
    level integer DEFAULT 100 NOT NULL,
    semester integer DEFAULT 1 NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."Course" FORCE ROW LEVEL SECURITY;

--
-- Name: CourseRegistration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CourseRegistration" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "studentId" text NOT NULL,
    "courseId" text NOT NULL,
    "periodId" text NOT NULL,
    status public."CourseRegStatus" DEFAULT 'REGISTERED'::public."CourseRegStatus" NOT NULL,
    "creditUnits" integer NOT NULL,
    score numeric(5,2),
    grade text,
    "gradePoint" numeric(3,2),
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."CourseRegistration" FORCE ROW LEVEL SECURITY;

--
-- Name: CustomDomain; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CustomDomain" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    domain text NOT NULL,
    status public."DomainStatus" DEFAULT 'PENDING_VERIFICATION'::public."DomainStatus" NOT NULL,
    "verificationToken" text NOT NULL,
    "verifiedAt" timestamp(3) without time zone,
    "sslActive" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."CustomDomain" FORCE ROW LEVEL SECURITY;

--
-- Name: Department; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Department" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."Department" FORCE ROW LEVEL SECURITY;

--
-- Name: EmailChangeToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EmailChangeToken" (
    id text NOT NULL,
    "tokenHash" text NOT NULL,
    "userId" text NOT NULL,
    "newEmail" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone
);

--
-- Name: FeeStructure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FeeStructure" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "periodId" text NOT NULL,
    "classGroupId" text,
    name text NOT NULL,
    amount numeric(12,2) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "FeeStructure_amount_non_negative" CHECK ((amount >= (0)::numeric))
);

ALTER TABLE ONLY public."FeeStructure" FORCE ROW LEVEL SECURITY;

--
-- Name: Form; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Form" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    kind public."FormKind" DEFAULT 'PRACTICE_SET'::public."FormKind" NOT NULL,
    title text NOT NULL,
    instructions text,
    status public."FormStatus" DEFAULT 'DRAFT'::public."FormStatus" NOT NULL,
    "isAnonymous" boolean DEFAULT false NOT NULL,
    "shareToken" text,
    "opensAt" timestamp(3) without time zone,
    "closesAt" timestamp(3) without time zone,
    "maxDurationMinutes" integer,
    "createdById" text NOT NULL,
    "closedById" text,
    "closedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."Form" FORCE ROW LEVEL SECURITY;

--
-- Name: FormAnswer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormAnswer" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "responseId" text NOT NULL,
    "formQuestionId" text NOT NULL,
    value jsonb NOT NULL,
    "isCorrect" boolean,
    score double precision DEFAULT 0,
    "markingStatus" public."FormMarkingStatus" DEFAULT 'NOT_REQUIRED'::public."FormMarkingStatus" NOT NULL,
    "markedById" text,
    "markedAt" timestamp(3) without time zone,
    feedback text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."FormAnswer" FORCE ROW LEVEL SECURITY;

--
-- Name: FormAudience; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormAudience" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "formId" text NOT NULL,
    kind public."FormAudienceKind" DEFAULT 'MEMBERS'::public."FormAudienceKind" NOT NULL,
    roles jsonb DEFAULT '[]'::jsonb NOT NULL,
    "classGroupId" text,
    "classGroupIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."FormAudience" FORCE ROW LEVEL SECURITY;

--
-- Name: FormMarkingAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormMarkingAudit" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "responseId" text NOT NULL,
    "answerId" text,
    "formId" text NOT NULL,
    "studentId" text,
    "scoreAwarded" double precision NOT NULL,
    "maxScore" double precision NOT NULL,
    feedback text,
    action text NOT NULL,
    "actorUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."FormMarkingAudit" FORCE ROW LEVEL SECURITY;

--
-- Name: FormParticipation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormParticipation" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "formId" text NOT NULL,
    "respondentId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."FormParticipation" FORCE ROW LEVEL SECURITY;

--
-- Name: FormQuestion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormQuestion" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "formId" text NOT NULL,
    "sourceItemId" text,
    "sourceVersion" integer,
    prompt text NOT NULL,
    "questionType" public."BankQuestionType" DEFAULT 'SINGLE'::public."BankQuestionType" NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    "correctAnswer" text,
    explanation text,
    points integer DEFAULT 1 NOT NULL,
    "markingMethod" public."FormMarkingMethod" DEFAULT 'AUTO'::public."FormMarkingMethod" NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."FormQuestion" FORCE ROW LEVEL SECURITY;

--
-- Name: FormResponse; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormResponse" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    "formId" text NOT NULL,
    "respondentId" text,
    "studentId" text,
    status public."FormResponseStatus" DEFAULT 'IN_PROGRESS'::public."FormResponseStatus" NOT NULL,
    score double precision DEFAULT 0,
    "maxScore" double precision DEFAULT 0,
    "markingStatus" public."FormMarkingStatus" DEFAULT 'NOT_REQUIRED'::public."FormMarkingStatus" NOT NULL,
    "markedById" text,
    "markedAt" timestamp(3) without time zone,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "submittedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."FormResponse" FORCE ROW LEVEL SECURITY;

--
-- Name: FormTurnIn; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormTurnIn" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    "formId" text NOT NULL,
    "studentId" text NOT NULL,
    status public."TurnInStatus" DEFAULT 'PENDING'::public."TurnInStatus" NOT NULL,
    "markedById" text,
    "markedAt" timestamp(3) without time zone,
    "requestedAt" timestamp(3) without time zone,
    note text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."FormTurnIn" FORCE ROW LEVEL SECURITY;

--
-- Name: FormTurnInAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormTurnInAudit" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "turnInId" text NOT NULL,
    "formId" text NOT NULL,
    "studentId" text NOT NULL,
    status public."TurnInStatus" NOT NULL,
    action text NOT NULL,
    "actorUserId" text,
    note text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."FormTurnInAudit" FORCE ROW LEVEL SECURITY;

--
-- Name: GradeBand; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GradeBand" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "scaleId" text NOT NULL,
    "minScore" numeric(5,2) NOT NULL,
    "maxScore" numeric(5,2) NOT NULL,
    letter text NOT NULL,
    remark text NOT NULL,
    "sortOrder" integer NOT NULL,
    CONSTRAINT "GradeBand_letter_not_blank" CHECK (((length(btrim(letter)) >= 1) AND (length(btrim(letter)) <= 4))),
    CONSTRAINT "GradeBand_range" CHECK ((("minScore" >= (0)::numeric) AND ("maxScore" <= (100)::numeric) AND ("minScore" < "maxScore"))),
    CONSTRAINT "GradeBand_remark_not_blank" CHECK (((length(btrim(remark)) >= 1) AND (length(btrim(remark)) <= 40))),
    CONSTRAINT "GradeBand_sort_range" CHECK ((("sortOrder" >= 0) AND ("sortOrder" <= 99)))
);

ALTER TABLE ONLY public."GradeBand" FORCE ROW LEVEL SECURITY;

--
-- Name: GradeScale; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GradeScale" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "lockedAt" timestamp(3) without time zone,
    "supersedesId" text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "GradeScale_name_not_blank" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 60))),
    CONSTRAINT "GradeScale_version_positive" CHECK ((version >= 1))
);

ALTER TABLE ONLY public."GradeScale" FORCE ROW LEVEL SECURITY;

--
-- Name: GuardianLink; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuardianLink" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "studentId" text NOT NULL,
    "guardianId" text NOT NULL,
    relationship public."Relationship" NOT NULL,
    "isPrimary" boolean DEFAULT false NOT NULL,
    status public."GuardianLinkStatus" DEFAULT 'APPROVED'::public."GuardianLinkStatus" NOT NULL,
    "approvedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    CONSTRAINT "GuardianLink_revoked_consistent" CHECK (((status = 'REVOKED'::public."GuardianLinkStatus") = ("revokedAt" IS NOT NULL))),
    CONSTRAINT "GuardianLink_revoked_not_primary" CHECK ((NOT ("isPrimary" AND (status = 'REVOKED'::public."GuardianLinkStatus"))))
);

ALTER TABLE ONLY public."GuardianLink" FORCE ROW LEVEL SECURITY;

--
-- Name: GuardianLinkToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuardianLinkToken" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "studentId" text NOT NULL,
    "guardianId" text,
    "tokenHash" text NOT NULL,
    channel public."NotificationChannel" NOT NULL,
    action text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."GuardianLinkToken" FORCE ROW LEVEL SECURITY;

--
-- Name: GuardianRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuardianRecord" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    phone text,
    email text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "middleName" text,
    address text,
    occupation text,
    CONSTRAINT "GuardianRecord_email_shape" CHECK (((email IS NULL) OR ((email = lower(email)) AND (length(email) <= 254) AND (email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'::text)))),
    CONSTRAINT "GuardianRecord_middle_name_valid" CHECK ((("middleName" IS NULL) OR ((length(btrim("middleName")) >= 1) AND (length(btrim("middleName")) <= 80)))),
    CONSTRAINT "GuardianRecord_names_valid" CHECK ((((length(btrim("firstName")) >= 1) AND (length(btrim("firstName")) <= 80)) AND ((length(btrim("lastName")) >= 1) AND (length(btrim("lastName")) <= 80)))),
    CONSTRAINT "GuardianRecord_phone_shape" CHECK (((phone IS NULL) OR (phone ~ '^[0-9+() -]{7,20}$'::text)))
);

ALTER TABLE ONLY public."GuardianRecord" FORCE ROW LEVEL SECURITY;

--
-- Name: Invitation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Invitation" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    email text NOT NULL,
    role public."Role" NOT NULL,
    "campusId" text,
    "tokenHash" text NOT NULL,
    "invitedById" text,
    "acceptedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "acceptedAt" timestamp(3) without time zone,
    "revokedAt" timestamp(3) without time zone,
    "staffRecordId" text
);

ALTER TABLE ONLY public."Invitation" FORCE ROW LEVEL SECURITY;

--
-- Name: Invoice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Invoice" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "studentId" text NOT NULL,
    "periodId" text NOT NULL,
    "invoiceNo" text NOT NULL,
    "totalAmount" numeric(12,2) NOT NULL,
    "amountPaid" numeric(12,2) DEFAULT 0 NOT NULL,
    status public."InvoiceStatus" DEFAULT 'UNPAID'::public."InvoiceStatus" NOT NULL,
    "dueDate" date,
    "lineItems" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "payInFull" boolean DEFAULT false NOT NULL,
    CONSTRAINT "Invoice_amount_non_negative" CHECK ((("totalAmount" >= (0)::numeric) AND ("amountPaid" >= (0)::numeric)))
);

ALTER TABLE ONLY public."Invoice" FORCE ROW LEVEL SECURITY;

--
-- Name: InvoiceDiscount; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InvoiceDiscount" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "invoiceId" text NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text NOT NULL,
    mode public."DiscountWorkflowMode" DEFAULT 'MANUAL_OVERRIDE'::public."DiscountWorkflowMode" NOT NULL,
    "appliedByUserId" text NOT NULL,
    "approvedByUserId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "InvoiceDiscount_amount_positive" CHECK ((amount > (0)::numeric))
);

ALTER TABLE ONLY public."InvoiceDiscount" FORCE ROW LEVEL SECURITY;

--
-- Name: LearningMaterial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LearningMaterial" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    "subjectId" text NOT NULL,
    "classGroupId" text,
    title text NOT NULL,
    description text,
    content text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdById" text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."LearningMaterial" FORCE ROW LEVEL SECURITY;

--
-- Name: MfaChallenge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MfaChallenge" (
    id text NOT NULL,
    "tokenHash" text NOT NULL,
    "userId" text NOT NULL,
    remember boolean DEFAULT false NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: MfaCredential; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MfaCredential" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "secretEnc" text NOT NULL,
    "confirmedAt" timestamp(3) without time zone,
    "lastUsedStep" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: MfaRecoveryCode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MfaRecoveryCode" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "codeHash" text NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: NotificationAuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."NotificationAuditLog" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "dispatchId" text,
    "actorUserId" text,
    event text NOT NULL,
    channel public."NotificationChannel" NOT NULL,
    recipient text NOT NULL,
    details jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."NotificationAuditLog" FORCE ROW LEVEL SECURITY;

--
-- Name: NotificationDispatch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."NotificationDispatch" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "templateId" text,
    channel public."NotificationChannel" NOT NULL,
    "recipientAddress" text NOT NULL,
    "recipientUserId" text,
    status public."NotificationDispatchStatus" DEFAULT 'QUEUED'::public."NotificationDispatchStatus" NOT NULL,
    subject text,
    body text NOT NULL,
    metadata jsonb,
    attempts integer DEFAULT 0 NOT NULL,
    "lastError" text,
    "sentAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."NotificationDispatch" FORCE ROW LEVEL SECURITY;

--
-- Name: NotificationTemplate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."NotificationTemplate" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    channel public."NotificationChannel" NOT NULL,
    "subjectTemplate" text,
    "bodyTemplate" text NOT NULL,
    variables jsonb,
    "isSystem" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."NotificationTemplate" FORCE ROW LEVEL SECURITY;

--
-- Name: PasswordResetToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PasswordResetToken" (
    id text NOT NULL,
    "tokenHash" text NOT NULL,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone
);

--
-- Name: Payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Payment" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "invoiceId" text NOT NULL,
    amount numeric(12,2) NOT NULL,
    provider public."PaymentProvider" DEFAULT 'PAYSTACK'::public."PaymentProvider" NOT NULL,
    "providerRef" text NOT NULL,
    status public."PaymentStatus" DEFAULT 'PENDING'::public."PaymentStatus" NOT NULL,
    "verifiedServerSide" boolean DEFAULT false NOT NULL,
    channel text,
    "paidAt" timestamp(3) without time zone,
    "receiptNo" text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Payment_amount_positive" CHECK ((amount > (0)::numeric))
);

ALTER TABLE ONLY public."Payment" FORCE ROW LEVEL SECURITY;

--
-- Name: PaymentWebhookEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PaymentWebhookEvent" (
    id text NOT NULL,
    provider public."PaymentProvider" DEFAULT 'PAYSTACK'::public."PaymentProvider" NOT NULL,
    "eventId" text NOT NULL,
    "eventType" text,
    "signatureValid" boolean NOT NULL,
    "processedAt" timestamp(3) without time zone,
    "rawPayloadHash" text NOT NULL,
    error text,
    "receivedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: PlatformAuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PlatformAuditLog" (
    id text NOT NULL,
    "actorUserId" text NOT NULL,
    action text NOT NULL,
    "targetTenantId" text,
    "beforeValue" jsonb,
    "afterValue" jsonb,
    reason text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."PlatformAuditLog" FORCE ROW LEVEL SECURITY;

--
-- Name: PracticeAttempt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PracticeAttempt" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "sessionId" text NOT NULL,
    "studentId" text NOT NULL,
    "bankItemId" text NOT NULL,
    version integer NOT NULL,
    answer jsonb NOT NULL,
    correct boolean NOT NULL,
    "answeredAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "archivedAt" timestamp(3) without time zone
);

ALTER TABLE ONLY public."PracticeAttempt" FORCE ROW LEVEL SECURITY;

--
-- Name: PracticeSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PracticeSession" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    "studentId" text NOT NULL,
    "classGroupId" text,
    "subjectLabel" text NOT NULL,
    "subjectKey" text NOT NULL,
    topic text,
    size integer NOT NULL,
    "feedbackMode" public."PracticeFeedbackMode" DEFAULT 'EACH'::public."PracticeFeedbackMode" NOT NULL,
    "itemIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."PracticeSession" FORCE ROW LEVEL SECURITY;

--
-- Name: Program; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Program" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    description text,
    kind public."ProgramKind" NOT NULL,
    status public."ProgramStatus" DEFAULT 'DRAFT'::public."ProgramStatus" NOT NULL,
    "startsOn" date,
    "endsOn" date,
    "createdByUserId" text NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "attendanceEnabled" boolean DEFAULT true NOT NULL,
    "lowAttendancePercent" integer DEFAULT 75 NOT NULL,
    "assessmentsEnabled" boolean DEFAULT false NOT NULL,
    "gradeBands" jsonb,
    "feesEnabled" boolean DEFAULT false NOT NULL,
    "certBody" text DEFAULT 'This is to certify that {name} has completed {program} at {school}, from {from} to {to}.'::text NOT NULL,
    "certSignatories" jsonb,
    "certTitle" text DEFAULT 'Certificate of Completion'::text NOT NULL,
    "completionMinAverage" numeric(5,2),
    "completionRequirePassed" boolean DEFAULT false NOT NULL,
    "noCertWhileOwing" boolean DEFAULT false NOT NULL,
    "progressEnabled" boolean DEFAULT false NOT NULL,
    "progressFourEyes" boolean DEFAULT true NOT NULL,
    "progressGuardianDetail" public."ProgressGuardianDetail" DEFAULT 'SUMMARY'::public."ProgressGuardianDetail" NOT NULL,
    "progressGuardianView" boolean DEFAULT true NOT NULL,
    "progressHijriAdjust" integer DEFAULT 0 NOT NULL,
    "progressLockInactivity" integer DEFAULT 300 NOT NULL,
    "progressLockRelease" integer DEFAULT 30 NOT NULL,
    "progressRequireVerification" boolean DEFAULT false NOT NULL,
    "progressStudentView" boolean DEFAULT true NOT NULL,
    "progressTemplate" text,
    "progressWriters" public."ProgressWriters" DEFAULT 'BOTH'::public."ProgressWriters" NOT NULL,
    CONSTRAINT "Program_certBody_check" CHECK (((char_length("certBody") >= 1) AND (char_length("certBody") <= 600))),
    CONSTRAINT "Program_certSignatories_check" CHECK ((("certSignatories" IS NULL) OR ((jsonb_typeof("certSignatories") = 'array'::text) AND (jsonb_array_length("certSignatories") <= 2)))),
    CONSTRAINT "Program_certTitle_check" CHECK (((char_length("certTitle") >= 1) AND (char_length("certTitle") <= 80))),
    CONSTRAINT "Program_completionMinAverage_check" CHECK ((("completionMinAverage" IS NULL) OR (("completionMinAverage" >= (0)::numeric) AND ("completionMinAverage" <= (100)::numeric)))),
    CONSTRAINT "Program_dates_check" CHECK ((((kind = 'FIXED_TERM'::public."ProgramKind") AND ("startsOn" IS NOT NULL) AND ("endsOn" IS NOT NULL) AND ("endsOn" > "startsOn")) OR ((kind = 'ONGOING'::public."ProgramKind") AND ("endsOn" IS NULL)))),
    CONSTRAINT "Program_gradeBands_check" CHECK ((("gradeBands" IS NULL) OR (jsonb_typeof("gradeBands") = 'array'::text))),
    CONSTRAINT "Program_lowAttendancePercent_check" CHECK ((("lowAttendancePercent" >= 1) AND ("lowAttendancePercent" <= 100))),
    CONSTRAINT "Program_progressHijriAdjust_check" CHECK ((("progressHijriAdjust" >= '-2'::integer) AND ("progressHijriAdjust" <= 2))),
    CONSTRAINT "Program_progressLockInactivity_check" CHECK ((("progressLockInactivity" >= 60) AND ("progressLockInactivity" <= 3600))),
    CONSTRAINT "Program_progressLockRelease_check" CHECK ((("progressLockRelease" >= 0) AND ("progressLockRelease" <= 300)))
);

ALTER TABLE ONLY public."Program" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramAssessment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramAssessment" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    title text NOT NULL,
    kind text DEFAULT ''::text NOT NULL,
    date date NOT NULL,
    "maxScore" numeric(7,2) NOT NULL,
    "passMark" numeric(7,2),
    weight numeric(5,2) DEFAULT 1 NOT NULL,
    required boolean DEFAULT false NOT NULL,
    status public."ProgramAssessmentStatus" DEFAULT 'DRAFT'::public."ProgramAssessmentStatus" NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "publishedAt" timestamp(3) without time zone,
    CONSTRAINT "ProgramAssessment_kind_check" CHECK ((char_length(kind) <= 40)),
    CONSTRAINT "ProgramAssessment_max_check" CHECK ((("maxScore" > (0)::numeric) AND ("maxScore" <= (1000)::numeric))),
    CONSTRAINT "ProgramAssessment_pass_check" CHECK ((("passMark" IS NULL) OR (("passMark" >= (0)::numeric) AND ("passMark" <= "maxScore")))),
    CONSTRAINT "ProgramAssessment_published_check" CHECK ((((status = 'PUBLISHED'::public."ProgramAssessmentStatus") = ("publishedAt" IS NOT NULL)) OR (status = 'ARCHIVED'::public."ProgramAssessmentStatus"))),
    CONSTRAINT "ProgramAssessment_title_check" CHECK ((((char_length(title) >= 1) AND (char_length(title) <= 120)) AND (title = btrim(title)))),
    CONSTRAINT "ProgramAssessment_weight_check" CHECK (((weight > (0)::numeric) AND (weight <= (100)::numeric)))
);

ALTER TABLE ONLY public."ProgramAssessment" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramAssessmentGroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramAssessmentGroup" (
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "assessmentId" text NOT NULL,
    "groupId" text NOT NULL
);

ALTER TABLE ONLY public."ProgramAssessmentGroup" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramAttendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramAttendance" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "sessionId" text NOT NULL,
    "participantId" text NOT NULL,
    "campusId" text,
    status public."AttendanceStatus" NOT NULL,
    remarks text,
    "markedByUserId" text NOT NULL,
    "markedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT "ProgramAttendance_remarks_check" CHECK ((COALESCE(char_length(remarks), 0) <= 200)),
    CONSTRAINT "ProgramAttendance_version_check" CHECK ((version >= 1))
);

ALTER TABLE ONLY public."ProgramAttendance" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramAttendanceChange; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramAttendanceChange" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "sessionId" text NOT NULL,
    "participantId" text NOT NULL,
    "beforeStatus" public."AttendanceStatus" NOT NULL,
    "afterStatus" public."AttendanceStatus" NOT NULL,
    "beforeRemarks" text,
    "afterRemarks" text,
    reason text,
    "changedByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramAttendanceChange_reason_check" CHECK ((COALESCE(char_length(reason), 0) <= 500))
);

ALTER TABLE ONLY public."ProgramAttendanceChange" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramAudit" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "actorUserId" text NOT NULL,
    action text NOT NULL,
    "targetType" text NOT NULL,
    "targetId" text,
    "beforeValue" jsonb,
    "afterValue" jsonb,
    reason text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."ProgramAudit" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramCampus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramCampus" (
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "campusId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."ProgramCampus" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramCertificate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramCertificate" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "participantId" text NOT NULL,
    "serialNo" text NOT NULL,
    "verificationToken" text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
    "issuedOn" date NOT NULL,
    "completedOn" date NOT NULL,
    title text NOT NULL,
    "bodyText" text NOT NULL,
    "personName" text NOT NULL,
    "programName" text NOT NULL,
    "schoolName" text NOT NULL,
    signatories jsonb DEFAULT '[]'::jsonb NOT NULL,
    status public."ProgramCertificateStatus" DEFAULT 'ISSUED'::public."ProgramCertificateStatus" NOT NULL,
    "replacesId" text,
    "revokedAt" timestamp(3) without time zone,
    "revokedByUserId" text,
    "revokeReason" text,
    "issuedByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramCertificate_revoked_check" CHECK ((((status = 'REVOKED'::public."ProgramCertificateStatus") = ("revokedAt" IS NOT NULL)) AND ((status <> 'REVOKED'::public."ProgramCertificateStatus") OR (char_length(btrim(COALESCE("revokeReason", ''::text))) >= 3)))),
    CONSTRAINT "ProgramCertificate_text_check" CHECK ((((char_length(title) >= 1) AND (char_length(title) <= 80)) AND ((char_length("bodyText") >= 1) AND (char_length("bodyText") <= 1200)) AND ((char_length("personName") >= 1) AND (char_length("personName") <= 200)))),
    CONSTRAINT "ProgramCertificate_token_check" CHECK (("verificationToken" ~ '^[0-9a-f]{32}$'::text))
);

ALTER TABLE ONLY public."ProgramCertificate" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramCounter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramCounter" (
    "tenantId" text NOT NULL,
    kind text NOT NULL,
    year integer NOT NULL,
    next integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public."ProgramCounter" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramFeeExemption; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramFeeExemption" (
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "feeItemId" text NOT NULL,
    "participantId" text NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."ProgramFeeExemption" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramFeeItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramFeeItem" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    name text NOT NULL,
    amount numeric(12,2) NOT NULL,
    frequency public."ProgramFeeFrequency" DEFAULT 'ONCE'::public."ProgramFeeFrequency" NOT NULL,
    "dueDay" integer,
    audience jsonb DEFAULT '{}'::jsonb NOT NULL,
    "discountPercent" numeric(5,2),
    "billedTo" public."ProgramFeeBilledTo" DEFAULT 'PARTICIPANT'::public."ProgramFeeBilledTo" NOT NULL,
    status public."ProgramFeeStatus" DEFAULT 'ACTIVE'::public."ProgramFeeStatus" NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramFeeItem_amount_check" CHECK (((amount >= 0.01) AND (amount <= (10000000)::numeric))),
    CONSTRAINT "ProgramFeeItem_audience_check" CHECK ((jsonb_typeof(audience) = 'object'::text)),
    CONSTRAINT "ProgramFeeItem_discount_check" CHECK ((("discountPercent" IS NULL) OR (("discountPercent" >= (0)::numeric) AND ("discountPercent" <= (100)::numeric)))),
    CONSTRAINT "ProgramFeeItem_dueDay_check" CHECK ((("dueDay" IS NULL) OR (("dueDay" >= 1) AND ("dueDay" <= 28)))),
    CONSTRAINT "ProgramFeeItem_name_check" CHECK ((((char_length(name) >= 1) AND (char_length(name) <= 80)) AND (name = btrim(name))))
);

ALTER TABLE ONLY public."ProgramFeeItem" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramGroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramGroup" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "parentId" text,
    "levelIndex" integer NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramGroup_level_check" CHECK ((("levelIndex" >= 0) AND ("levelIndex" <= 3))),
    CONSTRAINT "ProgramGroup_top_has_no_parent_check" CHECK ((("parentId" IS NULL) = ("levelIndex" = 0)))
);

ALTER TABLE ONLY public."ProgramGroup" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramInvoice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramInvoice" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "campusId" text,
    "participantId" text NOT NULL,
    "periodKey" text NOT NULL,
    "invoiceNo" text NOT NULL,
    "totalAmount" numeric(12,2) NOT NULL,
    "amountPaid" numeric(12,2) DEFAULT 0 NOT NULL,
    status public."InvoiceStatus" DEFAULT 'UNPAID'::public."InvoiceStatus" NOT NULL,
    "dueDate" date,
    "payInFull" boolean DEFAULT false NOT NULL,
    "lineItems" jsonb NOT NULL,
    "billingName" text,
    "billingPhone" text,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramInvoice_amounts_check" CHECK ((("totalAmount" >= (0)::numeric) AND ("amountPaid" >= (0)::numeric) AND ("amountPaid" <= "totalAmount"))),
    CONSTRAINT "ProgramInvoice_lines_check" CHECK ((jsonb_typeof("lineItems") = 'array'::text)),
    CONSTRAINT "ProgramInvoice_period_check" CHECK (("periodKey" ~ '^(once|[0-9]{4}|[0-9]{4}-(0[1-9]|1[0-2]))$'::text))
);

ALTER TABLE ONLY public."ProgramInvoice" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramInvoiceDiscount; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramInvoiceDiscount" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "invoiceId" text NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text NOT NULL,
    "appliedByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramInvoiceDiscount_amount_check" CHECK ((amount > (0)::numeric)),
    CONSTRAINT "ProgramInvoiceDiscount_reason_check" CHECK (((char_length(btrim(reason)) >= 3) AND (char_length(btrim(reason)) <= 500)))
);

ALTER TABLE ONLY public."ProgramInvoiceDiscount" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramLevelLabel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramLevelLabel" (
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "levelIndex" integer NOT NULL,
    name text NOT NULL,
    CONSTRAINT "ProgramLevelLabel_level_check" CHECK ((("levelIndex" >= 0) AND ("levelIndex" <= 3)))
);

ALTER TABLE ONLY public."ProgramLevelLabel" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramParticipant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramParticipant" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    kind public."ParticipantKind" NOT NULL,
    "studentId" text,
    "staffRecordId" text,
    "guardianId" text,
    "firstName" text,
    "lastName" text,
    gender public."Gender",
    "dateOfBirth" date,
    phone text,
    email text,
    "guardianName" text,
    "guardianPhone" text,
    "groupId" text NOT NULL,
    "campusId" text,
    status public."ProgramPlaceStatus" DEFAULT 'ACTIVE'::public."ProgramPlaceStatus" NOT NULL,
    "joinedOn" date NOT NULL,
    "endedOn" date,
    "endedReason" text,
    standing public."StandingState" DEFAULT 'ACTIVE'::public."StandingState" NOT NULL,
    "standingUntil" date,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completionOverrideReason" text,
    CONSTRAINT "ProgramParticipant_child_check" CHECK (((kind <> 'CHILD'::public."ParticipantKind") OR (("dateOfBirth" IS NOT NULL) AND (COALESCE(char_length(btrim("guardianName")), 0) > 0) AND (COALESCE(char_length(btrim("guardianPhone")), 0) > 0)))),
    CONSTRAINT "ProgramParticipant_dates_check" CHECK (((("endedOn" IS NULL) OR ("endedOn" >= "joinedOn")) AND ((status <> 'ACTIVE'::public."ProgramPlaceStatus") OR ("endedOn" IS NULL)))),
    CONSTRAINT "ProgramParticipant_kind_check" CHECK ((((kind = 'STUDENT'::public."ParticipantKind") AND ("studentId" IS NOT NULL) AND ("staffRecordId" IS NULL) AND ("guardianId" IS NULL) AND ("firstName" IS NULL) AND ("lastName" IS NULL) AND (gender IS NULL) AND ("dateOfBirth" IS NULL) AND (phone IS NULL) AND (email IS NULL) AND ("guardianName" IS NULL) AND ("guardianPhone" IS NULL)) OR ((kind = 'STAFF'::public."ParticipantKind") AND ("staffRecordId" IS NOT NULL) AND ("studentId" IS NULL) AND ("guardianId" IS NULL) AND ("firstName" IS NULL) AND ("lastName" IS NULL) AND (gender IS NULL) AND ("dateOfBirth" IS NULL) AND (phone IS NULL) AND (email IS NULL) AND ("guardianName" IS NULL) AND ("guardianPhone" IS NULL)) OR ((kind = 'GUARDIAN'::public."ParticipantKind") AND ("guardianId" IS NOT NULL) AND ("studentId" IS NULL) AND ("staffRecordId" IS NULL) AND ("firstName" IS NULL) AND ("lastName" IS NULL) AND (gender IS NULL) AND ("dateOfBirth" IS NULL) AND (phone IS NULL) AND (email IS NULL) AND ("guardianName" IS NULL) AND ("guardianPhone" IS NULL)) OR ((kind = ANY (ARRAY['ADULT'::public."ParticipantKind", 'CHILD'::public."ParticipantKind"])) AND ("studentId" IS NULL) AND ("staffRecordId" IS NULL) AND ("guardianId" IS NULL) AND (COALESCE(char_length(btrim("firstName")), 0) > 0) AND (COALESCE(char_length(btrim("lastName")), 0) > 0)))),
    CONSTRAINT "ProgramParticipant_length_check" CHECK (((COALESCE(char_length("firstName"), 0) <= 60) AND (COALESCE(char_length("lastName"), 0) <= 60) AND (COALESCE(char_length(phone), 0) <= 30) AND (COALESCE(char_length("guardianPhone"), 0) <= 30) AND (COALESCE(char_length(email), 0) <= 120) AND (COALESCE(char_length("guardianName"), 0) <= 120) AND (COALESCE(char_length("endedReason"), 0) <= 500))),
    CONSTRAINT "ProgramParticipant_override_check" CHECK ((("completionOverrideReason" IS NULL) OR (((char_length(btrim("completionOverrideReason")) >= 3) AND (char_length(btrim("completionOverrideReason")) <= 500)) AND (status = 'COMPLETED'::public."ProgramPlaceStatus")))),
    CONSTRAINT "ProgramParticipant_standing_check" CHECK (((standing = ANY (ARRAY['ACTIVE'::public."StandingState", 'SUSPENDED'::public."StandingState", 'EXPELLED'::public."StandingState"])) AND (("standingUntil" IS NULL) OR (standing = 'SUSPENDED'::public."StandingState")) AND ((kind = ANY (ARRAY['ADULT'::public."ParticipantKind", 'CHILD'::public."ParticipantKind"])) OR ((standing = 'ACTIVE'::public."StandingState") AND ("standingUntil" IS NULL)))))
);

ALTER TABLE ONLY public."ProgramParticipant" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramPayment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramPayment" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "campusId" text,
    "invoiceId" text NOT NULL,
    amount numeric(12,2) NOT NULL,
    source public."ProgramPaymentSource" DEFAULT 'MANUAL'::public."ProgramPaymentSource" NOT NULL,
    "providerRef" text NOT NULL,
    status public."PaymentStatus" DEFAULT 'PENDING'::public."PaymentStatus" NOT NULL,
    "verifiedServerSide" boolean DEFAULT false NOT NULL,
    channel text,
    "paidAt" timestamp(3) without time zone,
    "receiptNo" text,
    metadata jsonb,
    "recordedByUserId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramPayment_amount_check" CHECK ((amount > (0)::numeric))
);

ALTER TABLE ONLY public."ProgramPayment" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramScore; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramScore" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "assessmentId" text NOT NULL,
    "participantId" text NOT NULL,
    "campusId" text,
    score numeric(7,2),
    code public."ProgramScoreCode",
    comment text,
    "markedByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT "ProgramScore_comment_check" CHECK ((COALESCE(char_length(comment), 0) <= 500)),
    CONSTRAINT "ProgramScore_one_of_check" CHECK (((score IS NOT NULL) <> (code IS NOT NULL))),
    CONSTRAINT "ProgramScore_score_check" CHECK (((score IS NULL) OR ((score >= (0)::numeric) AND (score <= (1000)::numeric)))),
    CONSTRAINT "ProgramScore_version_check" CHECK ((version >= 1))
);

ALTER TABLE ONLY public."ProgramScore" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramScoreChange; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramScoreChange" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "assessmentId" text NOT NULL,
    "participantId" text NOT NULL,
    "beforeScore" numeric(7,2),
    "beforeCode" public."ProgramScoreCode",
    "afterScore" numeric(7,2),
    "afterCode" public."ProgramScoreCode",
    reason text,
    "changedByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramScoreChange_reason_check" CHECK ((COALESCE(char_length(reason), 0) <= 500))
);

ALTER TABLE ONLY public."ProgramScoreChange" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramSession" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "groupId" text NOT NULL,
    date date NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgramSession_label_check" CHECK (((char_length(label) <= 40) AND (label = btrim(label))))
);

ALTER TABLE ONLY public."ProgramSession" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramStaff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramStaff" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "userId" text NOT NULL,
    role public."ProgramStaffRole" NOT NULL,
    status public."ProgramStaffStatus" DEFAULT 'ACTIVE'::public."ProgramStaffStatus" NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endedAt" timestamp(3) without time zone
);

ALTER TABLE ONLY public."ProgramStaff" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgramStaffGroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgramStaffGroup" (
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "programStaffId" text NOT NULL,
    "groupId" text NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."ProgramStaffGroup" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgressEntry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgressEntry" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "recordId" text NOT NULL,
    "trackKey" text NOT NULL,
    "entryDate" date NOT NULL,
    "values" jsonb NOT NULL,
    status public."ProgressEntryStatus" DEFAULT 'DRAFT'::public."ProgressEntryStatus" NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "createdByUserId" text NOT NULL,
    "lastEditedByUserId" text NOT NULL,
    "submittedAt" timestamp(3) without time zone,
    "verifiedByUserId" text,
    "verifiedAt" timestamp(3) without time zone,
    "returnComment" text,
    "publishedValues" jsonb,
    "publishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgressEntry_published_check" CHECK ((("publishedValues" IS NULL) OR (jsonb_typeof("publishedValues") = 'object'::text))),
    CONSTRAINT "ProgressEntry_return_check" CHECK ((COALESCE(char_length("returnComment"), 0) <= 300)),
    CONSTRAINT "ProgressEntry_values_check" CHECK (((jsonb_typeof("values") = 'object'::text) AND ((char_length("trackKey") >= 1) AND (char_length("trackKey") <= 40)) AND (version >= 1))),
    CONSTRAINT "ProgressEntry_verified_check" CHECK (((status <> 'VERIFIED'::public."ProgressEntryStatus") OR (("publishedValues" IS NOT NULL) AND ("verifiedAt" IS NOT NULL) AND ("verifiedByUserId" IS NOT NULL))))
);

ALTER TABLE ONLY public."ProgressEntry" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgressEntryRevision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgressEntryRevision" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "entryId" text NOT NULL,
    "recordId" text NOT NULL,
    version integer NOT NULL,
    action text NOT NULL,
    "userId" text NOT NULL,
    "beforeValues" jsonb,
    "afterValues" jsonb,
    note text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgressEntryRevision_note_check" CHECK (((COALESCE(char_length(note), 0) <= 300) AND ((char_length(action) >= 1) AND (char_length(action) <= 30))))
);

ALTER TABLE ONLY public."ProgressEntryRevision" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgressLock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgressLock" (
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "entryId" text NOT NULL,
    "holderUserId" text NOT NULL,
    "heartbeatAt" timestamp(3) without time zone NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "releaseAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgressLock_times_check" CHECK ((("expiresAt" >= "heartbeatAt") AND (("releaseAt" IS NULL) OR ("releaseAt" >= "heartbeatAt"))))
);

ALTER TABLE ONLY public."ProgressLock" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgressRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgressRecord" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "participantId" text NOT NULL,
    "templateId" text NOT NULL,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgressRecord_profile_check" CHECK (((jsonb_typeof(profile) = 'object'::text) AND (version >= 1)))
);

ALTER TABLE ONLY public."ProgressRecord" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgressSeen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgressSeen" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    "recordId" text NOT NULL,
    actor text NOT NULL,
    "weekStart" date NOT NULL,
    "seenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgressSeen_actor_check" CHECK ((actor = ANY (ARRAY['PUPIL'::text, 'GUARDIAN'::text])))
);

ALTER TABLE ONLY public."ProgressSeen" FORCE ROW LEVEL SECURITY;

--
-- Name: ProgressTemplate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProgressTemplate" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "programId" text NOT NULL,
    key text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    schema jsonb NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ProgressTemplate_key_check" CHECK ((((char_length(key) >= 1) AND (char_length(key) <= 40)) AND (version >= 1) AND (jsonb_typeof(schema) = 'object'::text)))
);

ALTER TABLE ONLY public."ProgressTemplate" FORCE ROW LEVEL SECURITY;

--
-- Name: PromotionBatch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PromotionBatch" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "sourceSessionId" text NOT NULL,
    "targetSessionId" text NOT NULL,
    "sourceClassGroupId" text NOT NULL,
    "targetClassGroupId" text,
    "passMark" numeric(5,2) NOT NULL,
    "totalEvaluated" integer NOT NULL,
    "totalPromoted" integer NOT NULL,
    "totalRepeated" integer NOT NULL,
    "totalGraduated" integer NOT NULL,
    "totalWithdrawn" integer NOT NULL,
    "totalSkipped" integer NOT NULL,
    "executedByUserId" text NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "PromotionBatch_counts_check" CHECK ((("totalEvaluated" >= 0) AND ("totalPromoted" >= 0) AND ("totalRepeated" >= 0) AND ("totalGraduated" >= 0) AND ("totalWithdrawn" >= 0) AND ("totalSkipped" >= 0) AND ((((("totalPromoted" + "totalRepeated") + "totalGraduated") + "totalWithdrawn") + "totalSkipped") <= "totalEvaluated"))),
    CONSTRAINT "PromotionBatch_notes_check" CHECK ((COALESCE(char_length(notes), 0) <= 500)),
    CONSTRAINT "PromotionBatch_passMark_check" CHECK ((("passMark" >= (0)::numeric) AND ("passMark" <= (100)::numeric))),
    CONSTRAINT "PromotionBatch_sessions_check" CHECK (("sourceSessionId" <> "targetSessionId"))
);

ALTER TABLE ONLY public."PromotionBatch" FORCE ROW LEVEL SECURITY;

--
-- Name: PromotionRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PromotionRecord" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "batchId" text NOT NULL,
    "studentId" text NOT NULL,
    "sourceEnrollmentId" text NOT NULL,
    "targetEnrollmentId" text,
    "overallAverage" numeric(5,2),
    "termAverages" jsonb NOT NULL,
    decision public."PromotionDecision" NOT NULL,
    "decisionMode" public."PromotionDecisionMode" NOT NULL,
    "overrideReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "targetClassGroupId" text,
    CONSTRAINT "PromotionRecord_average_check" CHECK ((("overallAverage" IS NULL) OR (("overallAverage" >= (0)::numeric) AND ("overallAverage" <= (100)::numeric)))),
    CONSTRAINT "PromotionRecord_class_check" CHECK ((("targetClassGroupId" IS NULL) OR ("targetEnrollmentId" IS NOT NULL))),
    CONSTRAINT "PromotionRecord_reason_check" CHECK (((COALESCE(char_length("overrideReason"), 0) <= 255) AND (("decisionMode" <> 'OVERRIDDEN'::public."PromotionDecisionMode") OR (char_length(btrim(COALESCE("overrideReason", ''::text))) > 0)))),
    CONSTRAINT "PromotionRecord_target_check" CHECK (((decision = ANY (ARRAY['PROMOTED'::public."PromotionDecision", 'REPEATED'::public."PromotionDecision"])) = ("targetEnrollmentId" IS NOT NULL))),
    CONSTRAINT "PromotionRecord_terms_check" CHECK ((jsonb_typeof("termAverages") = 'object'::text))
);

ALTER TABLE ONLY public."PromotionRecord" FORCE ROW LEVEL SECURITY;

--
-- Name: PromotionReversal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PromotionReversal" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "batchId" text NOT NULL,
    "reversedByUserId" text NOT NULL,
    reason text NOT NULL,
    restored integer NOT NULL,
    cancelled integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "PromotionReversal_counts_check" CHECK (((restored >= 0) AND (cancelled >= 0) AND (cancelled <= restored))),
    CONSTRAINT "PromotionReversal_reason_check" CHECK (((char_length(btrim(reason)) >= 1) AND (char_length(btrim(reason)) <= 500)))
);

ALTER TABLE ONLY public."PromotionReversal" FORCE ROW LEVEL SECURITY;

--
-- Name: QuestionBankAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankAudit" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    "itemId" text,
    "actorUserId" text,
    entity text NOT NULL,
    action text NOT NULL,
    ref text,
    "oldValue" jsonb,
    "newValue" jsonb,
    reason text,
    "stepUpVerifiedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "QuestionBankAudit_entity" CHECK ((entity = ANY (ARRAY['ITEM'::text, 'REVIEWER'::text, 'SETTING'::text]))),
    CONSTRAINT "QuestionBankAudit_step_up" CHECK (((entity <> 'SETTING'::text) OR ("stepUpVerifiedAt" IS NOT NULL)))
);

ALTER TABLE ONLY public."QuestionBankAudit" FORCE ROW LEVEL SECURITY;

--
-- Name: QuestionBankClassTag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankClassTag" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "itemId" text NOT NULL,
    label text NOT NULL,
    "labelKey" text NOT NULL,
    CONSTRAINT "QuestionBankClassTag_sane" CHECK (((length("labelKey") > 0) AND (length(btrim(label, E' \t\r\n\f\v\u00a0'::text)) > 0)))
);

ALTER TABLE ONLY public."QuestionBankClassTag" FORCE ROW LEVEL SECURITY;

--
-- Name: QuestionBankImage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankImage" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "itemId" text NOT NULL,
    "storageKey" text NOT NULL,
    store text NOT NULL,
    "contentType" text NOT NULL,
    alt text DEFAULT ''::text NOT NULL,
    decorative boolean DEFAULT false NOT NULL,
    bytes integer NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "QuestionBankImage_contentType" CHECK (("contentType" = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]))),
    CONSTRAINT "QuestionBankImage_sane" CHECK (((bytes > 0) AND (width > 0) AND (height > 0) AND ("sortOrder" >= 0) AND (decorative OR (length(btrim(alt, E' \t\r\n\f\v\u00a0'::text)) > 0)))),
    CONSTRAINT "QuestionBankImage_store" CHECK ((store = ANY (ARRAY['s3'::text, 'r2'::text, 'cloudinary'::text, 'memory'::text])))
);

ALTER TABLE ONLY public."QuestionBankImage" FORCE ROW LEVEL SECURITY;

--
-- Name: QuestionBankItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankItem" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    bank public."BankKind" DEFAULT 'ASSESSMENT'::public."BankKind" NOT NULL,
    type public."BankQuestionType" NOT NULL,
    prompt text NOT NULL,
    explanation text,
    points integer DEFAULT 1 NOT NULL,
    difficulty integer,
    topic text,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    "correctAnswer" jsonb,
    "subjectLabel" text,
    "subjectKey" text,
    visibility public."BankVisibility" DEFAULT 'TEACHERS_ONLY'::public."BankVisibility" NOT NULL,
    "visibleFrom" timestamp(3) without time zone,
    status public."BankItemStatus" DEFAULT 'DRAFT'::public."BankItemStatus" NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "submittedById" text NOT NULL,
    "approvedById" text,
    "approvedAt" timestamp(3) without time zone,
    "retiredReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "visibleAfterQuizId" text,
    CONSTRAINT "QuestionBankItem_decided" CHECK ((((status <> ALL (ARRAY['APPROVED'::public."BankItemStatus", 'RETIRED'::public."BankItemStatus"])) OR (("approvedById" IS NOT NULL) AND ("approvedAt" IS NOT NULL))) AND ((status <> 'RETIRED'::public."BankItemStatus") OR (length(btrim(COALESCE("retiredReason", ''::text), E' \t\r\n\f\v\u00a0'::text)) > 0)))),
    CONSTRAINT "QuestionBankItem_kind_types" CHECK ((((type <> ALL (ARRAY['RATING'::public."BankQuestionType", 'TEXT'::public."BankQuestionType"])) OR (bank = 'QUESTIONNAIRE'::public."BankKind")) AND ((bank <> 'QUESTIONNAIRE'::public."BankKind") OR ("correctAnswer" IS NULL)))),
    CONSTRAINT "QuestionBankItem_sane" CHECK (((points >= 0) AND (version >= 1) AND ((difficulty IS NULL) OR ((difficulty >= 1) AND (difficulty <= 5))) AND (length(btrim(prompt, E' \t\r\n\f\v\u00a0'::text)) > 0) AND (("subjectLabel" IS NULL) = ("subjectKey" IS NULL)) AND (("subjectKey" IS NULL) OR (length("subjectKey") > 0)))),
    CONSTRAINT "QuestionBankItem_until" CHECK (((visibility = 'TEACHERS_ONLY_UNTIL'::public."BankVisibility") = ("visibleFrom" IS NOT NULL)))
);

ALTER TABLE ONLY public."QuestionBankItem" FORCE ROW LEVEL SECURITY;

--
-- Name: QuestionBankItemVersion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankItemVersion" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "itemId" text NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    "actorUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "QuestionBankItemVersion_sane" CHECK (((version >= 1) AND (jsonb_typeof(snapshot) = 'object'::text)))
);

ALTER TABLE ONLY public."QuestionBankItemVersion" FORCE ROW LEVEL SECURITY;

--
-- Name: QuestionBankPrintLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankPrintLog" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    "targetKind" public."PrintTargetKind" NOT NULL,
    "targetId" text NOT NULL,
    title text NOT NULL,
    watermark text NOT NULL,
    "pageCount" integer DEFAULT 1 NOT NULL,
    reason text,
    "recipientStudentId" text,
    "printedById" text NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "printedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."QuestionBankPrintLog" FORCE ROW LEVEL SECURITY;

--
-- Name: QuestionBankReview; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankReview" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "itemId" text NOT NULL,
    version integer NOT NULL,
    "reviewerId" text NOT NULL,
    outcome public."BankReviewOutcome" NOT NULL,
    reason text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."QuestionBankReview" FORCE ROW LEVEL SECURITY;

--
-- Name: QuestionBankReviewer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankReviewer" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text NOT NULL,
    "campusId" text,
    scope public."BankReviewerScope" NOT NULL,
    "subjectLabel" text,
    "subjectKey" text,
    "isExamApprover" boolean DEFAULT false NOT NULL,
    "assignedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "QuestionBankReviewer_scope" CHECK ((((scope = 'SUBJECT'::public."BankReviewerScope") AND ("subjectKey" IS NOT NULL) AND (length("subjectKey") > 0) AND ("subjectLabel" IS NOT NULL)) OR ((scope = 'GENERAL'::public."BankReviewerScope") AND ("subjectKey" IS NULL) AND ("subjectLabel" IS NULL))))
);

ALTER TABLE ONLY public."QuestionBankReviewer" FORCE ROW LEVEL SECURITY;

--
-- Name: QuestionBankSetting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionBankSetting" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    key text NOT NULL,
    value jsonb NOT NULL,
    "updatedById" text NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "QuestionBankSetting_key" CHECK ((((length(key) >= 1) AND (length(key) <= 80)) AND (key ~~ 'bank.%'::text)))
);

ALTER TABLE ONLY public."QuestionBankSetting" FORCE ROW LEVEL SECURITY;

--
-- Name: QuestionOverlapFlag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionOverlapFlag" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "itemId" text NOT NULL,
    "similarToItemId" text,
    "similarToAssessmentQuestionId" text,
    score double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "QuestionOverlapFlag_score" CHECK (((score >= (0)::double precision) AND (score <= (1)::double precision)))
);

ALTER TABLE ONLY public."QuestionOverlapFlag" FORCE ROW LEVEL SECURITY;

--
-- Name: QuestionReport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionReport" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    "bankItemId" text NOT NULL,
    "reporterUserId" text NOT NULL,
    "reporterRole" text NOT NULL,
    "reporterStudentId" text,
    reason text NOT NULL,
    status public."QuestionReportStatus" DEFAULT 'OPEN'::public."QuestionReportStatus" NOT NULL,
    "resolvedById" text,
    "resolvedAt" timestamp(3) without time zone,
    outcome public."QuestionReportOutcome",
    explanation text,
    "regradeImpact" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."QuestionReport" FORCE ROW LEVEL SECURITY;

--
-- Name: Quiz; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Quiz" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    "subjectId" text NOT NULL,
    "classGroupId" text,
    title text NOT NULL,
    instructions text,
    "timeLimitMinutes" integer,
    "passingScore" double precision,
    status public."QuizStatus" DEFAULT 'DRAFT'::public."QuizStatus" NOT NULL,
    "createdById" text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isExamTemplate" boolean DEFAULT false NOT NULL,
    "examWindowStart" timestamp(3) without time zone,
    "examWindowEnd" timestamp(3) without time zone
);

ALTER TABLE ONLY public."Quiz" FORCE ROW LEVEL SECURITY;

--
-- Name: QuizAttempt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuizAttempt" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "quizId" text NOT NULL,
    "studentId" text NOT NULL,
    answers jsonb DEFAULT '[]'::jsonb NOT NULL,
    score double precision DEFAULT 0 NOT NULL,
    "isPassed" boolean DEFAULT false NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone
);

ALTER TABLE ONLY public."QuizAttempt" FORCE ROW LEVEL SECURITY;

--
-- Name: QuizQuestion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuizQuestion" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "quizId" text NOT NULL,
    prompt text NOT NULL,
    "questionType" public."QuestionType" DEFAULT 'MULTIPLE_CHOICE'::public."QuestionType" NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    "correctAnswer" text NOT NULL,
    points integer DEFAULT 1 NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "sourceItemId" text,
    "sourceVersion" integer,
    "exposedToPractice" boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public."QuizQuestion" FORCE ROW LEVEL SECURITY;

--
-- Name: ReceiptCounter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReceiptCounter" (
    "tenantId" text NOT NULL,
    year integer NOT NULL,
    next integer DEFAULT 1 NOT NULL,
    CONSTRAINT "ReceiptCounter_range" CHECK ((((year >= 1900) AND (year <= 9999)) AND (next >= 1)))
);

ALTER TABLE ONLY public."ReceiptCounter" FORCE ROW LEVEL SECURITY;

--
-- Name: ReportRemark; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReportRemark" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "studentId" text NOT NULL,
    "periodId" text NOT NULL,
    "teacherRemark" text,
    "teacherRemarkByUserId" text,
    "principalRemark" text,
    "principalRemarkByUserId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ReportRemark_authors_check" CHECK (((("teacherRemark" IS NULL) = ("teacherRemarkByUserId" IS NULL)) AND (("principalRemark" IS NULL) = ("principalRemarkByUserId" IS NULL)))),
    CONSTRAINT "ReportRemark_present_check" CHECK ((("teacherRemark" IS NOT NULL) OR ("principalRemark" IS NOT NULL))),
    CONSTRAINT "ReportRemark_principal_check" CHECK ((("principalRemark" IS NULL) OR ((char_length("principalRemark") <= 500) AND (char_length(btrim("principalRemark")) > 0)))),
    CONSTRAINT "ReportRemark_teacher_check" CHECK ((("teacherRemark" IS NULL) OR ((char_length("teacherRemark") <= 500) AND (char_length(btrim("teacherRemark")) > 0))))
);

ALTER TABLE ONLY public."ReportRemark" FORCE ROW LEVEL SECURITY;

--
-- Name: Result; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Result" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "studentId" text NOT NULL,
    "subjectId" text NOT NULL,
    "periodId" text NOT NULL,
    score numeric(6,2) NOT NULL,
    "maxScore" numeric(6,2) DEFAULT 100 NOT NULL,
    status public."ResultStatus" DEFAULT 'DRAFT'::public."ResultStatus" NOT NULL,
    "componentScores" jsonb,
    "gradeLetter" text,
    "gradeRemark" text,
    "enteredByStaffId" text,
    "approvedByStaffId" text,
    "publishedAt" timestamp(3) without time zone,
    "lockedAt" timestamp(3) without time zone,
    "verificationToken" text,
    "verificationHash" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Result_maxScore_positive" CHECK (("maxScore" > (0)::numeric)),
    CONSTRAINT "Result_score_range" CHECK (((score >= (0)::numeric) AND (score <= "maxScore")))
);

ALTER TABLE ONLY public."Result" FORCE ROW LEVEL SECURITY;

--
-- Name: ResultApprovalScope; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ResultApprovalScope" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text NOT NULL,
    kind public."ApprovalScopeKind" NOT NULL,
    "sectionId" text,
    "classGroupId" text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ResultApprovalScope_kind_target" CHECK ((((kind = 'GENERAL'::public."ApprovalScopeKind") AND ("sectionId" IS NULL) AND ("classGroupId" IS NULL)) OR ((kind = 'SECTION'::public."ApprovalScopeKind") AND ("sectionId" IS NOT NULL) AND ("classGroupId" IS NULL)) OR ((kind = 'CLASS'::public."ApprovalScopeKind") AND ("classGroupId" IS NOT NULL) AND ("sectionId" IS NULL))))
);

ALTER TABLE ONLY public."ResultApprovalScope" FORCE ROW LEVEL SECURITY;

--
-- Name: ResultAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ResultAudit" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "resultId" text NOT NULL,
    "actorUserId" text NOT NULL,
    "fromStatus" public."ResultStatus" NOT NULL,
    "toStatus" public."ResultStatus" NOT NULL,
    "fromScore" numeric(6,2),
    "toScore" numeric(6,2),
    reason text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."ResultAudit" FORCE ROW LEVEL SECURITY;

--
-- Name: SchoolSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SchoolSettings" (
    "tenantId" text NOT NULL,
    "resultApprovalRequired" boolean DEFAULT true NOT NULL,
    "rolloverMode" public."RolloverMode" DEFAULT 'ADMIN_CONFIRMED'::public."RolloverMode" NOT NULL,
    "classAutoAssignment" boolean DEFAULT false NOT NULL,
    "billingCycle" public."BillingCycle" DEFAULT 'PER_TERM'::public."BillingCycle" NOT NULL,
    "feeReminderEnabled" boolean DEFAULT true NOT NULL,
    "discountWorkflowMode" public."DiscountWorkflowMode" DEFAULT 'MANUAL_OVERRIDE'::public."DiscountWorkflowMode" NOT NULL,
    "feeCostBearer" public."FeeCostBearer" DEFAULT 'SCHOOL_ABSORBS'::public."FeeCostBearer" NOT NULL,
    "multiCampusEnabled" boolean DEFAULT false NOT NULL,
    "mfaRequiredForTeaching" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "unsectionedClassApproval" public."UnsectionedClassApproval" DEFAULT 'GENERAL_OR_CLASS_ONLY'::public."UnsectionedClassApproval" NOT NULL,
    "timeZone" text DEFAULT 'UTC'::text NOT NULL,
    CONSTRAINT "SchoolSettings_timeZone_length" CHECK (((char_length("timeZone") >= 1) AND (char_length("timeZone") <= 64)))
);

ALTER TABLE ONLY public."SchoolSettings" FORCE ROW LEVEL SECURITY;

--
-- Name: Section; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Section" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Section_name_given" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80)))
);

ALTER TABLE ONLY public."Section" FORCE ROW LEVEL SECURITY;

--
-- Name: Session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Session" (
    id text NOT NULL,
    "userId" text NOT NULL,
    expires timestamp(3) without time zone NOT NULL,
    "absoluteExpires" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastUsedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tokenHash" text NOT NULL,
    "userAgent" text,
    "supportTenantId" text,
    "supportOpenedAt" timestamp(3) without time zone,
    CONSTRAINT "Session_support_pair" CHECK ((("supportTenantId" IS NULL) = ("supportOpenedAt" IS NULL)))
);

--
-- Name: SettingsChangeAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SettingsChangeAudit" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "actorUserId" text NOT NULL,
    field text NOT NULL,
    "fromValue" text NOT NULL,
    "toValue" text NOT NULL,
    "stepUpVerifiedAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."SettingsChangeAudit" FORCE ROW LEVEL SECURITY;

--
-- Name: StaffRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StaffRecord" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    "userId" text,
    category public."StaffCategory" NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    phone text,
    email text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "middleName" text,
    gender public."Gender",
    "dateOfBirth" date,
    address text,
    designation text,
    qualification text,
    "employmentDate" date,
    "nextOfKinName" text,
    "nextOfKinRelationship" text,
    "nextOfKinPhone" text,
    "nextOfKinAddress" text,
    standing public."StandingState" DEFAULT 'ACTIVE'::public."StandingState" NOT NULL,
    "standingUntil" date,
    CONSTRAINT "StaffRecord_birth_date_floor" CHECK ((("dateOfBirth" IS NULL) OR ("dateOfBirth" >= '1900-01-01'::date))),
    CONSTRAINT "StaffRecord_email_shape" CHECK (((email IS NULL) OR ((email = lower(email)) AND (length(email) <= 254) AND (email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'::text)))),
    CONSTRAINT "StaffRecord_employment_date_floor" CHECK ((("employmentDate" IS NULL) OR ("employmentDate" >= '1900-01-01'::date))),
    CONSTRAINT "StaffRecord_middle_name_valid" CHECK ((("middleName" IS NULL) OR ((length(btrim("middleName")) >= 1) AND (length(btrim("middleName")) <= 80)))),
    CONSTRAINT "StaffRecord_names_valid" CHECK ((((length(btrim("firstName")) >= 1) AND (length(btrim("firstName")) <= 80)) AND ((length(btrim("lastName")) >= 1) AND (length(btrim("lastName")) <= 80)))),
    CONSTRAINT "StaffRecord_nok_phone_shape" CHECK ((("nextOfKinPhone" IS NULL) OR ("nextOfKinPhone" ~ '^[0-9+() -]{7,20}$'::text))),
    CONSTRAINT "StaffRecord_phone_shape" CHECK (((phone IS NULL) OR (phone ~ '^[0-9+() -]{7,20}$'::text))),
    CONSTRAINT "StaffRecord_standing_check" CHECK (((standing = ANY (ARRAY['ACTIVE'::public."StandingState", 'SUSPENDED'::public."StandingState", 'TERMINATED'::public."StandingState"])) AND (("standingUntil" IS NULL) OR (standing = 'SUSPENDED'::public."StandingState"))))
);

ALTER TABLE ONLY public."StaffRecord" FORCE ROW LEVEL SECURITY;

--
-- Name: StaffSubjectAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StaffSubjectAssignment" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "staffRecordId" text NOT NULL,
    "subjectId" text NOT NULL,
    "classArmId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."StaffSubjectAssignment" FORCE ROW LEVEL SECURITY;

--
-- Name: StandingEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StandingEvent" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    subject public."StandingSubject" NOT NULL,
    "studentId" text,
    "staffRecordId" text,
    "memberUserId" text,
    "campusId" text,
    action public."StandingEventAction" NOT NULL,
    reason text NOT NULL,
    "startsOn" date NOT NULL,
    "endsOn" date,
    "decidedByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "participantId" text,
    CONSTRAINT "StandingEvent_action_check" CHECK ((((action <> 'EXPELLED'::public."StandingEventAction") OR (subject = ANY (ARRAY['STUDENT'::public."StandingSubject", 'PARTICIPANT'::public."StandingSubject"]))) AND ((action <> 'TERMINATED'::public."StandingEventAction") OR (subject = 'STAFF'::public."StandingSubject")))),
    CONSTRAINT "StandingEvent_reason_check" CHECK (((char_length(reason) >= 3) AND (char_length(reason) <= 500))),
    CONSTRAINT "StandingEvent_subject_check" CHECK ((((subject = 'STUDENT'::public."StandingSubject") AND ("studentId" IS NOT NULL) AND ("staffRecordId" IS NULL) AND ("memberUserId" IS NULL) AND ("participantId" IS NULL)) OR ((subject = 'STAFF'::public."StandingSubject") AND ("studentId" IS NULL) AND (("staffRecordId" IS NOT NULL) OR ("memberUserId" IS NOT NULL)) AND ("participantId" IS NULL)) OR ((subject = 'PARTICIPANT'::public."StandingSubject") AND ("participantId" IS NOT NULL) AND ("studentId" IS NULL) AND ("staffRecordId" IS NULL) AND ("memberUserId" IS NULL))))
);

ALTER TABLE ONLY public."StandingEvent" FORCE ROW LEVEL SECURITY;

--
-- Name: StudentEnrollment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StudentEnrollment" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "studentId" text NOT NULL,
    "sessionId" text NOT NULL,
    "classArmId" text NOT NULL,
    status public."EnrollmentStatus" DEFAULT 'ACTIVE'::public."EnrollmentStatus" NOT NULL,
    "enrolledAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."StudentEnrollment" FORCE ROW LEVEL SECURITY;

--
-- Name: StudentRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StudentRecord" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    "userId" text,
    "firstName" text NOT NULL,
    "middleName" text,
    "lastName" text NOT NULL,
    "dateOfBirth" date NOT NULL,
    "admissionNo" text NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    gender public."Gender",
    standing public."StandingState" DEFAULT 'ACTIVE'::public."StandingState" NOT NULL,
    "standingUntil" date,
    CONSTRAINT "StudentRecord_admission_no_shape" CHECK (("admissionNo" ~ '^[A-Za-z0-9][A-Za-z0-9/.-]{0,29}$'::text)),
    CONSTRAINT "StudentRecord_birth_date_floor" CHECK (("dateOfBirth" >= '1900-01-01'::date)),
    CONSTRAINT "StudentRecord_names_valid" CHECK ((((length(btrim("firstName")) >= 1) AND (length(btrim("firstName")) <= 80)) AND ((length(btrim("lastName")) >= 1) AND (length(btrim("lastName")) <= 80)) AND (("middleName" IS NULL) OR ((length(btrim("middleName")) >= 1) AND (length(btrim("middleName")) <= 80))))),
    CONSTRAINT "StudentRecord_standing_check" CHECK (((standing = ANY (ARRAY['ACTIVE'::public."StandingState", 'SUSPENDED'::public."StandingState", 'EXPELLED'::public."StandingState"])) AND (("standingUntil" IS NULL) OR (standing = 'SUSPENDED'::public."StandingState"))))
);

ALTER TABLE ONLY public."StudentRecord" FORCE ROW LEVEL SECURITY;

--
-- Name: Subject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Subject" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    code text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Subject_code_shape" CHECK (((code IS NULL) OR (code ~ '^[A-Z0-9]{1,12}$'::text))),
    CONSTRAINT "Subject_name_not_blank" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80)))
);

ALTER TABLE ONLY public."Subject" FORCE ROW LEVEL SECURITY;

--
-- Name: SubjectOffering; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SubjectOffering" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "classGroupId" text NOT NULL,
    "subjectId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."SubjectOffering" FORCE ROW LEVEL SECURITY;

--
-- Name: SupportGrant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SupportGrant" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "granteeUserId" text,
    areas text[] NOT NULL,
    reason text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "SupportGrant_areas_grantable" CHECK (((cardinality(areas) > 0) AND (areas <@ ARRAY['settings'::text, 'academics'::text, 'people'::text, 'attendance'::text, 'results'::text]))),
    CONSTRAINT "SupportGrant_expiry_window" CHECK ((("expiresAt" > "createdAt") AND ("expiresAt" <= ("createdAt" + '24:00:00'::interval)))),
    CONSTRAINT "SupportGrant_reason_given" CHECK ((length(btrim(reason)) > 0))
);

ALTER TABLE ONLY public."SupportGrant" FORCE ROW LEVEL SECURITY;

--
-- Name: SystemSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SystemSettings" (
    id text DEFAULT 'global'::text NOT NULL,
    "setupComplete" boolean DEFAULT false NOT NULL
);

--
-- Name: Tenant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Tenant" (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "schoolType" public."SchoolType" DEFAULT 'K12'::public."SchoolType" NOT NULL,
    "suspendedAt" timestamp(3) without time zone
);

--
-- Name: TenantMembership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TenantMembership" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    role public."Role" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deactivatedAt" timestamp(3) without time zone,
    permissions public."Permission"[] DEFAULT ARRAY[]::public."Permission"[] NOT NULL,
    standing public."StandingState" DEFAULT 'ACTIVE'::public."StandingState" NOT NULL,
    "standingUntil" date,
    CONSTRAINT "TenantMembership_campus_admin_has_campus" CHECK (((role <> 'CAMPUS_ADMIN'::public."Role") OR ("campusId" IS NOT NULL))),
    CONSTRAINT "TenantMembership_permissions_staff_only" CHECK (((permissions = ARRAY[]::public."Permission"[]) OR (role = ANY (ARRAY['TEACHING_STAFF'::public."Role", 'NON_TEACHING_STAFF'::public."Role"])))),
    CONSTRAINT "TenantMembership_standing_check" CHECK (((standing = ANY (ARRAY['ACTIVE'::public."StandingState", 'SUSPENDED'::public."StandingState", 'TERMINATED'::public."StandingState"])) AND (("standingUntil" IS NULL) OR (standing = 'SUSPENDED'::public."StandingState"))))
);

ALTER TABLE ONLY public."TenantMembership" FORCE ROW LEVEL SECURITY;

--
-- Name: TenantSetting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TenantSetting" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "campusId" text,
    key text NOT NULL,
    value jsonb NOT NULL,
    "updatedById" text NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "TenantSetting_key" CHECK ((((length(key) >= 1) AND (length(key) <= 80)) AND (key ~ '^[a-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$'::text))),
    CONSTRAINT "TenantSetting_value_size" CHECK ((pg_column_size(value) <= 4096))
);

ALTER TABLE ONLY public."TenantSetting" FORCE ROW LEVEL SECURITY;

--
-- Name: TenantStats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TenantStats" (
    "tenantId" text NOT NULL,
    "activeMembers" integer DEFAULT 0 NOT NULL,
    "activeAdmins" integer DEFAULT 0 NOT NULL,
    students integer DEFAULT 0 NOT NULL,
    campuses integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public."TenantStats" FORCE ROW LEVEL SECURITY;

--
-- Name: TimetableSlot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TimetableSlot" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "classArmId" text NOT NULL,
    "subjectId" text NOT NULL,
    "staffRecordId" text NOT NULL,
    "dayOfWeek" integer NOT NULL,
    "periodNumber" integer,
    "startTime" text NOT NULL,
    "endTime" text NOT NULL,
    room text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "TimetableSlot_dayOfWeek_valid" CHECK ((("dayOfWeek" >= 1) AND ("dayOfWeek" <= 7))),
    CONSTRAINT "TimetableSlot_time_order" CHECK (("startTime" < "endTime"))
);

ALTER TABLE ONLY public."TimetableSlot" FORCE ROW LEVEL SECURITY;

--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    name text,
    email text,
    "emailVerified" timestamp(3) without time zone,
    image text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "passwordHash" text,
    "isPlatformAdmin" boolean DEFAULT false NOT NULL,
    CONSTRAINT "User_email_lowercase_check" CHECK ((email = lower(email)))
);

--
-- Name: AcademicPeriod AcademicPeriod_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicPeriod"
    ADD CONSTRAINT "AcademicPeriod_pkey" PRIMARY KEY (id);

--
-- Name: AcademicSession AcademicSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicSession"
    ADD CONSTRAINT "AcademicSession_pkey" PRIMARY KEY (id);

--
-- Name: AdmissionCounter AdmissionCounter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdmissionCounter"
    ADD CONSTRAINT "AdmissionCounter_pkey" PRIMARY KEY ("tenantId", year);

--
-- Name: Announcement Announcement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Announcement"
    ADD CONSTRAINT "Announcement_pkey" PRIMARY KEY (id);

--
-- Name: AssessmentComponent AssessmentComponent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentComponent"
    ADD CONSTRAINT "AssessmentComponent_pkey" PRIMARY KEY (id);

--
-- Name: AssessmentScheme AssessmentScheme_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentScheme"
    ADD CONSTRAINT "AssessmentScheme_pkey" PRIMARY KEY (id);

--
-- Name: AssignmentSubmission AssignmentSubmission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentSubmission"
    ADD CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY (id);

--
-- Name: Assignment Assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_pkey" PRIMARY KEY (id);

--
-- Name: AttendanceRecord AttendanceRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttendanceRecord"
    ADD CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY (id);

--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);

--
-- Name: Campus Campus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campus"
    ADD CONSTRAINT "Campus_pkey" PRIMARY KEY (id);

--
-- Name: Certificate Certificate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Certificate"
    ADD CONSTRAINT "Certificate_pkey" PRIMARY KEY (id);

--
-- Name: ClassArm ClassArm_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassArm"
    ADD CONSTRAINT "ClassArm_pkey" PRIMARY KEY (id);

--
-- Name: ClassGroup ClassGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassGroup"
    ADD CONSTRAINT "ClassGroup_pkey" PRIMARY KEY (id);

--
-- Name: CourseRegistration CourseRegistration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CourseRegistration"
    ADD CONSTRAINT "CourseRegistration_pkey" PRIMARY KEY (id);

--
-- Name: Course Course_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Course"
    ADD CONSTRAINT "Course_pkey" PRIMARY KEY (id);

--
-- Name: CustomDomain CustomDomain_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomDomain"
    ADD CONSTRAINT "CustomDomain_pkey" PRIMARY KEY (id);

--
-- Name: Department Department_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Department"
    ADD CONSTRAINT "Department_pkey" PRIMARY KEY (id);

--
-- Name: EmailChangeToken EmailChangeToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailChangeToken"
    ADD CONSTRAINT "EmailChangeToken_pkey" PRIMARY KEY (id);

--
-- Name: FeeStructure FeeStructure_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FeeStructure"
    ADD CONSTRAINT "FeeStructure_pkey" PRIMARY KEY (id);

--
-- Name: FormAnswer FormAnswer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAnswer"
    ADD CONSTRAINT "FormAnswer_pkey" PRIMARY KEY (id);

--
-- Name: FormAudience FormAudience_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAudience"
    ADD CONSTRAINT "FormAudience_pkey" PRIMARY KEY (id);

--
-- Name: FormMarkingAudit FormMarkingAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormMarkingAudit"
    ADD CONSTRAINT "FormMarkingAudit_pkey" PRIMARY KEY (id);

--
-- Name: FormParticipation FormParticipation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormParticipation"
    ADD CONSTRAINT "FormParticipation_pkey" PRIMARY KEY (id);

--
-- Name: FormQuestion FormQuestion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormQuestion"
    ADD CONSTRAINT "FormQuestion_pkey" PRIMARY KEY (id);

--
-- Name: FormResponse FormResponse_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_pkey" PRIMARY KEY (id);

--
-- Name: FormTurnInAudit FormTurnInAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnInAudit"
    ADD CONSTRAINT "FormTurnInAudit_pkey" PRIMARY KEY (id);

--
-- Name: FormTurnIn FormTurnIn_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnIn"
    ADD CONSTRAINT "FormTurnIn_pkey" PRIMARY KEY (id);

--
-- Name: Form Form_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_pkey" PRIMARY KEY (id);

--
-- Name: GradeBand GradeBand_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GradeBand"
    ADD CONSTRAINT "GradeBand_pkey" PRIMARY KEY (id);

--
-- Name: GradeScale GradeScale_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GradeScale"
    ADD CONSTRAINT "GradeScale_pkey" PRIMARY KEY (id);

--
-- Name: GuardianLinkToken GuardianLinkToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianLinkToken"
    ADD CONSTRAINT "GuardianLinkToken_pkey" PRIMARY KEY (id);

--
-- Name: GuardianLink GuardianLink_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianLink"
    ADD CONSTRAINT "GuardianLink_pkey" PRIMARY KEY (id);

--
-- Name: GuardianRecord GuardianRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianRecord"
    ADD CONSTRAINT "GuardianRecord_pkey" PRIMARY KEY (id);

--
-- Name: Invitation Invitation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_pkey" PRIMARY KEY (id);

--
-- Name: InvoiceDiscount InvoiceDiscount_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InvoiceDiscount"
    ADD CONSTRAINT "InvoiceDiscount_pkey" PRIMARY KEY (id);

--
-- Name: Invoice Invoice_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_pkey" PRIMARY KEY (id);

--
-- Name: LearningMaterial LearningMaterial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LearningMaterial"
    ADD CONSTRAINT "LearningMaterial_pkey" PRIMARY KEY (id);

--
-- Name: MfaChallenge MfaChallenge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MfaChallenge"
    ADD CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY (id);

--
-- Name: MfaCredential MfaCredential_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MfaCredential"
    ADD CONSTRAINT "MfaCredential_pkey" PRIMARY KEY (id);

--
-- Name: MfaRecoveryCode MfaRecoveryCode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MfaRecoveryCode"
    ADD CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY (id);

--
-- Name: NotificationAuditLog NotificationAuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationAuditLog"
    ADD CONSTRAINT "NotificationAuditLog_pkey" PRIMARY KEY (id);

--
-- Name: NotificationDispatch NotificationDispatch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationDispatch"
    ADD CONSTRAINT "NotificationDispatch_pkey" PRIMARY KEY (id);

--
-- Name: NotificationTemplate NotificationTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationTemplate"
    ADD CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY (id);

--
-- Name: PasswordResetToken PasswordResetToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY (id);

--
-- Name: PaymentWebhookEvent PaymentWebhookEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PaymentWebhookEvent"
    ADD CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY (id);

--
-- Name: Payment Payment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_pkey" PRIMARY KEY (id);

--
-- Name: PlatformAuditLog PlatformAuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlatformAuditLog"
    ADD CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY (id);

--
-- Name: PracticeAttempt PracticeAttempt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeAttempt"
    ADD CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY (id);

--
-- Name: PracticeSession PracticeSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeSession"
    ADD CONSTRAINT "PracticeSession_pkey" PRIMARY KEY (id);

--
-- Name: ProgramAssessmentGroup ProgramAssessmentGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAssessmentGroup"
    ADD CONSTRAINT "ProgramAssessmentGroup_pkey" PRIMARY KEY ("assessmentId", "groupId");

--
-- Name: ProgramAssessment ProgramAssessment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAssessment"
    ADD CONSTRAINT "ProgramAssessment_pkey" PRIMARY KEY (id);

--
-- Name: ProgramAttendanceChange ProgramAttendanceChange_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAttendanceChange"
    ADD CONSTRAINT "ProgramAttendanceChange_pkey" PRIMARY KEY (id);

--
-- Name: ProgramAttendance ProgramAttendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAttendance"
    ADD CONSTRAINT "ProgramAttendance_pkey" PRIMARY KEY (id);

--
-- Name: ProgramAudit ProgramAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAudit"
    ADD CONSTRAINT "ProgramAudit_pkey" PRIMARY KEY (id);

--
-- Name: ProgramCampus ProgramCampus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramCampus"
    ADD CONSTRAINT "ProgramCampus_pkey" PRIMARY KEY ("programId", "campusId");

--
-- Name: ProgramCertificate ProgramCertificate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramCertificate"
    ADD CONSTRAINT "ProgramCertificate_pkey" PRIMARY KEY (id);

--
-- Name: ProgramCounter ProgramCounter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramCounter"
    ADD CONSTRAINT "ProgramCounter_pkey" PRIMARY KEY ("tenantId", kind, year);

--
-- Name: ProgramFeeExemption ProgramFeeExemption_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramFeeExemption"
    ADD CONSTRAINT "ProgramFeeExemption_pkey" PRIMARY KEY ("feeItemId", "participantId");

--
-- Name: ProgramFeeItem ProgramFeeItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramFeeItem"
    ADD CONSTRAINT "ProgramFeeItem_pkey" PRIMARY KEY (id);

--
-- Name: ProgramGroup ProgramGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramGroup"
    ADD CONSTRAINT "ProgramGroup_pkey" PRIMARY KEY (id);

--
-- Name: ProgramInvoiceDiscount ProgramInvoiceDiscount_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramInvoiceDiscount"
    ADD CONSTRAINT "ProgramInvoiceDiscount_pkey" PRIMARY KEY (id);

--
-- Name: ProgramInvoice ProgramInvoice_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramInvoice"
    ADD CONSTRAINT "ProgramInvoice_pkey" PRIMARY KEY (id);

--
-- Name: ProgramLevelLabel ProgramLevelLabel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramLevelLabel"
    ADD CONSTRAINT "ProgramLevelLabel_pkey" PRIMARY KEY ("programId", "levelIndex");

--
-- Name: ProgramParticipant ProgramParticipant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramParticipant"
    ADD CONSTRAINT "ProgramParticipant_pkey" PRIMARY KEY (id);

--
-- Name: ProgramPayment ProgramPayment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramPayment"
    ADD CONSTRAINT "ProgramPayment_pkey" PRIMARY KEY (id);

--
-- Name: ProgramScoreChange ProgramScoreChange_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramScoreChange"
    ADD CONSTRAINT "ProgramScoreChange_pkey" PRIMARY KEY (id);

--
-- Name: ProgramScore ProgramScore_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramScore"
    ADD CONSTRAINT "ProgramScore_pkey" PRIMARY KEY (id);

--
-- Name: ProgramSession ProgramSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramSession"
    ADD CONSTRAINT "ProgramSession_pkey" PRIMARY KEY (id);

--
-- Name: ProgramStaffGroup ProgramStaffGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramStaffGroup"
    ADD CONSTRAINT "ProgramStaffGroup_pkey" PRIMARY KEY ("programStaffId", "groupId");

--
-- Name: ProgramStaff ProgramStaff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramStaff"
    ADD CONSTRAINT "ProgramStaff_pkey" PRIMARY KEY (id);

--
-- Name: Program Program_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Program"
    ADD CONSTRAINT "Program_pkey" PRIMARY KEY (id);

--
-- Name: ProgressEntryRevision ProgressEntryRevision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressEntryRevision"
    ADD CONSTRAINT "ProgressEntryRevision_pkey" PRIMARY KEY (id);

--
-- Name: ProgressEntry ProgressEntry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressEntry"
    ADD CONSTRAINT "ProgressEntry_pkey" PRIMARY KEY (id);

--
-- Name: ProgressLock ProgressLock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressLock"
    ADD CONSTRAINT "ProgressLock_pkey" PRIMARY KEY ("entryId");

--
-- Name: ProgressRecord ProgressRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressRecord"
    ADD CONSTRAINT "ProgressRecord_pkey" PRIMARY KEY (id);

--
-- Name: ProgressSeen ProgressSeen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressSeen"
    ADD CONSTRAINT "ProgressSeen_pkey" PRIMARY KEY (id);

--
-- Name: ProgressTemplate ProgressTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressTemplate"
    ADD CONSTRAINT "ProgressTemplate_pkey" PRIMARY KEY (id);

--
-- Name: PromotionBatch PromotionBatch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionBatch"
    ADD CONSTRAINT "PromotionBatch_pkey" PRIMARY KEY (id);

--
-- Name: PromotionRecord PromotionRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionRecord"
    ADD CONSTRAINT "PromotionRecord_pkey" PRIMARY KEY (id);

--
-- Name: PromotionReversal PromotionReversal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionReversal"
    ADD CONSTRAINT "PromotionReversal_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankAudit QuestionBankAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankAudit"
    ADD CONSTRAINT "QuestionBankAudit_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankClassTag QuestionBankClassTag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankClassTag"
    ADD CONSTRAINT "QuestionBankClassTag_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankImage QuestionBankImage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankImage"
    ADD CONSTRAINT "QuestionBankImage_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankItemVersion QuestionBankItemVersion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItemVersion"
    ADD CONSTRAINT "QuestionBankItemVersion_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankItem QuestionBankItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItem"
    ADD CONSTRAINT "QuestionBankItem_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankPrintLog QuestionBankPrintLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankPrintLog"
    ADD CONSTRAINT "QuestionBankPrintLog_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankReview QuestionBankReview_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReview"
    ADD CONSTRAINT "QuestionBankReview_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankReviewer QuestionBankReviewer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReviewer"
    ADD CONSTRAINT "QuestionBankReviewer_pkey" PRIMARY KEY (id);

--
-- Name: QuestionBankSetting QuestionBankSetting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankSetting"
    ADD CONSTRAINT "QuestionBankSetting_pkey" PRIMARY KEY (id);

--
-- Name: QuestionOverlapFlag QuestionOverlapFlag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionOverlapFlag"
    ADD CONSTRAINT "QuestionOverlapFlag_pkey" PRIMARY KEY (id);

--
-- Name: QuestionReport QuestionReport_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionReport"
    ADD CONSTRAINT "QuestionReport_pkey" PRIMARY KEY (id);

--
-- Name: QuizAttempt QuizAttempt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizAttempt"
    ADD CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY (id);

--
-- Name: QuizQuestion QuizQuestion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizQuestion"
    ADD CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY (id);

--
-- Name: Quiz Quiz_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Quiz"
    ADD CONSTRAINT "Quiz_pkey" PRIMARY KEY (id);

--
-- Name: ReceiptCounter ReceiptCounter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReceiptCounter"
    ADD CONSTRAINT "ReceiptCounter_pkey" PRIMARY KEY ("tenantId", year);

--
-- Name: ReportRemark ReportRemark_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRemark"
    ADD CONSTRAINT "ReportRemark_pkey" PRIMARY KEY (id);

--
-- Name: ResultApprovalScope ResultApprovalScope_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultApprovalScope"
    ADD CONSTRAINT "ResultApprovalScope_pkey" PRIMARY KEY (id);

--
-- Name: ResultAudit ResultAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultAudit"
    ADD CONSTRAINT "ResultAudit_pkey" PRIMARY KEY (id);

--
-- Name: Result Result_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_pkey" PRIMARY KEY (id);

--
-- Name: SchoolSettings SchoolSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SchoolSettings"
    ADD CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY ("tenantId");

--
-- Name: Section Section_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Section"
    ADD CONSTRAINT "Section_pkey" PRIMARY KEY (id);

--
-- Name: Session Session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);

--
-- Name: SettingsChangeAudit SettingsChangeAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SettingsChangeAudit"
    ADD CONSTRAINT "SettingsChangeAudit_pkey" PRIMARY KEY (id);

--
-- Name: StaffRecord StaffRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffRecord"
    ADD CONSTRAINT "StaffRecord_pkey" PRIMARY KEY (id);

--
-- Name: StaffSubjectAssignment StaffSubjectAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffSubjectAssignment"
    ADD CONSTRAINT "StaffSubjectAssignment_pkey" PRIMARY KEY (id);

--
-- Name: StandingEvent StandingEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StandingEvent"
    ADD CONSTRAINT "StandingEvent_pkey" PRIMARY KEY (id);

--
-- Name: StudentEnrollment StudentEnrollment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentEnrollment"
    ADD CONSTRAINT "StudentEnrollment_pkey" PRIMARY KEY (id);

--
-- Name: StudentRecord StudentRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentRecord"
    ADD CONSTRAINT "StudentRecord_pkey" PRIMARY KEY (id);

--
-- Name: SubjectOffering SubjectOffering_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SubjectOffering"
    ADD CONSTRAINT "SubjectOffering_pkey" PRIMARY KEY (id);

--
-- Name: Subject Subject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Subject"
    ADD CONSTRAINT "Subject_pkey" PRIMARY KEY (id);

--
-- Name: SupportGrant SupportGrant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupportGrant"
    ADD CONSTRAINT "SupportGrant_pkey" PRIMARY KEY (id);

--
-- Name: SystemSettings SystemSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SystemSettings"
    ADD CONSTRAINT "SystemSettings_pkey" PRIMARY KEY (id);

--
-- Name: TenantMembership TenantMembership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantMembership"
    ADD CONSTRAINT "TenantMembership_pkey" PRIMARY KEY (id);

--
-- Name: TenantSetting TenantSetting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantSetting"
    ADD CONSTRAINT "TenantSetting_pkey" PRIMARY KEY (id);

--
-- Name: TenantStats TenantStats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantStats"
    ADD CONSTRAINT "TenantStats_pkey" PRIMARY KEY ("tenantId");

--
-- Name: Tenant Tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tenant"
    ADD CONSTRAINT "Tenant_pkey" PRIMARY KEY (id);

--
-- Name: TimetableSlot TimetableSlot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimetableSlot"
    ADD CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY (id);

--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);

--
-- Name: AcademicPeriod_label_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AcademicPeriod_label_live" ON public."AcademicPeriod" USING btree ("sessionId", label) WHERE ("archivedAt" IS NULL);

--
-- Name: AcademicPeriod_one_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AcademicPeriod_one_current" ON public."AcademicPeriod" USING btree ("sessionId") WHERE ("isCurrent" AND ("archivedAt" IS NULL));

--
-- Name: AcademicPeriod_ordinal_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AcademicPeriod_ordinal_live" ON public."AcademicPeriod" USING btree ("sessionId", ordinal) WHERE ("archivedAt" IS NULL);

--
-- Name: AcademicPeriod_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AcademicPeriod_tenantId_id_key" ON public."AcademicPeriod" USING btree ("tenantId", id);

--
-- Name: AcademicPeriod_tenantId_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AcademicPeriod_tenantId_sessionId_idx" ON public."AcademicPeriod" USING btree ("tenantId", "sessionId");

--
-- Name: AcademicSession_label_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AcademicSession_label_live" ON public."AcademicSession" USING btree ("tenantId", COALESCE("campusId", ''::text), label) WHERE ("archivedAt" IS NULL);

--
-- Name: AcademicSession_one_active_per_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AcademicSession_one_active_per_scope" ON public."AcademicSession" USING btree ("tenantId", COALESCE("campusId", ''::text)) WHERE ((status = 'ACTIVE'::public."SessionStatus") AND ("archivedAt" IS NULL));

--
-- Name: AcademicSession_one_live_copy; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AcademicSession_one_live_copy" ON public."AcademicSession" USING btree ("tenantId", "copiedFromId") WHERE (("copiedFromId" IS NOT NULL) AND ("archivedAt" IS NULL));

--
-- Name: AcademicSession_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AcademicSession_tenantId_id_key" ON public."AcademicSession" USING btree ("tenantId", id);

--
-- Name: AcademicSession_tenantId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AcademicSession_tenantId_status_idx" ON public."AcademicSession" USING btree ("tenantId", status);

--
-- Name: Announcement_tenantId_campusId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Announcement_tenantId_campusId_idx" ON public."Announcement" USING btree ("tenantId", "campusId");

--
-- Name: Announcement_tenantId_classArmId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Announcement_tenantId_classArmId_idx" ON public."Announcement" USING btree ("tenantId", "classArmId");

--
-- Name: Announcement_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Announcement_tenantId_id_key" ON public."Announcement" USING btree ("tenantId", id);

--
-- Name: Announcement_tenantId_publishedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Announcement_tenantId_publishedAt_idx" ON public."Announcement" USING btree ("tenantId", "publishedAt");

--
-- Name: Announcement_tenantId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Announcement_tenantId_status_idx" ON public."Announcement" USING btree ("tenantId", status);

--
-- Name: AssessmentComponent_name_per_scheme; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssessmentComponent_name_per_scheme" ON public."AssessmentComponent" USING btree ("schemeId", lower(name));

--
-- Name: AssessmentComponent_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssessmentComponent_tenantId_id_key" ON public."AssessmentComponent" USING btree ("tenantId", id);

--
-- Name: AssessmentComponent_tenantId_schemeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssessmentComponent_tenantId_schemeId_idx" ON public."AssessmentComponent" USING btree ("tenantId", "schemeId");

--
-- Name: AssessmentScheme_name_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssessmentScheme_name_live" ON public."AssessmentScheme" USING btree ("tenantId", name) WHERE ("archivedAt" IS NULL);

--
-- Name: AssessmentScheme_one_live_per_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssessmentScheme_one_live_per_scope" ON public."AssessmentScheme" USING btree ("tenantId", COALESCE("classGroupId", ''::text)) WHERE ("archivedAt" IS NULL);

--
-- Name: AssessmentScheme_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssessmentScheme_tenantId_id_key" ON public."AssessmentScheme" USING btree ("tenantId", id);

--
-- Name: AssessmentScheme_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssessmentScheme_tenantId_idx" ON public."AssessmentScheme" USING btree ("tenantId");

--
-- Name: AssignmentSubmission_tenantId_assignmentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssignmentSubmission_tenantId_assignmentId_idx" ON public."AssignmentSubmission" USING btree ("tenantId", "assignmentId");

--
-- Name: AssignmentSubmission_tenantId_assignmentId_studentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssignmentSubmission_tenantId_assignmentId_studentId_key" ON public."AssignmentSubmission" USING btree ("tenantId", "assignmentId", "studentId");

--
-- Name: AssignmentSubmission_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AssignmentSubmission_tenantId_id_key" ON public."AssignmentSubmission" USING btree ("tenantId", id);

--
-- Name: AssignmentSubmission_tenantId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssignmentSubmission_tenantId_status_idx" ON public."AssignmentSubmission" USING btree ("tenantId", status);

--
-- Name: AssignmentSubmission_tenantId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssignmentSubmission_tenantId_studentId_idx" ON public."AssignmentSubmission" USING btree ("tenantId", "studentId");

--
-- Name: Assignment_tenantId_classArmId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Assignment_tenantId_classArmId_idx" ON public."Assignment" USING btree ("tenantId", "classArmId");

--
-- Name: Assignment_tenantId_classGroupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Assignment_tenantId_classGroupId_idx" ON public."Assignment" USING btree ("tenantId", "classGroupId");

--
-- Name: Assignment_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Assignment_tenantId_id_key" ON public."Assignment" USING btree ("tenantId", id);

--
-- Name: Assignment_tenantId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Assignment_tenantId_status_idx" ON public."Assignment" USING btree ("tenantId", status);

--
-- Name: Assignment_tenantId_subjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Assignment_tenantId_subjectId_idx" ON public."Assignment" USING btree ("tenantId", "subjectId");

--
-- Name: AttendanceRecord_tenantId_classArmId_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AttendanceRecord_tenantId_classArmId_date_idx" ON public."AttendanceRecord" USING btree ("tenantId", "classArmId", date);

--
-- Name: AttendanceRecord_tenantId_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AttendanceRecord_tenantId_date_idx" ON public."AttendanceRecord" USING btree ("tenantId", date);

--
-- Name: AttendanceRecord_tenantId_studentId_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AttendanceRecord_tenantId_studentId_date_idx" ON public."AttendanceRecord" USING btree ("tenantId", "studentId", date);

--
-- Name: AttendanceRecord_tenantId_studentId_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AttendanceRecord_tenantId_studentId_date_key" ON public."AttendanceRecord" USING btree ("tenantId", "studentId", date);

--
-- Name: AuditLog_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON public."AuditLog" USING btree ("tenantId", "createdAt");

--
-- Name: AuditLog_tenantId_targetType_targetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_tenantId_targetType_targetId_idx" ON public."AuditLog" USING btree ("tenantId", "targetType", "targetId");

--
-- Name: Campus_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Campus_tenantId_id_key" ON public."Campus" USING btree ("tenantId", id);

--
-- Name: Campus_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Campus_tenantId_idx" ON public."Campus" USING btree ("tenantId");

--
-- Name: Campus_tenantId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Campus_tenantId_name_key" ON public."Campus" USING btree ("tenantId", name);

--
-- Name: Certificate_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Certificate_studentId_idx" ON public."Certificate" USING btree ("studentId");

--
-- Name: Certificate_tenantId_certificateNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Certificate_tenantId_certificateNo_key" ON public."Certificate" USING btree ("tenantId", "certificateNo");

--
-- Name: Certificate_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Certificate_tenantId_idx" ON public."Certificate" USING btree ("tenantId");

--
-- Name: Certificate_verificationHash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Certificate_verificationHash_idx" ON public."Certificate" USING btree ("verificationHash");

--
-- Name: Certificate_verificationToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Certificate_verificationToken_key" ON public."Certificate" USING btree ("verificationToken");

--
-- Name: ClassArm_name_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ClassArm_name_live" ON public."ClassArm" USING btree ("classGroupId", name) WHERE ("archivedAt" IS NULL);

--
-- Name: ClassArm_tenantId_classGroupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ClassArm_tenantId_classGroupId_idx" ON public."ClassArm" USING btree ("tenantId", "classGroupId");

--
-- Name: ClassArm_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ClassArm_tenantId_id_key" ON public."ClassArm" USING btree ("tenantId", id);

--
-- Name: ClassGroup_name_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ClassGroup_name_live" ON public."ClassGroup" USING btree ("tenantId", COALESCE("campusId", ''::text), name) WHERE ("archivedAt" IS NULL);

--
-- Name: ClassGroup_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ClassGroup_tenantId_id_key" ON public."ClassGroup" USING btree ("tenantId", id);

--
-- Name: ClassGroup_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ClassGroup_tenantId_idx" ON public."ClassGroup" USING btree ("tenantId");

--
-- Name: ClassGroup_tenantId_sectionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ClassGroup_tenantId_sectionId_idx" ON public."ClassGroup" USING btree ("tenantId", "sectionId");

--
-- Name: CourseRegistration_courseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CourseRegistration_courseId_idx" ON public."CourseRegistration" USING btree ("courseId");

--
-- Name: CourseRegistration_periodId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CourseRegistration_periodId_idx" ON public."CourseRegistration" USING btree ("periodId");

--
-- Name: CourseRegistration_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CourseRegistration_studentId_idx" ON public."CourseRegistration" USING btree ("studentId");

--
-- Name: CourseRegistration_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CourseRegistration_tenantId_idx" ON public."CourseRegistration" USING btree ("tenantId");

--
-- Name: CourseRegistration_tenantId_studentId_courseId_periodId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CourseRegistration_tenantId_studentId_courseId_periodId_key" ON public."CourseRegistration" USING btree ("tenantId", "studentId", "courseId", "periodId");

--
-- Name: Course_departmentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Course_departmentId_idx" ON public."Course" USING btree ("departmentId");

--
-- Name: Course_tenantId_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Course_tenantId_code_key" ON public."Course" USING btree ("tenantId", code);

--
-- Name: Course_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Course_tenantId_id_key" ON public."Course" USING btree ("tenantId", id);

--
-- Name: Course_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Course_tenantId_idx" ON public."Course" USING btree ("tenantId");

--
-- Name: CustomDomain_domain_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CustomDomain_domain_key" ON public."CustomDomain" USING btree (domain);

--
-- Name: CustomDomain_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CustomDomain_tenantId_id_key" ON public."CustomDomain" USING btree ("tenantId", id);

--
-- Name: CustomDomain_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomDomain_tenantId_idx" ON public."CustomDomain" USING btree ("tenantId");

--
-- Name: Department_tenantId_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Department_tenantId_code_key" ON public."Department" USING btree ("tenantId", code);

--
-- Name: Department_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Department_tenantId_id_key" ON public."Department" USING btree ("tenantId", id);

--
-- Name: Department_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Department_tenantId_idx" ON public."Department" USING btree ("tenantId");

--
-- Name: EmailChangeToken_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EmailChangeToken_tokenHash_key" ON public."EmailChangeToken" USING btree ("tokenHash");

--
-- Name: EmailChangeToken_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmailChangeToken_userId_idx" ON public."EmailChangeToken" USING btree ("userId");

--
-- Name: FeeStructure_tenantId_classGroupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FeeStructure_tenantId_classGroupId_idx" ON public."FeeStructure" USING btree ("tenantId", "classGroupId");

--
-- Name: FeeStructure_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FeeStructure_tenantId_id_key" ON public."FeeStructure" USING btree ("tenantId", id);

--
-- Name: FeeStructure_tenantId_periodId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FeeStructure_tenantId_periodId_idx" ON public."FeeStructure" USING btree ("tenantId", "periodId");

--
-- Name: FormAnswer_tenantId_formQuestionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormAnswer_tenantId_formQuestionId_idx" ON public."FormAnswer" USING btree ("tenantId", "formQuestionId");

--
-- Name: FormAnswer_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormAnswer_tenantId_id_key" ON public."FormAnswer" USING btree ("tenantId", id);

--
-- Name: FormAnswer_tenantId_markingStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormAnswer_tenantId_markingStatus_idx" ON public."FormAnswer" USING btree ("tenantId", "markingStatus");

--
-- Name: FormAnswer_tenantId_responseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormAnswer_tenantId_responseId_idx" ON public."FormAnswer" USING btree ("tenantId", "responseId");

--
-- Name: FormAudience_tenantId_formId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormAudience_tenantId_formId_idx" ON public."FormAudience" USING btree ("tenantId", "formId");

--
-- Name: FormAudience_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormAudience_tenantId_id_key" ON public."FormAudience" USING btree ("tenantId", id);

--
-- Name: FormMarkingAudit_tenantId_answerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormMarkingAudit_tenantId_answerId_idx" ON public."FormMarkingAudit" USING btree ("tenantId", "answerId");

--
-- Name: FormMarkingAudit_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormMarkingAudit_tenantId_createdAt_idx" ON public."FormMarkingAudit" USING btree ("tenantId", "createdAt");

--
-- Name: FormMarkingAudit_tenantId_formId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormMarkingAudit_tenantId_formId_idx" ON public."FormMarkingAudit" USING btree ("tenantId", "formId");

--
-- Name: FormMarkingAudit_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormMarkingAudit_tenantId_id_key" ON public."FormMarkingAudit" USING btree ("tenantId", id);

--
-- Name: FormMarkingAudit_tenantId_responseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormMarkingAudit_tenantId_responseId_idx" ON public."FormMarkingAudit" USING btree ("tenantId", "responseId");

--
-- Name: FormParticipation_tenantId_formId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormParticipation_tenantId_formId_idx" ON public."FormParticipation" USING btree ("tenantId", "formId");

--
-- Name: FormParticipation_tenantId_formId_respondentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormParticipation_tenantId_formId_respondentId_key" ON public."FormParticipation" USING btree ("tenantId", "formId", "respondentId");

--
-- Name: FormParticipation_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormParticipation_tenantId_id_key" ON public."FormParticipation" USING btree ("tenantId", id);

--
-- Name: FormParticipation_tenantId_respondentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormParticipation_tenantId_respondentId_idx" ON public."FormParticipation" USING btree ("tenantId", "respondentId");

--
-- Name: FormQuestion_tenantId_formId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormQuestion_tenantId_formId_idx" ON public."FormQuestion" USING btree ("tenantId", "formId");

--
-- Name: FormQuestion_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormQuestion_tenantId_id_key" ON public."FormQuestion" USING btree ("tenantId", id);

--
-- Name: FormQuestion_tenantId_sourceItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormQuestion_tenantId_sourceItemId_idx" ON public."FormQuestion" USING btree ("tenantId", "sourceItemId");

--
-- Name: FormResponse_tenantId_formId_markingStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormResponse_tenantId_formId_markingStatus_idx" ON public."FormResponse" USING btree ("tenantId", "formId", "markingStatus");

--
-- Name: FormResponse_tenantId_formId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormResponse_tenantId_formId_status_idx" ON public."FormResponse" USING btree ("tenantId", "formId", status);

--
-- Name: FormResponse_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormResponse_tenantId_id_key" ON public."FormResponse" USING btree ("tenantId", id);

--
-- Name: FormResponse_tenantId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormResponse_tenantId_studentId_idx" ON public."FormResponse" USING btree ("tenantId", "studentId");

--
-- Name: FormTurnInAudit_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormTurnInAudit_tenantId_createdAt_idx" ON public."FormTurnInAudit" USING btree ("tenantId", "createdAt");

--
-- Name: FormTurnInAudit_tenantId_formId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormTurnInAudit_tenantId_formId_idx" ON public."FormTurnInAudit" USING btree ("tenantId", "formId");

--
-- Name: FormTurnInAudit_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormTurnInAudit_tenantId_id_key" ON public."FormTurnInAudit" USING btree ("tenantId", id);

--
-- Name: FormTurnInAudit_tenantId_turnInId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormTurnInAudit_tenantId_turnInId_idx" ON public."FormTurnInAudit" USING btree ("tenantId", "turnInId");

--
-- Name: FormTurnIn_tenantId_formId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormTurnIn_tenantId_formId_status_idx" ON public."FormTurnIn" USING btree ("tenantId", "formId", status);

--
-- Name: FormTurnIn_tenantId_formId_studentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormTurnIn_tenantId_formId_studentId_key" ON public."FormTurnIn" USING btree ("tenantId", "formId", "studentId");

--
-- Name: FormTurnIn_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormTurnIn_tenantId_id_key" ON public."FormTurnIn" USING btree ("tenantId", id);

--
-- Name: FormTurnIn_tenantId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormTurnIn_tenantId_studentId_idx" ON public."FormTurnIn" USING btree ("tenantId", "studentId");

--
-- Name: Form_shareToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Form_shareToken_key" ON public."Form" USING btree ("shareToken");

--
-- Name: Form_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Form_tenantId_createdAt_idx" ON public."Form" USING btree ("tenantId", "createdAt");

--
-- Name: Form_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Form_tenantId_id_key" ON public."Form" USING btree ("tenantId", id);

--
-- Name: Form_tenantId_kind_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Form_tenantId_kind_status_idx" ON public."Form" USING btree ("tenantId", kind, status);

--
-- Name: GradeBand_letter_per_scale; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GradeBand_letter_per_scale" ON public."GradeBand" USING btree ("scaleId", lower(letter));

--
-- Name: GradeBand_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GradeBand_tenantId_id_key" ON public."GradeBand" USING btree ("tenantId", id);

--
-- Name: GradeBand_tenantId_scaleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GradeBand_tenantId_scaleId_idx" ON public."GradeBand" USING btree ("tenantId", "scaleId");

--
-- Name: GradeScale_name_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GradeScale_name_live" ON public."GradeScale" USING btree ("tenantId", name) WHERE ("archivedAt" IS NULL);

--
-- Name: GradeScale_one_live_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GradeScale_one_live_default" ON public."GradeScale" USING btree ("tenantId") WHERE ("isDefault" AND ("archivedAt" IS NULL));

--
-- Name: GradeScale_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GradeScale_tenantId_id_key" ON public."GradeScale" USING btree ("tenantId", id);

--
-- Name: GradeScale_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GradeScale_tenantId_idx" ON public."GradeScale" USING btree ("tenantId");

--
-- Name: GuardianLinkToken_tenantId_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GuardianLinkToken_tenantId_expiresAt_idx" ON public."GuardianLinkToken" USING btree ("tenantId", "expiresAt");

--
-- Name: GuardianLinkToken_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GuardianLinkToken_tenantId_id_key" ON public."GuardianLinkToken" USING btree ("tenantId", id);

--
-- Name: GuardianLinkToken_tenantId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GuardianLinkToken_tenantId_studentId_idx" ON public."GuardianLinkToken" USING btree ("tenantId", "studentId");

--
-- Name: GuardianLinkToken_tenantId_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GuardianLinkToken_tenantId_tokenHash_key" ON public."GuardianLinkToken" USING btree ("tenantId", "tokenHash");

--
-- Name: GuardianLink_one_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GuardianLink_one_primary" ON public."GuardianLink" USING btree ("studentId") WHERE ("isPrimary" AND (status <> 'REVOKED'::public."GuardianLinkStatus"));

--
-- Name: GuardianLink_studentId_guardianId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GuardianLink_studentId_guardianId_key" ON public."GuardianLink" USING btree ("studentId", "guardianId");

--
-- Name: GuardianLink_tenantId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GuardianLink_tenantId_studentId_idx" ON public."GuardianLink" USING btree ("tenantId", "studentId");

--
-- Name: GuardianRecord_account_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GuardianRecord_account_once" ON public."GuardianRecord" USING btree ("tenantId", "userId") WHERE ("userId" IS NOT NULL);

--
-- Name: GuardianRecord_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GuardianRecord_tenantId_id_key" ON public."GuardianRecord" USING btree ("tenantId", id);

--
-- Name: GuardianRecord_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GuardianRecord_tenantId_idx" ON public."GuardianRecord" USING btree ("tenantId");

--
-- Name: Invitation_one_live_per_address; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invitation_one_live_per_address" ON public."Invitation" USING btree ("tenantId", email) WHERE (("acceptedAt" IS NULL) AND ("revokedAt" IS NULL));

--
-- Name: Invitation_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invitation_tenantId_createdAt_idx" ON public."Invitation" USING btree ("tenantId", "createdAt");

--
-- Name: Invitation_tenantId_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invitation_tenantId_email_idx" ON public."Invitation" USING btree ("tenantId", email);

--
-- Name: Invitation_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON public."Invitation" USING btree ("tokenHash");

--
-- Name: InvoiceDiscount_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InvoiceDiscount_tenantId_id_key" ON public."InvoiceDiscount" USING btree ("tenantId", id);

--
-- Name: InvoiceDiscount_tenantId_invoiceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InvoiceDiscount_tenantId_invoiceId_idx" ON public."InvoiceDiscount" USING btree ("tenantId", "invoiceId");

--
-- Name: Invoice_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invoice_tenantId_id_key" ON public."Invoice" USING btree ("tenantId", id);

--
-- Name: Invoice_tenantId_invoiceNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invoice_tenantId_invoiceNo_key" ON public."Invoice" USING btree ("tenantId", "invoiceNo");

--
-- Name: Invoice_tenantId_periodId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invoice_tenantId_periodId_idx" ON public."Invoice" USING btree ("tenantId", "periodId");

--
-- Name: Invoice_tenantId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invoice_tenantId_status_idx" ON public."Invoice" USING btree ("tenantId", status);

--
-- Name: Invoice_tenantId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invoice_tenantId_studentId_idx" ON public."Invoice" USING btree ("tenantId", "studentId");

--
-- Name: Invoice_tenantId_studentId_periodId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invoice_tenantId_studentId_periodId_key" ON public."Invoice" USING btree ("tenantId", "studentId", "periodId");

--
-- Name: LearningMaterial_tenantId_classGroupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LearningMaterial_tenantId_classGroupId_idx" ON public."LearningMaterial" USING btree ("tenantId", "classGroupId");

--
-- Name: LearningMaterial_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "LearningMaterial_tenantId_id_key" ON public."LearningMaterial" USING btree ("tenantId", id);

--
-- Name: LearningMaterial_tenantId_subjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LearningMaterial_tenantId_subjectId_idx" ON public."LearningMaterial" USING btree ("tenantId", "subjectId");

--
-- Name: MfaChallenge_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MfaChallenge_tokenHash_key" ON public."MfaChallenge" USING btree ("tokenHash");

--
-- Name: MfaChallenge_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MfaChallenge_userId_idx" ON public."MfaChallenge" USING btree ("userId");

--
-- Name: MfaCredential_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MfaCredential_userId_key" ON public."MfaCredential" USING btree ("userId");

--
-- Name: MfaRecoveryCode_userId_codeHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MfaRecoveryCode_userId_codeHash_key" ON public."MfaRecoveryCode" USING btree ("userId", "codeHash");

--
-- Name: MfaRecoveryCode_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MfaRecoveryCode_userId_idx" ON public."MfaRecoveryCode" USING btree ("userId");

--
-- Name: NotificationAuditLog_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationAuditLog_tenantId_createdAt_idx" ON public."NotificationAuditLog" USING btree ("tenantId", "createdAt");

--
-- Name: NotificationAuditLog_tenantId_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationAuditLog_tenantId_event_idx" ON public."NotificationAuditLog" USING btree ("tenantId", event);

--
-- Name: NotificationAuditLog_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "NotificationAuditLog_tenantId_id_key" ON public."NotificationAuditLog" USING btree ("tenantId", id);

--
-- Name: NotificationDispatch_tenantId_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationDispatch_tenantId_channel_idx" ON public."NotificationDispatch" USING btree ("tenantId", channel);

--
-- Name: NotificationDispatch_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationDispatch_tenantId_createdAt_idx" ON public."NotificationDispatch" USING btree ("tenantId", "createdAt");

--
-- Name: NotificationDispatch_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "NotificationDispatch_tenantId_id_key" ON public."NotificationDispatch" USING btree ("tenantId", id);

--
-- Name: NotificationDispatch_tenantId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationDispatch_tenantId_status_idx" ON public."NotificationDispatch" USING btree ("tenantId", status);

--
-- Name: NotificationTemplate_tenantId_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationTemplate_tenantId_channel_idx" ON public."NotificationTemplate" USING btree ("tenantId", channel);

--
-- Name: NotificationTemplate_tenantId_code_channel_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "NotificationTemplate_tenantId_code_channel_key" ON public."NotificationTemplate" USING btree ("tenantId", code, channel);

--
-- Name: NotificationTemplate_tenantId_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NotificationTemplate_tenantId_code_idx" ON public."NotificationTemplate" USING btree ("tenantId", code);

--
-- Name: NotificationTemplate_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "NotificationTemplate_tenantId_id_key" ON public."NotificationTemplate" USING btree ("tenantId", id);

--
-- Name: PasswordResetToken_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON public."PasswordResetToken" USING btree ("tokenHash");

--
-- Name: PasswordResetToken_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PasswordResetToken_userId_idx" ON public."PasswordResetToken" USING btree ("userId");

--
-- Name: PaymentWebhookEvent_provider_eventId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_eventId_key" ON public."PaymentWebhookEvent" USING btree (provider, "eventId");

--
-- Name: PaymentWebhookEvent_provider_receivedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PaymentWebhookEvent_provider_receivedAt_idx" ON public."PaymentWebhookEvent" USING btree (provider, "receivedAt");

--
-- Name: Payment_provider_providerRef_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Payment_provider_providerRef_key" ON public."Payment" USING btree (provider, "providerRef");

--
-- Name: Payment_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Payment_tenantId_id_key" ON public."Payment" USING btree ("tenantId", id);

--
-- Name: Payment_tenantId_invoiceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Payment_tenantId_invoiceId_idx" ON public."Payment" USING btree ("tenantId", "invoiceId");

--
-- Name: Payment_tenantId_providerRef_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Payment_tenantId_providerRef_idx" ON public."Payment" USING btree ("tenantId", "providerRef");

--
-- Name: Payment_tenantId_receiptNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Payment_tenantId_receiptNo_key" ON public."Payment" USING btree ("tenantId", "receiptNo") WHERE ("receiptNo" IS NOT NULL);

--
-- Name: Payment_tenantId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Payment_tenantId_status_idx" ON public."Payment" USING btree ("tenantId", status);

--
-- Name: PlatformAuditLog_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PlatformAuditLog_createdAt_idx" ON public."PlatformAuditLog" USING btree ("createdAt");

--
-- Name: PracticeAttempt_tenantId_bankItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PracticeAttempt_tenantId_bankItemId_idx" ON public."PracticeAttempt" USING btree ("tenantId", "bankItemId");

--
-- Name: PracticeAttempt_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PracticeAttempt_tenantId_id_key" ON public."PracticeAttempt" USING btree ("tenantId", id);

--
-- Name: PracticeAttempt_tenantId_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PracticeAttempt_tenantId_sessionId_idx" ON public."PracticeAttempt" USING btree ("tenantId", "sessionId");

--
-- Name: PracticeAttempt_tenantId_studentId_answeredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PracticeAttempt_tenantId_studentId_answeredAt_idx" ON public."PracticeAttempt" USING btree ("tenantId", "studentId", "answeredAt");

--
-- Name: PracticeSession_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PracticeSession_tenantId_id_key" ON public."PracticeSession" USING btree ("tenantId", id);

--
-- Name: PracticeSession_tenantId_studentId_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PracticeSession_tenantId_studentId_startedAt_idx" ON public."PracticeSession" USING btree ("tenantId", "studentId", "startedAt");

--
-- Name: PracticeSession_tenantId_subjectKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PracticeSession_tenantId_subjectKey_idx" ON public."PracticeSession" USING btree ("tenantId", "subjectKey");

--
-- Name: ProgramAssessmentGroup_tenantId_groupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAssessmentGroup_tenantId_groupId_idx" ON public."ProgramAssessmentGroup" USING btree ("tenantId", "groupId");

--
-- Name: ProgramAssessment_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramAssessment_tenantId_id_key" ON public."ProgramAssessment" USING btree ("tenantId", id);

--
-- Name: ProgramAssessment_tenantId_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramAssessment_tenantId_programId_id_key" ON public."ProgramAssessment" USING btree ("tenantId", "programId", id);

--
-- Name: ProgramAssessment_tenantId_programId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAssessment_tenantId_programId_status_idx" ON public."ProgramAssessment" USING btree ("tenantId", "programId", status);

--
-- Name: ProgramAttendanceChange_tenantId_participantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAttendanceChange_tenantId_participantId_createdAt_idx" ON public."ProgramAttendanceChange" USING btree ("tenantId", "participantId", "createdAt");

--
-- Name: ProgramAttendanceChange_tenantId_programId_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAttendanceChange_tenantId_programId_sessionId_idx" ON public."ProgramAttendanceChange" USING btree ("tenantId", "programId", "sessionId");

--
-- Name: ProgramAttendance_sessionId_participantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramAttendance_sessionId_participantId_key" ON public."ProgramAttendance" USING btree ("sessionId", "participantId");

--
-- Name: ProgramAttendance_tenantId_programId_campusId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAttendance_tenantId_programId_campusId_idx" ON public."ProgramAttendance" USING btree ("tenantId", "programId", "campusId");

--
-- Name: ProgramAttendance_tenantId_programId_participantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAttendance_tenantId_programId_participantId_idx" ON public."ProgramAttendance" USING btree ("tenantId", "programId", "participantId");

--
-- Name: ProgramAudit_tenantId_programId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramAudit_tenantId_programId_createdAt_idx" ON public."ProgramAudit" USING btree ("tenantId", "programId", "createdAt");

--
-- Name: ProgramCampus_tenantId_campusId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramCampus_tenantId_campusId_idx" ON public."ProgramCampus" USING btree ("tenantId", "campusId");

--
-- Name: ProgramCertificate_one_issued_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramCertificate_one_issued_key" ON public."ProgramCertificate" USING btree ("programId", "participantId") WHERE (status = 'ISSUED'::public."ProgramCertificateStatus");

--
-- Name: ProgramCertificate_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramCertificate_tenantId_id_key" ON public."ProgramCertificate" USING btree ("tenantId", id);

--
-- Name: ProgramCertificate_tenantId_programId_participantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramCertificate_tenantId_programId_participantId_idx" ON public."ProgramCertificate" USING btree ("tenantId", "programId", "participantId");

--
-- Name: ProgramCertificate_tenantId_serialNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramCertificate_tenantId_serialNo_key" ON public."ProgramCertificate" USING btree ("tenantId", "serialNo");

--
-- Name: ProgramCertificate_verificationToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramCertificate_verificationToken_key" ON public."ProgramCertificate" USING btree ("verificationToken");

--
-- Name: ProgramFeeExemption_tenantId_participantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramFeeExemption_tenantId_participantId_idx" ON public."ProgramFeeExemption" USING btree ("tenantId", "participantId");

--
-- Name: ProgramFeeItem_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramFeeItem_tenantId_id_key" ON public."ProgramFeeItem" USING btree ("tenantId", id);

--
-- Name: ProgramFeeItem_tenantId_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramFeeItem_tenantId_programId_id_key" ON public."ProgramFeeItem" USING btree ("tenantId", "programId", id);

--
-- Name: ProgramFeeItem_tenantId_programId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramFeeItem_tenantId_programId_status_idx" ON public."ProgramFeeItem" USING btree ("tenantId", "programId", status);

--
-- Name: ProgramGroup_live_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramGroup_live_name_key" ON public."ProgramGroup" USING btree ("tenantId", "programId", COALESCE("parentId", ''::text), lower(name)) WHERE ("archivedAt" IS NULL);

--
-- Name: ProgramGroup_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramGroup_tenantId_id_key" ON public."ProgramGroup" USING btree ("tenantId", id);

--
-- Name: ProgramGroup_tenantId_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramGroup_tenantId_programId_id_key" ON public."ProgramGroup" USING btree ("tenantId", "programId", id);

--
-- Name: ProgramGroup_tenantId_programId_parentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramGroup_tenantId_programId_parentId_idx" ON public."ProgramGroup" USING btree ("tenantId", "programId", "parentId");

--
-- Name: ProgramInvoiceDiscount_tenantId_programId_invoiceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramInvoiceDiscount_tenantId_programId_invoiceId_idx" ON public."ProgramInvoiceDiscount" USING btree ("tenantId", "programId", "invoiceId");

--
-- Name: ProgramInvoice_programId_participantId_periodKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramInvoice_programId_participantId_periodKey_key" ON public."ProgramInvoice" USING btree ("programId", "participantId", "periodKey");

--
-- Name: ProgramInvoice_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramInvoice_tenantId_id_key" ON public."ProgramInvoice" USING btree ("tenantId", id);

--
-- Name: ProgramInvoice_tenantId_invoiceNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramInvoice_tenantId_invoiceNo_key" ON public."ProgramInvoice" USING btree ("tenantId", "invoiceNo");

--
-- Name: ProgramInvoice_tenantId_programId_campusId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramInvoice_tenantId_programId_campusId_status_idx" ON public."ProgramInvoice" USING btree ("tenantId", "programId", "campusId", status);

--
-- Name: ProgramInvoice_tenantId_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramInvoice_tenantId_programId_id_key" ON public."ProgramInvoice" USING btree ("tenantId", "programId", id);

--
-- Name: ProgramLevelLabel_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramLevelLabel_tenantId_idx" ON public."ProgramLevelLabel" USING btree ("tenantId");

--
-- Name: ProgramParticipant_programId_guardianId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramParticipant_programId_guardianId_key" ON public."ProgramParticipant" USING btree ("programId", "guardianId");

--
-- Name: ProgramParticipant_programId_staffRecordId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramParticipant_programId_staffRecordId_key" ON public."ProgramParticipant" USING btree ("programId", "staffRecordId");

--
-- Name: ProgramParticipant_programId_studentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramParticipant_programId_studentId_key" ON public."ProgramParticipant" USING btree ("programId", "studentId");

--
-- Name: ProgramParticipant_tenantId_guardianId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramParticipant_tenantId_guardianId_idx" ON public."ProgramParticipant" USING btree ("tenantId", "guardianId");

--
-- Name: ProgramParticipant_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramParticipant_tenantId_id_key" ON public."ProgramParticipant" USING btree ("tenantId", id);

--
-- Name: ProgramParticipant_tenantId_programId_campusId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramParticipant_tenantId_programId_campusId_idx" ON public."ProgramParticipant" USING btree ("tenantId", "programId", "campusId");

--
-- Name: ProgramParticipant_tenantId_programId_groupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramParticipant_tenantId_programId_groupId_idx" ON public."ProgramParticipant" USING btree ("tenantId", "programId", "groupId");

--
-- Name: ProgramParticipant_tenantId_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramParticipant_tenantId_programId_id_key" ON public."ProgramParticipant" USING btree ("tenantId", "programId", id);

--
-- Name: ProgramParticipant_tenantId_programId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramParticipant_tenantId_programId_status_idx" ON public."ProgramParticipant" USING btree ("tenantId", "programId", status);

--
-- Name: ProgramParticipant_tenantId_staffRecordId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramParticipant_tenantId_staffRecordId_idx" ON public."ProgramParticipant" USING btree ("tenantId", "staffRecordId");

--
-- Name: ProgramParticipant_tenantId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramParticipant_tenantId_studentId_idx" ON public."ProgramParticipant" USING btree ("tenantId", "studentId");

--
-- Name: ProgramPayment_tenantId_programId_campusId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramPayment_tenantId_programId_campusId_status_idx" ON public."ProgramPayment" USING btree ("tenantId", "programId", "campusId", status);

--
-- Name: ProgramPayment_tenantId_programId_invoiceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramPayment_tenantId_programId_invoiceId_idx" ON public."ProgramPayment" USING btree ("tenantId", "programId", "invoiceId");

--
-- Name: ProgramPayment_tenantId_receiptNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramPayment_tenantId_receiptNo_key" ON public."ProgramPayment" USING btree ("tenantId", "receiptNo");

--
-- Name: ProgramPayment_tenantId_source_providerRef_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramPayment_tenantId_source_providerRef_key" ON public."ProgramPayment" USING btree ("tenantId", source, "providerRef");

--
-- Name: ProgramScoreChange_tenantId_participantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramScoreChange_tenantId_participantId_createdAt_idx" ON public."ProgramScoreChange" USING btree ("tenantId", "participantId", "createdAt");

--
-- Name: ProgramScoreChange_tenantId_programId_assessmentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramScoreChange_tenantId_programId_assessmentId_idx" ON public."ProgramScoreChange" USING btree ("tenantId", "programId", "assessmentId");

--
-- Name: ProgramScore_assessmentId_participantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramScore_assessmentId_participantId_key" ON public."ProgramScore" USING btree ("assessmentId", "participantId");

--
-- Name: ProgramScore_tenantId_programId_campusId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramScore_tenantId_programId_campusId_idx" ON public."ProgramScore" USING btree ("tenantId", "programId", "campusId");

--
-- Name: ProgramScore_tenantId_programId_participantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramScore_tenantId_programId_participantId_idx" ON public."ProgramScore" USING btree ("tenantId", "programId", "participantId");

--
-- Name: ProgramSession_programId_groupId_date_label_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramSession_programId_groupId_date_label_key" ON public."ProgramSession" USING btree ("programId", "groupId", date, label);

--
-- Name: ProgramSession_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramSession_tenantId_id_key" ON public."ProgramSession" USING btree ("tenantId", id);

--
-- Name: ProgramSession_tenantId_programId_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramSession_tenantId_programId_date_idx" ON public."ProgramSession" USING btree ("tenantId", "programId", date);

--
-- Name: ProgramStaffGroup_tenantId_groupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramStaffGroup_tenantId_groupId_idx" ON public."ProgramStaffGroup" USING btree ("tenantId", "groupId");

--
-- Name: ProgramStaff_programId_userId_role_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramStaff_programId_userId_role_key" ON public."ProgramStaff" USING btree ("programId", "userId", role);

--
-- Name: ProgramStaff_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramStaff_tenantId_id_key" ON public."ProgramStaff" USING btree ("tenantId", id);

--
-- Name: ProgramStaff_tenantId_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgramStaff_tenantId_programId_id_key" ON public."ProgramStaff" USING btree ("tenantId", "programId", id);

--
-- Name: ProgramStaff_tenantId_programId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramStaff_tenantId_programId_status_idx" ON public."ProgramStaff" USING btree ("tenantId", "programId", status);

--
-- Name: ProgramStaff_tenantId_userId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgramStaff_tenantId_userId_status_idx" ON public."ProgramStaff" USING btree ("tenantId", "userId", status);

--
-- Name: Program_live_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Program_live_name_key" ON public."Program" USING btree ("tenantId", lower(name)) WHERE (status <> 'ARCHIVED'::public."ProgramStatus");

--
-- Name: Program_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Program_tenantId_id_key" ON public."Program" USING btree ("tenantId", id);

--
-- Name: Program_tenantId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Program_tenantId_status_idx" ON public."Program" USING btree ("tenantId", status);

--
-- Name: ProgressEntryRevision_tenantId_entryId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgressEntryRevision_tenantId_entryId_createdAt_idx" ON public."ProgressEntryRevision" USING btree ("tenantId", "entryId", "createdAt");

--
-- Name: ProgressEntryRevision_tenantId_programId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgressEntryRevision_tenantId_programId_createdAt_idx" ON public."ProgressEntryRevision" USING btree ("tenantId", "programId", "createdAt");

--
-- Name: ProgressEntry_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressEntry_tenantId_id_key" ON public."ProgressEntry" USING btree ("tenantId", id);

--
-- Name: ProgressEntry_tenantId_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressEntry_tenantId_programId_id_key" ON public."ProgressEntry" USING btree ("tenantId", "programId", id);

--
-- Name: ProgressEntry_tenantId_programId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgressEntry_tenantId_programId_status_idx" ON public."ProgressEntry" USING btree ("tenantId", "programId", status);

--
-- Name: ProgressEntry_tenantId_recordId_trackKey_entryDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgressEntry_tenantId_recordId_trackKey_entryDate_idx" ON public."ProgressEntry" USING btree ("tenantId", "recordId", "trackKey", "entryDate");

--
-- Name: ProgressLock_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgressLock_expiresAt_idx" ON public."ProgressLock" USING btree ("expiresAt");

--
-- Name: ProgressLock_tenantId_programId_entryId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressLock_tenantId_programId_entryId_key" ON public."ProgressLock" USING btree ("tenantId", "programId", "entryId");

--
-- Name: ProgressRecord_programId_participantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressRecord_programId_participantId_key" ON public."ProgressRecord" USING btree ("programId", "participantId");

--
-- Name: ProgressRecord_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressRecord_tenantId_id_key" ON public."ProgressRecord" USING btree ("tenantId", id);

--
-- Name: ProgressRecord_tenantId_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressRecord_tenantId_programId_id_key" ON public."ProgressRecord" USING btree ("tenantId", "programId", id);

--
-- Name: ProgressRecord_tenantId_programId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProgressRecord_tenantId_programId_idx" ON public."ProgressRecord" USING btree ("tenantId", "programId");

--
-- Name: ProgressRecord_tenantId_programId_participantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressRecord_tenantId_programId_participantId_key" ON public."ProgressRecord" USING btree ("tenantId", "programId", "participantId");

--
-- Name: ProgressSeen_recordId_actor_weekStart_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressSeen_recordId_actor_weekStart_key" ON public."ProgressSeen" USING btree ("recordId", actor, "weekStart");

--
-- Name: ProgressTemplate_programId_key_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressTemplate_programId_key_version_key" ON public."ProgressTemplate" USING btree ("programId", key, version);

--
-- Name: ProgressTemplate_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressTemplate_tenantId_id_key" ON public."ProgressTemplate" USING btree ("tenantId", id);

--
-- Name: ProgressTemplate_tenantId_programId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProgressTemplate_tenantId_programId_id_key" ON public."ProgressTemplate" USING btree ("tenantId", "programId", id);

--
-- Name: PromotionBatch_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PromotionBatch_tenantId_createdAt_idx" ON public."PromotionBatch" USING btree ("tenantId", "createdAt");

--
-- Name: PromotionBatch_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PromotionBatch_tenantId_id_key" ON public."PromotionBatch" USING btree ("tenantId", id);

--
-- Name: PromotionBatch_tenantId_sourceSessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PromotionBatch_tenantId_sourceSessionId_idx" ON public."PromotionBatch" USING btree ("tenantId", "sourceSessionId");

--
-- Name: PromotionBatch_tenantId_targetSessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PromotionBatch_tenantId_targetSessionId_idx" ON public."PromotionBatch" USING btree ("tenantId", "targetSessionId");

--
-- Name: PromotionRecord_tenantId_batchId_studentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PromotionRecord_tenantId_batchId_studentId_key" ON public."PromotionRecord" USING btree ("tenantId", "batchId", "studentId");

--
-- Name: PromotionRecord_tenantId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PromotionRecord_tenantId_studentId_idx" ON public."PromotionRecord" USING btree ("tenantId", "studentId");

--
-- Name: PromotionReversal_tenantId_batchId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PromotionReversal_tenantId_batchId_key" ON public."PromotionReversal" USING btree ("tenantId", "batchId");

--
-- Name: PromotionReversal_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PromotionReversal_tenantId_createdAt_idx" ON public."PromotionReversal" USING btree ("tenantId", "createdAt");

--
-- Name: QuestionBankAudit_tenantId_campusId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankAudit_tenantId_campusId_createdAt_idx" ON public."QuestionBankAudit" USING btree ("tenantId", "campusId", "createdAt");

--
-- Name: QuestionBankAudit_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankAudit_tenantId_createdAt_idx" ON public."QuestionBankAudit" USING btree ("tenantId", "createdAt");

--
-- Name: QuestionBankAudit_tenantId_itemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankAudit_tenantId_itemId_idx" ON public."QuestionBankAudit" USING btree ("tenantId", "itemId");

--
-- Name: QuestionBankClassTag_itemId_labelKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankClassTag_itemId_labelKey_key" ON public."QuestionBankClassTag" USING btree ("itemId", "labelKey");

--
-- Name: QuestionBankClassTag_tenantId_labelKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankClassTag_tenantId_labelKey_idx" ON public."QuestionBankClassTag" USING btree ("tenantId", "labelKey");

--
-- Name: QuestionBankImage_itemId_sortOrder_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankImage_itemId_sortOrder_key" ON public."QuestionBankImage" USING btree ("itemId", "sortOrder");

--
-- Name: QuestionBankImage_storageKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankImage_storageKey_key" ON public."QuestionBankImage" USING btree ("storageKey");

--
-- Name: QuestionBankImage_tenantId_itemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankImage_tenantId_itemId_idx" ON public."QuestionBankImage" USING btree ("tenantId", "itemId");

--
-- Name: QuestionBankItemVersion_itemId_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankItemVersion_itemId_version_key" ON public."QuestionBankItemVersion" USING btree ("itemId", version);

--
-- Name: QuestionBankItemVersion_tenantId_itemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankItemVersion_tenantId_itemId_idx" ON public."QuestionBankItemVersion" USING btree ("tenantId", "itemId");

--
-- Name: QuestionBankItem_tenantId_bank_subjectKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankItem_tenantId_bank_subjectKey_idx" ON public."QuestionBankItem" USING btree ("tenantId", bank, "subjectKey");

--
-- Name: QuestionBankItem_tenantId_campusId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankItem_tenantId_campusId_status_idx" ON public."QuestionBankItem" USING btree ("tenantId", "campusId", status);

--
-- Name: QuestionBankItem_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankItem_tenantId_id_key" ON public."QuestionBankItem" USING btree ("tenantId", id);

--
-- Name: QuestionBankItem_tenantId_status_visibility_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankItem_tenantId_status_visibility_idx" ON public."QuestionBankItem" USING btree ("tenantId", status, visibility);

--
-- Name: QuestionBankItem_tenantId_visibleAfterQuizId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankItem_tenantId_visibleAfterQuizId_idx" ON public."QuestionBankItem" USING btree ("tenantId", "visibleAfterQuizId");

--
-- Name: QuestionBankPrintLog_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankPrintLog_tenantId_id_key" ON public."QuestionBankPrintLog" USING btree ("tenantId", id);

--
-- Name: QuestionBankPrintLog_tenantId_printedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankPrintLog_tenantId_printedAt_idx" ON public."QuestionBankPrintLog" USING btree ("tenantId", "printedAt");

--
-- Name: QuestionBankPrintLog_tenantId_printedById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankPrintLog_tenantId_printedById_idx" ON public."QuestionBankPrintLog" USING btree ("tenantId", "printedById");

--
-- Name: QuestionBankPrintLog_tenantId_targetKind_targetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankPrintLog_tenantId_targetKind_targetId_idx" ON public."QuestionBankPrintLog" USING btree ("tenantId", "targetKind", "targetId");

--
-- Name: QuestionBankReview_tenantId_itemId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankReview_tenantId_itemId_createdAt_idx" ON public."QuestionBankReview" USING btree ("tenantId", "itemId", "createdAt");

--
-- Name: QuestionBankReviewer_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankReviewer_once" ON public."QuestionBankReviewer" USING btree ("tenantId", "userId", COALESCE("campusId", ''::text), scope, COALESCE("subjectKey", ''::text));

--
-- Name: QuestionBankReviewer_tenantId_campusId_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankReviewer_tenantId_campusId_scope_idx" ON public."QuestionBankReviewer" USING btree ("tenantId", "campusId", scope);

--
-- Name: QuestionBankReviewer_tenantId_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankReviewer_tenantId_userId_idx" ON public."QuestionBankReviewer" USING btree ("tenantId", "userId");

--
-- Name: QuestionBankSetting_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionBankSetting_once" ON public."QuestionBankSetting" USING btree ("tenantId", COALESCE("campusId", ''::text), key);

--
-- Name: QuestionBankSetting_tenantId_campusId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionBankSetting_tenantId_campusId_idx" ON public."QuestionBankSetting" USING btree ("tenantId", "campusId");

--
-- Name: QuestionOverlapFlag_tenantId_itemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionOverlapFlag_tenantId_itemId_idx" ON public."QuestionOverlapFlag" USING btree ("tenantId", "itemId");

--
-- Name: QuestionReport_tenantId_bankItemId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionReport_tenantId_bankItemId_status_idx" ON public."QuestionReport" USING btree ("tenantId", "bankItemId", status);

--
-- Name: QuestionReport_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionReport_tenantId_id_key" ON public."QuestionReport" USING btree ("tenantId", id);

--
-- Name: QuestionReport_tenantId_reporterUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionReport_tenantId_reporterUserId_idx" ON public."QuestionReport" USING btree ("tenantId", "reporterUserId");

--
-- Name: QuizAttempt_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuizAttempt_tenantId_id_key" ON public."QuizAttempt" USING btree ("tenantId", id);

--
-- Name: QuizAttempt_tenantId_quizId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuizAttempt_tenantId_quizId_idx" ON public."QuizAttempt" USING btree ("tenantId", "quizId");

--
-- Name: QuizAttempt_tenantId_studentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuizAttempt_tenantId_studentId_idx" ON public."QuizAttempt" USING btree ("tenantId", "studentId");

--
-- Name: QuizQuestion_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuizQuestion_tenantId_id_key" ON public."QuizQuestion" USING btree ("tenantId", id);

--
-- Name: QuizQuestion_tenantId_quizId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuizQuestion_tenantId_quizId_idx" ON public."QuizQuestion" USING btree ("tenantId", "quizId");

--
-- Name: QuizQuestion_tenantId_sourceItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuizQuestion_tenantId_sourceItemId_idx" ON public."QuizQuestion" USING btree ("tenantId", "sourceItemId");

--
-- Name: Quiz_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Quiz_tenantId_id_key" ON public."Quiz" USING btree ("tenantId", id);

--
-- Name: Quiz_tenantId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Quiz_tenantId_status_idx" ON public."Quiz" USING btree ("tenantId", status);

--
-- Name: Quiz_tenantId_subjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Quiz_tenantId_subjectId_idx" ON public."Quiz" USING btree ("tenantId", "subjectId");

--
-- Name: ReportRemark_tenantId_periodId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportRemark_tenantId_periodId_idx" ON public."ReportRemark" USING btree ("tenantId", "periodId");

--
-- Name: ReportRemark_tenantId_studentId_periodId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ReportRemark_tenantId_studentId_periodId_key" ON public."ReportRemark" USING btree ("tenantId", "studentId", "periodId");

--
-- Name: ResultApprovalScope_target_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ResultApprovalScope_target_key" ON public."ResultApprovalScope" USING btree ("tenantId", "userId", kind, COALESCE("sectionId", ''::text), COALESCE("classGroupId", ''::text));

--
-- Name: ResultApprovalScope_tenantId_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ResultApprovalScope_tenantId_userId_idx" ON public."ResultApprovalScope" USING btree ("tenantId", "userId");

--
-- Name: ResultAudit_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ResultAudit_tenantId_createdAt_idx" ON public."ResultAudit" USING btree ("tenantId", "createdAt");

--
-- Name: ResultAudit_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ResultAudit_tenantId_id_key" ON public."ResultAudit" USING btree ("tenantId", id);

--
-- Name: ResultAudit_tenantId_resultId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ResultAudit_tenantId_resultId_idx" ON public."ResultAudit" USING btree ("tenantId", "resultId");

--
-- Name: Result_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Result_tenantId_id_key" ON public."Result" USING btree ("tenantId", id);

--
-- Name: Result_tenantId_periodId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Result_tenantId_periodId_idx" ON public."Result" USING btree ("tenantId", "periodId");

--
-- Name: Result_tenantId_studentId_periodId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Result_tenantId_studentId_periodId_idx" ON public."Result" USING btree ("tenantId", "studentId", "periodId");

--
-- Name: Result_tenantId_studentId_subjectId_periodId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Result_tenantId_studentId_subjectId_periodId_key" ON public."Result" USING btree ("tenantId", "studentId", "subjectId", "periodId");

--
-- Name: Result_tenantId_subjectId_periodId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Result_tenantId_subjectId_periodId_idx" ON public."Result" USING btree ("tenantId", "subjectId", "periodId");

--
-- Name: Result_verificationToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Result_verificationToken_key" ON public."Result" USING btree ("verificationToken") WHERE ("verificationToken" IS NOT NULL);

--
-- Name: Section_live_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Section_live_name_key" ON public."Section" USING btree ("tenantId", COALESCE("campusId", ''::text), lower(name)) WHERE ("archivedAt" IS NULL);

--
-- Name: Section_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Section_tenantId_id_key" ON public."Section" USING btree ("tenantId", id);

--
-- Name: Section_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Section_tenantId_idx" ON public."Section" USING btree ("tenantId");

--
-- Name: Session_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Session_tokenHash_key" ON public."Session" USING btree ("tokenHash");

--
-- Name: Session_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_userId_idx" ON public."Session" USING btree ("userId");

--
-- Name: SettingsChangeAudit_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SettingsChangeAudit_tenantId_createdAt_idx" ON public."SettingsChangeAudit" USING btree ("tenantId", "createdAt");

--
-- Name: SettingsChangeAudit_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SettingsChangeAudit_tenantId_id_key" ON public."SettingsChangeAudit" USING btree ("tenantId", id);

--
-- Name: SettingsChangeAudit_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SettingsChangeAudit_tenantId_idx" ON public."SettingsChangeAudit" USING btree ("tenantId");

--
-- Name: StaffRecord_account_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StaffRecord_account_once" ON public."StaffRecord" USING btree ("tenantId", "userId") WHERE ("userId" IS NOT NULL);

--
-- Name: StaffRecord_email_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StaffRecord_email_live" ON public."StaffRecord" USING btree ("tenantId", lower(email)) WHERE ((email IS NOT NULL) AND ("archivedAt" IS NULL));

--
-- Name: StaffRecord_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StaffRecord_tenantId_id_key" ON public."StaffRecord" USING btree ("tenantId", id);

--
-- Name: StaffRecord_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StaffRecord_tenantId_idx" ON public."StaffRecord" USING btree ("tenantId");

--
-- Name: StaffSubjectAssignment_staffRecordId_subjectId_classArmId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StaffSubjectAssignment_staffRecordId_subjectId_classArmId_key" ON public."StaffSubjectAssignment" USING btree ("staffRecordId", "subjectId", "classArmId");

--
-- Name: StaffSubjectAssignment_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StaffSubjectAssignment_tenantId_idx" ON public."StaffSubjectAssignment" USING btree ("tenantId");

--
-- Name: StandingEvent_tenantId_campusId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StandingEvent_tenantId_campusId_createdAt_idx" ON public."StandingEvent" USING btree ("tenantId", "campusId", "createdAt");

--
-- Name: StandingEvent_tenantId_memberUserId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StandingEvent_tenantId_memberUserId_createdAt_idx" ON public."StandingEvent" USING btree ("tenantId", "memberUserId", "createdAt");

--
-- Name: StandingEvent_tenantId_participantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StandingEvent_tenantId_participantId_createdAt_idx" ON public."StandingEvent" USING btree ("tenantId", "participantId", "createdAt");

--
-- Name: StandingEvent_tenantId_staffRecordId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StandingEvent_tenantId_staffRecordId_createdAt_idx" ON public."StandingEvent" USING btree ("tenantId", "staffRecordId", "createdAt");

--
-- Name: StandingEvent_tenantId_studentId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StandingEvent_tenantId_studentId_createdAt_idx" ON public."StandingEvent" USING btree ("tenantId", "studentId", "createdAt");

--
-- Name: StudentEnrollment_tenantId_classArmId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StudentEnrollment_tenantId_classArmId_idx" ON public."StudentEnrollment" USING btree ("tenantId", "classArmId");

--
-- Name: StudentEnrollment_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StudentEnrollment_tenantId_id_key" ON public."StudentEnrollment" USING btree ("tenantId", id);

--
-- Name: StudentEnrollment_tenantId_studentId_sessionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StudentEnrollment_tenantId_studentId_sessionId_key" ON public."StudentEnrollment" USING btree ("tenantId", "studentId", "sessionId");

--
-- Name: StudentRecord_account_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StudentRecord_account_once" ON public."StudentRecord" USING btree ("tenantId", "userId") WHERE ("userId" IS NOT NULL);

--
-- Name: StudentRecord_admission_no_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StudentRecord_admission_no_key" ON public."StudentRecord" USING btree ("tenantId", lower("admissionNo"));

--
-- Name: StudentRecord_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StudentRecord_tenantId_id_key" ON public."StudentRecord" USING btree ("tenantId", id);

--
-- Name: StudentRecord_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StudentRecord_tenantId_idx" ON public."StudentRecord" USING btree ("tenantId");

--
-- Name: SubjectOffering_classGroupId_subjectId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SubjectOffering_classGroupId_subjectId_key" ON public."SubjectOffering" USING btree ("classGroupId", "subjectId");

--
-- Name: SubjectOffering_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SubjectOffering_tenantId_idx" ON public."SubjectOffering" USING btree ("tenantId");

--
-- Name: Subject_code_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Subject_code_live" ON public."Subject" USING btree ("tenantId", code) WHERE ((code IS NOT NULL) AND ("archivedAt" IS NULL));

--
-- Name: Subject_name_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Subject_name_live" ON public."Subject" USING btree ("tenantId", name) WHERE ("archivedAt" IS NULL);

--
-- Name: Subject_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Subject_tenantId_id_key" ON public."Subject" USING btree ("tenantId", id);

--
-- Name: Subject_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Subject_tenantId_idx" ON public."Subject" USING btree ("tenantId");

--
-- Name: SupportGrant_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SupportGrant_tenantId_createdAt_idx" ON public."SupportGrant" USING btree ("tenantId", "createdAt");

--
-- Name: TenantMembership_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TenantMembership_tenantId_idx" ON public."TenantMembership" USING btree ("tenantId");

--
-- Name: TenantMembership_userId_tenantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TenantMembership_userId_tenantId_key" ON public."TenantMembership" USING btree ("userId", "tenantId");

--
-- Name: TenantSetting_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TenantSetting_once" ON public."TenantSetting" USING btree ("tenantId", COALESCE("campusId", ''::text), key);

--
-- Name: TenantSetting_tenantId_campusId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TenantSetting_tenantId_campusId_idx" ON public."TenantSetting" USING btree ("tenantId", "campusId");

--
-- Name: Tenant_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Tenant_code_key" ON public."Tenant" USING btree (code);

--
-- Name: TimetableSlot_tenantId_classArmId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimetableSlot_tenantId_classArmId_idx" ON public."TimetableSlot" USING btree ("tenantId", "classArmId");

--
-- Name: TimetableSlot_tenantId_dayOfWeek_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimetableSlot_tenantId_dayOfWeek_idx" ON public."TimetableSlot" USING btree ("tenantId", "dayOfWeek");

--
-- Name: TimetableSlot_tenantId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TimetableSlot_tenantId_id_key" ON public."TimetableSlot" USING btree ("tenantId", id);

--
-- Name: TimetableSlot_tenantId_staffRecordId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimetableSlot_tenantId_staffRecordId_idx" ON public."TimetableSlot" USING btree ("tenantId", "staffRecordId");

--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);

--
-- Name: FormMarkingAudit FormMarkingAudit_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "FormMarkingAudit_append_only" BEFORE DELETE OR UPDATE ON public."FormMarkingAudit" FOR EACH ROW EXECUTE FUNCTION public.question_bank_append_only();

--
-- Name: FormTurnInAudit FormTurnInAudit_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "FormTurnInAudit_append_only" BEFORE DELETE OR UPDATE ON public."FormTurnInAudit" FOR EACH ROW EXECUTE FUNCTION public.question_bank_append_only();

--
-- Name: QuestionBankAudit QuestionBankAudit_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "QuestionBankAudit_append_only" BEFORE DELETE OR UPDATE ON public."QuestionBankAudit" FOR EACH ROW EXECUTE FUNCTION public.question_bank_append_only();

--
-- Name: QuestionBankImage QuestionBankImage_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "QuestionBankImage_limit" BEFORE INSERT OR UPDATE OF "itemId" ON public."QuestionBankImage" FOR EACH ROW EXECUTE FUNCTION public.question_bank_image_limit();

--
-- Name: QuestionBankItemVersion QuestionBankItemVersion_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "QuestionBankItemVersion_append_only" BEFORE DELETE OR UPDATE ON public."QuestionBankItemVersion" FOR EACH ROW EXECUTE FUNCTION public.question_bank_append_only();

--
-- Name: QuestionBankItem QuestionBankItem_visibility_forward; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "QuestionBankItem_visibility_forward" BEFORE INSERT OR UPDATE OF visibility, "visibleFrom" ON public."QuestionBankItem" FOR EACH ROW EXECUTE FUNCTION public.question_bank_visibility_forward();

--
-- Name: QuestionBankPrintLog QuestionBankPrintLog_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "QuestionBankPrintLog_append_only" BEFORE DELETE OR UPDATE ON public."QuestionBankPrintLog" FOR EACH ROW EXECUTE FUNCTION public.question_bank_append_only();

--
-- Name: QuestionBankReview QuestionBankReview_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "QuestionBankReview_append_only" BEFORE DELETE OR UPDATE ON public."QuestionBankReview" FOR EACH ROW EXECUTE FUNCTION public.question_bank_append_only();

--
-- Name: AssessmentComponent assessment_component_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assessment_component_locked BEFORE INSERT OR DELETE OR UPDATE ON public."AssessmentComponent" FOR EACH ROW EXECUTE FUNCTION public.assessment_component_locked_guard();

--
-- Name: AssessmentScheme assessment_scheme_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assessment_scheme_locked BEFORE UPDATE ON public."AssessmentScheme" FOR EACH ROW EXECUTE FUNCTION public.assessment_scheme_locked_guard();

--
-- Name: GradeBand grade_band_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER grade_band_locked BEFORE INSERT OR DELETE OR UPDATE ON public."GradeBand" FOR EACH ROW EXECUTE FUNCTION public.grade_band_locked_guard();

--
-- Name: GradeScale grade_scale_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER grade_scale_locked BEFORE UPDATE ON public."GradeScale" FOR EACH ROW EXECUTE FUNCTION public.grade_scale_locked_guard();

--
-- Name: SupportGrant support_grant_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER support_grant_guard BEFORE UPDATE ON public."SupportGrant" FOR EACH ROW EXECUTE FUNCTION public.support_grant_guard();

--
-- Name: Tenant tenant_creates_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tenant_creates_settings AFTER INSERT ON public."Tenant" FOR EACH ROW EXECUTE FUNCTION public.school_settings_for_new_tenant();

--
-- Name: Campus tenant_stats_campus; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tenant_stats_campus AFTER INSERT OR DELETE ON public."Campus" FOR EACH ROW EXECUTE FUNCTION public.tenant_stats_from_campus();

--
-- Name: TenantMembership tenant_stats_membership; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tenant_stats_membership AFTER INSERT OR DELETE OR UPDATE OF role, "deactivatedAt" ON public."TenantMembership" FOR EACH ROW EXECUTE FUNCTION public.tenant_stats_from_membership();

--
-- Name: StudentRecord tenant_stats_student; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tenant_stats_student AFTER INSERT OR DELETE OR UPDATE OF "archivedAt" ON public."StudentRecord" FOR EACH ROW EXECUTE FUNCTION public.tenant_stats_from_student();

--
-- Name: AcademicPeriod AcademicPeriod_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicPeriod"
    ADD CONSTRAINT "AcademicPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AcademicPeriod AcademicPeriod_tenantId_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicPeriod"
    ADD CONSTRAINT "AcademicPeriod_tenantId_sessionId_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES public."AcademicSession"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: AcademicSession AcademicSession_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicSession"
    ADD CONSTRAINT "AcademicSession_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: AcademicSession AcademicSession_tenantId_copiedFromId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicSession"
    ADD CONSTRAINT "AcademicSession_tenantId_copiedFromId_fkey" FOREIGN KEY ("tenantId", "copiedFromId") REFERENCES public."AcademicSession"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: AcademicSession AcademicSession_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicSession"
    ADD CONSTRAINT "AcademicSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AdmissionCounter AdmissionCounter_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdmissionCounter"
    ADD CONSTRAINT "AdmissionCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Announcement Announcement_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Announcement"
    ADD CONSTRAINT "Announcement_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: Announcement Announcement_tenantId_classArmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Announcement"
    ADD CONSTRAINT "Announcement_tenantId_classArmId_fkey" FOREIGN KEY ("tenantId", "classArmId") REFERENCES public."ClassArm"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: Announcement Announcement_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Announcement"
    ADD CONSTRAINT "Announcement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssessmentComponent AssessmentComponent_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentComponent"
    ADD CONSTRAINT "AssessmentComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssessmentComponent AssessmentComponent_tenantId_schemeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentComponent"
    ADD CONSTRAINT "AssessmentComponent_tenantId_schemeId_fkey" FOREIGN KEY ("tenantId", "schemeId") REFERENCES public."AssessmentScheme"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: AssessmentScheme AssessmentScheme_tenantId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentScheme"
    ADD CONSTRAINT "AssessmentScheme_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES public."ClassGroup"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: AssessmentScheme AssessmentScheme_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentScheme"
    ADD CONSTRAINT "AssessmentScheme_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssessmentScheme AssessmentScheme_tenantId_supersedesId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssessmentScheme"
    ADD CONSTRAINT "AssessmentScheme_tenantId_supersedesId_fkey" FOREIGN KEY ("tenantId", "supersedesId") REFERENCES public."AssessmentScheme"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: AssignmentSubmission AssignmentSubmission_tenantId_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentSubmission"
    ADD CONSTRAINT "AssignmentSubmission_tenantId_assignmentId_fkey" FOREIGN KEY ("tenantId", "assignmentId") REFERENCES public."Assignment"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssignmentSubmission AssignmentSubmission_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentSubmission"
    ADD CONSTRAINT "AssignmentSubmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AssignmentSubmission AssignmentSubmission_tenantId_gradedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentSubmission"
    ADD CONSTRAINT "AssignmentSubmission_tenantId_gradedById_fkey" FOREIGN KEY ("tenantId", "gradedById") REFERENCES public."StaffRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: AssignmentSubmission AssignmentSubmission_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentSubmission"
    ADD CONSTRAINT "AssignmentSubmission_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: Assignment Assignment_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: Assignment Assignment_tenantId_classArmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_tenantId_classArmId_fkey" FOREIGN KEY ("tenantId", "classArmId") REFERENCES public."ClassArm"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: Assignment Assignment_tenantId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES public."ClassGroup"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: Assignment Assignment_tenantId_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES public."StaffRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: Assignment Assignment_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Assignment Assignment_tenantId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_tenantId_subjectId_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES public."Subject"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: AttendanceRecord AttendanceRecord_tenantId_classArmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttendanceRecord"
    ADD CONSTRAINT "AttendanceRecord_tenantId_classArmId_fkey" FOREIGN KEY ("tenantId", "classArmId") REFERENCES public."ClassArm"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: AttendanceRecord AttendanceRecord_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttendanceRecord"
    ADD CONSTRAINT "AttendanceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AttendanceRecord AttendanceRecord_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttendanceRecord"
    ADD CONSTRAINT "AttendanceRecord_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Campus Campus_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campus"
    ADD CONSTRAINT "Campus_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Certificate Certificate_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Certificate"
    ADD CONSTRAINT "Certificate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Certificate Certificate_tenantId_periodId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Certificate"
    ADD CONSTRAINT "Certificate_tenantId_periodId_fkey" FOREIGN KEY ("tenantId", "periodId") REFERENCES public."AcademicPeriod"("tenantId", id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Certificate Certificate_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Certificate"
    ADD CONSTRAINT "Certificate_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ClassArm ClassArm_tenantId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassArm"
    ADD CONSTRAINT "ClassArm_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES public."ClassGroup"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: ClassArm ClassArm_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassArm"
    ADD CONSTRAINT "ClassArm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ClassGroup ClassGroup_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassGroup"
    ADD CONSTRAINT "ClassGroup_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: ClassGroup ClassGroup_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassGroup"
    ADD CONSTRAINT "ClassGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ClassGroup ClassGroup_tenantId_sectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassGroup"
    ADD CONSTRAINT "ClassGroup_tenantId_sectionId_fkey" FOREIGN KEY ("tenantId", "sectionId") REFERENCES public."Section"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: CourseRegistration CourseRegistration_tenantId_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CourseRegistration"
    ADD CONSTRAINT "CourseRegistration_tenantId_courseId_fkey" FOREIGN KEY ("tenantId", "courseId") REFERENCES public."Course"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: CourseRegistration CourseRegistration_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CourseRegistration"
    ADD CONSTRAINT "CourseRegistration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: CourseRegistration CourseRegistration_tenantId_periodId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CourseRegistration"
    ADD CONSTRAINT "CourseRegistration_tenantId_periodId_fkey" FOREIGN KEY ("tenantId", "periodId") REFERENCES public."AcademicPeriod"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: CourseRegistration CourseRegistration_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CourseRegistration"
    ADD CONSTRAINT "CourseRegistration_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Course Course_tenantId_departmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Course"
    ADD CONSTRAINT "Course_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES public."Department"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Course Course_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Course"
    ADD CONSTRAINT "Course_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: CustomDomain CustomDomain_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomDomain"
    ADD CONSTRAINT "CustomDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Department Department_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Department"
    ADD CONSTRAINT "Department_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EmailChangeToken EmailChangeToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailChangeToken"
    ADD CONSTRAINT "EmailChangeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FeeStructure FeeStructure_tenantId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FeeStructure"
    ADD CONSTRAINT "FeeStructure_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES public."ClassGroup"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: FeeStructure FeeStructure_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FeeStructure"
    ADD CONSTRAINT "FeeStructure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FeeStructure FeeStructure_tenantId_periodId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FeeStructure"
    ADD CONSTRAINT "FeeStructure_tenantId_periodId_fkey" FOREIGN KEY ("tenantId", "periodId") REFERENCES public."AcademicPeriod"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormAnswer FormAnswer_markedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAnswer"
    ADD CONSTRAINT "FormAnswer_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: FormAnswer FormAnswer_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAnswer"
    ADD CONSTRAINT "FormAnswer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormAnswer FormAnswer_tenantId_formQuestionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAnswer"
    ADD CONSTRAINT "FormAnswer_tenantId_formQuestionId_fkey" FOREIGN KEY ("tenantId", "formQuestionId") REFERENCES public."FormQuestion"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormAnswer FormAnswer_tenantId_responseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAnswer"
    ADD CONSTRAINT "FormAnswer_tenantId_responseId_fkey" FOREIGN KEY ("tenantId", "responseId") REFERENCES public."FormResponse"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormAudience FormAudience_tenantId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAudience"
    ADD CONSTRAINT "FormAudience_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES public."ClassGroup"("tenantId", id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: FormAudience FormAudience_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAudience"
    ADD CONSTRAINT "FormAudience_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormAudience FormAudience_tenantId_formId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAudience"
    ADD CONSTRAINT "FormAudience_tenantId_formId_fkey" FOREIGN KEY ("tenantId", "formId") REFERENCES public."Form"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormMarkingAudit FormMarkingAudit_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormMarkingAudit"
    ADD CONSTRAINT "FormMarkingAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: FormMarkingAudit FormMarkingAudit_tenantId_answerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormMarkingAudit"
    ADD CONSTRAINT "FormMarkingAudit_tenantId_answerId_fkey" FOREIGN KEY ("tenantId", "answerId") REFERENCES public."FormAnswer"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormMarkingAudit FormMarkingAudit_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormMarkingAudit"
    ADD CONSTRAINT "FormMarkingAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormMarkingAudit FormMarkingAudit_tenantId_responseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormMarkingAudit"
    ADD CONSTRAINT "FormMarkingAudit_tenantId_responseId_fkey" FOREIGN KEY ("tenantId", "responseId") REFERENCES public."FormResponse"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormParticipation FormParticipation_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormParticipation"
    ADD CONSTRAINT "FormParticipation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormParticipation FormParticipation_tenantId_formId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormParticipation"
    ADD CONSTRAINT "FormParticipation_tenantId_formId_fkey" FOREIGN KEY ("tenantId", "formId") REFERENCES public."Form"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormQuestion FormQuestion_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormQuestion"
    ADD CONSTRAINT "FormQuestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormQuestion FormQuestion_tenantId_formId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormQuestion"
    ADD CONSTRAINT "FormQuestion_tenantId_formId_fkey" FOREIGN KEY ("tenantId", "formId") REFERENCES public."Form"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormQuestion FormQuestion_tenantId_sourceItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormQuestion"
    ADD CONSTRAINT "FormQuestion_tenantId_sourceItemId_fkey" FOREIGN KEY ("tenantId", "sourceItemId") REFERENCES public."QuestionBankItem"("tenantId", id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: FormResponse FormResponse_markedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: FormResponse FormResponse_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: FormResponse FormResponse_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormResponse FormResponse_tenantId_formId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_tenantId_formId_fkey" FOREIGN KEY ("tenantId", "formId") REFERENCES public."Form"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormResponse FormResponse_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormTurnInAudit FormTurnInAudit_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnInAudit"
    ADD CONSTRAINT "FormTurnInAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: FormTurnInAudit FormTurnInAudit_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnInAudit"
    ADD CONSTRAINT "FormTurnInAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormTurnInAudit FormTurnInAudit_tenantId_turnInId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnInAudit"
    ADD CONSTRAINT "FormTurnInAudit_tenantId_turnInId_fkey" FOREIGN KEY ("tenantId", "turnInId") REFERENCES public."FormTurnIn"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormTurnIn FormTurnIn_markedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnIn"
    ADD CONSTRAINT "FormTurnIn_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: FormTurnIn FormTurnIn_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnIn"
    ADD CONSTRAINT "FormTurnIn_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: FormTurnIn FormTurnIn_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnIn"
    ADD CONSTRAINT "FormTurnIn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormTurnIn FormTurnIn_tenantId_formId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnIn"
    ADD CONSTRAINT "FormTurnIn_tenantId_formId_fkey" FOREIGN KEY ("tenantId", "formId") REFERENCES public."Form"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FormTurnIn FormTurnIn_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTurnIn"
    ADD CONSTRAINT "FormTurnIn_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Form Form_closedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Form Form_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: Form Form_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: Form Form_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: GradeBand GradeBand_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GradeBand"
    ADD CONSTRAINT "GradeBand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: GradeBand GradeBand_tenantId_scaleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GradeBand"
    ADD CONSTRAINT "GradeBand_tenantId_scaleId_fkey" FOREIGN KEY ("tenantId", "scaleId") REFERENCES public."GradeScale"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: GradeScale GradeScale_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GradeScale"
    ADD CONSTRAINT "GradeScale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: GradeScale GradeScale_tenantId_supersedesId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GradeScale"
    ADD CONSTRAINT "GradeScale_tenantId_supersedesId_fkey" FOREIGN KEY ("tenantId", "supersedesId") REFERENCES public."GradeScale"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: GuardianLinkToken GuardianLinkToken_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianLinkToken"
    ADD CONSTRAINT "GuardianLinkToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: GuardianLinkToken GuardianLinkToken_tenantId_guardianId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianLinkToken"
    ADD CONSTRAINT "GuardianLinkToken_tenantId_guardianId_fkey" FOREIGN KEY ("tenantId", "guardianId") REFERENCES public."GuardianRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: GuardianLinkToken GuardianLinkToken_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianLinkToken"
    ADD CONSTRAINT "GuardianLinkToken_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: GuardianLink GuardianLink_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianLink"
    ADD CONSTRAINT "GuardianLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: GuardianLink GuardianLink_tenantId_guardianId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianLink"
    ADD CONSTRAINT "GuardianLink_tenantId_guardianId_fkey" FOREIGN KEY ("tenantId", "guardianId") REFERENCES public."GuardianRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: GuardianLink GuardianLink_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianLink"
    ADD CONSTRAINT "GuardianLink_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: GuardianRecord GuardianRecord_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianRecord"
    ADD CONSTRAINT "GuardianRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: GuardianRecord GuardianRecord_userId_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuardianRecord"
    ADD CONSTRAINT "GuardianRecord_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES public."TenantMembership"("userId", "tenantId") ON UPDATE CASCADE;

--
-- Name: Invitation Invitation_acceptedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Invitation Invitation_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES public."Campus"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Invitation Invitation_invitedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Invitation Invitation_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Invitation Invitation_tenantId_staffRecordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_tenantId_staffRecordId_fkey" FOREIGN KEY ("tenantId", "staffRecordId") REFERENCES public."StaffRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: InvoiceDiscount InvoiceDiscount_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InvoiceDiscount"
    ADD CONSTRAINT "InvoiceDiscount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: InvoiceDiscount InvoiceDiscount_tenantId_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InvoiceDiscount"
    ADD CONSTRAINT "InvoiceDiscount_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES public."Invoice"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Invoice Invoice_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Invoice Invoice_tenantId_periodId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_tenantId_periodId_fkey" FOREIGN KEY ("tenantId", "periodId") REFERENCES public."AcademicPeriod"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Invoice Invoice_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: LearningMaterial LearningMaterial_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LearningMaterial"
    ADD CONSTRAINT "LearningMaterial_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: LearningMaterial LearningMaterial_tenantId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LearningMaterial"
    ADD CONSTRAINT "LearningMaterial_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES public."ClassGroup"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: LearningMaterial LearningMaterial_tenantId_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LearningMaterial"
    ADD CONSTRAINT "LearningMaterial_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES public."StaffRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: LearningMaterial LearningMaterial_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LearningMaterial"
    ADD CONSTRAINT "LearningMaterial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: LearningMaterial LearningMaterial_tenantId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LearningMaterial"
    ADD CONSTRAINT "LearningMaterial_tenantId_subjectId_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES public."Subject"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: MfaChallenge MfaChallenge_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MfaChallenge"
    ADD CONSTRAINT "MfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MfaCredential MfaCredential_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MfaCredential"
    ADD CONSTRAINT "MfaCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MfaRecoveryCode MfaRecoveryCode_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MfaRecoveryCode"
    ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: NotificationAuditLog NotificationAuditLog_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationAuditLog"
    ADD CONSTRAINT "NotificationAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: NotificationDispatch NotificationDispatch_recipientUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationDispatch"
    ADD CONSTRAINT "NotificationDispatch_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: NotificationDispatch NotificationDispatch_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationDispatch"
    ADD CONSTRAINT "NotificationDispatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: NotificationDispatch NotificationDispatch_tenantId_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationDispatch"
    ADD CONSTRAINT "NotificationDispatch_tenantId_templateId_fkey" FOREIGN KEY ("tenantId", "templateId") REFERENCES public."NotificationTemplate"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: NotificationTemplate NotificationTemplate_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NotificationTemplate"
    ADD CONSTRAINT "NotificationTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PasswordResetToken PasswordResetToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Payment Payment_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Payment Payment_tenantId_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES public."Invoice"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PracticeAttempt PracticeAttempt_tenantId_bankItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeAttempt"
    ADD CONSTRAINT "PracticeAttempt_tenantId_bankItemId_fkey" FOREIGN KEY ("tenantId", "bankItemId") REFERENCES public."QuestionBankItem"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PracticeAttempt PracticeAttempt_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeAttempt"
    ADD CONSTRAINT "PracticeAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PracticeAttempt PracticeAttempt_tenantId_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeAttempt"
    ADD CONSTRAINT "PracticeAttempt_tenantId_sessionId_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES public."PracticeSession"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PracticeAttempt PracticeAttempt_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeAttempt"
    ADD CONSTRAINT "PracticeAttempt_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PracticeSession PracticeSession_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeSession"
    ADD CONSTRAINT "PracticeSession_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: PracticeSession PracticeSession_tenantId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeSession"
    ADD CONSTRAINT "PracticeSession_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES public."ClassGroup"("tenantId", id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: PracticeSession PracticeSession_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeSession"
    ADD CONSTRAINT "PracticeSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PracticeSession PracticeSession_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PracticeSession"
    ADD CONSTRAINT "PracticeSession_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramAssessmentGroup ProgramAssessmentGroup_tenantId_programId_assessmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAssessmentGroup"
    ADD CONSTRAINT "ProgramAssessmentGroup_tenantId_programId_assessmentId_fkey" FOREIGN KEY ("tenantId", "programId", "assessmentId") REFERENCES public."ProgramAssessment"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramAssessmentGroup ProgramAssessmentGroup_tenantId_programId_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAssessmentGroup"
    ADD CONSTRAINT "ProgramAssessmentGroup_tenantId_programId_groupId_fkey" FOREIGN KEY ("tenantId", "programId", "groupId") REFERENCES public."ProgramGroup"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramAssessment ProgramAssessment_tenantId_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAssessment"
    ADD CONSTRAINT "ProgramAssessment_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES public."Program"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramAttendance ProgramAttendance_tenantId_programId_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAttendance"
    ADD CONSTRAINT "ProgramAttendance_tenantId_programId_participantId_fkey" FOREIGN KEY ("tenantId", "programId", "participantId") REFERENCES public."ProgramParticipant"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramAttendance ProgramAttendance_tenantId_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAttendance"
    ADD CONSTRAINT "ProgramAttendance_tenantId_sessionId_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES public."ProgramSession"("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramAudit ProgramAudit_tenantId_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramAudit"
    ADD CONSTRAINT "ProgramAudit_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES public."Program"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramCampus ProgramCampus_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramCampus"
    ADD CONSTRAINT "ProgramCampus_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramCampus ProgramCampus_tenantId_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramCampus"
    ADD CONSTRAINT "ProgramCampus_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES public."Program"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramCertificate ProgramCertificate_replaces_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramCertificate"
    ADD CONSTRAINT "ProgramCertificate_replaces_fkey" FOREIGN KEY ("tenantId", "replacesId") REFERENCES public."ProgramCertificate"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: ProgramCertificate ProgramCertificate_tenantId_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramCertificate"
    ADD CONSTRAINT "ProgramCertificate_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES public."Program"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramCertificate ProgramCertificate_tenantId_programId_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramCertificate"
    ADD CONSTRAINT "ProgramCertificate_tenantId_programId_participantId_fkey" FOREIGN KEY ("tenantId", "programId", "participantId") REFERENCES public."ProgramParticipant"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramFeeExemption ProgramFeeExemption_tenantId_programId_feeItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramFeeExemption"
    ADD CONSTRAINT "ProgramFeeExemption_tenantId_programId_feeItemId_fkey" FOREIGN KEY ("tenantId", "programId", "feeItemId") REFERENCES public."ProgramFeeItem"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramFeeExemption ProgramFeeExemption_tenantId_programId_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramFeeExemption"
    ADD CONSTRAINT "ProgramFeeExemption_tenantId_programId_participantId_fkey" FOREIGN KEY ("tenantId", "programId", "participantId") REFERENCES public."ProgramParticipant"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramFeeItem ProgramFeeItem_tenantId_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramFeeItem"
    ADD CONSTRAINT "ProgramFeeItem_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES public."Program"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramGroup ProgramGroup_tenantId_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramGroup"
    ADD CONSTRAINT "ProgramGroup_tenantId_parentId_fkey" FOREIGN KEY ("tenantId", "parentId") REFERENCES public."ProgramGroup"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: ProgramGroup ProgramGroup_tenantId_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramGroup"
    ADD CONSTRAINT "ProgramGroup_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES public."Program"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramInvoiceDiscount ProgramInvoiceDiscount_tenantId_programId_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramInvoiceDiscount"
    ADD CONSTRAINT "ProgramInvoiceDiscount_tenantId_programId_invoiceId_fkey" FOREIGN KEY ("tenantId", "programId", "invoiceId") REFERENCES public."ProgramInvoice"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramInvoice ProgramInvoice_tenantId_programId_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramInvoice"
    ADD CONSTRAINT "ProgramInvoice_tenantId_programId_participantId_fkey" FOREIGN KEY ("tenantId", "programId", "participantId") REFERENCES public."ProgramParticipant"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramLevelLabel ProgramLevelLabel_tenantId_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramLevelLabel"
    ADD CONSTRAINT "ProgramLevelLabel_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES public."Program"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramParticipant ProgramParticipant_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramParticipant"
    ADD CONSTRAINT "ProgramParticipant_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: ProgramParticipant ProgramParticipant_tenantId_guardianId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramParticipant"
    ADD CONSTRAINT "ProgramParticipant_tenantId_guardianId_fkey" FOREIGN KEY ("tenantId", "guardianId") REFERENCES public."GuardianRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: ProgramParticipant ProgramParticipant_tenantId_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramParticipant"
    ADD CONSTRAINT "ProgramParticipant_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES public."Program"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramParticipant ProgramParticipant_tenantId_programId_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramParticipant"
    ADD CONSTRAINT "ProgramParticipant_tenantId_programId_groupId_fkey" FOREIGN KEY ("tenantId", "programId", "groupId") REFERENCES public."ProgramGroup"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramParticipant ProgramParticipant_tenantId_staffRecordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramParticipant"
    ADD CONSTRAINT "ProgramParticipant_tenantId_staffRecordId_fkey" FOREIGN KEY ("tenantId", "staffRecordId") REFERENCES public."StaffRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: ProgramParticipant ProgramParticipant_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramParticipant"
    ADD CONSTRAINT "ProgramParticipant_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: ProgramPayment ProgramPayment_tenantId_programId_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramPayment"
    ADD CONSTRAINT "ProgramPayment_tenantId_programId_invoiceId_fkey" FOREIGN KEY ("tenantId", "programId", "invoiceId") REFERENCES public."ProgramInvoice"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramScore ProgramScore_tenantId_programId_assessmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramScore"
    ADD CONSTRAINT "ProgramScore_tenantId_programId_assessmentId_fkey" FOREIGN KEY ("tenantId", "programId", "assessmentId") REFERENCES public."ProgramAssessment"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramScore ProgramScore_tenantId_programId_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramScore"
    ADD CONSTRAINT "ProgramScore_tenantId_programId_participantId_fkey" FOREIGN KEY ("tenantId", "programId", "participantId") REFERENCES public."ProgramParticipant"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramSession ProgramSession_tenantId_programId_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramSession"
    ADD CONSTRAINT "ProgramSession_tenantId_programId_groupId_fkey" FOREIGN KEY ("tenantId", "programId", "groupId") REFERENCES public."ProgramGroup"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramStaffGroup ProgramStaffGroup_tenantId_programId_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramStaffGroup"
    ADD CONSTRAINT "ProgramStaffGroup_tenantId_programId_groupId_fkey" FOREIGN KEY ("tenantId", "programId", "groupId") REFERENCES public."ProgramGroup"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgramStaffGroup ProgramStaffGroup_tenantId_programId_programStaffId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramStaffGroup"
    ADD CONSTRAINT "ProgramStaffGroup_tenantId_programId_programStaffId_fkey" FOREIGN KEY ("tenantId", "programId", "programStaffId") REFERENCES public."ProgramStaff"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramStaff ProgramStaff_tenantId_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramStaff"
    ADD CONSTRAINT "ProgramStaff_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES public."Program"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgramStaff ProgramStaff_userId_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgramStaff"
    ADD CONSTRAINT "ProgramStaff_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES public."TenantMembership"("userId", "tenantId") ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Program Program_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Program"
    ADD CONSTRAINT "Program_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgressEntry ProgressEntry_tenantId_programId_recordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressEntry"
    ADD CONSTRAINT "ProgressEntry_tenantId_programId_recordId_fkey" FOREIGN KEY ("tenantId", "programId", "recordId") REFERENCES public."ProgressRecord"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgressLock ProgressLock_tenantId_programId_entryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressLock"
    ADD CONSTRAINT "ProgressLock_tenantId_programId_entryId_fkey" FOREIGN KEY ("tenantId", "programId", "entryId") REFERENCES public."ProgressEntry"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgressRecord ProgressRecord_tenantId_programId_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressRecord"
    ADD CONSTRAINT "ProgressRecord_tenantId_programId_participantId_fkey" FOREIGN KEY ("tenantId", "programId", "participantId") REFERENCES public."ProgramParticipant"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgressRecord ProgressRecord_tenantId_programId_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressRecord"
    ADD CONSTRAINT "ProgressRecord_tenantId_programId_templateId_fkey" FOREIGN KEY ("tenantId", "programId", "templateId") REFERENCES public."ProgressTemplate"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: ProgressSeen ProgressSeen_tenantId_programId_recordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressSeen"
    ADD CONSTRAINT "ProgressSeen_tenantId_programId_recordId_fkey" FOREIGN KEY ("tenantId", "programId", "recordId") REFERENCES public."ProgressRecord"("tenantId", "programId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ProgressTemplate ProgressTemplate_tenantId_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProgressTemplate"
    ADD CONSTRAINT "ProgressTemplate_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES public."Program"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PromotionBatch PromotionBatch_tenantId_sourceClassGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionBatch"
    ADD CONSTRAINT "PromotionBatch_tenantId_sourceClassGroupId_fkey" FOREIGN KEY ("tenantId", "sourceClassGroupId") REFERENCES public."ClassGroup"("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: PromotionBatch PromotionBatch_tenantId_sourceSessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionBatch"
    ADD CONSTRAINT "PromotionBatch_tenantId_sourceSessionId_fkey" FOREIGN KEY ("tenantId", "sourceSessionId") REFERENCES public."AcademicSession"("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: PromotionBatch PromotionBatch_tenantId_targetClassGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionBatch"
    ADD CONSTRAINT "PromotionBatch_tenantId_targetClassGroupId_fkey" FOREIGN KEY ("tenantId", "targetClassGroupId") REFERENCES public."ClassGroup"("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: PromotionBatch PromotionBatch_tenantId_targetSessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionBatch"
    ADD CONSTRAINT "PromotionBatch_tenantId_targetSessionId_fkey" FOREIGN KEY ("tenantId", "targetSessionId") REFERENCES public."AcademicSession"("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: PromotionRecord PromotionRecord_tenantId_batchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionRecord"
    ADD CONSTRAINT "PromotionRecord_tenantId_batchId_fkey" FOREIGN KEY ("tenantId", "batchId") REFERENCES public."PromotionBatch"("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: PromotionRecord PromotionRecord_tenantId_sourceEnrollmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionRecord"
    ADD CONSTRAINT "PromotionRecord_tenantId_sourceEnrollmentId_fkey" FOREIGN KEY ("tenantId", "sourceEnrollmentId") REFERENCES public."StudentEnrollment"("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: PromotionRecord PromotionRecord_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionRecord"
    ADD CONSTRAINT "PromotionRecord_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: PromotionRecord PromotionRecord_tenantId_targetClassGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionRecord"
    ADD CONSTRAINT "PromotionRecord_tenantId_targetClassGroupId_fkey" FOREIGN KEY ("tenantId", "targetClassGroupId") REFERENCES public."ClassGroup"("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: PromotionRecord PromotionRecord_tenantId_targetEnrollmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionRecord"
    ADD CONSTRAINT "PromotionRecord_tenantId_targetEnrollmentId_fkey" FOREIGN KEY ("tenantId", "targetEnrollmentId") REFERENCES public."StudentEnrollment"("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: PromotionReversal PromotionReversal_tenantId_batchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromotionReversal"
    ADD CONSTRAINT "PromotionReversal_tenantId_batchId_fkey" FOREIGN KEY ("tenantId", "batchId") REFERENCES public."PromotionBatch"("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: QuestionBankAudit QuestionBankAudit_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankAudit"
    ADD CONSTRAINT "QuestionBankAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE;

--
-- Name: QuestionBankAudit QuestionBankAudit_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankAudit"
    ADD CONSTRAINT "QuestionBankAudit_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: QuestionBankAudit QuestionBankAudit_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankAudit"
    ADD CONSTRAINT "QuestionBankAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankClassTag QuestionBankClassTag_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankClassTag"
    ADD CONSTRAINT "QuestionBankClassTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankClassTag QuestionBankClassTag_tenantId_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankClassTag"
    ADD CONSTRAINT "QuestionBankClassTag_tenantId_itemId_fkey" FOREIGN KEY ("tenantId", "itemId") REFERENCES public."QuestionBankItem"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankImage QuestionBankImage_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankImage"
    ADD CONSTRAINT "QuestionBankImage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankImage QuestionBankImage_tenantId_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankImage"
    ADD CONSTRAINT "QuestionBankImage_tenantId_itemId_fkey" FOREIGN KEY ("tenantId", "itemId") REFERENCES public."QuestionBankItem"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankItemVersion QuestionBankItemVersion_actorUserId_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItemVersion"
    ADD CONSTRAINT "QuestionBankItemVersion_actorUserId_tenantId_fkey" FOREIGN KEY ("actorUserId", "tenantId") REFERENCES public."TenantMembership"("userId", "tenantId") ON UPDATE CASCADE;

--
-- Name: QuestionBankItemVersion QuestionBankItemVersion_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItemVersion"
    ADD CONSTRAINT "QuestionBankItemVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankItemVersion QuestionBankItemVersion_tenantId_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItemVersion"
    ADD CONSTRAINT "QuestionBankItemVersion_tenantId_itemId_fkey" FOREIGN KEY ("tenantId", "itemId") REFERENCES public."QuestionBankItem"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: QuestionBankItem QuestionBankItem_approvedById_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItem"
    ADD CONSTRAINT "QuestionBankItem_approvedById_tenantId_fkey" FOREIGN KEY ("approvedById", "tenantId") REFERENCES public."TenantMembership"("userId", "tenantId") ON UPDATE CASCADE;

--
-- Name: QuestionBankItem QuestionBankItem_submittedById_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItem"
    ADD CONSTRAINT "QuestionBankItem_submittedById_tenantId_fkey" FOREIGN KEY ("submittedById", "tenantId") REFERENCES public."TenantMembership"("userId", "tenantId") ON UPDATE CASCADE;

--
-- Name: QuestionBankItem QuestionBankItem_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItem"
    ADD CONSTRAINT "QuestionBankItem_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: QuestionBankItem QuestionBankItem_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItem"
    ADD CONSTRAINT "QuestionBankItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankItem QuestionBankItem_tenantId_visibleAfterQuizId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankItem"
    ADD CONSTRAINT "QuestionBankItem_tenantId_visibleAfterQuizId_fkey" FOREIGN KEY ("tenantId", "visibleAfterQuizId") REFERENCES public."Quiz"("tenantId", id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: QuestionBankPrintLog QuestionBankPrintLog_printedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankPrintLog"
    ADD CONSTRAINT "QuestionBankPrintLog_printedById_fkey" FOREIGN KEY ("printedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: QuestionBankPrintLog QuestionBankPrintLog_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankPrintLog"
    ADD CONSTRAINT "QuestionBankPrintLog_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: QuestionBankPrintLog QuestionBankPrintLog_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankPrintLog"
    ADD CONSTRAINT "QuestionBankPrintLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankPrintLog QuestionBankPrintLog_tenantId_recipientStudentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankPrintLog"
    ADD CONSTRAINT "QuestionBankPrintLog_tenantId_recipientStudentId_fkey" FOREIGN KEY ("tenantId", "recipientStudentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: QuestionBankReview QuestionBankReview_reviewerId_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReview"
    ADD CONSTRAINT "QuestionBankReview_reviewerId_tenantId_fkey" FOREIGN KEY ("reviewerId", "tenantId") REFERENCES public."TenantMembership"("userId", "tenantId") ON UPDATE CASCADE;

--
-- Name: QuestionBankReview QuestionBankReview_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReview"
    ADD CONSTRAINT "QuestionBankReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankReview QuestionBankReview_tenantId_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReview"
    ADD CONSTRAINT "QuestionBankReview_tenantId_itemId_fkey" FOREIGN KEY ("tenantId", "itemId") REFERENCES public."QuestionBankItem"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: QuestionBankReviewer QuestionBankReviewer_assignedById_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReviewer"
    ADD CONSTRAINT "QuestionBankReviewer_assignedById_tenantId_fkey" FOREIGN KEY ("assignedById", "tenantId") REFERENCES public."TenantMembership"("userId", "tenantId") ON UPDATE CASCADE;

--
-- Name: QuestionBankReviewer QuestionBankReviewer_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReviewer"
    ADD CONSTRAINT "QuestionBankReviewer_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankReviewer QuestionBankReviewer_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReviewer"
    ADD CONSTRAINT "QuestionBankReviewer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankReviewer QuestionBankReviewer_userId_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankReviewer"
    ADD CONSTRAINT "QuestionBankReviewer_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES public."TenantMembership"("userId", "tenantId") ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankSetting QuestionBankSetting_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankSetting"
    ADD CONSTRAINT "QuestionBankSetting_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankSetting QuestionBankSetting_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankSetting"
    ADD CONSTRAINT "QuestionBankSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionBankSetting QuestionBankSetting_updatedById_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionBankSetting"
    ADD CONSTRAINT "QuestionBankSetting_updatedById_tenantId_fkey" FOREIGN KEY ("updatedById", "tenantId") REFERENCES public."TenantMembership"("userId", "tenantId") ON UPDATE CASCADE;

--
-- Name: QuestionOverlapFlag QuestionOverlapFlag_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionOverlapFlag"
    ADD CONSTRAINT "QuestionOverlapFlag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionOverlapFlag QuestionOverlapFlag_tenantId_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionOverlapFlag"
    ADD CONSTRAINT "QuestionOverlapFlag_tenantId_itemId_fkey" FOREIGN KEY ("tenantId", "itemId") REFERENCES public."QuestionBankItem"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionOverlapFlag QuestionOverlapFlag_tenantId_similarToItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionOverlapFlag"
    ADD CONSTRAINT "QuestionOverlapFlag_tenantId_similarToItemId_fkey" FOREIGN KEY ("tenantId", "similarToItemId") REFERENCES public."QuestionBankItem"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: QuestionReport QuestionReport_reporterUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionReport"
    ADD CONSTRAINT "QuestionReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionReport QuestionReport_resolvedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionReport"
    ADD CONSTRAINT "QuestionReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: QuestionReport QuestionReport_tenantId_bankItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionReport"
    ADD CONSTRAINT "QuestionReport_tenantId_bankItemId_fkey" FOREIGN KEY ("tenantId", "bankItemId") REFERENCES public."QuestionBankItem"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionReport QuestionReport_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionReport"
    ADD CONSTRAINT "QuestionReport_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: QuestionReport QuestionReport_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionReport"
    ADD CONSTRAINT "QuestionReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuestionReport QuestionReport_tenantId_reporterStudentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionReport"
    ADD CONSTRAINT "QuestionReport_tenantId_reporterStudentId_fkey" FOREIGN KEY ("tenantId", "reporterStudentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: QuizAttempt QuizAttempt_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizAttempt"
    ADD CONSTRAINT "QuizAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuizAttempt QuizAttempt_tenantId_quizId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizAttempt"
    ADD CONSTRAINT "QuizAttempt_tenantId_quizId_fkey" FOREIGN KEY ("tenantId", "quizId") REFERENCES public."Quiz"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuizAttempt QuizAttempt_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizAttempt"
    ADD CONSTRAINT "QuizAttempt_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: QuizQuestion QuizQuestion_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizQuestion"
    ADD CONSTRAINT "QuizQuestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuizQuestion QuizQuestion_tenantId_quizId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizQuestion"
    ADD CONSTRAINT "QuizQuestion_tenantId_quizId_fkey" FOREIGN KEY ("tenantId", "quizId") REFERENCES public."Quiz"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: QuizQuestion QuizQuestion_tenantId_sourceItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuizQuestion"
    ADD CONSTRAINT "QuizQuestion_tenantId_sourceItemId_fkey" FOREIGN KEY ("tenantId", "sourceItemId") REFERENCES public."QuestionBankItem"("tenantId", id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Quiz Quiz_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Quiz"
    ADD CONSTRAINT "Quiz_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: Quiz Quiz_tenantId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Quiz"
    ADD CONSTRAINT "Quiz_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES public."ClassGroup"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: Quiz Quiz_tenantId_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Quiz"
    ADD CONSTRAINT "Quiz_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES public."StaffRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: Quiz Quiz_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Quiz"
    ADD CONSTRAINT "Quiz_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Quiz Quiz_tenantId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Quiz"
    ADD CONSTRAINT "Quiz_tenantId_subjectId_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES public."Subject"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: ReceiptCounter ReceiptCounter_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReceiptCounter"
    ADD CONSTRAINT "ReceiptCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ReportRemark ReportRemark_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRemark"
    ADD CONSTRAINT "ReportRemark_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ReportRemark ReportRemark_tenantId_periodId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRemark"
    ADD CONSTRAINT "ReportRemark_tenantId_periodId_fkey" FOREIGN KEY ("tenantId", "periodId") REFERENCES public."AcademicPeriod"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ReportRemark ReportRemark_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRemark"
    ADD CONSTRAINT "ReportRemark_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ResultApprovalScope ResultApprovalScope_tenantId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultApprovalScope"
    ADD CONSTRAINT "ResultApprovalScope_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES public."ClassGroup"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: ResultApprovalScope ResultApprovalScope_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultApprovalScope"
    ADD CONSTRAINT "ResultApprovalScope_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ResultApprovalScope ResultApprovalScope_tenantId_sectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultApprovalScope"
    ADD CONSTRAINT "ResultApprovalScope_tenantId_sectionId_fkey" FOREIGN KEY ("tenantId", "sectionId") REFERENCES public."Section"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: ResultApprovalScope ResultApprovalScope_userId_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultApprovalScope"
    ADD CONSTRAINT "ResultApprovalScope_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES public."TenantMembership"("userId", "tenantId") ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ResultAudit ResultAudit_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultAudit"
    ADD CONSTRAINT "ResultAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: ResultAudit ResultAudit_tenantId_resultId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResultAudit"
    ADD CONSTRAINT "ResultAudit_tenantId_resultId_fkey" FOREIGN KEY ("tenantId", "resultId") REFERENCES public."Result"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Result Result_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Result Result_tenantId_periodId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_tenantId_periodId_fkey" FOREIGN KEY ("tenantId", "periodId") REFERENCES public."AcademicPeriod"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Result Result_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Result Result_tenantId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Result"
    ADD CONSTRAINT "Result_tenantId_subjectId_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES public."Subject"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SchoolSettings SchoolSettings_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SchoolSettings"
    ADD CONSTRAINT "SchoolSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Section Section_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Section"
    ADD CONSTRAINT "Section_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: Section Section_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Section"
    ADD CONSTRAINT "Section_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Session Session_supportTenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_supportTenantId_fkey" FOREIGN KEY ("supportTenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Session Session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SettingsChangeAudit SettingsChangeAudit_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SettingsChangeAudit"
    ADD CONSTRAINT "SettingsChangeAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: StaffRecord StaffRecord_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffRecord"
    ADD CONSTRAINT "StaffRecord_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: StaffRecord StaffRecord_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffRecord"
    ADD CONSTRAINT "StaffRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: StaffRecord StaffRecord_userId_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffRecord"
    ADD CONSTRAINT "StaffRecord_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES public."TenantMembership"("userId", "tenantId") ON UPDATE CASCADE;

--
-- Name: StaffSubjectAssignment StaffSubjectAssignment_tenantId_classArmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffSubjectAssignment"
    ADD CONSTRAINT "StaffSubjectAssignment_tenantId_classArmId_fkey" FOREIGN KEY ("tenantId", "classArmId") REFERENCES public."ClassArm"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: StaffSubjectAssignment StaffSubjectAssignment_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffSubjectAssignment"
    ADD CONSTRAINT "StaffSubjectAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: StaffSubjectAssignment StaffSubjectAssignment_tenantId_staffRecordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffSubjectAssignment"
    ADD CONSTRAINT "StaffSubjectAssignment_tenantId_staffRecordId_fkey" FOREIGN KEY ("tenantId", "staffRecordId") REFERENCES public."StaffRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: StaffSubjectAssignment StaffSubjectAssignment_tenantId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StaffSubjectAssignment"
    ADD CONSTRAINT "StaffSubjectAssignment_tenantId_subjectId_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES public."Subject"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: StandingEvent StandingEvent_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StandingEvent"
    ADD CONSTRAINT "StandingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: StandingEvent StandingEvent_tenantId_staffRecordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StandingEvent"
    ADD CONSTRAINT "StandingEvent_tenantId_staffRecordId_fkey" FOREIGN KEY ("tenantId", "staffRecordId") REFERENCES public."StaffRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: StandingEvent StandingEvent_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StandingEvent"
    ADD CONSTRAINT "StandingEvent_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: StudentEnrollment StudentEnrollment_tenantId_classArmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentEnrollment"
    ADD CONSTRAINT "StudentEnrollment_tenantId_classArmId_fkey" FOREIGN KEY ("tenantId", "classArmId") REFERENCES public."ClassArm"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: StudentEnrollment StudentEnrollment_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentEnrollment"
    ADD CONSTRAINT "StudentEnrollment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: StudentEnrollment StudentEnrollment_tenantId_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentEnrollment"
    ADD CONSTRAINT "StudentEnrollment_tenantId_sessionId_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES public."AcademicSession"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: StudentEnrollment StudentEnrollment_tenantId_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentEnrollment"
    ADD CONSTRAINT "StudentEnrollment_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES public."StudentRecord"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: StudentRecord StudentRecord_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentRecord"
    ADD CONSTRAINT "StudentRecord_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: StudentRecord StudentRecord_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentRecord"
    ADD CONSTRAINT "StudentRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: StudentRecord StudentRecord_userId_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentRecord"
    ADD CONSTRAINT "StudentRecord_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES public."TenantMembership"("userId", "tenantId") ON UPDATE CASCADE;

--
-- Name: SubjectOffering SubjectOffering_tenantId_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SubjectOffering"
    ADD CONSTRAINT "SubjectOffering_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES public."ClassGroup"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: SubjectOffering SubjectOffering_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SubjectOffering"
    ADD CONSTRAINT "SubjectOffering_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SubjectOffering SubjectOffering_tenantId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SubjectOffering"
    ADD CONSTRAINT "SubjectOffering_tenantId_subjectId_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES public."Subject"("tenantId", id) ON UPDATE CASCADE;

--
-- Name: Subject Subject_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Subject"
    ADD CONSTRAINT "Subject_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SupportGrant SupportGrant_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupportGrant"
    ADD CONSTRAINT "SupportGrant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SupportGrant SupportGrant_granteeUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupportGrant"
    ADD CONSTRAINT "SupportGrant_granteeUserId_fkey" FOREIGN KEY ("granteeUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SupportGrant SupportGrant_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupportGrant"
    ADD CONSTRAINT "SupportGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TenantMembership TenantMembership_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantMembership"
    ADD CONSTRAINT "TenantMembership_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES public."Campus"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: TenantMembership TenantMembership_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantMembership"
    ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TenantMembership TenantMembership_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantMembership"
    ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TenantSetting TenantSetting_tenantId_campusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantSetting"
    ADD CONSTRAINT "TenantSetting_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES public."Campus"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TenantSetting TenantSetting_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantSetting"
    ADD CONSTRAINT "TenantSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TenantSetting TenantSetting_updatedById_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantSetting"
    ADD CONSTRAINT "TenantSetting_updatedById_tenantId_fkey" FOREIGN KEY ("updatedById", "tenantId") REFERENCES public."TenantMembership"("userId", "tenantId") ON UPDATE CASCADE;

--
-- Name: TenantStats TenantStats_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantStats"
    ADD CONSTRAINT "TenantStats_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimetableSlot TimetableSlot_tenantId_classArmId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimetableSlot"
    ADD CONSTRAINT "TimetableSlot_tenantId_classArmId_fkey" FOREIGN KEY ("tenantId", "classArmId") REFERENCES public."ClassArm"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimetableSlot TimetableSlot_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimetableSlot"
    ADD CONSTRAINT "TimetableSlot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimetableSlot TimetableSlot_tenantId_staffRecordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimetableSlot"
    ADD CONSTRAINT "TimetableSlot_tenantId_staffRecordId_fkey" FOREIGN KEY ("tenantId", "staffRecordId") REFERENCES public."StaffRecord"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimetableSlot TimetableSlot_tenantId_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimetableSlot"
    ADD CONSTRAINT "TimetableSlot_tenantId_subjectId_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES public."Subject"("tenantId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AcademicPeriod; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AcademicPeriod" ENABLE ROW LEVEL SECURITY;

--
-- Name: AcademicSession; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AcademicSession" ENABLE ROW LEVEL SECURITY;

--
-- Name: AdmissionCounter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AdmissionCounter" ENABLE ROW LEVEL SECURITY;

--
-- Name: Announcement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Announcement" ENABLE ROW LEVEL SECURITY;

--
-- Name: AssessmentComponent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AssessmentComponent" ENABLE ROW LEVEL SECURITY;

--
-- Name: AssessmentScheme; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AssessmentScheme" ENABLE ROW LEVEL SECURITY;

--
-- Name: Assignment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Assignment" ENABLE ROW LEVEL SECURITY;

--
-- Name: AssignmentSubmission; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AssignmentSubmission" ENABLE ROW LEVEL SECURITY;

--
-- Name: AttendanceRecord; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AttendanceRecord" ENABLE ROW LEVEL SECURITY;

--
-- Name: AuditLog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: Campus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Campus" ENABLE ROW LEVEL SECURITY;

--
-- Name: Certificate; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Certificate" ENABLE ROW LEVEL SECURITY;

--
-- Name: ClassArm; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ClassArm" ENABLE ROW LEVEL SECURITY;

--
-- Name: ClassGroup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ClassGroup" ENABLE ROW LEVEL SECURITY;

--
-- Name: Course; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Course" ENABLE ROW LEVEL SECURITY;

--
-- Name: CourseRegistration; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CourseRegistration" ENABLE ROW LEVEL SECURITY;

--
-- Name: CustomDomain; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CustomDomain" ENABLE ROW LEVEL SECURITY;

--
-- Name: Department; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Department" ENABLE ROW LEVEL SECURITY;

--
-- Name: FeeStructure; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FeeStructure" ENABLE ROW LEVEL SECURITY;

--
-- Name: Form; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Form" ENABLE ROW LEVEL SECURITY;

--
-- Name: FormAnswer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FormAnswer" ENABLE ROW LEVEL SECURITY;

--
-- Name: FormAudience; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FormAudience" ENABLE ROW LEVEL SECURITY;

--
-- Name: FormMarkingAudit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FormMarkingAudit" ENABLE ROW LEVEL SECURITY;

--
-- Name: FormParticipation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FormParticipation" ENABLE ROW LEVEL SECURITY;

--
-- Name: FormQuestion; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FormQuestion" ENABLE ROW LEVEL SECURITY;

--
-- Name: FormResponse; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FormResponse" ENABLE ROW LEVEL SECURITY;

--
-- Name: FormTurnIn; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FormTurnIn" ENABLE ROW LEVEL SECURITY;

--
-- Name: FormTurnInAudit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FormTurnInAudit" ENABLE ROW LEVEL SECURITY;

--
-- Name: GradeBand; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GradeBand" ENABLE ROW LEVEL SECURITY;

--
-- Name: GradeScale; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GradeScale" ENABLE ROW LEVEL SECURITY;

--
-- Name: GuardianLink; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GuardianLink" ENABLE ROW LEVEL SECURITY;

--
-- Name: GuardianLinkToken; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GuardianLinkToken" ENABLE ROW LEVEL SECURITY;

--
-- Name: GuardianRecord; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GuardianRecord" ENABLE ROW LEVEL SECURITY;

--
-- Name: Invitation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Invitation" ENABLE ROW LEVEL SECURITY;

--
-- Name: Invoice; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Invoice" ENABLE ROW LEVEL SECURITY;

--
-- Name: InvoiceDiscount; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."InvoiceDiscount" ENABLE ROW LEVEL SECURITY;

--
-- Name: LearningMaterial; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."LearningMaterial" ENABLE ROW LEVEL SECURITY;

--
-- Name: NotificationAuditLog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."NotificationAuditLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: NotificationDispatch; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."NotificationDispatch" ENABLE ROW LEVEL SECURITY;

--
-- Name: NotificationTemplate; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."NotificationTemplate" ENABLE ROW LEVEL SECURITY;

--
-- Name: Payment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Payment" ENABLE ROW LEVEL SECURITY;

--
-- Name: PlatformAuditLog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PlatformAuditLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: PracticeAttempt; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PracticeAttempt" ENABLE ROW LEVEL SECURITY;

--
-- Name: PracticeSession; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PracticeSession" ENABLE ROW LEVEL SECURITY;

--
-- Name: Program; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Program" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramAssessment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramAssessment" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramAssessmentGroup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramAssessmentGroup" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramAttendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramAttendance" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramAttendanceChange; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramAttendanceChange" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramAudit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramAudit" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramCampus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramCampus" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramCertificate; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramCertificate" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramCounter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramCounter" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramFeeExemption; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramFeeExemption" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramFeeItem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramFeeItem" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramGroup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramGroup" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramInvoice; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramInvoice" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramInvoiceDiscount; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramInvoiceDiscount" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramLevelLabel; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramLevelLabel" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramParticipant; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramParticipant" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramPayment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramPayment" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramScore; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramScore" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramScoreChange; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramScoreChange" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramSession; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramSession" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramStaff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramStaff" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgramStaffGroup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgramStaffGroup" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgressEntry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgressEntry" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgressEntryRevision; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgressEntryRevision" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgressLock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgressLock" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgressRecord; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgressRecord" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgressSeen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgressSeen" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProgressTemplate; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProgressTemplate" ENABLE ROW LEVEL SECURITY;

--
-- Name: PromotionBatch; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PromotionBatch" ENABLE ROW LEVEL SECURITY;

--
-- Name: PromotionRecord; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PromotionRecord" ENABLE ROW LEVEL SECURITY;

--
-- Name: PromotionReversal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PromotionReversal" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuestionBankAudit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuestionBankAudit" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuestionBankClassTag; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuestionBankClassTag" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuestionBankImage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuestionBankImage" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuestionBankItem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuestionBankItem" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuestionBankItemVersion; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuestionBankItemVersion" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuestionBankPrintLog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuestionBankPrintLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuestionBankReview; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuestionBankReview" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuestionBankReviewer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuestionBankReviewer" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuestionBankSetting; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuestionBankSetting" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuestionOverlapFlag; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuestionOverlapFlag" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuestionReport; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuestionReport" ENABLE ROW LEVEL SECURITY;

--
-- Name: Quiz; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Quiz" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuizAttempt; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuizAttempt" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuizQuestion; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuizQuestion" ENABLE ROW LEVEL SECURITY;

--
-- Name: ReceiptCounter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ReceiptCounter" ENABLE ROW LEVEL SECURITY;

--
-- Name: ReportRemark; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ReportRemark" ENABLE ROW LEVEL SECURITY;

--
-- Name: Result; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Result" ENABLE ROW LEVEL SECURITY;

--
-- Name: ResultApprovalScope; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ResultApprovalScope" ENABLE ROW LEVEL SECURITY;

--
-- Name: ResultAudit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ResultAudit" ENABLE ROW LEVEL SECURITY;

--
-- Name: SchoolSettings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SchoolSettings" ENABLE ROW LEVEL SECURITY;

--
-- Name: Section; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Section" ENABLE ROW LEVEL SECURITY;

--
-- Name: SettingsChangeAudit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SettingsChangeAudit" ENABLE ROW LEVEL SECURITY;

--
-- Name: StaffRecord; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."StaffRecord" ENABLE ROW LEVEL SECURITY;

--
-- Name: StaffSubjectAssignment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."StaffSubjectAssignment" ENABLE ROW LEVEL SECURITY;

--
-- Name: StandingEvent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."StandingEvent" ENABLE ROW LEVEL SECURITY;

--
-- Name: StudentEnrollment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."StudentEnrollment" ENABLE ROW LEVEL SECURITY;

--
-- Name: StudentRecord; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."StudentRecord" ENABLE ROW LEVEL SECURITY;

--
-- Name: Subject; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Subject" ENABLE ROW LEVEL SECURITY;

--
-- Name: SubjectOffering; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SubjectOffering" ENABLE ROW LEVEL SECURITY;

--
-- Name: SupportGrant; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SupportGrant" ENABLE ROW LEVEL SECURITY;

--
-- Name: TenantMembership; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TenantMembership" ENABLE ROW LEVEL SECURITY;

--
-- Name: TenantSetting; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TenantSetting" ENABLE ROW LEVEL SECURITY;

--
-- Name: TenantStats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TenantStats" ENABLE ROW LEVEL SECURITY;

--
-- Name: TimetableSlot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TimetableSlot" ENABLE ROW LEVEL SECURITY;

--
-- Name: AcademicPeriod academic_period_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY academic_period_insert ON public."AcademicPeriod" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: AcademicPeriod academic_period_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY academic_period_read ON public."AcademicPeriod" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: AcademicPeriod academic_period_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY academic_period_update ON public."AcademicPeriod" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: AcademicSession academic_session_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY academic_session_insert ON public."AcademicSession" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: AcademicSession academic_session_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY academic_session_read ON public."AcademicSession" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: AcademicSession academic_session_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY academic_session_update ON public."AcademicSession" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: AdmissionCounter admission_counter_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admission_counter_insert ON public."AdmissionCounter" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: AdmissionCounter admission_counter_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admission_counter_read ON public."AdmissionCounter" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: AdmissionCounter admission_counter_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admission_counter_update ON public."AdmissionCounter" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Announcement announcement_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcement_tenant_isolation ON public."Announcement" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: AssessmentComponent assessment_component_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assessment_component_delete ON public."AssessmentComponent" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: AssessmentComponent assessment_component_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assessment_component_insert ON public."AssessmentComponent" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: AssessmentComponent assessment_component_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assessment_component_read ON public."AssessmentComponent" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: AssessmentComponent assessment_component_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assessment_component_update ON public."AssessmentComponent" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: AssessmentScheme assessment_scheme_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assessment_scheme_insert ON public."AssessmentScheme" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: AssessmentScheme assessment_scheme_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assessment_scheme_read ON public."AssessmentScheme" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: AssessmentScheme assessment_scheme_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assessment_scheme_update ON public."AssessmentScheme" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Assignment assignment_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignment_owner ON public."Assignment" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: AssignmentSubmission assignment_submission_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignment_submission_owner ON public."AssignmentSubmission" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: AssignmentSubmission assignment_submission_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignment_submission_tenant_isolation ON public."AssignmentSubmission" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Assignment assignment_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignment_tenant_isolation ON public."Assignment" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: AttendanceRecord attendance_record_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_record_delete ON public."AttendanceRecord" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: AttendanceRecord attendance_record_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_record_insert ON public."AttendanceRecord" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: AttendanceRecord attendance_record_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_record_read ON public."AttendanceRecord" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: AttendanceRecord attendance_record_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_record_update ON public."AttendanceRecord" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: AuditLog audit_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_insert ON public."AuditLog" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: AuditLog audit_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_read ON public."AuditLog" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: Campus campus_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campus_tenant_isolation ON public."Campus" USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Certificate certificate_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY certificate_owner ON public."Certificate" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: Certificate certificate_public_verification; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY certificate_public_verification ON public."Certificate" FOR SELECT TO app_user USING ((("verificationToken" = public.app_verification_token()) AND (status = 'ISSUED'::public."CertificateStatus")));

--
-- Name: Certificate certificate_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY certificate_tenant_isolation ON public."Certificate" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ClassArm class_arm_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_arm_insert ON public."ClassArm" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ClassArm class_arm_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_arm_read ON public."ClassArm" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ClassArm class_arm_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_arm_update ON public."ClassArm" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ClassGroup class_group_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_group_insert ON public."ClassGroup" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ClassGroup class_group_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_group_read ON public."ClassGroup" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ClassGroup class_group_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_group_update ON public."ClassGroup" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Course course_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY course_owner ON public."Course" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: CourseRegistration course_registration_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY course_registration_owner ON public."CourseRegistration" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: CourseRegistration course_registration_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY course_registration_tenant_isolation ON public."CourseRegistration" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Course course_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY course_tenant_isolation ON public."Course" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: CustomDomain custom_domain_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY custom_domain_owner ON public."CustomDomain" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: CustomDomain custom_domain_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY custom_domain_tenant_isolation ON public."CustomDomain" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Department department_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY department_owner ON public."Department" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: Department department_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY department_tenant_isolation ON public."Department" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: FeeStructure fee_structure_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fee_structure_tenant_isolation ON public."FeeStructure" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: FormAnswer form_answer_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY form_answer_tenant_isolation ON public."FormAnswer" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: FormAudience form_audience_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY form_audience_tenant_isolation ON public."FormAudience" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: FormMarkingAudit form_marking_audit_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY form_marking_audit_tenant_isolation ON public."FormMarkingAudit" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: FormParticipation form_participation_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY form_participation_tenant_isolation ON public."FormParticipation" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Form form_public_share; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY form_public_share ON public."Form" FOR SELECT TO app_user USING ((("shareToken" = public.app_share_token()) AND (kind = 'QUESTIONNAIRE'::public."FormKind") AND (status = 'PUBLISHED'::public."FormStatus")));

--
-- Name: FormQuestion form_question_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY form_question_tenant_isolation ON public."FormQuestion" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: FormResponse form_response_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY form_response_tenant_isolation ON public."FormResponse" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Form form_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY form_tenant_isolation ON public."Form" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: FormTurnInAudit form_turn_in_audit_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY form_turn_in_audit_tenant_isolation ON public."FormTurnInAudit" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: FormTurnIn form_turn_in_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY form_turn_in_tenant_isolation ON public."FormTurnIn" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: GradeBand grade_band_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grade_band_delete ON public."GradeBand" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: GradeBand grade_band_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grade_band_insert ON public."GradeBand" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: GradeBand grade_band_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grade_band_read ON public."GradeBand" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: GradeBand grade_band_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grade_band_update ON public."GradeBand" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: GradeScale grade_scale_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grade_scale_insert ON public."GradeScale" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: GradeScale grade_scale_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grade_scale_read ON public."GradeScale" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: GradeScale grade_scale_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grade_scale_update ON public."GradeScale" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: GuardianLink guardian_link_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardian_link_insert ON public."GuardianLink" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: GuardianLink guardian_link_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardian_link_read ON public."GuardianLink" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: GuardianLinkToken guardian_link_token_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardian_link_token_owner ON public."GuardianLinkToken" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: GuardianLinkToken guardian_link_token_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardian_link_token_tenant_isolation ON public."GuardianLinkToken" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: GuardianLink guardian_link_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardian_link_update ON public."GuardianLink" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: GuardianRecord guardian_record_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardian_record_insert ON public."GuardianRecord" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: GuardianRecord guardian_record_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardian_record_read ON public."GuardianRecord" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: GuardianRecord guardian_record_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardian_record_update ON public."GuardianRecord" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Invitation invitation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitation_delete ON public."Invitation" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: Invitation invitation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitation_insert ON public."Invitation" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Invitation invitation_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitation_read ON public."Invitation" FOR SELECT USING ((("tenantId" = public.app_tenant_id()) OR ("tokenHash" = public.app_invitation_hash())));

--
-- Name: Invitation invitation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitation_update ON public."Invitation" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: InvoiceDiscount invoice_discount_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_discount_tenant_isolation ON public."InvoiceDiscount" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Invoice invoice_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_tenant_isolation ON public."Invoice" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: LearningMaterial learning_material_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY learning_material_owner ON public."LearningMaterial" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: LearningMaterial learning_material_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY learning_material_tenant_isolation ON public."LearningMaterial" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: TenantMembership membership_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY membership_delete ON public."TenantMembership" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: TenantMembership membership_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY membership_insert ON public."TenantMembership" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: TenantMembership membership_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY membership_read ON public."TenantMembership" FOR SELECT USING ((("tenantId" = public.app_tenant_id()) OR ("userId" = public.app_user_id())));

--
-- Name: TenantMembership membership_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY membership_update ON public."TenantMembership" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: NotificationAuditLog notification_audit_log_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_audit_log_owner ON public."NotificationAuditLog" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: NotificationAuditLog notification_audit_log_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_audit_log_tenant_isolation ON public."NotificationAuditLog" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: NotificationDispatch notification_dispatch_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_dispatch_owner ON public."NotificationDispatch" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: NotificationDispatch notification_dispatch_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_dispatch_tenant_isolation ON public."NotificationDispatch" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: NotificationTemplate notification_template_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_template_owner ON public."NotificationTemplate" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: NotificationTemplate notification_template_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_template_tenant_isolation ON public."NotificationTemplate" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Payment payment_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payment_tenant_isolation ON public."Payment" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: PlatformAuditLog platform_audit_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_audit_owner ON public."PlatformAuditLog" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: PracticeAttempt practice_attempt_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY practice_attempt_tenant_isolation ON public."PracticeAttempt" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: PracticeSession practice_session_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY practice_session_tenant_isolation ON public."PracticeSession" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAssessment program_assessment_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_assessment_delete ON public."ProgramAssessment" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAssessmentGroup program_assessment_group_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_assessment_group_delete ON public."ProgramAssessmentGroup" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAssessmentGroup program_assessment_group_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_assessment_group_insert ON public."ProgramAssessmentGroup" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAssessmentGroup program_assessment_group_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_assessment_group_read ON public."ProgramAssessmentGroup" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAssessmentGroup program_assessment_group_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_assessment_group_update ON public."ProgramAssessmentGroup" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAssessment program_assessment_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_assessment_insert ON public."ProgramAssessment" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAssessment program_assessment_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_assessment_read ON public."ProgramAssessment" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAssessment program_assessment_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_assessment_update ON public."ProgramAssessment" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAttendanceChange program_attendance_change_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_attendance_change_insert ON public."ProgramAttendanceChange" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAttendanceChange program_attendance_change_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_attendance_change_read ON public."ProgramAttendanceChange" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAttendance program_attendance_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_attendance_delete ON public."ProgramAttendance" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAttendance program_attendance_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_attendance_insert ON public."ProgramAttendance" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAttendance program_attendance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_attendance_read ON public."ProgramAttendance" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAttendance program_attendance_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_attendance_update ON public."ProgramAttendance" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAudit program_audit_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_audit_insert ON public."ProgramAudit" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramAudit program_audit_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_audit_read ON public."ProgramAudit" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramCampus program_campus_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_campus_delete ON public."ProgramCampus" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramCampus program_campus_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_campus_insert ON public."ProgramCampus" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramCampus program_campus_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_campus_read ON public."ProgramCampus" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramCampus program_campus_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_campus_update ON public."ProgramCampus" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramCertificate program_certificate_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_certificate_delete ON public."ProgramCertificate" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramCertificate program_certificate_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_certificate_insert ON public."ProgramCertificate" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramCertificate program_certificate_public_verification; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_certificate_public_verification ON public."ProgramCertificate" FOR SELECT TO app_user USING (("verificationToken" = public.app_verification_token()));

--
-- Name: ProgramCertificate program_certificate_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_certificate_read ON public."ProgramCertificate" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramCertificate program_certificate_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_certificate_update ON public."ProgramCertificate" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramCounter program_counter_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_counter_delete ON public."ProgramCounter" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramCounter program_counter_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_counter_insert ON public."ProgramCounter" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramCounter program_counter_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_counter_read ON public."ProgramCounter" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramCounter program_counter_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_counter_update ON public."ProgramCounter" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Program program_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_delete ON public."Program" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramFeeExemption program_fee_exemption_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_fee_exemption_delete ON public."ProgramFeeExemption" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramFeeExemption program_fee_exemption_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_fee_exemption_insert ON public."ProgramFeeExemption" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramFeeExemption program_fee_exemption_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_fee_exemption_read ON public."ProgramFeeExemption" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramFeeExemption program_fee_exemption_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_fee_exemption_update ON public."ProgramFeeExemption" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramFeeItem program_fee_item_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_fee_item_delete ON public."ProgramFeeItem" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramFeeItem program_fee_item_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_fee_item_insert ON public."ProgramFeeItem" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramFeeItem program_fee_item_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_fee_item_read ON public."ProgramFeeItem" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramFeeItem program_fee_item_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_fee_item_update ON public."ProgramFeeItem" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramGroup program_group_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_group_delete ON public."ProgramGroup" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramGroup program_group_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_group_insert ON public."ProgramGroup" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramGroup program_group_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_group_read ON public."ProgramGroup" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramGroup program_group_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_group_update ON public."ProgramGroup" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Program program_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_insert ON public."Program" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramInvoice program_invoice_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_invoice_delete ON public."ProgramInvoice" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramInvoiceDiscount program_invoice_discount_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_invoice_discount_delete ON public."ProgramInvoiceDiscount" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramInvoiceDiscount program_invoice_discount_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_invoice_discount_insert ON public."ProgramInvoiceDiscount" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramInvoiceDiscount program_invoice_discount_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_invoice_discount_read ON public."ProgramInvoiceDiscount" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramInvoiceDiscount program_invoice_discount_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_invoice_discount_update ON public."ProgramInvoiceDiscount" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramInvoice program_invoice_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_invoice_insert ON public."ProgramInvoice" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramInvoice program_invoice_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_invoice_read ON public."ProgramInvoice" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramInvoice program_invoice_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_invoice_update ON public."ProgramInvoice" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramLevelLabel program_level_label_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_level_label_delete ON public."ProgramLevelLabel" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramLevelLabel program_level_label_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_level_label_insert ON public."ProgramLevelLabel" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramLevelLabel program_level_label_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_level_label_read ON public."ProgramLevelLabel" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramLevelLabel program_level_label_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_level_label_update ON public."ProgramLevelLabel" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramParticipant program_participant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_participant_delete ON public."ProgramParticipant" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramParticipant program_participant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_participant_insert ON public."ProgramParticipant" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramParticipant program_participant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_participant_read ON public."ProgramParticipant" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramParticipant program_participant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_participant_update ON public."ProgramParticipant" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramPayment program_payment_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_payment_delete ON public."ProgramPayment" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramPayment program_payment_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_payment_insert ON public."ProgramPayment" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramPayment program_payment_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_payment_read ON public."ProgramPayment" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramPayment program_payment_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_payment_update ON public."ProgramPayment" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Program program_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_read ON public."Program" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramScoreChange program_score_change_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_score_change_insert ON public."ProgramScoreChange" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramScoreChange program_score_change_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_score_change_read ON public."ProgramScoreChange" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramScore program_score_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_score_delete ON public."ProgramScore" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramScore program_score_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_score_insert ON public."ProgramScore" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramScore program_score_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_score_read ON public."ProgramScore" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramScore program_score_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_score_update ON public."ProgramScore" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramSession program_session_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_session_delete ON public."ProgramSession" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramSession program_session_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_session_insert ON public."ProgramSession" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramSession program_session_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_session_read ON public."ProgramSession" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramSession program_session_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_session_update ON public."ProgramSession" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramStaff program_staff_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_staff_delete ON public."ProgramStaff" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramStaffGroup program_staff_group_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_staff_group_delete ON public."ProgramStaffGroup" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramStaffGroup program_staff_group_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_staff_group_insert ON public."ProgramStaffGroup" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramStaffGroup program_staff_group_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_staff_group_read ON public."ProgramStaffGroup" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramStaffGroup program_staff_group_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_staff_group_update ON public."ProgramStaffGroup" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramStaff program_staff_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_staff_insert ON public."ProgramStaff" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramStaff program_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_staff_read ON public."ProgramStaff" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgramStaff program_staff_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_staff_update ON public."ProgramStaff" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Program program_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_update ON public."Program" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressEntry progress_entry_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_entry_delete ON public."ProgressEntry" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressEntry progress_entry_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_entry_insert ON public."ProgressEntry" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressEntry progress_entry_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_entry_read ON public."ProgressEntry" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressEntryRevision progress_entry_revision_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_entry_revision_insert ON public."ProgressEntryRevision" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressEntryRevision progress_entry_revision_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_entry_revision_read ON public."ProgressEntryRevision" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressEntry progress_entry_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_entry_update ON public."ProgressEntry" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressLock progress_lock_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_lock_delete ON public."ProgressLock" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressLock progress_lock_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_lock_insert ON public."ProgressLock" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressLock progress_lock_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_lock_read ON public."ProgressLock" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressLock progress_lock_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_lock_update ON public."ProgressLock" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressRecord progress_record_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_record_delete ON public."ProgressRecord" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressRecord progress_record_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_record_insert ON public."ProgressRecord" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressRecord progress_record_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_record_read ON public."ProgressRecord" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressRecord progress_record_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_record_update ON public."ProgressRecord" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressSeen progress_seen_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_seen_delete ON public."ProgressSeen" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressSeen progress_seen_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_seen_insert ON public."ProgressSeen" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressSeen progress_seen_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_seen_read ON public."ProgressSeen" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressSeen progress_seen_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_seen_update ON public."ProgressSeen" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressTemplate progress_template_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_template_insert ON public."ProgressTemplate" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ProgressTemplate progress_template_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_template_read ON public."ProgressTemplate" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: PromotionBatch promotion_batch_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotion_batch_insert ON public."PromotionBatch" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: PromotionBatch promotion_batch_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotion_batch_read ON public."PromotionBatch" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: PromotionRecord promotion_record_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotion_record_insert ON public."PromotionRecord" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: PromotionRecord promotion_record_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotion_record_read ON public."PromotionRecord" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: PromotionReversal promotion_reversal_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotion_reversal_insert ON public."PromotionReversal" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: PromotionReversal promotion_reversal_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotion_reversal_read ON public."PromotionReversal" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankAudit question_bank_audit_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_audit_insert ON public."QuestionBankAudit" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankAudit question_bank_audit_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_audit_read ON public."QuestionBankAudit" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankClassTag question_bank_class_tag_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_class_tag_delete ON public."QuestionBankClassTag" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankClassTag question_bank_class_tag_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_class_tag_insert ON public."QuestionBankClassTag" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankClassTag question_bank_class_tag_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_class_tag_read ON public."QuestionBankClassTag" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankImage question_bank_image_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_image_delete ON public."QuestionBankImage" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankImage question_bank_image_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_image_insert ON public."QuestionBankImage" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankImage question_bank_image_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_image_read ON public."QuestionBankImage" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankItem question_bank_item_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_item_insert ON public."QuestionBankItem" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankItem question_bank_item_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_item_read ON public."QuestionBankItem" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankItem question_bank_item_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_item_update ON public."QuestionBankItem" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankItemVersion question_bank_item_version_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_item_version_insert ON public."QuestionBankItemVersion" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankItemVersion question_bank_item_version_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_item_version_read ON public."QuestionBankItemVersion" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankPrintLog question_bank_print_log_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_print_log_tenant_isolation ON public."QuestionBankPrintLog" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankReview question_bank_review_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_review_insert ON public."QuestionBankReview" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankReview question_bank_review_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_review_read ON public."QuestionBankReview" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankReviewer question_bank_reviewer_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_reviewer_delete ON public."QuestionBankReviewer" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankReviewer question_bank_reviewer_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_reviewer_insert ON public."QuestionBankReviewer" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankReviewer question_bank_reviewer_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_reviewer_read ON public."QuestionBankReviewer" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankSetting question_bank_setting_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_setting_delete ON public."QuestionBankSetting" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankSetting question_bank_setting_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_setting_insert ON public."QuestionBankSetting" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankSetting question_bank_setting_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_setting_read ON public."QuestionBankSetting" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionBankSetting question_bank_setting_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_bank_setting_update ON public."QuestionBankSetting" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionOverlapFlag question_overlap_flag_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_overlap_flag_delete ON public."QuestionOverlapFlag" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionOverlapFlag question_overlap_flag_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_overlap_flag_insert ON public."QuestionOverlapFlag" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionOverlapFlag question_overlap_flag_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_overlap_flag_read ON public."QuestionOverlapFlag" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: QuestionReport question_report_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_report_tenant_isolation ON public."QuestionReport" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: QuizAttempt quiz_attempt_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quiz_attempt_owner ON public."QuizAttempt" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: QuizAttempt quiz_attempt_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quiz_attempt_tenant_isolation ON public."QuizAttempt" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Quiz quiz_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quiz_owner ON public."Quiz" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: QuizQuestion quiz_question_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quiz_question_owner ON public."QuizQuestion" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: QuizQuestion quiz_question_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quiz_question_tenant_isolation ON public."QuizQuestion" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Quiz quiz_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quiz_tenant_isolation ON public."Quiz" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ReceiptCounter receipt_counter_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY receipt_counter_insert ON public."ReceiptCounter" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ReceiptCounter receipt_counter_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY receipt_counter_read ON public."ReceiptCounter" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ReceiptCounter receipt_counter_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY receipt_counter_update ON public."ReceiptCounter" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ReportRemark report_remark_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_remark_delete ON public."ReportRemark" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ReportRemark report_remark_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_remark_insert ON public."ReportRemark" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ReportRemark report_remark_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_remark_read ON public."ReportRemark" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ReportRemark report_remark_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_remark_update ON public."ReportRemark" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ResultApprovalScope result_approval_scope_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY result_approval_scope_delete ON public."ResultApprovalScope" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ResultApprovalScope result_approval_scope_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY result_approval_scope_insert ON public."ResultApprovalScope" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ResultApprovalScope result_approval_scope_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY result_approval_scope_read ON public."ResultApprovalScope" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: ResultAudit result_audit_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY result_audit_insert ON public."ResultAudit" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: ResultAudit result_audit_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY result_audit_read ON public."ResultAudit" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: Result result_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY result_delete ON public."Result" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: Result result_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY result_insert ON public."Result" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Result result_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY result_read ON public."Result" FOR SELECT USING ((("tenantId" = public.app_tenant_id()) OR (("verificationToken" = public.app_verification_token()) AND (status = ANY (ARRAY['PUBLISHED'::public."ResultStatus", 'LOCKED'::public."ResultStatus"])))));

--
-- Name: Result result_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY result_update ON public."Result" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: SchoolSettings school_settings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY school_settings_insert ON public."SchoolSettings" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: SchoolSettings school_settings_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY school_settings_read ON public."SchoolSettings" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: SchoolSettings school_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY school_settings_update ON public."SchoolSettings" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Section section_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY section_insert ON public."Section" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Section section_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY section_read ON public."Section" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: Section section_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY section_update ON public."Section" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: SettingsChangeAudit settings_change_audit_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settings_change_audit_insert ON public."SettingsChangeAudit" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: SettingsChangeAudit settings_change_audit_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settings_change_audit_read ON public."SettingsChangeAudit" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: StaffRecord staff_record_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_record_insert ON public."StaffRecord" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: StaffRecord staff_record_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_record_read ON public."StaffRecord" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: StaffRecord staff_record_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_record_update ON public."StaffRecord" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: StaffSubjectAssignment staff_subject_assignment_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_subject_assignment_delete ON public."StaffSubjectAssignment" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: StaffSubjectAssignment staff_subject_assignment_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_subject_assignment_insert ON public."StaffSubjectAssignment" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: StaffSubjectAssignment staff_subject_assignment_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_subject_assignment_read ON public."StaffSubjectAssignment" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: StandingEvent standing_event_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY standing_event_insert ON public."StandingEvent" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: StandingEvent standing_event_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY standing_event_read ON public."StandingEvent" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: StudentEnrollment student_enrollment_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_enrollment_insert ON public."StudentEnrollment" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: StudentEnrollment student_enrollment_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_enrollment_read ON public."StudentEnrollment" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: StudentEnrollment student_enrollment_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_enrollment_update ON public."StudentEnrollment" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: StudentRecord student_record_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_record_insert ON public."StudentRecord" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: StudentRecord student_record_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_record_read ON public."StudentRecord" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: StudentRecord student_record_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_record_update ON public."StudentRecord" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: Subject subject_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subject_insert ON public."Subject" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: SubjectOffering subject_offering_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subject_offering_delete ON public."SubjectOffering" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: SubjectOffering subject_offering_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subject_offering_insert ON public."SubjectOffering" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: SubjectOffering subject_offering_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subject_offering_read ON public."SubjectOffering" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: Subject subject_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subject_read ON public."Subject" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: Subject subject_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subject_update ON public."Subject" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: SupportGrant support_grant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_grant_insert ON public."SupportGrant" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: SupportGrant support_grant_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_grant_owner ON public."SupportGrant" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: SupportGrant support_grant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_grant_read ON public."SupportGrant" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: SupportGrant support_grant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_grant_update ON public."SupportGrant" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: TenantSetting tenant_setting_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_setting_delete ON public."TenantSetting" FOR DELETE USING (("tenantId" = public.app_tenant_id()));

--
-- Name: TenantSetting tenant_setting_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_setting_insert ON public."TenantSetting" FOR INSERT WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: TenantSetting tenant_setting_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_setting_read ON public."TenantSetting" FOR SELECT USING (("tenantId" = public.app_tenant_id()));

--
-- Name: TenantSetting tenant_setting_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_setting_update ON public."TenantSetting" FOR UPDATE USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: TenantStats tenant_stats_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_stats_owner ON public."TenantStats" TO CURRENT_USER USING (true) WITH CHECK (true);

--
-- Name: TimetableSlot timetable_slot_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timetable_slot_tenant_isolation ON public."TimetableSlot" TO app_user USING (("tenantId" = public.app_tenant_id())) WITH CHECK (("tenantId" = public.app_tenant_id()));

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO app_user;

--
-- Name: FUNCTION tenant_stats_apply(p_tenant_id text, d_members integer, d_admins integer, d_students integer, d_campuses integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.tenant_stats_apply(p_tenant_id text, d_members integer, d_admins integer, d_students integer, d_campuses integer) FROM PUBLIC;

--
-- Name: FUNCTION tenant_stats_recompute(p_tenant_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.tenant_stats_recompute(p_tenant_id text) FROM PUBLIC;

--
-- Name: TABLE "AcademicPeriod"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."AcademicPeriod" TO app_user;

--
-- Name: TABLE "AcademicSession"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."AcademicSession" TO app_user;

--
-- Name: TABLE "AdmissionCounter"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."AdmissionCounter" TO app_user;

--
-- Name: TABLE "Announcement"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Announcement" TO app_user;

--
-- Name: TABLE "AssessmentComponent"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."AssessmentComponent" TO app_user;

--
-- Name: TABLE "AssessmentScheme"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."AssessmentScheme" TO app_user;

--
-- Name: TABLE "Assignment"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Assignment" TO app_user;

--
-- Name: TABLE "AssignmentSubmission"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."AssignmentSubmission" TO app_user;

--
-- Name: TABLE "AttendanceRecord"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."AttendanceRecord" TO app_user;

--
-- Name: TABLE "AuditLog"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."AuditLog" TO app_user;

--
-- Name: TABLE "Campus"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Campus" TO app_user;

--
-- Name: TABLE "Certificate"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Certificate" TO app_user;

--
-- Name: TABLE "ClassArm"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ClassArm" TO app_user;

--
-- Name: TABLE "ClassGroup"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ClassGroup" TO app_user;

--
-- Name: TABLE "Course"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Course" TO app_user;

--
-- Name: TABLE "CourseRegistration"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."CourseRegistration" TO app_user;

--
-- Name: TABLE "CustomDomain"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."CustomDomain" TO app_user;

--
-- Name: TABLE "Department"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Department" TO app_user;

--
-- Name: TABLE "EmailChangeToken"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."EmailChangeToken" TO app_user;

--
-- Name: TABLE "FeeStructure"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."FeeStructure" TO app_user;

--
-- Name: TABLE "Form"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Form" TO app_user;

--
-- Name: TABLE "FormAnswer"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."FormAnswer" TO app_user;

--
-- Name: TABLE "FormAudience"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."FormAudience" TO app_user;

--
-- Name: TABLE "FormMarkingAudit"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."FormMarkingAudit" TO app_user;

--
-- Name: TABLE "FormParticipation"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."FormParticipation" TO app_user;

--
-- Name: TABLE "FormQuestion"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."FormQuestion" TO app_user;

--
-- Name: TABLE "FormResponse"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."FormResponse" TO app_user;

--
-- Name: TABLE "FormTurnIn"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."FormTurnIn" TO app_user;

--
-- Name: TABLE "FormTurnInAudit"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."FormTurnInAudit" TO app_user;

--
-- Name: TABLE "GradeBand"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."GradeBand" TO app_user;

--
-- Name: TABLE "GradeScale"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."GradeScale" TO app_user;

--
-- Name: TABLE "GuardianLink"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."GuardianLink" TO app_user;

--
-- Name: TABLE "GuardianLinkToken"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."GuardianLinkToken" TO app_user;

--
-- Name: TABLE "GuardianRecord"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."GuardianRecord" TO app_user;

--
-- Name: TABLE "Invitation"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Invitation" TO app_user;

--
-- Name: TABLE "Invoice"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Invoice" TO app_user;

--
-- Name: TABLE "InvoiceDiscount"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."InvoiceDiscount" TO app_user;

--
-- Name: TABLE "LearningMaterial"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."LearningMaterial" TO app_user;

--
-- Name: TABLE "MfaChallenge"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."MfaChallenge" TO app_user;

--
-- Name: TABLE "MfaCredential"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."MfaCredential" TO app_user;

--
-- Name: TABLE "MfaRecoveryCode"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."MfaRecoveryCode" TO app_user;

--
-- Name: TABLE "NotificationAuditLog"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."NotificationAuditLog" TO app_user;

--
-- Name: TABLE "NotificationDispatch"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."NotificationDispatch" TO app_user;

--
-- Name: TABLE "NotificationTemplate"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."NotificationTemplate" TO app_user;

--
-- Name: TABLE "PasswordResetToken"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."PasswordResetToken" TO app_user;

--
-- Name: TABLE "Payment"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Payment" TO app_user;

--
-- Name: TABLE "PaymentWebhookEvent"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."PaymentWebhookEvent" TO app_user;

--
-- Name: TABLE "PlatformAuditLog"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."PlatformAuditLog" TO app_user;

--
-- Name: TABLE "PracticeAttempt"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."PracticeAttempt" TO app_user;

--
-- Name: TABLE "PracticeSession"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."PracticeSession" TO app_user;

--
-- Name: TABLE "Program"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Program" TO app_user;

--
-- Name: TABLE "ProgramAssessment"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramAssessment" TO app_user;

--
-- Name: TABLE "ProgramAssessmentGroup"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramAssessmentGroup" TO app_user;

--
-- Name: TABLE "ProgramAttendance"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramAttendance" TO app_user;

--
-- Name: TABLE "ProgramAttendanceChange"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."ProgramAttendanceChange" TO app_user;

--
-- Name: TABLE "ProgramAudit"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."ProgramAudit" TO app_user;

--
-- Name: TABLE "ProgramCampus"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramCampus" TO app_user;

--
-- Name: TABLE "ProgramCertificate"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramCertificate" TO app_user;

--
-- Name: TABLE "ProgramCounter"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramCounter" TO app_user;

--
-- Name: TABLE "ProgramFeeExemption"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramFeeExemption" TO app_user;

--
-- Name: TABLE "ProgramFeeItem"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramFeeItem" TO app_user;

--
-- Name: TABLE "ProgramGroup"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramGroup" TO app_user;

--
-- Name: TABLE "ProgramInvoice"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramInvoice" TO app_user;

--
-- Name: TABLE "ProgramInvoiceDiscount"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramInvoiceDiscount" TO app_user;

--
-- Name: TABLE "ProgramLevelLabel"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramLevelLabel" TO app_user;

--
-- Name: TABLE "ProgramParticipant"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramParticipant" TO app_user;

--
-- Name: TABLE "ProgramPayment"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramPayment" TO app_user;

--
-- Name: TABLE "ProgramScore"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramScore" TO app_user;

--
-- Name: TABLE "ProgramScoreChange"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."ProgramScoreChange" TO app_user;

--
-- Name: TABLE "ProgramSession"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramSession" TO app_user;

--
-- Name: TABLE "ProgramStaff"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramStaff" TO app_user;

--
-- Name: TABLE "ProgramStaffGroup"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgramStaffGroup" TO app_user;

--
-- Name: TABLE "ProgressEntry"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgressEntry" TO app_user;

--
-- Name: TABLE "ProgressEntryRevision"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."ProgressEntryRevision" TO app_user;

--
-- Name: TABLE "ProgressLock"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgressLock" TO app_user;

--
-- Name: TABLE "ProgressRecord"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgressRecord" TO app_user;

--
-- Name: TABLE "ProgressSeen"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProgressSeen" TO app_user;

--
-- Name: TABLE "ProgressTemplate"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."ProgressTemplate" TO app_user;

--
-- Name: TABLE "PromotionBatch"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."PromotionBatch" TO app_user;

--
-- Name: TABLE "PromotionRecord"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."PromotionRecord" TO app_user;

--
-- Name: TABLE "PromotionReversal"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."PromotionReversal" TO app_user;

--
-- Name: TABLE "QuestionBankAudit"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."QuestionBankAudit" TO app_user;

--
-- Name: TABLE "QuestionBankClassTag"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."QuestionBankClassTag" TO app_user;

--
-- Name: TABLE "QuestionBankImage"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."QuestionBankImage" TO app_user;

--
-- Name: TABLE "QuestionBankItem"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."QuestionBankItem" TO app_user;

--
-- Name: TABLE "QuestionBankItemVersion"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."QuestionBankItemVersion" TO app_user;

--
-- Name: TABLE "QuestionBankPrintLog"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."QuestionBankPrintLog" TO app_user;

--
-- Name: TABLE "QuestionBankReview"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."QuestionBankReview" TO app_user;

--
-- Name: TABLE "QuestionBankReviewer"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."QuestionBankReviewer" TO app_user;

--
-- Name: TABLE "QuestionBankSetting"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."QuestionBankSetting" TO app_user;

--
-- Name: TABLE "QuestionOverlapFlag"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."QuestionOverlapFlag" TO app_user;

--
-- Name: TABLE "QuestionReport"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."QuestionReport" TO app_user;

--
-- Name: TABLE "Quiz"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Quiz" TO app_user;

--
-- Name: TABLE "QuizAttempt"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."QuizAttempt" TO app_user;

--
-- Name: TABLE "QuizQuestion"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."QuizQuestion" TO app_user;

--
-- Name: TABLE "ReceiptCounter"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ReceiptCounter" TO app_user;

--
-- Name: TABLE "ReportRemark"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ReportRemark" TO app_user;

--
-- Name: TABLE "Result"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Result" TO app_user;

--
-- Name: TABLE "ResultApprovalScope"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ResultApprovalScope" TO app_user;

--
-- Name: TABLE "ResultAudit"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."ResultAudit" TO app_user;

--
-- Name: TABLE "SchoolSettings"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."SchoolSettings" TO app_user;

--
-- Name: TABLE "Section"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Section" TO app_user;

--
-- Name: TABLE "Session"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Session" TO app_user;

--
-- Name: TABLE "SettingsChangeAudit"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."SettingsChangeAudit" TO app_user;

--
-- Name: TABLE "StaffRecord"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."StaffRecord" TO app_user;

--
-- Name: TABLE "StaffSubjectAssignment"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."StaffSubjectAssignment" TO app_user;

--
-- Name: TABLE "StandingEvent"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."StandingEvent" TO app_user;

--
-- Name: TABLE "StudentEnrollment"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."StudentEnrollment" TO app_user;

--
-- Name: TABLE "StudentRecord"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."StudentRecord" TO app_user;

--
-- Name: TABLE "Subject"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Subject" TO app_user;

--
-- Name: TABLE "SubjectOffering"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."SubjectOffering" TO app_user;

--
-- Name: TABLE "SupportGrant"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."SupportGrant" TO app_user;

--
-- Name: TABLE "SystemSettings"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."SystemSettings" TO app_user;

--
-- Name: TABLE "Tenant"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Tenant" TO app_user;

--
-- Name: TABLE "TenantMembership"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."TenantMembership" TO app_user;

--
-- Name: TABLE "TenantSetting"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."TenantSetting" TO app_user;

--
-- Name: TABLE "TenantStats"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."TenantStats" TO app_user;

--
-- Name: TABLE "TimetableSlot"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."TimetableSlot" TO app_user;

--
-- Name: TABLE "User"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."User" TO app_user;

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO app_user;

--
-- PostgreSQL database dump complete
--

RESET check_function_bodies;
