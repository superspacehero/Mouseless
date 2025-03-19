// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// ========================================================================
// This file provides the icon grid components for the Mouseless GNOME Shell extension.
// It defines BaseIcon, IconGrid, and optionally PaginatedIconGrid, as well as helper functions
// for icon animations such as zoomOut and position animations.
// ========================================================================
/* exported BaseIcon, IconGrid, PaginatedIconGrid */

const { Clutter, GLib, GObject, Graphene, Meta, St } = imports.gi;

const Params = imports.misc.params;
const Main = imports.ui.main;

var ICON_SIZE = 160;
var MIN_ICON_SIZE = 16;

var ANIMATION_TIME_IN = 350;
var ANIMATION_TIME_OUT = (1 / 2) * ANIMATION_TIME_IN;
var ANIMATION_MAX_DELAY_FOR_ITEM = (2 / 3) * ANIMATION_TIME_IN;
var ANIMATION_BASE_DELAY_FOR_ITEM = (1 / 4) * ANIMATION_MAX_DELAY_FOR_ITEM;
var ANIMATION_MAX_DELAY_OUT_FOR_ITEM = (2 / 3) * ANIMATION_TIME_OUT;
var ANIMATION_FADE_IN_TIME_FOR_ITEM = (1 / 4) * ANIMATION_TIME_IN;

var ANIMATION_BOUNCE_ICON_SCALE = 1.1;

var AnimationDirection = {
  IN: 0,
  OUT: 1
};

var APPICON_ANIMATION_OUT_SCALE = 3;
var APPICON_ANIMATION_OUT_TIME = 250;

const ICON_POSITION_DELAY = 25;

/**
 * BaseIcon creates an icon widget with a label and supports animations.
 * @param {string} label - The icon label.
 * @param {Object} params - Parameters for icon creation.
 */
var BaseIcon = GObject.registerClass(
  class BaseIcon extends St.Bin {
    _init(label, params) {
      params = Params.parse(params, { createIcon: null, setSizeManually: false, showLabel: true });

      let styleClass = 'overview-icon';
      if (params.showLabel) styleClass += ' overview-icon-with-label';

      super._init({ style_class: styleClass });

      this.connect('destroy', this._onDestroy.bind(this));

      this._box = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_expand: true
      });
      this.set_child(this._box);

      this.iconSize = ICON_SIZE;
      this._iconBin = new St.Bin({ x_align: Clutter.ActorAlign.CENTER });

      this._box.add_actor(this._iconBin);

      if (params.showLabel) {
        this.label = new St.Label({ text: label });
        this.label.clutter_text.set({
          x_align: Clutter.ActorAlign.CENTER,
          y_align: Clutter.ActorAlign.CENTER
        });
        this._box.add_actor(this.label);
      } else {
        this.label = null;
      }

      if (params.createIcon) this.createIcon = params.createIcon;
      this._setSizeManually = params.setSizeManually;

      this.icon = null;

      let cache = St.TextureCache.get_default();
      this._iconThemeChangedId = cache.connect('icon-theme-changed', this._onIconThemeChanged.bind(this));
    }

    /**
     * Returns the preferred width.
     * @param {number} _forHeight - Height constraint.
     * @returns {number} Preferred width.
     */
    vfunc_get_preferred_width(_forHeight) {
      // Return the actual height to keep the squared aspect
      return this.get_preferred_height(-1);
    }

    /**
     * Override to create an icon texture.
     * @param {number} _size - The size for the icon.
     * @throws {GObject.NotImplementedError}
     */
    createIcon(_size) {
      throw new GObject.NotImplementedError(`createIcon in ${this.constructor.name}`);
    }

    /**
     * Sets the icon size manually.
     * @param {number} size - The new icon size.
     */
    setIconSize(size) {
      if (!this._setSizeManually) throw new Error('setSizeManually has to be set to use setIconsize');

      if (size == this.iconSize) return;

      this._createIconTexture(size);
    }

    /**
     * Creates a new icon texture.
     * @param {number} size - The icon size.
     * @private
     */
    _createIconTexture(size) {
      if (this.icon) this.icon.destroy();
      this.iconSize = size;
      this.icon = this.createIcon(this.iconSize);

      this._iconBin.child = this.icon;
    }

    /**
     * Updates the icon texture when styles change.
     */
    vfunc_style_changed() {
      super.vfunc_style_changed();
      let node = this.get_theme_node();

      let size;
      if (this._setSizeManually) {
        size = this.iconSize;
      } else {
        let [found, len] = node.lookup_length('icon-size', false);
        size = found ? len : ICON_SIZE;
      }

      if (this.iconSize == size && this._iconBin.child) return;

      this._createIconTexture(size);
    }

    /**
     * Cleans up event connections.
     * @private
     */
    _onDestroy() {
      if (this._iconThemeChangedId > 0) {
        let cache = St.TextureCache.get_default();
        cache.disconnect(this._iconThemeChangedId);
        this._iconThemeChangedId = 0;
      }
    }

    /**
     * Handles icon theme changes.
     * @private
     */
    _onIconThemeChanged() {
      this._createIconTexture(this.iconSize);
    }

    /**
     * Animates a zoom-out effect on the icon.
     */
    animateZoomOut() {
      // Animate only the child instead of the entire actor, so the
      // styles like hover and running are not applied while
      // animating.
      zoomOutActor(this.child);
    }

    /**
     * Animates a zoom-out effect starting at a given position.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     */
    animateZoomOutAtPos(x, y) {
      zoomOutActorAtPos(this.child, x, y);
    }

    /**
     * Updates the icon texture.
     */
    update() {
      this._createIconTexture(this.iconSize);
    }
  }
);

