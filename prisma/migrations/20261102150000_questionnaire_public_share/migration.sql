-- Public survey links: a questionnaire for the public is read and answered by anyone holding its link, with no sign-in, so the request has no school until the link's token has
-- been looked up. The lookup used to run with no school selected, which row-level security answers with no rows (and refuses every write): the link was "not found" for every
-- survey. This adds the read path the lookup needs, in the same shape as the certificate link (certificate_public_verification) and the invitation link (invitation_read).
--
-- Run it BEFORE the code that answers a public survey is deployed. It only adds a function and a policy: nothing is changed or lost, and the code of the release before it (which
-- never reached a survey through a link) keeps working.

-- A transaction-local setting like app.tenant_id: the share token of a survey the caller presented. It is NULL unless the link context set it, so no token matches nothing.
CREATE FUNCTION app_share_token() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.share_token', true), '') $$;

-- Read, and only read: the one PUBLISHED questionnaire whose share token the caller holds. A draft, a closed survey and any other kind of form are not reachable through a link.
-- Once the survey is found, the code sets the SCHOOL context from the row it found (the token is a 128-bit secret: it names the school, as an invitation's does) and reads
-- the questions and writes the answers under the ordinary school policies. Permissive policies are OR-ed with form_tenant_isolation.
CREATE POLICY form_public_share ON "Form" FOR SELECT TO app_user
    USING ("shareToken" = app_share_token() AND "kind" = 'QUESTIONNAIRE' AND "status" = 'PUBLISHED');
