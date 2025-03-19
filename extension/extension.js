// ========================================================================
// This file implements the main extension logic for the Mouseless GNOME Shell extension.
// It defines the Mouseless class which handles enabling/disabling the extension,
// creating the panel indicator, and managing the fullscreen interface.
// It also provides the init() function to initialize the extension instance.
// ========================================================================

/* extension.js */
/* exported init */
const { Meta, Shell } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Settings = Me.imports.settings;
const MouselessIndicator = Me.imports.indicator;  // renamed indicator module if necessary
const MouselessScreen = Me.imports.screen;          // renamed screen module if necessary
const Main = imports.ui.main;

// global constants
window.SCHEMA_KEY = 'org.gnome.shell.extensions.mouseless';
window.HELP_URL = 'https://github.com/superspacehero/Mouseless/';

const DISABLE_ANIMATIONS = true;

var restoreShouldAnimate;

/**
 * Creates the main instance managing the Mouseless extension.
 */
class Mouseless {
  /**
   * Constructor.
   */
  constructor() {}

  /**
   * Enables the extension: creates indicators, sets keybindings, and disables animations if needed.
   */
  enable() {
    log(`${Me.metadata.name} enabling`);
    // Create a panel indicator
    let indicatorName = `${Me.metadata.name} Indicator`;
    this._indicator = new MouselessIndicator.MouselessIndicator(indicatorName);
    Main.panel.addToStatusArea(indicatorName, this._indicator);

    // Create the fullscreen 10-foot interface
    this.screen = new MouselessScreen.MouselessScreen();

    this.settings = ExtensionUtils.getSettings(SCHEMA_KEY);

    Main.wm.addKeybinding(
      'ml-exit-shortcut',
      Settings.SETTINGS,
      Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
      Shell.ActionMode.ALL,
      this._exitKeyHandler.bind(this)
    );

    Main.wm.addKeybinding(
      'ml-home-shortcut',
      Settings.SETTINGS,
      Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
      Shell.ActionMode.ALL,
      this._homeKeyHandler.bind(this)
    );

    if (DISABLE_ANIMATIONS) {
      restoreShouldAnimate = Main.wm._shouldAnimate;
      Main.wm._shouldAnimate = function (_actor) {
        return false;
      };
    }
  }

  /**
   * Handles the exit key binding to hide the interface.
   */
  _exitKeyHandler() {
    this.hide();
  }

  /**
   * Handles the home key binding.
   */
  _homeKeyHandler() {
    // For now, simply log the key press.
    log('_homeKeyHandler');
  }

  /**
   * Disables the extension and restores any modified settings.
   */
  disable() {
    log(`${Me.metadata.name} disabling`);
    this.screen.hideModal();
    this.screen.destroy();
    this.screen = null;
    this._indicator.destroy();
    this._indicator = null;
    if (DISABLE_ANIMATIONS) {
      Main.wm._shouldAnimate = restoreShouldAnimate;
    }
  }

  /**
   * Shows the fullscreen interface.
   */
  show() {
    if (!this.screen) {
      this.screen = new MouselessScreen.MouselessScreen();
    }
    this.screen.showModal();
  }

  /**
   * Hides the fullscreen interface.
   * @param {boolean} closeModal - If true, hides the modal screen completely.
   */
  hide(closeModal = true) {
    if (closeModal) {
      this.screen.hideModal();
    } else {
      this.screen.actor.hide();
    }
  }
}

/**
 * Initializes the Mouseless extension.
 * @returns {Mouseless} An initialized instance.
 */
function init() {
  log(`${Me.metadata.name} init`);
  // Ensure a shared state object exists
  if (!Me.stateObj)
    Me.stateObj = {};
  // Create a single instance of AppBackend if not already created.
  if (!Me.stateObj.appBackend) {
    try {
      const AppBackend = Me.imports.appBackend.AppBackend;
      Me.stateObj.appBackend = new AppBackend();
    } catch (e) {
      log(`Error creating AppBackend: ${e}`);
    }
  }
  return new Mouseless();
}
