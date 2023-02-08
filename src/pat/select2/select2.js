import $ from "jquery";
import Base from "@patternslib/patternslib/src/core/base";
import I18n from "../../core/i18n";
import utils from "../../core/utils";

export default Base.extend({
    name: "select2",
    trigger: ".pat-select2",
    parser: "mockup",
    defaults: {
        separator: ",",
    },
    initializeValues: function () {
        var self = this;
        // Init Selection ---------------------------------------------
        if (self.options.initialValues) {
            self.options.id = function (term) {
                return term.id;
            };
            self.options.initSelection = function ($el, callback) {
                var data = [],
                    value = $el.val(),
                    seldefaults = self.options.initialValues;

                // Create the initSelection value that contains the default selection,
                // but in a javascript object
                if (
                    typeof self.options.initialValues === "string" &&
                    self.options.initialValues !== ""
                ) {
                    // if default selection value starts with a '{', then treat the value as
                    // a JSON object that needs to be parsed
                    if (self.options.initialValues[0] === "{") {
                        seldefaults = JSON.parse(self.options.initialValues);
                    }
                    // otherwise, treat the value as a list, separated by the defaults.separator value of
                    // strings in the format "id:text", and convert it to an object
                    else {
                        seldefaults = {};
                        $(self.options.initialValues.split(self.options.separator)).each(
                            function () {
                                var selection = this.split(":");
                                var id = $.trim(selection[0]);
                                var text = $.trim(selection[1]);
                                seldefaults[id] = text;
                            }
                        );
                    }
                }

                $(value.split(self.options.separator)).each(function () {
                    var text = this;
                    if (seldefaults[this]) {
                        text = seldefaults[this];
                    }
                    data.push({
                        id: utils.removeHTML(this),
                        text: utils.removeHTML(text),
                    });
                });
                callback(data);
            };
        }
    },
    initializeTags: function () {
        var self = this;
        if (self.options.tags && typeof self.options.tags === "string") {
            if (self.options.tags.substr(0, 1) === "[") {
                self.options.tags = JSON.parse(self.options.tags);
            } else {
                self.options.tags = self.options.tags.split(self.options.separator);
            }
        }

        if (self.options.tags && !self.options.allowNewItems) {
            self.options.data = $.map(self.options.tags, function (value, i) {
                return { id: value, text: value };
            });
            self.options.multiple = true;
            delete self.options.tags;
        }
    },
    initializeOrdering: async function () {
        if (!this.options.orderable) {
            return;
        }
        const Sortable = (await import("sortablejs")).default;
        const _initializeOrdering = () => {
            const sortable_el = this.$select2[0].querySelector(".select2-choices");
            new Sortable(sortable_el, {
                draggable: "li",
                dragClass: "select2-choice-dragging",
                chosenClass: "dragging",
                onStart: () => this.$select2_el.select2("onSortStart"),
                onEnd: () => this.$select2_el.select2("onSortEnd"),
            });
        };
        this.$select2_el.on("change", _initializeOrdering.bind(this));
        _initializeOrdering();
    },
    initializeSelect2: async function () {
        import("select2/select2.css");
        import("./select2.scss");
        await import("select2");
        try {
            // Don't load "en" which is the default where no separate language file exists.
            if (this.options.language && this.options.language !== "en") {
                await import(`select2/select2_locale_${this.options.language}`);
            }
        } catch {
            console.warn("Language file could not be loaded", this.options.language);
        }

        var self = this;
        self.options.formatResultCssClass = function (ob) {
            if (ob.id) {
                return (
                    "select2-option-" +
                    ob.id.toLowerCase().replace(/[ \:\)\(\[\]\{\}\_\+\=\&\*\%\#]/g, "-")
                );
            }
        };

        function callback(action, e) {
            if (action) {
                if (self.options.debug) {
                    console.debug("callback", action, e);
                }
                if (typeof action === "string") {
                    action = window[action];
                }
                return action(e);
            } else {
                return action;
            }
        }

        this.$select2_el.select2(self.options);
        this.$select2_el.on("select2-selected", function (e) {
            callback(self.options.onSelected, e);
        });
        this.$select2_el.on("select2-selecting", function (e) {
            callback(self.options.onSelecting, e);
        });
        this.$select2_el.on("select2-deselecting", function (e) {
            callback(self.options.onDeselecting, e);
        });
        this.$select2_el.on("select2-deselected", function (e) {
            callback(self.options.onDeselected, e);
        });
        this.$select2 = this.$select2_el.parent().find(".select2-container");
        this.$select2_el.parent().off("close.plone-modal.patterns");
        if (self.options.orderable) {
            self.$select2.addClass("select2-orderable");
        }
    },
    opened: function () {
        var isOpen = $(".select2-dropdown-open", this.$select2_el.parent()).length === 1;
        return isOpen;
    },
    init: async function () {
        var self = this;
        this.$select2_el = this.$el;
        var i18n = new I18n();
        self.options.language = i18n.currentLanguage;
        self.options.allowNewItems = self.options.hasOwnProperty("allowNewItems")
            ? JSON.parse(self.options.allowNewItems)
            : true;

        if (this.el.hasAttribute("multiple")) {
            self.options.multiple = true;
        }

        if (self.options.ajax || self.options.vocabularyUrl) {
            if (self.options.vocabularyUrl) {
                self.options.multiple =
                    self.options.multiple === undefined ? true : self.options.multiple;
                self.options.ajax = self.options.ajax || {};
                self.options.ajax.url = self.options.vocabularyUrl;
                // XXX removing the following function does'nt break tests. dead code?
                self.options.initSelection = function ($el, callback) {
                    var data = [],
                        value = $el.val();
                    $(value.split(self.options.separator)).each(function () {
                        var val = utils.removeHTML(this);
                        data.push({ id: val, text: val });
                    });
                    callback(data);
                };
            }

            var queryTerm = "";
            self.options.ajax = $.extend(
                {
                    quietMillis: 300,
                    data: function (term, page) {
                        queryTerm = term;
                        return {
                            query: term,
                            page_limit: 10,
                            page: page,
                        };
                    },
                    results: function (data, page) {
                        var results = data.results;
                        if (self.options.vocabularyUrl) {
                            var dataIds = [];
                            $.each(data.results, function (i, item) {
                                dataIds.push(item.id);
                            });
                            results = [];

                            var haveResult =
                                queryTerm === "" || $.inArray(queryTerm, dataIds) >= 0;
                            if (self.options.allowNewItems && !haveResult) {
                                queryTerm = utils.removeHTML(queryTerm);
                                results.push({
                                    id: queryTerm,
                                    text: queryTerm,
                                });
                            }

                            $.each(data.results, function (i, item) {
                                results.push(item);
                            });
                        }
                        return { results: results };
                    },
                },
                self.options.ajax
            );
        } else if (self.options.multiple && self.$el.is("select")) {
            // Multiselects need to be converted to input[type=hidden]
            // for Select2
            var vals = self.$el.val() || [];
            var options = $.map(self.$el.find("option"), function (o) {
                return { text: $(o).html(), id: o.value };
            });
            this.$select2_el = $('<input type="hidden" />');
            this.$select2_el.val(vals.join(self.options.separator));
            this.$select2_el.attr("class", self.$el.attr("class"));
            this.$select2_el.attr("name", self.$el.attr("name"));
            this.$select2_el.attr("id", self.$el.attr("id"));
            this.el.after(this.$select2_el[0]);
            this.el.remove();
            self.options.data = options;
        }
        self.initializeValues();
        self.initializeTags();
        await self.initializeSelect2();
        await self.initializeOrdering();
    },
});
