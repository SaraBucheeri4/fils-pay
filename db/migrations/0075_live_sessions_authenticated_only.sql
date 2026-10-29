-- live_sessions (0058) filtered only revoked and expired rows, so a pending
-- session (password passed, OTP not yet verified) also counted as "live".
-- lookupSession added its own authenticated check (B32), but any other
-- reader of the view would still treat pre-OTP sessions as logged in.
-- Redefined so the view itself means "usable, fully authenticated session".
--
-- A new migration rather than an edit to 0058, which is already applied.
-- Same columns in the same order, so CREATE OR REPLACE is valid. Pending
-- sessions are read from sessions directly (lookupPendingSession).

CREATE OR REPLACE VIEW live_sessions AS
SELECT id,
       merchant_user_id,
       token_hash,
       authenticated,
       created_at,
       expires_at
  FROM sessions
 WHERE revoked_at IS NULL
   AND expires_at > now()
   AND authenticated = true;
