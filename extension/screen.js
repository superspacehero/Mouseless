// ========================================================================
// This file implements the main fullscreen interface for the Mouseless extension.
// It defines the MouselessScreen class which manages UI components, view switching,
// layout adjustments, and key event handling.
// ========================================================================
/* exported MouselessScreen */
const { Clutter, Meta, Shell, St } = imports.gi;
const Signals = imports.signals;

const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const MenuList = Me.imports.menuList;
const AppGrid = Me.imports.appGrid;
const Sounds = Me.imports.sounds;
const KeyEvents = Me.imports.keyEvents.KeyEvents;

/**
 * A simple view manager for switching between views.
 */
var ViewManager = class {
  /**
   * Constructs a new ViewManager instance.
   */
  constructor() {
    this._views = {};
    this._currentView = null;
  }

  /**
   * Adds a view to the manager.
   * @param {string} name - The name of the view.
   * @param {St.Widget} view - The view widget.
   */
  addView(name, view) {
    this._views[name] = view;
    view.hide();
  }

  /**
   * Shows a view by name and hides the current one if necessary.
   * @param {string} name - The name of the view to show.
   */
  showView(name) {
    if (this._views[name]) {
      if (this._currentView && this._currentView !== this._views[name]) {
        this._currentView.hide();
      }
      this._currentView = this._views[name];
      this._currentView.show();
    }
  }
};

/**
 * Represents the main fullscreen interface.
 */