/**
 * Helper function that clamps a value.
 * @param {number} value - The value.
 * @param {number} min - The minimum.
 * @param {number} max - The maximum.
 * @returns {number} The clamped value.
 */
function clamp(value, min, max) {
  return Math.max(Math.min(value, max), min);
}

/**
 * Animates the given actor with a zoom-out effect.
 * @param {Clutter.Actor} actor - The actor.
 */
function zoomOutActor(actor) {
  let [x, y] = actor.get_transformed_position();
  zoomOutActorAtPos(actor, x, y);
}

/**
 * Animates a zoom-out effect from a specific position.
 * @param {Clutter.Actor} actor - The actor.
 * @param {number} x - The starting x coordinate.
 * @param {number} y - The starting y coordinate.
 */
function zoomOutActorAtPos(actor, x, y) {
  let actorClone = new Clutter.Clone({ source: actor, reactive: false });
  let [width, height] = actor.get_transformed_size();

  actorClone.set_size(width, height);
  actorClone.set_position(x, y);
  actorClone.opacity = 255;
  actorClone.set_pivot_point(0.5, 0.5);

  Main.uiGroup.add_actor(actorClone);

  // Avoid monitor edges to not zoom outside the current monitor
  let monitor = Main.layoutManager.findMonitorForActor(actor);
  let scaledWidth = width * APPICON_ANIMATION_OUT_SCALE;
  let scaledHeight = height * APPICON_ANIMATION_OUT_SCALE;
  let scaledX = x - (scaledWidth - width) / 2;
  let scaledY = y - (scaledHeight - height) / 2;
  let containedX = clamp(scaledX, monitor.x, monitor.x + monitor.width - scaledWidth);
  let containedY = clamp(scaledY, monitor.y, monitor.y + monitor.height - scaledHeight);

  actorClone.ease({
    scale_x: APPICON_ANIMATION_OUT_SCALE,
    scale_y: APPICON_ANIMATION_OUT_SCALE,
    translation_x: containedX - scaledX,
    translation_y: containedY - scaledY,
    opacity: 0,
    duration: APPICON_ANIMATION_OUT_TIME,
    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    onComplete: () => actorClone.destroy()
  });
}

/**
 * Animates the position of an icon.
 * @param {Clutter.Actor} icon - The icon actor.
 * @param {Clutter.ActorBox} box - The target box.
 * @param {number} nChangedIcons - Number of changed icons.
 * @returns {boolean} True if animation was applied.
 */
function animateIconPosition(icon, box, nChangedIcons) {
  if (!icon.has_allocation() || icon.allocation.equal(box) || icon.opacity === 0) {
    icon.allocate(box);
    return false;
  }

  icon.save_easing_state();
  icon.set_easing_mode(Clutter.AnimationMode.EASE_OUT_QUAD);
  icon.set_easing_delay(nChangedIcons * ICON_POSITION_DELAY);

  icon.allocate(box);

  icon.restore_easing_state();

  return true;
}

/**
 * IconGrid provides a flexible grid layout widget for application icons.
 */
