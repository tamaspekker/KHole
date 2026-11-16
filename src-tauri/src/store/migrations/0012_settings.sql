-- App-wide preferences that are not tied to a session (the keyboard shortcuts, …), one
-- opaque JSON value per key. The UI defines and validates the values.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
