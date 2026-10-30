CREATE TABLE admin_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by_admin_id UUID NOT NULL REFERENCES admin_users(id),
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('support', 'finance', 'super_admin')),
    code TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    redeemed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at)
);
