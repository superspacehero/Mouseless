// ========================================================================
// This file implements the core UI components for displaying application icons in a grid.
// It defines BaseAppIcon, AppIcon, AppView, and AppGrid which wraps AppView in a resizing container.
// ========================================================================

const { Clutter, GLib, Gio, GObject, Graphene, Meta, Shell, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const IconGrid = Me.imports.iconGrid;
const ViewStackLayout = Me.imports.viewStack;
const AppFavorites = imports.ui.appFavorites;
const Main = imports.ui.main;
const Params = imports.misc.params;
const Util = imports.misc.util;
const PopupMenu = imports.ui.popupMenu;

var MAX_COLUMNS = 5;
var MIN_COLUMNS = 3;
var MIN_ROWS = 4;

/**
 * Helper function to get the running app id from an app object.
 * This function checks if the app has a method to get its id and
 * if it starts with "window:". If so, it attempts to get the
 * desktop file id from the app's info.
 * @param {Object} app - The application object.
 * @return {string|null} - The app id or null if it cannot be resolved.
 */
function getRunningAppId(app) {
    // Get the raw id (it might be something like "window:16")
    let rawId = (app.get_id ? app.get_id() : String(app.id)).toLowerCase();
    if (rawId.startsWith("window:") && app.get_app_info) {
        try {
            let info = app.get_app_info();
            let desktopId = info.get_desktop_file_id();
            if (desktopId && desktopId.trim() !== "")
                return desktopId.toLowerCase();
        } catch (e) {
            // fallback: ignore this running app id if we cannot resolve
            return null;
        }
    }
    return rawId;
}

var BaseAppIcon = GObject.registerClass(
  {
    Signals: {
      'menu-state-changed': { param_types: [GObject.TYPE_BOOLEAN] },
      'sync-tooltip': {}
    }
  },
  /**
   * BaseAppIcon represents a basic application icon that supports animations.
   * @param {Object} app - The application object.
   * @param {string} name - The display name.
   * @param {string} id - The application id.
   */
  class BaseAppIcon extends St.Button {
    /**
     * Initializes a new BaseAppIcon.
     * @param {Object} app - The application object.
     * @param {string} name - The display name of the app.
     * @param {string} id - The unique identifier for the app.
     */
    _init(app, name, id) {
      super._init({
        style_class: 'app-well-app',
        pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
      reactive: true,
        button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
        can_focus: true
      });

      // Ensure name and id are strings
      this.app = app;
      this.name = String(name);
      this.id = String(id);
      if (app.icon) {
        this.iconName = String(app.icon);
      }

      this._iconContainer = new St.Widget({ layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true });
      this.set_child(this._iconContainer);

      this._delegate = this;

      const iconParams = {
        createIcon: this._createIcon.bind(this),
        setSizeManually: true
      };

      // Explicitly convert this.name to string before passing it
      this.icon = new IconGrid.BaseIcon(String(this.name), iconParams);

      this._iconContainer.add_child(this.icon);
      this.label_actor = this.icon.label;
      this.label_actor.style_class = 'ml-grid-icon-label';

      this.icon.setIconSize(250);
      this.icon.update();
    }

    /**
     * Handles click events on the icon.
     * @override
     */
    vfunc_clicked(button) {
      this.activate(button);
    }

    /**
     * Activates the associated window.
     * @param {Meta.Window} metaWindow - The window to activate.
     */
    activateWindow(metaWindow) {
      if (metaWindow) {
        Main.activateWindow(metaWindow);
      }
    }

    getId() {
      return this.id;
    }

    /**
     * Scales and fades the icon.
     */
    scaleAndFade() {
      this.ease({
        scale_x: 0.75,
        scale_y: 0.75,
        opacity: 128
      });
    }

    /**
     * Restores the icon scale and opacity.
     */
    undoScaleAndFade() {
      this.ease({
        scale_x: 1.0,
        scale_y: 1.0,
        opacity: 255
      });
    }

    /**
     * Animates the app icon launch effect.
     */
    animateLaunch() {
      this.icon.animateZoomOut();
    }

    /**
     * Animates a zoom out effect from a specific position.
     * @param {number} x - The x-coordinate.
     * @param {number} y - The y-coordinate.
     */
    animateLaunchAtPos(x, y) {
      this.icon.animateZoomOutAtPos(x, y);
    }

    /**
     * Stub to be implemented by subclasses for app activation.
     */
    activate() {
      // implement in the extended class
    }

    /**
     * Stub to be implemented by subclasses for icon creation.
     */
    _createIcon() {
      // implement in the extended class
    }
  }
);

var AppIcon = GObject.registerClass(
  {},
  /**
   * AppIcon extends BaseAppIcon with app-specific functionality.
   * @param {Object} app - The application object.
   */
  class AppIcon extends BaseAppIcon {
    /**
     * Initializes a new AppIcon using the provided app data.
     * @param {Object} app - The application object.
     */
    _init(app) {
      let name = app.get_name ? String(app.get_name()) : String(app.name);
      let id;
      if (app.get_id) {
        id = String(app.get_id());
        if (id.startsWith("window:") && app.get_app_info) {
          try {
            let info = app.get_app_info();
            let desktopId = info.get_desktop_file_id();
            if (desktopId && desktopId !== "")
              id = desktopId;
          } catch (e) {
            // fallback, keep existing id
          }
        }
      } else {
        id = String(app.id);
      }
      super._init(app, name, id);
    }

    /**
     * Handles pointer enter events to set hover state and focus.
     * @override
     */
    vfunc_enter_event(event) {
      return Me.imports.keyEvents.KeyEvents.handlePointerEnter(this, event);
    }

    /**
     * Handles pointer leave events to remove hover state.
     * @override
     */
    vfunc_leave_event(event) {
      return Me.imports.keyEvents.KeyEvents.handlePointerLeave(this, event);
    }

    /**
     * Detects quick taps to activate the icon.
     * @override
     */
    vfunc_clicked(event) {
      if (this._longPressTimeout) {
        GLib.source_remove(this._longPressTimeout);
        this._longPressTimeout = null;
      }
      return Me.imports.keyEvents.KeyEvents.handlePointerClick(this, event);
    }

    /**
     * Activates the application based on the event details such as modifiers.
     */
    activate(buttonOrEvent) {
      let event = Clutter.get_current_event();
      let modifiers = event ? event.get_state() : 0;
      let isMiddleButton = buttonOrEvent && (buttonOrEvent === Clutter.BUTTON_MIDDLE);
      let isCtrlPressed = (modifiers & Clutter.ModifierType.CONTROL_MASK) !== 0;
      let openNewWindow =
        this.app.can_open_new_window() &&
        this.app.state === Shell.AppState.RUNNING &&
        (isCtrlPressed || isMiddleButton);

      if (this.app.state === Shell.AppState.STOPPED || openNewWindow) {
        this.animateLaunch();
      }
      if (openNewWindow) {
        this.app.open_new_window(-1);
      } else {
        this.app.activate();
      }
      Me.stateObj.screen.sounds._playInterfaceClick();
      Me.stateObj.screen.hideModal(true);
    }

    /**
     * Creates the icon widget for the app.
     * @param {number} iconSize - The size of the icon.
     * @returns {St.Widget} - The icon widget.
     */
    _createIcon(iconSize) {
      if (typeof this.app.create_icon_texture === 'function') {
        return this.app.create_icon_texture(iconSize);
      } else {
        let gicon = this.app.get_icon && this.app.get_icon();
        return new St.Icon({ gicon: gicon, icon_size: iconSize });
      }
    }

    /**
     * Displays the context menu for the app icon.
     */
    popupMenu() {
      if (!this._menu) {
        this._menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP, 0);
        let openItem = new PopupMenu.PopupMenuItem("Open App");
        openItem.connect('activate', () => {
          this.app.activate();
          this._menu.close();
          Me.stateObj.screen.hideModal(true);
        });
        this._menu.addMenuItem(openItem);
        let newWindowItem = new PopupMenu.PopupMenuItem("Open in New Window");
        newWindowItem.connect('activate', () => {
          this.app.open_new_window(-1);
          this._menu.close();
          Me.stateObj.screen.hideModal(true);
        });
        this._menu.addMenuItem(newWindowItem);
        let cancelItem = new PopupMenu.PopupMenuItem("Cancel");
        cancelItem.connect('activate', () => {
          this._menu.close();
        });
        this._menu.addMenuItem(cancelItem);
      }
      this._menu.open();
    }

    /**
     * Detects button press events for long-press or right-click context menu activation.
     * @override
     */
    vfunc_button_press_event(event) {
      let button = event.get_button();
      if (button === Clutter.BUTTON_PRIMARY) {
        this._longPressTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
          this.popupMenu();
          this._longPressTimeout = null;
          return GLib.SOURCE_REMOVE;
        });
      } else if (button === Clutter.BUTTON_SECONDARY) {
        // Immediately trigger the popup menu on right-click.
        this.popupMenu();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Handles button release events and cancels long-press if necessary.
     * @override
     */
    vfunc_button_release_event(event) {
      let button = event.get_button();
      if (this._longPressTimeout) {
        GLib.source_remove(this._longPressTimeout);
        this._longPressTimeout = null;
      }
      // For right-click, we already handled activation in the press event.
      if (button === Clutter.BUTTON_SECONDARY)
        return Clutter.EVENT_STOP;
      return super.vfunc_button_release_event(event);
    }
  }
);

