// ========================================================================
// This file implements a custom view stack layout for the Mouseless extension.
// It provides a custom layout (ViewStackLayout) that emits allocated size changes.
// ========================================================================
/* exported ViewStackLayout */
const { Clutter, GObject } = imports.gi;

/**
 * A custom layout for view stacking.
 */
var ViewStackLayout = GObject.registerClass(
  {
    Signals: { 'allocated-size-changed': { param_types: [GObject.TYPE_INT, GObject.TYPE_INT] } }
  },
  class ViewStackLayout extends Clutter.BinLayout {
    /**
     * Allocates children and emits 'allocated-size-changed' with available width and height.
     * @param {Clutter.Actor} actor - The actor being allocated.
     * @param {Clutter.ActorBox} box - The available allocation box.
     * @param {number} flags - Allocation flags.
     */
    vfunc_allocate(actor, box, flags) {
      let availWidth = box.x2 - box.x1;
      let availHeight = box.y2 - box.y1;
      this.emit('allocated-size-changed', availWidth, availHeight);
      super.vfunc_allocate(actor, box);
    }
  }
);
