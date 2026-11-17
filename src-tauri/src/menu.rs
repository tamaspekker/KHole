//! The native menu bar: Tauri's default menu, with license details in the About panel and
//! links to the project, the issue tracker and the bundled license files in Help.

use tauri::menu::{AboutMetadata, HELP_SUBMENU_ID, Menu, MenuItem, PredefinedMenuItem};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_opener::OpenerExt;

const REPO: &str = "https://github.com/tomi2400/KHole";
const WEBSITE: &str = "help-website";
const ISSUE: &str = "help-issue";
const LICENSE: &str = "help-license";
const NOTICES: &str = "help-notices";

pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::default(app)?;

    // The About item is the first entry of the app menu; swap it for one with credits.
    if let Some(app_menu) = menu.items()?.first().and_then(|i| i.as_submenu().cloned()) {
        let info = app.package_info();
        let about = PredefinedMenuItem::about(
            app,
            None,
            Some(AboutMetadata {
                name: Some(info.name.clone()),
                version: Some(info.version.to_string()),
                copyright: app.config().bundle.copyright.clone(),
                credits: Some(format!(
                    "Free software under the GNU GPL v3 or later.\n\
                     Source code and issues: {REPO}\n\
                     BPM and key analysis: Essentia (AGPL-3.0).\n\
                     Help › Third-Party Licenses lists every bundled component."
                )),
                ..Default::default()
            }),
        )?;
        app_menu.remove_at(0)?;
        app_menu.insert(&about, 0)?;
    }

    if let Some(help) = menu
        .get(HELP_SUBMENU_ID)
        .and_then(|i| i.as_submenu().cloned())
    {
        help.append_items(&[
            &MenuItem::with_id(app, WEBSITE, "KHole on GitHub", true, None::<&str>)?,
            &MenuItem::with_id(app, ISSUE, "Report an Issue…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, LICENSE, "License (GPL-3.0)", true, None::<&str>)?,
            &MenuItem::with_id(app, NOTICES, "Third-Party Licenses", true, None::<&str>)?,
        ])?;
    }
    Ok(menu)
}

/// Handles the custom Help items; the predefined ones are handled by macOS.
pub fn on_event(app: &AppHandle, id: &str) {
    let result = match id {
        WEBSITE => app.opener().open_url(REPO, None::<&str>),
        ISSUE => app
            .opener()
            .open_url(format!("{REPO}/issues/new"), None::<&str>),
        LICENSE => open_resource(app, "LICENSE"),
        NOTICES => open_resource(app, "THIRD_PARTY_NOTICES.md"),
        _ => return,
    };
    if let Err(e) = result {
        eprintln!("menu {id}: {e}");
    }
}

/// Opens a file bundled in the app's Resources (see `bundle.resources`) in the default app;
/// TextEdit for Markdown, unless the user picked something else.
fn open_resource(app: &AppHandle, name: &str) -> Result<(), tauri_plugin_opener::Error> {
    let path = app
        .path()
        .resolve(name, BaseDirectory::Resource)
        .map_err(tauri_plugin_opener::Error::from)?;
    if !path.exists() {
        // `tauri dev` runs without a bundle: fall back to the copy on GitHub.
        return app
            .opener()
            .open_url(format!("{REPO}/blob/main/{name}"), None::<&str>);
    }
    app.opener().open_path(path.to_string_lossy(), None::<&str>)
}
