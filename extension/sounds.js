// ========================================================================
// This file implements the audio components for the Mouseless extension.
// It defines the Sounds class which loads and plays sound effects.
// ========================================================================
/* exported Sounds */
const { Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

/**
 * Represents the sound effects for the extension.
 */
var Sounds = class Sounds {
  /**
   * Constructs the Sounds instance and loads the click sound.
   */
  constructor() {
    this._clickSound = Gio.File.new_for_path(`${Me.path}/assets/click.wav`);
  }

  /**
   * Plays the interface click sound.
   */
  _playInterfaceClick() {
    global.display.get_sound_player().play_from_file(this._clickSound, 'Interface Click', null);
  }
};

// Attach the Sounds constructor to the module's global scope
this.Sounds = Sounds;
