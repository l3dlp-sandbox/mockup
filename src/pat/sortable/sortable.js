import $ from "jquery";
import Base from "patternslib/src/core/base";
import Sortable from "sortablejs";

export default Base.extend({
    name: "sortable",
    trigger: ".pat-sortable",
    parser: "mockup",
    defaults: {
        selector: "li",
        dragClass: "item-dragging",
        cloneClass: "dragging",
        drop: undefined, // callback function or name of global function
    },
    init: function () {
        var sortable = new Sortable(this.$el[0], {
            draggable: this.options.selector,
            chosenClass: this.options.dragClass,
            dragClass: this.options.cloneClass,
            onEnd: function (e) {
                var cb = this.options.drop;
                if (!cb) {
                    return;
                }
                if (typeof cb === "string") {
                    cb = window[this.options.drop];
                }
                cb($(e.item), e.newIndex - e.oldIndex);
            }.bind(this),
        });
    },
});