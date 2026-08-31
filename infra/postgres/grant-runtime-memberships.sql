-- Run as the database owner after creating four LOGIN roles in Neon.
-- Example:
-- psql "$DATABASE_URL" \
--   -v user_login_role=aifans_user_login \
--   -v platform_login_role=aifans_platform_login \
--   -v provisioning_login_role=aifans_provisioning_login \
--   -v analytics_login_role=aifans_analytics_login \
--   -f infra/postgres/grant-runtime-memberships.sql
--
-- Passwords are created and rotated in Neon; this script never accepts or stores them.

\if :{?user_login_role}
\else
  \echo 'user_login_role is required'
  \quit
\endif
\if :{?analytics_login_role}
\else
  \echo 'analytics_login_role is required'
  \quit
\endif
\if :{?platform_login_role}
\else
  \echo 'platform_login_role is required'
  \quit
\endif
\if :{?provisioning_login_role}
\else
  \echo 'provisioning_login_role is required'
  \quit
\endif

GRANT aifans_authenticated TO :"user_login_role";
GRANT aifans_platform TO :"platform_login_role";
GRANT aifans_provisioner TO :"provisioning_login_role";
GRANT aifans_analytics_delivery TO :"analytics_login_role";
