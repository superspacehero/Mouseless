// ========================================================================
// This file implements the MenuList UI components for the Mouseless extension.
// It includes classes MenuListItem, MenuList, InterfaceSettingsView, MainListView, and ListViewManager.
// ========================================================================

const { Clutter, GObject, Meta, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const _SCROLL_ANIMATION_TIME = 500;

var MenuListItem = GObject.registerClass(
  { Signals: { activate: {} } },
  class MenuListItem extends St.Button {
    /**
     * Constructor for a MenuListItem.
     * @param {Object} options - Contains id, label, and activate callback.
     * @param {Object} parent - The parent MenuList.
     */
    _init({ id, label, activate }, parent) {
      let layout = new St.BoxLayout({
        vertical: true,
        x_align: Clutter.ActorAlign.START
      });
      super._init({
        style_class: 'ml-menu-item',
        button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE,
        can_focus: true,
        x_expand: true,
        child: layout,
        label,
        reactive: false
      });

      this.id = id;
      this.list = parent;
      this.activate = activate;

      this.connect('notify::hover', () => {
        this._setSelected(this.hover);
      });

      this.connect('key-press-event', this._onKeyPress.bind(this));
    }

    /**
     * Handles key press events for navigation and activation.
     * @param {St.Actor} actor - The current actor.
     * @param {Clutter.Event} event - The key press event.
     * @returns {number} Clutter event propagation flag.
     */
    _onKeyPress(actor, event) {
      let symbol = event.get_key_symbol();
      if (symbol === Clutter.KEY_Escape) {
        // go back
        this.list.back();
      } else if (symbol === Clutter.KEY_Tab || symbol === Clutter.KEY_Down) {
        this.list.navigate_focus(actor, St.DirectionType.TAB_FORWARD, true);
        Me.stateObj.screen.sounds._playInterfaceClick();
        return Clutter.EVENT_STOP;
      } else if (symbol === Clutter.KEY_ISO_Left_Tab || symbol === Clutter.KEY_Up) {
        this.list.navigate_focus(actor, St.DirectionType.TAB_BACKWARD, true);
        Me.stateObj.screen.sounds._playInterfaceClick();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Called when the item receives key focus.
     */
    vfunc_key_focus_in() {
      super.vfunc_key_focus_in();
      this._setSelected(true);
    }

    /**
     * Called when the item loses key focus.
     */
    vfunc_key_focus_out() {
      super.vfunc_key_focus_out();
      this._setSelected(false);
    }
    /**
     * Called when the item is clicked.
     */
    vfunc_clicked() {
      Me.stateObj.screen.sounds._playInterfaceClick();
      this.emit('activate');
    }

    /**
     * Updates the visual state of the item.
     * @param {boolean} selected - True if selected.
     */
    _setSelected(selected) {
      if (selected) {
        this.add_style_pseudo_class('selected');
        this.grab_key_focus();
      } else {
        this.remove_style_pseudo_class('selected');
      }
    }
  }
);

var MenuList = GObject.registerClass(
  {
    Signals: {
      activate: { param_types: [MenuListItem.$gtype] },
      'item-added': { param_types: [MenuListItem.$gtype] }
    }
  },
  class MenuList extends St.ScrollView {
    /**
     * Constructor for MenuList.
     * @param {Object} params - Initialization parameters.
     */
    _init(params = {}) {
      super._init({
        ...params,
        style_class: 'ml-menu',
        x_expand: true,
        y_expand: true,
        // can_focus: false,
        // reactive: false,
        y_align: Clutter.ActorAlign.CENTER
      });
      // this.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

      this._box = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_expand: true,
        style_class: 'ml-menu-list',
        pseudo_class: 'expanded'
      });

      this.add_actor(this._box);
      this._items = {};
    }

    /**
     * Handles click events on items.
     * @param {Object} userList - The originating list.
     * @param {MenuListItem} activatedItem - The item that was activated.
     */
    _itemClick(userList, activatedItem) {
      if (typeof activatedItem.activate === 'function') {
        activatedItem.activate();
      }
    }

    /**
     * Smoothly scrolls the view to center the given item.
     * @param {St.Widget} item - The item to scroll to.
     */
    scrollToItem(item) {
      let box = item.get_allocation_box();

      let adjustment = this.get_vscroll_bar().get_adjustment();

      let value = box.y1 + adjustment.step_increment / 2.0 - adjustment.page_size / 2.0;
      adjustment.ease(value, {
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        duration: _SCROLL_ANIMATION_TIME
      });
    }

    /**
     * Immediately jumps the scroll view to the given item.
     * @param {St.Widget} item - The item to jump to.
     */
    jumpToItem(item) {
      let box = item.get_allocation_box();

      let adjustment = this.get_vscroll_bar().get_adjustment();

      let value = box.y1 + adjustment.step_increment / 2.0 - adjustment.page_size / 2.0;

      adjustment.set_value(value);
    }

    /**
     * Adds an item to the menu list.
     * @param {Object} data - Contains id, label, and activate callback.
     */
    addItem(data) {
      let item = new MenuListItem(data, this);
      this._items[data.id] = item;
      this._box.add_child(item);

      item.connect('activate', this._onItemActivated.bind(this));

      // Try to keep the focused item front-and-center
      item.connect('key-focus-in', () => this.scrollToItem(item));

      this._moveFocusToItems();
    }

    /**
     * Removes an item by its label.
     * @param {string} label - The label of the item to remove.
     */
    removeItem(label) {
      let item = this._items[label];
      if (!item) {
        return;
      }
      item.destroy();
      delete this._items[label];
    }

    /**
     * Returns the number of items in the list.
     * @returns {number} The number of items.
     */
    numItems() {
      return Object.keys(this._items).length;
    }

    /**
     * Moves focus among the available items.
     */
    _moveFocusToItems() {
      let hasItems = Object.keys(this._items).length > 0;

      if (!hasItems) return;

      if (global.stage.get_key_focus() != this) return;

      let focusSet = this.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
      if (!focusSet) {
        Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
          this._moveFocusToItems();
          return false;
        });
      }
    }

    /**
     * Handles activation of an item.
     * @param {MenuListItem} activatedItem - The activated item.
     */
    _onItemActivated(activatedItem) {
      this.emit('activate', activatedItem);
    }

    /**
     * Called when the list receives key focus.
     */
    vfunc_key_focus_in() {
      super.vfunc_key_focus_in();
      this._moveFocusToItems();
    }

    /**
     * Placeholder function for back navigation.
     */
    back() {}
  }
);

