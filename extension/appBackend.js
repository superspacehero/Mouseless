// ========================================================================
// This file implements the backend for retrieving application data.
// It loads application categories and apps from a GNOME menu tree,
// provides methods for retrieving all apps, apps by category,
// searching apps by patterns, caching results, and reloading data.
// ========================================================================

/*
 * Derived from Zorin Menu: The official applications menu for Zorin OS.
 * Copyright (C) 2016-2021 Zorin OS Technologies Ltd.
 *
 * This file is licensed under the GNU General Public License, either version 2
 * or (at your option) any later version.
 */

// Import Libraries
const {Gio, GMenu, Shell} = imports.gi;
const Signals = imports.signals;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;
const appSys = Shell.AppSystem.get_default();
const ParentalControlsManager = imports.misc.parentalControlsManager;

var AppBackend = class {
    /**
     * Constructs a new AppBackend instance.
     * Initializes caches, loads data, and sets up event listeners.
     */
    constructor() {
        this._categories = [];
        this._appsByCategory = {};
        this._allAppsCache = null;    // cache storage
        this._parentalControlsManager = ParentalControlsManager.getDefault();
        this._parentalControlsManager.connect('app-filter-changed', () => {
            this._reload();
        });
        this._load();
        this.reloading = false;
        this._installedChangedId = appSys.connect('installed-changed', this._reload.bind(this));
    }

    /**
     * Returns a descriptor for the all apps category.
     * @returns {Object} - An object representing the "All Apps" category.
     */
    allAppsCategory() {
        return {
            get_name: () => _('All Apps'),
            get_menu_id: () => 'all_apps',
            get_icon: () => Gio.icon_new_for_string('view-app-grid-symbolic'),
        };
    }

    /**
     * Loads data for a single menu category with filtering.
     * @param {string} categoryId - The unique category ID.
     * @param {GMenu.Directory} dir - The directory to load apps from.
     */
    _loadCategory(categoryId, dir) {
        let iter = dir.iter();
        let nextType;
        // Initialize category array if needed
        if (!this._appsByCategory[categoryId])
            this._appsByCategory[categoryId] = [];
        while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
            if (nextType == GMenu.TreeItemType.ENTRY) {
                let entry = iter.get_entry();
                let id;
                try {
                    id = entry.get_desktop_file_id();
                } catch(e) {
                    continue;
                }
                let app = appSys.lookup_app(id);
                if (app) {
                    // Use the built-in filtering, and add extra filtering if you wish.
                    // For instance, skip apps whose .desktop file indicates NoDisplay.
                    let info = app.get_app_info();
                    if (info && info.should_show()) {
                        // If needed, add extra filtering here (e.g., ignore known unwanted IDs)
                        this._appsByCategory[categoryId].push(app);
                    }
                }
            } else if (nextType == GMenu.TreeItemType.DIRECTORY) {
                let subdir = iter.get_directory();
                if (!subdir.get_is_nodisplay())
                    this._loadCategory(categoryId, subdir);
            }
        }
    }

    /**
     * Loads data for all menu categories.
     * Resets the cache and processes the GNOME menu tree.
     */
    _load() {
        // Reset cache
        this._allAppsCache = null;
        this._menuTree = new GMenu.Tree({ menu_basename: 'applications.menu', flags: GMenu.TreeFlags.SORT_DISPLAY_NAME });
        this._menuTree.load_sync();
        this._menuTreeChangedId = this._menuTree.connect('changed', this._reload.bind(this));

        let root = this._menuTree.get_root_directory();
        let iter = root.iter();
        let nextType;
        while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
            if (nextType == GMenu.TreeItemType.DIRECTORY) {
                let dir = iter.get_directory();
                if (!dir.get_is_nodisplay()) {
                    let categoryId = dir.get_menu_id();
                    // Create a fresh array for this category.
                    this._appsByCategory[categoryId] = [];
                    this._loadCategory(categoryId, dir);
                    if (this._appsByCategory[categoryId].length > 0)
                        this._categories.push(dir);
                }
            }
        }
    }

    /**
     * Reloads data for all menu categories by invalidating caches.
     * Emits a 'reload' event upon completion.
     */
    _reload() {
        if (this.reloading)
            return;
        this.reloading = true;
        if (this._menuTree) {
            if (this._menuTreeChangedId)
                this._menuTree.disconnect(this._menuTreeChangedId);
            this._menuTree = null;
        }
        this._menuTreeChangedId = null;
        this._categories = [];
        this._appsByCategory = {};
        this._allAppsCache = null; // Invalidate the cache
        this._load();
        this.reloading = false;
        this.emit('reload');
    }

    /**
     * Returns a cached list of all apps, if available.
     * Otherwise, retrieves and caches the list.
     * @returns {Array} - Array of all application instances.
     */
    _allApps() {
        if (this._allAppsCache)
            return this._allAppsCache;
        let apps = [];
        for (let category in this._appsByCategory)
            apps = apps.concat(this._appsByCategory[category]);
        // Optionally remove duplicates.
        let unique = {};
        apps.forEach(app => { unique[app.get_id()] = app; });
        this._allAppsCache = Object.values(unique);
        return this._allAppsCache;
    }

    /**
     * Returns a list of all apps in sorted order.
     * @returns {Array} - Sorted array of all application instances.
     */
    getAllApps() {
        let apps = this._allApps();
        apps.sort(function(a, b) {
            return a.get_name().toLowerCase() > b.get_name().toLowerCase();
        });
        return apps;
    }

    /**
     * Returns a sorted list of apps for a given category.
     * @param {string} category_menu_id - The category identifier.
     * @returns {Array} - Array of application instances for the category.
     */
    getAppsByCategory(category_menu_id) {
        let apps = [];
        if (category_menu_id == "all_apps") {
            return this.getAllApps();
        }
        if (category_menu_id) {
            apps = this._appsByCategory[category_menu_id].slice();
            apps.sort(function(a, b) {
                return a.get_name().toLowerCase() > b.get_name().toLowerCase();
            });
        }
        return apps;
    }

    /**
     * Returns a list of apps that match a given search pattern, sorted by relevance.
     * @param {string} pattern - The search pattern.
     * @returns {Array} - Array of matching application instances.
     */
    searchApps(pattern) {
        let apps = [];
        if (pattern) {
            apps = this._allApps();
            let searchResults = [];
            for (let i in apps) {
                let app = apps[i];
                let info = Gio.DesktopAppInfo.new(app.get_id());
                let match = app.get_name().toLowerCase() + " ";
                if (info.get_display_name())
                    match += info.get_display_name().toLowerCase() + " ";
                if (info.get_executable())
                    match += info.get_executable().toLowerCase() + " ";
                if (info.get_keywords())
                    match += info.get_keywords().toString().toLowerCase() + " ";
                if (app.get_description())
                    match += app.get_description().toLowerCase();
                let index = match.indexOf(pattern.toLowerCase());
                if (index != -1)
                    searchResults.push([index, app]);
            }
            searchResults.sort((a, b) => a[0] - b[0]);
            apps = searchResults.map(value => value[1]);
        }
        return apps;
    }

    /**
     * Returns a copy of all categories in sorted order.
     * @returns {Array} - Array of category directories.
     */
    getCategories() {
        return this._categories.slice();
    }

    /**
     * Destroys the AppBackend instance by disconnecting listeners and clearing caches.
     */
    destroy() {
        if (this._installedChangedId) {
            appSys.disconnect(this._installedChangedId);
            this._installedChangedId = null;
        }
        if (this._menuTree) {
            if (this._menuTreeChangedId)
                this._menuTree.disconnect(this._menuTreeChangedId);
            this._menuTree = null;
        }
        this._menuTreeChangedId = null;
        this._categories = null;
        this._appsByCategory = null;
        this._allAppsCache = null;
        this.emit('destroy');
    }
};
Signals.addSignalMethods(AppBackend.prototype);

// Attach the module to the global scope for use by other modules
this.AppBackend = AppBackend;