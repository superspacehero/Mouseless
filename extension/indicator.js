// ========================================================================
// This file implements the panel indicator for the Mouseless GNOME Shell extension.
// It defines the MouselessIndicator class, which creates the panel button and handles
// user interaction and UI updates for the extension's indicator.
// ========================================================================

/* exported MouselessIndicator */
const { Gio, GObject, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Util = imports.misc.util;

var MouselessIndicator = GObject.registerClass(
  /**
   * Creates a panel indicator for the Mouseless extension.
   */
  class MouselessIndicator extends PanelMenu.Button {
    /**
     * Initializes the indicator.
     * @param {string} name - The name of the indicator.
     */
    _init(name) {
      super._init(0.5, _(name));

      this._hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
      // this._hbox.add_child(this._container);

      let icon = new St.Icon({
        gicon: new Gio.ThemedIcon({ name: 'video-display' }),
        style_class: 'system-status-icon'
      });
      this._hbox.add_child(icon);

      this._hbox.add_child(PopupMenu.arrowIcon(St.Side.BOTTOM));

      this.add_child(this._hbox);

      const infoItem = new PopupMenu.PopupMenuItem('Mouseless v0.1', { hover: false, reactive: false });
      this.menu.addMenuItem(infoItem);

      const helpItem = new PopupMenu.PopupMenuItem('Help');
      this.menu.addMenuItem(helpItem);
      helpItem.connect('activate', this._openHelp.bind(this));

      this._propSeparator = new PopupMenu.PopupSeparatorMenuItem();
      this.menu.addMenuItem(this._propSeparator);

      this.settings = ExtensionUtils.getSettings(SCHEMA_KEY);

      const openItem = new PopupMenu.PopupMenuItem('Open Interface');
      this.menu.addMenuItem(openItem);
      openItem.connect('activate', this._openInterface.bind(this));
    }

    /**
     * Opens the help documentation.
     */
    _openHelp() {
      Util.spawn(['xdg-open', HELP_URL]);
    }

    /**
     * Opens the main interface.
     */
    _openInterface() {
      Me.stateObj.show();
    }
  }
);