var AppView = GObject.registerClass(
  {
    Signals: {
      'view-loaded': {}
    }
  },
  /**
   * AppView manages the grid of application icons.
   */
  class AppView extends St.Widget {
    /**
     * Initializes the AppView with a grid layout and scroll view.
     * @param {Object} params - Widget parameters.
     * @param {Object} gridParams - Parameters for grid layout.
     */
    _init(params = {}, gridParams = {}) {
      super._init(
        Params.parse(params, {
          layout_manager: new Clutter.BinLayout(),
          x_expand: true,
          y_expand: true
        })
      );

      gridParams = Params.parse(
        gridParams,
        {
          columnLimit: MAX_COLUMNS,
          minRows: MIN_ROWS,
          minColumns: MIN_COLUMNS,
          padWithSpacing: false
        },
        true
      );

      // Set up the grid view
      this._grid = new IconGrid.IconGrid(gridParams);

      this._grid.connect('child-focused', (grid, actor) => {
        this._childFocused(actor);
      });
      this._grid.connect('key-press-event', this.movement.bind(this));

      // Standard hack for ClutterBinLayout
      this._grid.x_expand = true;
      this._grid._delegate = this;

      this._items = new Map();
      this._orderedItems = [];
      this._viewLoadedHandlerId = 0;
      this._viewIsReady = false;

      this._scrollView = new St.ScrollView({
        overlay_scrollbars: true,
        x_expand: true,
        y_expand: true,
        reactive: true
      });
      this.add_actor(this._scrollView);
      this._scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.EXTERNAL);

      this._stack = new St.Widget({ layout_manager: new Clutter.BinLayout() });
      this._stack.add_actor(this._grid);

      let box = new St.BoxLayout({
        x_align: Clutter.ActorAlign.CENTER
      });
      box.add_actor(this._stack);
      this._scrollView.add_actor(box);

      this._availWidth = 0;
      this._availHeight = 0;

      // defer redisplay
      this._redisplayWorkId = Main.initializeDeferredWork(this, this._redisplay.bind(this));

      Shell.AppSystem.get_default().connect('installed-changed', () => {
        this._viewIsReady = false;
        AppFavorites.getAppFavorites().reload();
        this._queueRedisplay();
      });
      AppFavorites.getAppFavorites().connect('changed', this._queueRedisplay.bind(this));
    }

    /**
     * Queues a redisplay of the app grid.
     */
    _queueRedisplay() {
      Main.queueDeferredWork(this._redisplayWorkId);
    }

    /**
     * Ensures that the focused icon is visible in the scroll view.
     * @param {St.Widget} icon - The focused icon.
     */
    _childFocused(icon) {
      Util.ensureActorVisibleInScrollView(this._scrollView, icon);
      this._lastFocused = icon;
      Me.stateObj.screen.sounds._playInterfaceClick();
    }

    /**
     * Moves the focus on the grid based on the provided movement event.
     *
     * This method extracts the movement direction from the given event and, if valid and
     * there is an element that was last focused, it navigates the grid's focus accordingly.
     * It returns Clutter.EVENT_STOP if the focus is successfully moved; otherwise, it returns
     * Clutter.EVENT_PROPAGATE.
     *
     * @param {Object} actor - The actor associated with the event.
     * @param {Object} event - The event object containing the movementDirection property.
     * @param {string} event.movementDirection - The direction to move (e.g., St.DirectionType.RIGHT).
     * @returns {number} - Clutter.EVENT_STOP if moved, else Clutter.EVENT_PROPAGATE.
     */
    movement(actor, event) {
      let direction = event.movementDirection;
      if (direction && this._lastFocused) {
      this._grid.navigate_focus(this._lastFocused, direction, false);
      return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Internal method to select an app.
     * @param {string} id - The app identifier.
     * @private
     */
    _selectAppInternal(id) {
      if (this._items.has(id)) this._items.get(id).navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
      else log('No such application %s'.format(id));
    }

    /**
     * Selects an app by id.
     * @param {string} id - The app id.
     */
    selectApp(id) {
      if (this._items.has(id)) {
        let item = this._items.get(id);

        if (item.mapped) {
          this._selectAppInternal(id);
        } else {
          // Need to wait until the view is mapped
          let signalId = item.connect('notify::mapped', (actor) => {
            if (actor.mapped) {
              actor.disconnect(signalId);
              this._selectAppInternal(id);
            }
          });
        }
      } else {
        // Need to wait until the view is built
        let signalId = this.connect('view-loaded', () => {
          this.disconnect(signalId);
          this.selectApp(id);
        });
      }
    }
    _compareItems(a, b) {
      return a.name.localeCompare(b.name);
    }

    /**
     * Redisplays the app grid by adding new apps and removing missing ones.
     */
    _redisplay() {
      let oldApps = this._orderedItems.slice();
      let oldAppIds = oldApps.map((icon) => icon.id);
      // Remove the sorting call because _loadApps returns an already ordered array.
      let newApps = this._loadApps();
      let newAppIds = newApps.map((icon) => icon.id);

      let addedApps = newApps.filter((icon) => !oldAppIds.includes(icon.id));
      let removedApps = oldApps.filter((icon) => !newAppIds.includes(icon.id));

      removedApps.forEach((icon) => {
        let iconIndex = this._orderedItems.indexOf(icon);
        let id = icon.id;
        this._orderedItems.splice(iconIndex, 1);
        icon.destroy();
        this._items.delete(id);
      });

      addedApps.forEach((icon) => {
        let iconIndex = newApps.indexOf(icon);
        this._orderedItems.splice(iconIndex, 0, icon);
        this._grid.addItem(icon, iconIndex);
        this._items.set(icon.id, icon);
      });

      this._viewIsReady = true;
      this.emit('view-loaded');
    }
    /**
     * Loads applications and creates icons.
     * @returns {Array} - An array of AppIcon instances and empty row actors.
     */
    _loadApps() {
      // Lazy initialization of the AppBackend if it hasn't been created yet
      if (!Me.stateObj.appBackend) {
        try {
          const AppBackend = Me.imports.appBackend.AppBackend;
          Me.stateObj.appBackend = new AppBackend();
        } catch (e) {
          log("Error creating AppBackend in _loadApps: " + e);
          return [];
        }
      }
      
      let backendApps = Me.stateObj.appBackend.getAllApps();
      let icons = [];
      
      // Create an AppIcon for each app in the backend.
      for (let i = 0; i < backendApps.length; i++) {
        let app = backendApps[i];
        icons.push(new AppIcon(app));
      }
      
      // Determine running apps using Shell.AppSystem to get consistent ids.
      const appSystem = Shell.AppSystem.get_default();
      let runningAppIds = global.get_window_actors()
        .map(wa => {
          let meta = wa.get_meta_window();
          let runningApp = appSystem.lookup_app(meta.get_wm_class());
          return runningApp ? runningApp.get_id().toLowerCase() : "";
        })
        .filter(id => id.length > 0);
      log("Mouseless: Running apps: " + runningAppIds.join(", "));
      
      // Retrieve favorite IDs from the favorite map.
      let favorites = AppFavorites.getAppFavorites().getFavoriteMap();
      let favoriteAppIds = Object.keys(favorites).map(id => id.toLowerCase());
      log("Mouseless: Favorites from settings: " + favoriteAppIds.join(", "));
      
      // Group the icons accordingly.
      let favIcons = favoriteAppIds
        .map(id => icons.find(icon => icon.getId().toLowerCase() === id))
        .filter(icon => icon);
        
      let runningIcons = icons.filter(icon => {
        let id = getRunningAppId(icon.app);
        return runningAppIds.includes(id) && !favoriteAppIds.includes(id);
      });
      
      // Other icons: not in favorites and not running.
      let otherIcons = icons.filter(icon => {
        let id = icon.getId().toLowerCase();
        return !favoriteAppIds.includes(id) && !runningAppIds.includes(id);
      });
      
      otherIcons.sort((a, b) => a.name.localeCompare(b.name));

      // Combine groups: favorites, then running, then others.
      let sortedIcons = [];
      if (favIcons.length) {
        sortedIcons = sortedIcons.concat(favIcons);
      }
      if (runningIcons.length) {
        sortedIcons = sortedIcons.concat(runningIcons);
      }
      if (otherIcons.length) {
        sortedIcons = sortedIcons.concat(otherIcons);
      }
      
      return sortedIcons;
    }

    /**
     * Adapts the grid layout to the available size.
     * @param {number} width - Available width.
     * @param {number} height - Available height.
     */
    adaptToSize(width, height) {
      // Compute available dimensions for the grid.
      let box = new Clutter.ActorBox();
      box.x1 = 0;
      box.x2 = width;
      box.y1 = 0;
      box.y2 = height;
      box = this.get_theme_node().get_content_box(box);
      box = this._scrollView.get_theme_node().get_content_box(box);
      box = this._grid.get_theme_node().get_content_box(box);
      let availWidth = box.x2 - box.x1;
      let availHeight = box.y2 - box.y1;
      
      // Adapt the grid layout to the available size.
      this._grid.adaptToSize(availWidth, availHeight);
      
      // Create margins for the scroll view fade effect.
      let fadeOffset = Math.min(this._grid.topPadding, this._grid.bottomPadding);
      let margins = new Clutter.Margin({
        top: fadeOffset,
        right: fadeOffset,
        bottom: fadeOffset,
        left: fadeOffset
      });
      this._scrollView.update_fade_effect(margins);
      if (fadeOffset > 0)
        this._scrollView.get_effect('fade').fade_edges = true;
      
      // Trigger a redraw if available dimensions have changed.
      if (this._availWidth !== availWidth || this._availHeight !== availHeight)
        Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
          return GLib.SOURCE_REMOVE;
        });
      
      this._availWidth = availWidth;
      this._availHeight = availHeight;
    }
  }
);