var InterfaceSettingsView = GObject.registerClass(
  class InterfaceSettingsView extends MenuList {
    /**
     * Initializes the interface settings view.
     * @param {Object} params - Initialization parameters.
     * @param {Object} views - The related view objects.
     */
    _init(params = {}, views) {
      super._init(params);
      // add some items
      this.views = views;
      this.addItem({ id: 'back', label: 'Back', activate: this.back.bind(this) });
      this.connect('activate', this._itemClick.bind(this));
    }

    /**
     * Navigates back from the settings view.
     */
    back() {
      this.hide();
      this.views.mainView.show();
      this.views.mainView.navigate_focus(this.views.ifaceSettings, St.DirectionType.TAB_FORWARD, false);
    }
  }
);

var MainListView = GObject.registerClass(
  class MainListView extends MenuList {
    /**
     * Initializes the main list view.
     * @param {Object} params - Initialization parameters.
     * @param {Object} views - The related view objects.
     */
    _init(params = {}, views) {
      super._init(params);
      // add some items

      this.views = views;

      this.addItem({ id: 'back', label: 'Back', activate: this.back.bind(this) });
      this.addItem({
        id: 'iface-settings',
        label: 'Interface Settings',
        activate: this.showInterfaceSettings.bind(this)
      });
      
      this.addItem({ id: 'display-settings', label: 'Display Settings', activate: () => {
          Util.spawn(['gnome-control-center', 'display']);
      }});
      this.addItem({ id: 'audio-settings', label: 'Audio Settings', activate: () => {
          Util.spawn(['gnome-control-center', 'sound']);
      }});
      this.addItem({ id: 'exit', label: 'Exit Interface', activate: () => Me.stateObj.screen.exit() });
      this.connect('activate', this._itemClick.bind(this));
    }

    /**
     * Displays the interface settings view.
     */
    showInterfaceSettings() {
      this.hide();
      this.views.ifaceSettings.show();
      this.views.ifaceSettings.navigate_focus(this.views.mainView, St.DirectionType.TAB_FORWARD, false);
    }

    /**
     * Handles back navigation in the main view.
     */
    back() {
      Me.stateObj.screen.homeScreen();
    }
  }
);

var ListViewManager = GObject.registerClass(
  class ListViewManager extends St.Widget {
    /**
     * Initializes the ListViewManager with main and settings views.
     * @param {Object} params - Initialization parameters.
     */
    _init(params = {}) {
      super._init({
        ...params,
        layout_manager: new Clutter.BinLayout(),
        reactive: true,
        can_focus: true,
        x_expand: true,
        y_expand: true
      });

      this.mainView = new MainListView({}, this);
      this.ifaceSettings = new InterfaceSettingsView({ visible: false }, this);
      this.add_actor(this.mainView);
      this.add_actor(this.ifaceSettings);
    }

    /**
     * Updates layout when allocation size changes.
     * @param {St.Actor} actor - The actor whose size changed.
     * @param {number} width - The new width.
     * @param {number} height - The new height.
     */
    _onAllocatedSizeChanged(actor, width, height) {
      let box = new Clutter.ActorBox();
      box.x1 = box.y1 = 0;
      box.x2 = width;
      box.y2 = height;
      box = this._viewStack.get_theme_node().get_content_box(box);
      let availWidth = box.x2 - box.x1;
      let availHeight = box.y2 - box.y1;
      log(`${availWidth} x ${availHeight}`);
      // this.mainView.adaptToSize(availWidth, availHeight);
    }

    // vfunc_event() {
    //   super.vfunc_event();
    //   log('vfunc_event');
    // }
    /**
     * Navigates focus within the view.
     * @param {St.Widget|null} from - The starting widget, if any.
     * @param {St.DirectionType} direction - The direction to navigate.
     */
    vfunc_navigate_focus(from, direction) {
      super.vfunc_navigate_focus(from, direction);
      this.mainView.navigate_focus(this, St.DirectionType.TAB_FORWARD, false);
      log('vfunc_navigate_focus', from, direction);
    }
  }
);