var MouselessScreen = class {
  /**
   * Constructs the MouselessScreen, creating all UI components.
   */
  constructor() {
    this.lightbox = new St.Widget({
      visible: false,
      style_class: 'ml-lightbox'
    });
    Main.layoutManager.addTopChrome(this.lightbox);

    this.actor = new St.Widget({
      name: 'mouselessGroup',
      style_class: 'ml-group',
      x_expand: true,
      y_expand: true,
      visible: false,
      clip_to_allocation: true,
      layout_manager: new Clutter.BinLayout()
    });
    this._isShown = false;

    Main.layoutManager.addTopChrome(this.actor);

    this.settings = ExtensionUtils.getSettings(SCHEMA_KEY);

    // add menu view and apps view
    this.list = new MenuList.ListViewManager({ visible: false });
    this.actor.add_child(this.list);

    this.apps = new AppGrid.AppGrid({ visible: true });
    this.actor.add_child(this.apps);

    // Create and configure view manager for switching views
    this.viewManager = new ViewManager();
    this.viewManager.addView('list', this.list);
    this.viewManager.addView('apps', this.apps);
    // Initially show the apps view
    this.viewManager.showView('apps');

    this.sounds = new Sounds.Sounds();

    Main.layoutManager.connect('startup-prepared', () => {
      this._adjustSize();
    });

    this.actor.connect('show', () => {
      this._adjustSize();
      this._grabFocus(this.apps);
    });

    this.list.connect('show', () => {
      this._grabFocus(this.list);
    });
    this.apps.appView.connect('view-loaded', () => {
      this._grabFocus(this.apps.appView);
    });
    this.apps.connect('show', () => {
      this._grabFocus(this.apps.appView, St.DirectionType.TAB_BACKWARD);
    });

    this.actor.connect('key-press-event', (actor, event) => {
      return KeyEvents.handleStageKeyPress(this, event);
    });

    // Connect to key event signals emitted by KeyEvents.js
    this.connect('back', (screen, event) => {
      // Handle 'back': close the interface
      this.hideModal(true);
    });
    this.connect('movement', (screen, event) => {
      if (this.apps && this.apps.appView && typeof this.apps.appView.movement === 'function') {
        this.apps.appView.movement(this.apps.appView, event);
      }
    });
    this.connect('select', (screen, event) => {
      // Handle 'select' (Enter key): activate the currently focused element
      let focused = global.stage.get_key_focus();
      if (focused && typeof focused.activate === 'function') {
        focused.activate(Clutter.get_current_event());
      }
    });

    Shell.AppSystem.get_default().connect('app-state-changed', this._updateRunningCount.bind(this));
  }

  /**
   * Exits the interface.
   */
  exit() {
    this.hideModal(true);
    this.homeScreen();
  }

  /**
   * Shows the settings view.
   */
  showSettings() {
    this.viewManager.showView('list');
  }

  /**
   * Switches back to the home (apps) screen.
   */
  homeScreen() {
    this.viewManager.showView('apps');
  }

  /**
   * Adjusts sizes and positions of modal elements.
   * @private
   */
  _adjustSize() {
    this.lightbox.set_position(0, 0);
    this.lightbox.set_size(global.screen_width, global.screen_height);

    this.actor.set_position(0, 0);
    // this.actor.queue_relayout();
    this.actor.set_size(Main.layoutManager.primaryMonitor.width, Main.layoutManager.primaryMonitor.height);
  }

  /**
   * Updates the count of running applications and shows/hides the interface.
   * @param {object} appSys - The application system.
   * @param {Object} app - An application instance.
   * @private
   */
  _updateRunningCount(appSys, app) {
    if (app) {
      if (app.state == Shell.AppState.STARTING) {
        return;
      }
    }
    const apps = Shell.AppSystem.get_default().get_running();
    this._nAppsRunning = apps.length;
    if (this._nAppsRunning) {
      this.hideModal(false);
    } else if (this._isShown) {
      this.showModal(true);
    }
  }

  /**
   * Grabs focus for the provided actor.
   * @param {St.Widget} actor - The actor to focus.
   * @param {St.DirectionType} [direction=St.DirectionType.TAB_FORWARD] - Focus navigation direction.
   * @private
   */
  _grabFocus(actor, direction = St.DirectionType.TAB_FORWARD) {
    // fixes issue where item becomes active, but not focused,
    // likely a race condition if the first focusable child doesn't exist when we move the focus to the root
    let focusSet = actor.navigate_focus(null, direction, false);
    if (!focusSet) {
      Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
        actor.navigate_focus(null, direction, false);
        return false;
      });
    }
  }

  /**
   * Shows the interface modal.
   * @param {boolean} [skipAnimation=false] - If true, skip fade-in animation.
   */
  showModal(skipAnimation = false) {
    if (!this._grabModal()) {
      Main.notify('Unable to acquire modal grab for the interface!');
      log("Mouseless: showModal: Modal grab failed.");
    } else {
      log("Mouseless: showModal: Modal grab acquired.");
    }
    this._isShown = true;
    // Place the modal actor below the top window group
    Main.layoutManager.uiGroup.set_child_below_sibling(this.actor, global.top_window_group);
    // Place the lightbox just below the modal actor
    Main.layoutManager.uiGroup.set_child_below_sibling(this.lightbox, this.actor);

    this.lightbox.show();

    // Close interface if clicking on the background
    this.lightbox.connect('button-press-event', (actor, event) => {
      this.hideModal(true);
      return Clutter.EVENT_STOP;
    });

    if (!this.actor.visible) {
      this.actor.show();
      if (!skipAnimation) {
        this.actor.opacity = 0;
        this.actor.ease({
          opacity: 255,
          duration: 1000,
          mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
      } else {
        this.actor.opacity = 255;
      }
    }
    // Ensure the interface receives key events
    this.actor.reactive = true;
    this.actor.can_focus = true;
    global.stage.set_key_focus(this.actor);
    this.actor.grab_key_focus();
    log("Mouseless: interface open");
  }

  /**
   * Hides the interface modal.
   * @param {boolean} [userHidden=false] - If true, marks the interface as user-hidden.
   */
  hideModal(userHidden = false) {
    if (!this.actor) {
      log("Mouseless: hideModal: actor is already null.");
      return;
    }
    
    this.actor.remove_all_transitions();
    this.actor.opacity = 0;
    if (userHidden) {
      this._isShown = false;
    }

    this._removeModal();
    if (this.lightbox) {
      this.lightbox.hide();
    }
    this.actor.hide();
    // reset view to homeScreen
    this.homeScreen();
    log("Mouseless: hideModal: Interface hidden.");
  }

  /**
   * Acquires the modal grab.
   * @returns {number|boolean} The modal token.
   * @private
   */
  _grabModal() {
    if (this._modalToken) {
      return true;
    }
    this._modalToken = Main.pushModal(this.actor, {
      actionMode: Shell.ActionMode.NONE
    });
    return this._modalToken;
  }

  /**
   * Removes the modal grab.
   * @private
   */
  _removeModal() {
    if (this._modalToken) {
      Main.popModal(this._modalToken);
      this._modalToken = null;
    }
  }

  /**
   * Destroys the interface elements.
   */
  destroy() {
    if (this.actor) {
      this.actor.destroy();
      this.actor = null;
    }
    if (this.lightbox) {
      this.lightbox.destroy();
      this.lightbox = null;
    }
    // Add any additional cleanup if necessary
  }
};

// Add signals capability to MouselessScreen
Signals.addSignalMethods(MouselessScreen.prototype);
