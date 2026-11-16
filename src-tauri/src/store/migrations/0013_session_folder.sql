-- The folder tree (spec #13) replaces "Include subfolders": every scan takes the whole
-- source folder, and the session remembers which subfolder the list shows. `folder` is
-- relative to the source folder (so Locate… needs no rewrite); NULL: all of it.
ALTER TABLE sessions DROP COLUMN include_sub;
ALTER TABLE sessions ADD COLUMN folder TEXT;
