/**
 * KeyEvents module.
 * Implements handling of stage key press events.
 * 
 * @module KeyEvents
 */

const { Clutter, St } = imports.gi;

var KeyEvents = {
    /**
     * Handles key press events emitted on the stage and emits
     * corresponding custom signals ("back", "movement", "select") on the given screen.
     * 
     * @param {St.Widget} screen - The target screen widget.
     * @param {Clutter.Event} event - The key press event.
     * @returns {number} Clutter event propagation flag.
     */
    handleStageKeyPress(screen, event) {
        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Escape) {
            screen.emit('back', event);
            return Clutter.EVENT_STOP;
        }
        if ([Clutter.KEY_Up, Clutter.KEY_Down, Clutter.KEY_Left, Clutter.KEY_Right].includes(symbol)) {
            switch(symbol) {
                case Clutter.KEY_Up:
                    event.movementDirection = St.DirectionType.UP;
                    break;
                case Clutter.KEY_Down:
                    event.movementDirection = St.DirectionType.DOWN;
                    break;
                case Clutter.KEY_Left:
                    event.movementDirection = St.DirectionType.LEFT;
                    break;
                case Clutter.KEY_Right:
                    event.movementDirection = St.DirectionType.RIGHT;
                    break;
            }
            screen.emit('movement', event);
            return Clutter.EVENT_PROPAGATE;
        }
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
            screen.emit('select', event);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    },

    handlePointerEnter(actor, event) {
        actor.add_style_pseudo_class('hover');
        actor.grab_key_focus();
        return Clutter.EVENT_PROPAGATE;
    },

    handlePointerLeave(actor, event) {
        actor.remove_style_pseudo_class('hover');
        return Clutter.EVENT_PROPAGATE;
    },

    handlePointerClick(actor, event) {
        if (actor.activate && typeof actor.activate === 'function') {
            actor.activate(event);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
};

this.KeyEvents = KeyEvents;
