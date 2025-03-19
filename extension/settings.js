// ========================================================================
// This file implements the settings for the Mouseless extension.
// It defines the getSettings function and exposes the SETTINGS global variable.
// ========================================================================
/* settings.js */
/* exported getSettings, SETTINGS */
const Gio = imports.gi.Gio;
const ExtensionUtils = imports.misc.extensionUtils;

var SETTINGS = getSettings();

/**
 * Builds and returns a GSettings schema for the extension.
 * @param {string} [schema] - The GSettings schema id. If omitted, taken from metadata.
 * @returns {Gio.Settings} The settings object.
 */
function getSettings(schema) {
  let extension = ExtensionUtils.getCurrentExtension();

  schema = schema || extension.metadata['settings-schema'];

  const GioSSS = Gio.SettingsSchemaSource;

  // check if this extension was built with "make zip-file", and thus
  // has the schema files in a subfolder
  // otherwise assume that extension has been installed in the
  // same prefix as gnome-shell (and therefore schemas are available
  // in the standard folders)
  let schemaDir = extension.dir.get_child('schemas');
  let schemaSource;
  if (schemaDir.query_exists(null))
    schemaSource = GioSSS.new_from_directory(schemaDir.get_path(), GioSSS.get_default(), false);
  else schemaSource = GioSSS.get_default();

  let schemaObj = schemaSource.lookup(schema, true);
  if (!schemaObj)
    throw new Error(
      'Schema ' +
        schema +
        ' could not be found for extension ' +
        extension.metadata.uuid +
        '. Please check your installation.'
    );

  return new Gio.Settings({ settings_schema: schemaObj });
}