var IconGrid = GObject.registerClass(
  {
    Signals: { 'animation-done': {}, 'child-focused': { param_types: [Clutter.Actor.$gtype] } }
  },
  class IconGrid extends St.Widget {
    _init(params) {
      super._init({ style_class: 'icon-grid', y_align: Clutter.ActorAlign.START });

      params = Params.parse(params, {
        rowLimit: null,
        columnLimit: null,
        minRows: 1,
        minColumns: 1,
        fillParent: false,
        xAlign: St.Align.MIDDLE,
        padWithSpacing: false
      });
      this._rowLimit = params.rowLimit;
      this._colLimit = params.columnLimit;
      this._minRows = params.minRows;
      this._minColumns = params.minColumns;
      this._xAlign = params.xAlign;
      this._fillParent = params.fillParent;
      this._padWithSpacing = params.padWithSpacing;

      this.topPadding = 0;
      this.bottomPadding = 0;
      this.rightPadding = 0;
      this.leftPadding = 0;

      this._updateIconSizesLaterId = 0;

      this._items = [];
      this._clonesAnimating = [];
      // Pulled from CSS, but hardcode some defaults here
      this._spacing = 0;
      this._hItemSize = this._vItemSize = ICON_SIZE;
      this._fixedHItemSize = this._fixedVItemSize = undefined;
      this._nonIconWidth = this._nonIconHeight = 0;
      this.connect('style-changed', this._onStyleChanged.bind(this));

      this.connect('actor-added', this._childAdded.bind(this));
      this.connect('actor-removed', this._childRemoved.bind(this));
      this.connect('destroy', this._onDestroy.bind(this));
    }

    /**
     * Cancels animations when unmapping.
     */
    vfunc_unmap() {
      // Cancel animations when hiding the overview, to avoid icons
      // swarming into the void ...
      this._resetAnimationActors();
      super.vfunc_unmap();
    }

    /**
     * Cleans up any deferred work.
     * @private
     */
    _onDestroy() {
      if (this._updateIconSizesLaterId) {
        Meta.later_remove(this._updateIconSizesLaterId);
        this._updateIconSizesLaterId = 0;
      }
    }

    /**
     * Emits a signal when a child is focused.
     * @param {St.Actor} actor - The child actor.
     * @private
     */
    _keyFocusIn(actor) {
      this.emit('child-focused', actor);
    }

    /**
     * Handles child addition to the grid.
     * @param {St.Widget} grid - The grid widget.
     * @param {Clutter.Actor} child - The child actor.
     * @private
     */
    _childAdded(grid, child) {
      child._iconGridKeyFocusInId = child.connect('key-focus-in', this._keyFocusIn.bind(this));

      child._paintVisible = child.opacity > 0;
      child._opacityChangedId = child.connect('notify::opacity', () => {
        let paintVisible = child._paintVisible;
        child._paintVisible = child.opacity > 0;
        if (paintVisible !== child._paintVisible) this.queue_relayout();
      });
    }

    /**
     * Handles child removal from the grid.
     * @param {St.Widget} grid - The grid widget.
     * @param {Clutter.Actor} child - The child actor.
     * @private
     */
    _childRemoved(grid, child) {
      child.disconnect(child._iconGridKeyFocusInId);
      delete child._iconGridKeyFocusInId;

      child.disconnect(child._opacityChangedId);
      delete child._opacityChangedId;
      delete child._paintVisible;
    }

    /**
     * Returns the preferred width.
     * @param {number} _forHeight - Height constraint.
     * @returns {number} Preferred width.
     */
    vfunc_get_preferred_width(_forHeight) {
      if (this._fillParent)
        // Ignore all size requests of children and request a size of 0;
        // later we'll allocate as many children as fit the parent
        return [0, 0];

      let nChildren = this.get_n_children();
      let nColumns = this._colLimit ? Math.min(this._colLimit, nChildren) : nChildren;
      let totalSpacing = Math.max(0, nColumns - 1) * this._getSpacing();
      // Kind of a lie, but not really an issue right now.  If
      // we wanted to support some sort of hidden/overflow that would
      // need higher level design
      let minSize = this._getHItemSize() + this.leftPadding + this.rightPadding;
      let natSize = nColumns * this._getHItemSize() + totalSpacing + this.leftPadding + this.rightPadding;

      return this.get_theme_node().adjust_preferred_width(minSize, natSize);
    }

    /**
     * Returns the visible children of the grid.
     * @returns {Clutter.Actor[]} Array of visible children.
     * @private
     */
    _getVisibleChildren() {
      return this.get_children().filter((actor) => actor.visible);
    }

    /**
     * Returns the preferred height.
     * @param {number} forWidth - Width constraint.
     * @returns {number[]} Preferred height.
     */
    vfunc_get_preferred_height(forWidth) {
      if (this._fillParent)
        // Ignore all size requests of children and request a size of 0;
        // later we'll allocate as many children as fit the parent
        return [0, 0];

      let themeNode = this.get_theme_node();
      let children = this._getVisibleChildren();
      let nColumns;

      forWidth = themeNode.adjust_for_width(forWidth);

      if (forWidth < 0) nColumns = children.length;
      else [nColumns] = this._computeLayout(forWidth);

      let nRows;
      if (nColumns > 0) nRows = Math.ceil(children.length / nColumns);
      else nRows = 0;
      if (this._rowLimit) nRows = Math.min(nRows, this._rowLimit);
      let totalSpacing = Math.max(0, nRows - 1) * this._getSpacing();
      let height = nRows * this._getVItemSize() + totalSpacing + this.topPadding + this.bottomPadding;

      return themeNode.adjust_preferred_height(height, height);
    }

    /**
     * Allocates space for the grid and its children.
     * @param {Clutter.ActorBox} box - The allocation box.
     */
    vfunc_allocate(box) {
      this.set_allocation(box);

      let themeNode = this.get_theme_node();
      box = themeNode.get_content_box(box);

      if (this._fillParent) {
        let parentBox = this.get_parent().allocation;
        let gridBox = themeNode.get_content_box(parentBox);
        box = themeNode.get_content_box(gridBox);
      }

      let children = this._getVisibleChildren();
      let availWidth = box.x2 - box.x1;
      let availHeight = box.y2 - box.y1;
      let spacing = this._getSpacing();
      let [nColumns, usedWidth] = this._computeLayout(availWidth);

      let leftEmptySpace;
      switch (this._xAlign) {
        case St.Align.START:
          leftEmptySpace = 0;
          break;
        case St.Align.MIDDLE:
          leftEmptySpace = Math.floor((availWidth - usedWidth) / 2);
          break;
        case St.Align.END:
          leftEmptySpace = availWidth - usedWidth;
      }

      let animating = this._clonesAnimating.length > 0;
      let x = box.x1 + leftEmptySpace + this.leftPadding;
      let y = box.y1 + this.topPadding;
      let columnIndex = 0;
      let rowIndex = 0;
      let nChangedIcons = 0;
      for (let i = 0; i < children.length; i++) {
        let childBox = this._calculateChildBox(children[i], x, y, box);

        if (
          (this._rowLimit && rowIndex >= this._rowLimit) ||
          (this._fillParent && childBox.y2 > availHeight - this.bottomPadding)
        ) {
          children[i].opacity = 0;
        } else {
          if (!animating) children[i].opacity = 255;

          if (animateIconPosition(children[i], childBox, nChangedIcons))
            nChangedIcons++;
        }

        columnIndex++;
        if (columnIndex == nColumns) {
          columnIndex = 0;
          rowIndex++;
        }

        if (columnIndex == 0) {
          y += this._getVItemSize() + spacing;
          x = box.x1 + leftEmptySpace + this.leftPadding;
        } else {
          x += this._getHItemSize() + spacing;
        }
      }
    }

    /**
     * Returns the paint volume for the grid.
     * @param {Clutter.PaintVolume} paintVolume - The paint volume.
     * @returns {boolean} True if paint volume is set.
     */
    vfunc_get_paint_volume(paintVolume) {
      // Setting the paint volume does not make sense when we don't have
      // any allocation
      if (!this.has_allocation()) return false;

      let themeNode = this.get_theme_node();
      let allocationBox = this.get_allocation_box();
      let paintBox = themeNode.get_paint_box(allocationBox);

      let origin = new Graphene.Point3D();
      origin.x = paintBox.x1 - allocationBox.x1;
      origin.y = paintBox.y1 - allocationBox.y1;
      origin.z = 0.0;

      paintVolume.set_origin(origin);
      paintVolume.set_width(paintBox.x2 - paintBox.x1);
      paintVolume.set_height(paintBox.y2 - paintBox.y1);

      if (this.get_clip_to_allocation()) return true;

      for (let child = this.get_first_child(); child != null; child = child.get_next_sibling()) {
        if (!child.visible || !child.opacity) continue;

        let childVolume = child.get_transformed_paint_volume(this);
        if (!childVolume) return false;

        paintVolume.union(childVolume);
      }

      return true;
    }

    /**
     * Returns the children to animate.
     * @returns {Clutter.Actor[]} Array of children to animate.
     * @private
     */
    _getChildrenToAnimate() {
      return this._getVisibleChildren().filter((child) => child.opacity > 0);
    }

    /**
     * Resets animation actors.
     * @private
     */
    _resetAnimationActors() {
      this._clonesAnimating.forEach((clone) => {
        clone.source.reactive = true;
        clone.source.opacity = 255;
        clone.destroy();
      });
      this._clonesAnimating = [];
    }

    /**
     * Handles animation completion.
     * @private
     */
    _animationDone() {
      this._resetAnimationActors();
      this.emit('animation-done');
    }

    /**
     * Animates a pulse effect.
     * @param {number} animationDirection - The animation direction.
     */
    animatePulse(animationDirection) {
      if (animationDirection != AnimationDirection.IN) {
        throw new GObject.NotImplementedError('Pulse animation only implements ' + "'in' animation direction");
      }

      this._resetAnimationActors();

      let actors = this._getChildrenToAnimate();
      if (actors.length == 0) {
        this._animationDone();
        return;
      }

      // For few items the animation can be slow, so use a smaller
      // delay when there are less than 4 items
      // (ANIMATION_BASE_DELAY_FOR_ITEM = 1/4 *
      // ANIMATION_MAX_DELAY_FOR_ITEM)
      let maxDelay = Math.min(ANIMATION_BASE_DELAY_FOR_ITEM * actors.length, ANIMATION_MAX_DELAY_FOR_ITEM);

      for (let index = 0; index < actors.length; index++) {
        let actor = actors[index];
        actor.set_scale(0, 0);
        actor.set_pivot_point(0.5, 0.5);

        let delay = (index / actors.length) * maxDelay;
        let bounceUpTime = ANIMATION_TIME_IN / 4;
        let isLastItem = index == actors.length - 1;
        actor.ease({
          scale_x: ANIMATION_BOUNCE_ICON_SCALE,
          scale_y: ANIMATION_BOUNCE_ICON_SCALE,
          duration: bounceUpTime,
          mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
          delay,
          onComplete: () => {
            let duration = ANIMATION_TIME_IN - bounceUpTime;
            actor.ease({
              scale_x: 1,
              scale_y: 1,
              duration,
              mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
              onComplete: () => {
                if (isLastItem) this._animationDone();
                actor.reactive = true;
              }
            });
          }
        });
      }
    }

    /**
     * Animates a spring effect.
     * @param {number} animationDirection - The animation direction.
     * @param {Clutter.Actor} sourceActor - The source actor.
     */
    animateSpring(animationDirection, sourceActor) {
      this._resetAnimationActors();

      let actors = this._getChildrenToAnimate();
      if (actors.length == 0) {
        this._animationDone();
        return;
      }

      let [sourceX, sourceY] = sourceActor.get_transformed_position();
      let [sourceWidth, sourceHeight] = sourceActor.get_size();
      // Get the center
      let [sourceCenterX, sourceCenterY] = [sourceX + sourceWidth / 2, sourceY + sourceHeight / 2];
      // Design decision, 1/2 of the source actor size.
      let [sourceScaledWidth, sourceScaledHeight] = [sourceWidth / 2, sourceHeight / 2];

      actors.forEach((actor) => {
        let [actorX, actorY] = (actor._transformedPosition = actor.get_transformed_position());
        let [x, y] = [actorX - sourceX, actorY - sourceY];
        actor._distance = Math.sqrt(x * x + y * y);
      });
      let maxDist = actors.reduce((prev, cur) => {
        return Math.max(prev, cur._distance);
      }, 0);
      let minDist = actors.reduce((prev, cur) => {
        return Math.min(prev, cur._distance);
      }, Infinity);
      let normalization = maxDist - minDist;

      actors.forEach((actor) => {
        let clone = new Clutter.Clone({ source: actor });
        this._clonesAnimating.push(clone);
        Main.uiGroup.add_actor(clone);
      });

      /*
       * ^
       * | These need to be separate loops because Main.uiGroup.add_actor
       * | is excessively slow if done inside the below loop and we want the
       * | below loop to complete within one frame interval (#2065, !1002).
       * v
       */

      this._clonesAnimating.forEach((actorClone) => {
        let actor = actorClone.source;
        actor.opacity = 0;
        actor.reactive = false;

        let [width, height] = this._getAllocatedChildSizeAndSpacing(actor);
        actorClone.set_size(width, height);
        let scaleX = sourceScaledWidth / width;
        let scaleY = sourceScaledHeight / height;
        let [adjustedSourcePositionX, adjustedSourcePositionY] = [
          sourceCenterX - sourceScaledWidth / 2,
          sourceCenterY - sourceScaledHeight / 2
        ];

        let movementParams, fadeParams;
        if (animationDirection == AnimationDirection.IN) {
          let isLastItem = actor._distance == minDist;

          actorClone.opacity = 0;
          actorClone.set_scale(scaleX, scaleY);
          actorClone.set_translation(adjustedSourcePositionX, adjustedSourcePositionY, 0);

          let delay = (1 - (actor._distance - minDist) / normalization) * ANIMATION_MAX_DELAY_FOR_ITEM;
          let [finalX, finalY] = actor._transformedPosition;
          movementParams = {
            translation_x: finalX,
            translation_y: finalY,
            scale_x: 1,
            scale_y: 1,
            duration: ANIMATION_TIME_IN,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
            delay
          };

          if (isLastItem) movementParams.onComplete = this._animationDone.bind(this);

          fadeParams = {
            opacity: 255,
            duration: ANIMATION_FADE_IN_TIME_FOR_ITEM,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
            delay
          };
        } else {
          let isLastItem = actor._distance == maxDist;

          let [startX, startY] = actor._transformedPosition;
          actorClone.set_translation(startX, startY, 0);

          let delay = ((actor._distance - minDist) / normalization) * ANIMATION_MAX_DELAY_OUT_FOR_ITEM;
          movementParams = {
            translation_x: adjustedSourcePositionX,
            translation_y: adjustedSourcePositionY,
            scale_x: scaleX,
            scale_y: scaleY,
            duration: ANIMATION_TIME_OUT,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
            delay
          };

          if (isLastItem) movementParams.onComplete = this._animationDone.bind(this);

          fadeParams = {
            opacity: 0,
            duration: ANIMATION_FADE_IN_TIME_FOR_ITEM,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
            delay: ANIMATION_TIME_OUT + delay - ANIMATION_FADE_IN_TIME_FOR_ITEM
          };
        }

        actorClone.ease(movementParams);
        actorClone.ease(fadeParams);
      });
    }

    /**
     * Returns the allocated size and spacing for a child.
     * @param {Clutter.Actor} child - The child actor.
     * @returns {number[]} Array containing width, height, xSpacing, and ySpacing.
     * @private
     */
    _getAllocatedChildSizeAndSpacing(child) {
      let [, , natWidth, natHeight] = child.get_preferred_size();
      let width = Math.min(this._getHItemSize(), natWidth);
      let xSpacing = Math.max(0, width - natWidth) / 2;
      let height = Math.min(this._getVItemSize(), natHeight);
      let ySpacing = Math.max(0, height - natHeight) / 2;
      return [width, height, xSpacing, ySpacing];
    }

    /**
     * Calculates the allocation box for a child.
     * @param {Clutter.Actor} child - The child actor.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {Clutter.ActorBox} box - The parent box.
     * @returns {Clutter.ActorBox} The calculated box.
     * @private
     */
    _calculateChildBox(child, x, y, box) {
      /* Center the item in its allocation horizontally */
      let [width, height, childXSpacing, childYSpacing] = this._getAllocatedChildSizeAndSpacing(child);

      let childBox = new Clutter.ActorBox();
      if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL) {
        let _x = box.x2 - (x + width);
        childBox.x1 = Math.floor(_x - childXSpacing);
      } else {
        childBox.x1 = Math.floor(x + childXSpacing);
      }
      childBox.y1 = Math.floor(y + childYSpacing);
      childBox.x2 = childBox.x1 + width;
      childBox.y2 = childBox.y1 + height;
      return childBox;
    }

    /**
     * Returns the number of columns for a given width.
     * @param {number} rowWidth - The row width.
     * @returns {number} Number of columns.
     */
    columnsForWidth(rowWidth) {
      return this._computeLayout(rowWidth)[0];
    }

    /**
     * Returns the row limit.
     * @returns {number|null} The row limit.
     */
    getRowLimit() {
      return this._rowLimit;
    }

    /**
     * Computes the layout for a given width.
     * @param {number} forWidth - The width.
     * @returns {number[]} Array containing number of columns and used width.
     * @private
     */
    _computeLayout(forWidth) {
      this.ensure_style();

      let nColumns = 0;
      let usedWidth = this.leftPadding + this.rightPadding;
      let spacing = this._getSpacing();

      while ((this._colLimit == null || nColumns < this._colLimit) && usedWidth + this._getHItemSize() <= forWidth) {
        usedWidth += this._getHItemSize() + spacing;
        nColumns += 1;
      }

      if (nColumns > 0) usedWidth -= spacing;

      return [nColumns, usedWidth];
    }

    /**
     * Handles style changes.
     * @private
     */
    _onStyleChanged() {
      let themeNode = this.get_theme_node();
      this._spacing = themeNode.get_length('spacing');
      this._hItemSize = themeNode.get_length('-shell-grid-horizontal-item-size') || ICON_SIZE;
      this._vItemSize = themeNode.get_length('-shell-grid-vertical-item-size') || ICON_SIZE;
      this.queue_relayout();
    }

    /**
     * Returns the number of rows for a given width.
     * @param {number} forWidth - The width.
     * @returns {number} Number of rows.
     */
    nRows(forWidth) {
      let children = this._getVisibleChildren();
      let nColumns = forWidth < 0 ? children.length : this._computeLayout(forWidth)[0];
      let nRows = nColumns > 0 ? Math.ceil(children.length / nColumns) : 0;
      if (this._rowLimit) nRows = Math.min(nRows, this._rowLimit);
      return nRows;
    }

    /**
     * Returns the number of rows for a given height.
     * @param {number} forHeight - The height.
     * @returns {number} Number of rows.
     */
    rowsForHeight(forHeight) {
      return Math.floor(
        (forHeight - (this.topPadding + this.bottomPadding) + this._getSpacing()) /
          (this._getVItemSize() + this._getSpacing())
      );
    }

    /**
     * Returns the used height for a given number of rows.
     * @param {number} nRows - The number of rows.
     * @returns {number} Used height.
     */
    usedHeightForNRows(nRows) {
      return (
        (this._getVItemSize() + this._getSpacing()) * nRows - this._getSpacing() + this.topPadding + this.bottomPadding
      );
    }

    /**
     * Returns the used width for a given width.
     * @param {number} forWidth - The width.
     * @returns {number} Used width.
     */
    usedWidth(forWidth) {
      return this.usedWidthForNColumns(this.columnsForWidth(forWidth));
    }

    /**
     * Returns the used width for a given number of columns.
     * @param {number} columns - The number of columns.
     * @returns {number} Used width.
     */
    usedWidthForNColumns(columns) {
      let usedWidth = columns * (this._getHItemSize() + this._getSpacing());
      usedWidth -= this._getSpacing();
      return usedWidth + this.leftPadding + this.rightPadding;
    }

    /**
     * Removes all items from the grid.
     */
    removeAll() {
      this._items = [];
      this.remove_all_children();
    }

    /**
     * Destroys all items in the grid.
     */
    destroyAll() {
      this._items = [];
      this.destroy_all_children();
    }

    /**
     * Adds an item to the grid.
     * @param {Object} item - The item to add.
     * @param {number} [index] - The index to insert at.
     */
    addItem(item, index) {
      if (!(item.icon instanceof BaseIcon))
        throw new Error('Only items with a BaseIcon icon property can be added to IconGrid');

      this._items.push(item);
      if (index !== undefined) this.insert_child_at_index(item, index);
      else this.add_actor(item);
    }

    /**
     * Removes an item from the grid.
     * @param {Object} item - The item to remove.
     */
    removeItem(item) {
      this.remove_child(item);
    }

    /**
     * Returns the item at a given index.
     * @param {number} index - The index.
     * @returns {Object} The item.
     */
    getItemAtIndex(index) {
      return this.get_child_at_index(index);
    }

    /**
     * Returns the count of visible items.
     * @returns {number} Count of visible items.
     */
    visibleItemsCount() {
      return this.get_children().filter((c) => c.is_visible()).length;
    }

    /**
     * Sets the spacing between items.
     * @param {number} spacing - The spacing.
     */
    setSpacing(spacing) {
      this._fixedSpacing = spacing;
    }

    /**
     * Returns the spacing between items.
     * @returns {number} The spacing.
     * @private
     */
    _getSpacing() {
      return this._fixedSpacing ? this._fixedSpacing : this._spacing;
    }

    /**
     * Returns the horizontal item size.
     * @returns {number} The horizontal item size.
     * @private
     */
    _getHItemSize() {
      return this._fixedHItemSize ? this._fixedHItemSize : this._hItemSize;
    }

    /**
     * Returns the vertical item size.
     * @returns {number} The vertical item size.
     * @private
     */
    _getVItemSize() {
      return this._fixedVItemSize ? this._fixedVItemSize : this._vItemSize;
    }

    /**
     * Updates the spacing for the available size.
     * @param {number} availWidth - The available width.
     * @param {number} availHeight - The available height.
     * @private
     */
    _updateSpacingForSize(availWidth, availHeight) {
      let maxEmptyVArea = availHeight - this._minRows * this._getVItemSize();
      let maxEmptyHArea = availWidth - this._minColumns * this._getHItemSize();
      let maxHSpacing, maxVSpacing;

      if (this._padWithSpacing) {
        // minRows + 1 because we want to put spacing before the first row, so it is like we have one more row
        // to divide the empty space
        maxVSpacing = Math.floor(maxEmptyVArea / (this._minRows + 1));
        maxHSpacing = Math.floor(maxEmptyHArea / (this._minColumns + 1));
      } else {
        if (this._minRows <= 1) maxVSpacing = maxEmptyVArea;
        else maxVSpacing = Math.floor(maxEmptyVArea / (this._minRows - 1));

        if (this._minColumns <= 1) maxHSpacing = maxEmptyHArea;
        else maxHSpacing = Math.floor(maxEmptyHArea / (this._minColumns - 1));
      }

      let maxSpacing = Math.min(maxHSpacing, maxVSpacing);
      // Limit spacing to the item size
      maxSpacing = Math.min(maxSpacing, Math.min(this._getVItemSize(), this._getHItemSize()));
      // The minimum spacing, regardless of whether it satisfies the row/columng minima,
      // is the spacing we get from CSS.
      let spacing = Math.max(this._spacing, maxSpacing);
      this.setSpacing(spacing);
      if (this._padWithSpacing) this.topPadding = this.rightPadding = this.bottomPadding = this.leftPadding = spacing;
    }

    /**
     * Adapts the grid layout to the available size.
     * @param {number} availWidth - The available width.
     * @param {number} availHeight - The available height.
     */
    adaptToSize(availWidth, availHeight) {
      this._fixedHItemSize = this._hItemSize;
      this._fixedVItemSize = this._vItemSize;
      this._updateSpacingForSize(availWidth, availHeight);

      let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
      this._nonIconWidth = Math.max(0, this._hItemSize - scaleFactor * ICON_SIZE);
      this._nonIconHeight = Math.max(0, this._vItemSize - scaleFactor * ICON_SIZE);

      if (this.columnsForWidth(availWidth) < this._minColumns || this.rowsForHeight(availHeight) < this._minRows) {
        let neededWidth = this.usedWidthForNColumns(this._minColumns) - availWidth;
        let neededHeight = this.usedHeightForNRows(this._minRows) - availHeight;

        let neededSpacePerItem =
          neededWidth > neededHeight
            ? Math.ceil(neededWidth / this._minColumns)
            : Math.ceil(neededHeight / this._minRows);
        this._fixedHItemSize = Math.max(
          this._hItemSize - neededSpacePerItem,
          this._nonIconWidth + scaleFactor * MIN_ICON_SIZE
        );
        this._fixedVItemSize = Math.max(
          this._vItemSize - neededSpacePerItem,
          this._nonIconHeight + scaleFactor * MIN_ICON_SIZE
        );

        this._updateSpacingForSize(availWidth, availHeight);
      }
      if (!this._updateIconSizesLaterId) {
        this._updateIconSizesLaterId = Meta.later_add(Meta.LaterType.BEFORE_REDRAW, this._updateIconSizes.bind(this));
      }
    }

    /**
     * Updates the icon sizes.
     * @returns {boolean} GLib.SOURCE_REMOVE.
     * @private
     */
    _updateIconSizes() {
      this._updateIconSizesLaterId = 0;
      let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
      let newIconSize =
        Math.min(this._fixedHItemSize - this._nonIconWidth, this._fixedVItemSize - this._nonIconHeight) / scaleFactor;
      for (let i in this._items) this._items[i].icon.setIconSize(newIconSize);

      return GLib.SOURCE_REMOVE;
    }

    /**
     * Navigates focus within the grid and may wrap-around.
     * @param {St.Actor|null} current - The currently focused actor.
     * @param {St.DirectionType} direction - The navigation direction.
     * @param {boolean} wrap - Whether to wrap around.
     * @returns {boolean} True if focus changed.
     */
    navigate_focus(current, direction, wrap = true) {
      let children = this._getVisibleChildren();
      if (!children || children.length === 0)
        return false;
      let idx = children.indexOf(current);
      // If current not found then focus the first child.
      if (idx < 0) {
        children[0].grab_key_focus();
        return true;
      }
      let n = children.length;
      let allocation = this.allocation;
      let gridWidth = allocation.x2 - allocation.x1;
      let layout = this._computeLayout(gridWidth);
      let nColumns = layout[0] || 1;
      let newIndex = idx;
      
      if (direction === St.DirectionType.LEFT) {
        newIndex = idx - 1;
        if (newIndex < 0)
          newIndex = wrap ? n - 1 : 0;
      } else if (direction === St.DirectionType.RIGHT) {
        newIndex = idx + 1;
        if (newIndex >= n)
          newIndex = wrap ? 0 : n - 1;
      } else if (direction === St.DirectionType.UP) {
        newIndex = idx - nColumns;
        if (newIndex < 0) {
          // Wrap to the bottom row in the same column if possible.
          newIndex = idx % nColumns;
          let lastRow = Math.floor((n - 1) / nColumns);
          newIndex += lastRow * nColumns;
          if (newIndex >= n)
            newIndex -= nColumns;
        }
      } else if (direction === St.DirectionType.DOWN) {
        newIndex = idx + nColumns;
        if (newIndex >= n) {
          // Wrap to the top row in the same column.
          newIndex = idx % nColumns;
        }
      } else {
        return false;
      }
      let newChild = children[newIndex];
      if (newChild) {
        newChild.grab_key_focus();
        return true;
      }
      return false;
    }
  }
);
