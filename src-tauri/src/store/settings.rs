//! App-wide preferences (not tied to a session): one opaque value per key, defined and
//! validated by the UI (e.g. `keymap`, the remapped keyboard shortcuts).

use rusqlite::{Connection, OptionalExtension, params};

use crate::error::{Error, Result};

/// The keys the UI may store; anything else is refused.
const KEYS: &[&str] = &["keymap"];

fn check(key: &str) -> Result<()> {
    if KEYS.contains(&key) {
        Ok(())
    } else {
        Err(Error::Invalid(format!("unknown setting {key}")))
    }
}

pub fn get(conn: &Connection, key: &str) -> Result<Option<String>> {
    check(key)?;
    Ok(conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
            r.get(0)
        })
        .optional()?)
}

/// Stores `value`; `None` removes the key (back to the default).
pub fn set(conn: &Connection, key: &str, value: Option<&str>) -> Result<()> {
    check(key)?;
    match value {
        Some(v) => conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            params![key, v],
        )?,
        None => conn.execute("DELETE FROM settings WHERE key = ?1", [key])?,
    };
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;

    #[test]
    fn set_get_reset() {
        let store = Store::open_in_memory().unwrap();
        let conn = store.conn().unwrap();
        assert_eq!(get(&conn, "keymap").unwrap(), None);
        set(&conn, "keymap", Some("{\"a\":1}")).unwrap();
        set(&conn, "keymap", Some("{\"b\":2}")).unwrap();
        assert_eq!(get(&conn, "keymap").unwrap().as_deref(), Some("{\"b\":2}"));
        set(&conn, "keymap", None).unwrap();
        assert_eq!(get(&conn, "keymap").unwrap(), None);
        assert!(matches!(get(&conn, "other"), Err(Error::Invalid(_))));
        assert!(matches!(
            set(&conn, "other", Some("x")),
            Err(Error::Invalid(_))
        ));
    }
}