var EmptyRow = GObject.registerClass(
  {},
  class EmptyRow extends St.Widget {
    _init() {
      super._init({ reactive: false, style_class: 'ml-empty-row', x_expand: true });
      this.set_size(1, 20); // Set minimum width and desired height
      this.id = "empty-row-" + Math.random().toString(36).slice(2, 7);
      // Add dummy icon and name properties for compatibility with IconGrid's sorting/layout.
      this.icon = this;
      this.name = "";
    }
    getId() {
      return this.id;
    }
    destroy() {
      // no-op
    }
  }
);

function createEmptyRow() {
  return new EmptyRow();
}

var AppGrid = GObject.registerClass(
  /**
   * AppGrid embeds the AppView in a container that adapts on resize.
   */
  class AppGrid extends St.BoxLayout {
    /**
     * Initializes the AppGrid and embeds the AppView in a view stack.
     * @param {Object} params - BoxLayout parameters.
     */
    _init(params = {}) {
      super._init(
        Params.parse(
          params,
          {
            style_class: 'ml-app-grid app-display',
            vertical: true,
            x_expand: true,
            y_expand: true
          },
          true
        )
      );
      this.appView = new AppView();
      
      // Set up the view stack for containing the app view.
      this._viewStackLayout = new ViewStackLayout.ViewStackLayout();
      this._viewStack = new St.Widget({ 
        x_expand: true, 
        y_expand: true, 
        layout_manager: this._viewStackLayout 
      });
      this._viewStackLayout.connect('allocated-size-changed', this._onAllocatedSizeChanged.bind(this));
      this._viewStack.add_actor(this.appView);
      this.add_actor(this._viewStack);
    }

    /**
     * Handles allocated size changes and informs the AppView.
     * @param {St.Actor} actor - The actor with changed allocation.
     * @param {number} width - The new width.
     * @param {number} height - The new height.
     */
    _onAllocatedSizeChanged(actor, width, height) {
      // Calculate available size and inform the app view.
      let box = new Clutter.ActorBox();
      box.x1 = box.y1 = 0;
      box.x2 = width;
      box.y2 = height;
      box = this._viewStack.get_theme_node().get_content_box(box);
      let availWidth = box.x2 - box.x1;
      let availHeight = box.y2 - box.y1;
      this.appView.adaptToSize(availWidth, availHeight);
    }
  }
);
