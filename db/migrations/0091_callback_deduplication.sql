-- Existing duplicate evidence must be reviewed explicitly, never deleted by an upgrade.
CREATE UNIQUE INDEX acquirer_callback_notes_callback_id_unique
    ON acquirer_callback_notes (callback_id);
