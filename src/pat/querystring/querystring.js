import $ from "jquery";
import _ from "underscore";
import _t from "../../core/i18n-wrapper";
import utils from "../../core/utils";
import Base from "@patternslib/patternslib/src/core/base";
import { Pattern as ContentbrowserPattern } from "../contentbrowser/contentbrowser";

var Criteria = function () {
    this.init.apply(this, arguments);
};
Criteria.prototype = {
    defaults: {
        indexWidth: "20em",
        remove: "",
        classBetweenDtName: "querystring-criteria-betweendt",
        classWrapperName: "querystring-criteria-wrapper",
        classIndexName: "querystring-criteria-index",
        classOperatorName: "querystring-criteria-operator",
        classValueName: "querystring-criteria-value",
        classRemoveName: "querystring-criteria-remove",
        classResultsName: "querystring-criteria-results",
        classClearName: "querystring-criteria-clear",
        classDepthName: "querystring-criteria-depth",
    },
    init: function (
        $el,
        app,
        options,
        indexes,
        index,
        operator,
        value,
        baseUrl,
        patternDateOptions,
        patternAjaxSelectOptions,
        patternRelateditemsOptions
    ) {
        var self = this;
        self.app = app;

        self.options = {
            ...self.defaults,
            ...options,
        };
        self.indexes = indexes;
        self.indexGroups = {};
        self.baseUrl = baseUrl;
        self.advanced = false;
        self.initial = value;
        // create wrapper criteria and append it to DOM
        self.$wrapper = $("<div/>")
            .addClass(self.options.classWrapperName)
            .appendTo($el);

        // Sub widgets options
        self.patternDateOptions = patternDateOptions || {};
        self.patternAjaxSelectOptions = patternAjaxSelectOptions || {};
        self.patternRelateditemsOptions = patternRelateditemsOptions || {};
        // Defaults
        self.patternAjaxSelectOptions = {
            width: "250px",
            ...self.patternAjaxSelectOptions,
        };
        self.patternRelateditemsOptions = {
            vocabularyUrl:
                self.baseUrl +
                "@@getVocabulary?name=plone.app.vocabularies.Catalog&field=relatedItems",
            width: "20rem",
            ...self.patternRelateditemsOptions,
        };
        // Force set
        self.patternRelateditemsOptions["maximumSelectionSize"] = 1;

        // Remove button
        self.$remove = $("<div>" + self.options.remove + "</div>")
            .addClass(self.options.classRemoveName)
            .appendTo(self.$wrapper)
            .on("click", function (e) {
                e.stopPropagation();
                self.remove();
            });

        // Index selection
        self.$index = $("<select><option></option></select>").attr(
            "placeholder",
            _t("Select criteria")
        );

        // list of indexes
        for (const value in self.indexes) {
            let options = self.indexes[value];
            if (options.enabled) {
                if (!self.indexGroups[options.group]) {
                    self.indexGroups[options.group] = $("<optgroup/>")
                        .attr("label", options.group)
                        .appendTo(self.$index);
                }
                self.indexGroups[options.group].append(
                    $("<option/>").attr("value", value).html(options.title)
                );
            }
        }

        // attach index select to DOM
        self.$wrapper.append(
            $("<div/>").addClass(self.options.classIndexName).append(self.$index)
        );

        // add blink (select2)
        self.$index.patternSelect2({
            width: self.options.indexWidth,
            placeholder: _t("Select criteria"),
        });
        self.$index.on("change", function (e) {
            self.removeValue();
            self.createOperator(e.val);
            self.createClear();
            self.trigger("index-changed");
        });

        if (typeof index !== "undefined") {
            self.$index.val(index);
            self.createOperator(index, operator, value);
            self.createClear();
        }

        self.trigger("create-criteria");
    },
    appendOperators: function (index) {
        var self = this;

        self.$operator = $("<select/>");

        if (self.indexes[index]) {
            _.each(self.indexes[index].operations, function (value) {
                var options = self.indexes[index].operators[value];
                $("<option/>")
                    .attr("value", value)
                    .html(options.title)
                    .appendTo(self.$operator);
            });
        }

        // attach operators select to DOM
        self.$wrapper.append(
            $("<div/>").addClass(self.options.classOperatorName).append(self.$operator)
        );

        // add blink (select2)
        self.$operator.patternSelect2({ width: "10em" });
        self.$operator.on("change", function () {
            self.createValue(index);
            self.createClear();
            self.trigger("operator-changed");
        });
    },
    convertPathOperators: function (oval) {
        var self = this;

        if (self.advanced) {
            return oval;
        }
        //This allows us to use the same query operation for multiple dropdown options.
        oval = oval.replace("advanced", "relativePath").replace("path", "relativePath");
        return oval;
    },
    createPathOperators: function () {
        var self = this;

        if (self.advanced) {
            self.resetPathOperators();
            return;
        }
        var newOperator = "plone.app.querystring.operation.string.advanced";

        if (typeof self.indexes.path.operators[newOperator] === "undefined") {
            self.indexes.path.operations.push(newOperator);
            self.indexes.path.operators[newOperator] = {
                title: "Advanced",
                widget: "AdvancedPathWidget",
                description: "Enter a custom path string",
                operation: "plone.app.querystring.queryparser._relativePath",
            };
        }

        for (const key in self.indexes.path.operators) {
            var options = self.indexes.path.operators[key];
            if (key.indexOf("absolute") > 0) {
                options.title = "Custom";
            } else if (key.indexOf("relative") > 0) {
                options.title = "Parent (../)";
            } else if (key.indexOf("advanced") > 0) {
                options.title = "Advanced Mode";
            } else {
                options.title = "Current (./)";
                options.widget = "RelativePathWidget";
            }
        };
    },
    resetPathOperators: function () {
        var self = this;
        for (const key in self.indexes.path.operators) {
            var options = self.indexes.path.operators[key];
            if (key.indexOf("absolute") > 0) {
                options.title = "Absolute Path";
            } else if (key.indexOf("relative") > 0) {
                options.title = "Relative Path";
            } else if (key.indexOf("advanced") > 0) {
                options.title = "Simple Mode";
            } else {
                options.title = "Navigation Path";
                options.widget = "ReferenceWidget";
            }
        };

        return;
    },
    createOperator: function (index, operator, value) {
        var self = this;

        self.removeOperator();
        self.createPathOperators();

        // We must test if we have a "simple" path or an "advanced" one and change the widgets accordingly
        if (
            index === "path" &&
            value &&
            value !== ".::1" &&
            value !== "..::1" &&
            !value.match(/^[0-9a-f\-]{32,36}::-?[0-9]+$/)
        ) {
            self.advanced = true;
            self.resetPathOperators();
        }

        self.appendOperators(index);

        if (typeof operator === "undefined") {
            operator = self.$operator.val();
        }

        self.$operator.val(operator);
        self.createValue(index, value);

        self.trigger("create-operator");
    },
    createValue: function (index, value) {
        var self = this,
            widget = self.indexes[index].operators[self.$operator.val()].widget,
            $wrapper = $("<div/>")
                .addClass(self.options.classValueName)
                .appendTo(self.$wrapper);

        self.removeValue();

        var createDepthSelect = function (selected) {
            // remove previous depth-select-box items
            $wrapper.remove(".depth-select-box");
            var select =
                "<div class='depth-select-box'>" +
                "<label for='depth-select'>Depth</label>" +
                "<select name='depth-select' class='" +
                self.options.classDepthName +
                "'>" +
                "<option value='-1' selected='selected'>Unlimited</option>";

            for (var i = 0; i <= 10; i += 1) {
                select += "<option value=" + i + " ";
                if ("" + i === selected) {
                    select += "selected='selected' ";
                }
                select += ">" + i + "</option>";
            }
            select += "</select>" + "</div>";

            return $(select).on("change", function () {
                self.trigger("depth-changed");
            });
        };

        if (widget === "StringWidget") {
            self.$value = $('<input type="text"/>')
                .addClass(self.options.classValueName + "-" + widget)
                .val(value)
                .appendTo($wrapper)
                .on("change", function () {
                    self.trigger("value-changed");
                });
        } else if (widget === "DateWidget") {
            self.$value = $('<input type="date"/>')
                .addClass(self.options.classValueName + "-" + widget)
                .val(value)
                .appendTo($wrapper)
                .on("change", function () {
                    self.trigger("value-changed");
                });
        } else if (widget === "DateRangeWidget") {
            var startwrap = $("<span/>").appendTo($wrapper);
            var val1 = "";
            var val2 = "";

            if (value) {
                val1 = value[0] ? value[0] : "";
                val2 = value[1] ? value[1] : "";
            }

            var startdt = $('<input type="date"/>')
                .addClass(self.options.classValueName + "-" + widget)
                .addClass(self.options.classValueName + "-" + widget + "-start")
                .val(val1)
                .appendTo(startwrap)
                .on("change", function () {
                    self.trigger("value-changed");
                });
            $wrapper.append(
                $("<span/>").html(_t("to")).addClass(self.options.classBetweenDtName)
            );
            var endwrap = $("<span/>").appendTo($wrapper);
            var enddt = $('<input type="date"/>')
                .addClass(self.options.classValueName + "-" + widget)
                .addClass(self.options.classValueName + "-" + widget + "-end")
                .val(val2)
                .appendTo(endwrap)
                .on("change", function () {
                    self.trigger("value-changed");
                });
            self.$value = [startdt, enddt];
        } else if (widget === "RelativeDateWidget") {
            self.$value = $('<input type="text"/>')
                .after($("<span/>").html(_t("days")))
                .addClass(self.options.classValueName + "-" + widget)
                .val(value)
                .appendTo($wrapper)
                .on("change", function () {
                    self.trigger("value-changed");
                });
        } else if (widget === "AdvancedPathWidget") {
            if (self.advanced) {
                self.advanced = false;
            } else {
                self.advanced = true;
            }
            self.createPathOperators();
            self.removeOperator();
            self.appendOperators(index);
            self.createValue(index);
        } else if (widget === "RelativePathWidget") {
            if (self.advanced) {
                self.$value = $('<input type="text"/>')
                    .addClass(self.options.classValueName + "-" + widget)
                    .appendTo($wrapper)
                    .val(value)
                    .on("change", function () {
                        self.trigger("value-changed");
                    });
            } else {
                var pathAndDepth = [".", "1"];
                if (typeof value !== "undefined" && value.indexOf("::") != -1) {
                    pathAndDepth = value.split("::");
                    if (pathAndDepth[0] === ".") {
                        self.$operator.val(
                            "plone.app.querystring.operation.string.path"
                        );
                    } else {
                        self.$operator.val(
                            "plone.app.querystring.operation.string.relativePath"
                        );
                    }
                } else if (
                    self.$operator.val() ===
                    "plone.app.querystring.operation.string.relativePath"
                ) {
                    pathAndDepth = ["..", "1"];
                }

                self.$value = $('<input type="hidden"/>')
                    .addClass(self.options.classValueName + "-" + widget)
                    .appendTo($wrapper)
                    .val(pathAndDepth[0]);
                self.$value.after(createDepthSelect(pathAndDepth[1]));
            }
        } else if (widget === "ReferenceWidget") {
            if (self.advanced) {
                self.$value = $('<input type="text"/>')
                    .addClass(self.options.classValueName + "-" + widget)
                    .val(value)
                    .appendTo($wrapper)
                    .on("change", function () {
                        self.trigger("value-changed");
                    });
            } else {
                pathAndDepth = ["", "-1"];
                if (typeof value !== "undefined") {
                    pathAndDepth = value.split("::");
                }
                self.$value = $('<input type="text"/>')
                    .addClass(self.options.classValueName + "-" + widget)
                    .appendTo($wrapper)
                    .val(pathAndDepth[0])
                const pat = new ContentbrowserPattern(self.$value[0], self.patternRelateditemsOptions);
                pat.el.addEventListener("change", () => {
                    self.trigger("value-changed");
                })
                self.$value.after(createDepthSelect(pathAndDepth[1]));
            }
        } else if (widget === "MultipleSelectionWidget") {
            self.$value = $("<select/>")
                .prop("multiple", true)
                .addClass(self.options.classValueName + "-" + widget)
                .appendTo($wrapper)
                .on("change", function () {
                    self.trigger("value-changed");
                });
            if (self.indexes[index]) {
                for (const value in self.indexes[index].values) {
                    const options = self.indexes[index].values[value];
                    $("<option/>")
                        .attr("value", value)
                        .html(options.title)
                        .appendTo(self.$value);
                };
            }
            self.$value.patternSelect2(self.patternAjaxSelectOptions);
        }

        if (typeof value !== "undefined" && typeof self.$value !== "undefined") {
            if (Array.isArray(self.$value)) {
                $.each(value, function (i, v) {
                    self.$value[i].val(v);
                });
            } else {
                var trimmedValue = value;
                if (typeof value === "string" && widget !== "RelativePathWidget") {
                    trimmedValue = value.replace(/::-?[0-9]+/, "");
                }
                self.$value.val(trimmedValue);
            }
        }

        self.trigger("create-value");
    },
    createClear: function () {
        var self = this;
        self.removeClear();
        self.$clear = $("<div/>")
            .addClass(self.options.classClearName)
            .appendTo(self.$wrapper);
    },
    remove: function () {
        var self = this;
        self.trigger("remove");
        self.$remove.remove();
        self.$index.parent().remove();
        self.removeOperator();
        self.removeValue();
        self.removeClear();
        self.$wrapper.remove();
    },
    removeClear: function () {
        var self = this;
        self.trigger("remove-clear");
        if (self.$clear) {
            self.$clear.remove();
        }
    },
    removeOperator: function () {
        var self = this;
        self.trigger("remove-operator");
        if (self.$operator) {
            self.$operator.parent().remove();
        }
    },
    removeValue: function () {
        var self = this;
        self.trigger("remove-value");
        if (self.$value) {
            if (Array.isArray(self.$value)) {
                // date ranges have 2 values
                self.$value[0].parents(".querystring-criteria-value").remove();
            } else {
                self.$value.parents(".querystring-criteria-value").remove();
            }
        }
    },
    // builds the parameters to go into the http querystring for requesting
    // results from the query builder
    buildQueryPart: function () {
        var self = this;

        // index
        var ival = self.$index.val();
        if (ival === "") {
            // no index selected, no query
            return "";
        }
        var istr = "query.i:records=" + ival;

        // operator
        if (typeof self.$operator === "undefined") {
            // no operator, no query
            return "";
        }
        var oval = self.$operator.val();

        if (ival === "path") {
            if (oval.indexOf("advanced") > 0) {
                return "";
            }
            oval = self.convertPathOperators(oval);
        }

        var ostr = "query.o:records=" + oval;

        // value(s)
        var vstrbase = "query.v:records=",
            vstrlistbase = "query.v:records:list=",
            vstr = [];
        if (typeof self.$value === "undefined") {
            vstr.push(vstrbase);
        } else if (Array.isArray(self.$value)) {
            // handles only datepickers from the 'between' operator right now
            $.each(self.$value, function () {
                vstr.push(vstrlistbase + $(this).val());
            });
        } else if (Array.isArray(self.$value.val())) {
            // handles multible values
            $.each(self.$value.val(), function (i, v) {
                vstr.push(vstrlistbase + v);
            });
        } else {
            var str = vstrbase + self.$value.val();
            if (ival === "path" && self.$value.val() !== "") {
                str += self.getDepthString();
            } else if (typeof self.initial !== "undefined") {
                str = vstrbase + self.initial;
                //Sometimes the RelatedItemsWidget won't be loaded by this point.
                //This only should happen on the initial page load.
                delete self.initial;
            }
            vstr.push(str);
        }

        return istr + "&" + ostr + "&" + vstr.join("&");
    },
    getJSONListStr: function () {
        var self = this;

        // index
        var ival = self.$index.val();
        if (ival === "") {
            // no index selected, no query
            return "";
        }

        // operator
        if (typeof self.$operator === "undefined") {
            // no operator, no query
            return "";
        }
        var oval = self.$operator.val();

        if (ival === "path") {
            if (oval.indexOf("advanced") > 0) {
                //The advanced function is just a placeholder,
                //We don't want to send an actual query
                return "";
            }
            oval = self.convertPathOperators(oval);
        }
        // value(s)
        var varr = [];
        if (Array.isArray(self.$value)) {
            // handles only datepickers from the 'between' operator right now
            $.each(self.$value, function () {
                varr.push($(this).val());
            });
        } else if (typeof self.$value !== "undefined") {
            var value = self.$value.val();
            if (ival === "path" && value) {
                var depth = self.getDepthString();
                if (depth) {
                    value += depth;
                }
            }
            varr.push(value);
        }
        var vval;
        if (varr.length > 1) {
            vval = '["' + varr.join('","') + '"]';
        } else if (varr.length === 1) {
            vval = JSON.stringify(varr[0]);
        } else {
            vval = '""';
        }

        if (typeof self.indexes[ival].operators[oval] === "undefined") {
            return;
        }

        return '{"i":"' + ival + '", "o":"' + oval + '", "v":' + vval + "}";
    },
    getDepthString: function () {
        var self = this,
            out = "",
            depth = $("." + self.options.classDepthName).val();

        if (depth !== "" && typeof depth !== "undefined") {
            out += "::" + depth;
        }
        return out;
    },
    trigger: function (name) {
        this.$wrapper.trigger(name + "-criteria.querystring.patterns", [this]);
    },
    on: function (name, callback) {
        this.$wrapper.on(name + "-criteria.querystring.patterns", callback);
    },
};

export default Base.extend({
    name: "querystring",
    trigger: ".pat-querystring",
    parser: "mockup",
    defaults: {
        indexes: [],
        classWrapperName: "querystring-wrapper",
        criteria: {},
        indexOptionsUrl: null,
        previewURL: "portal_factory/@@querybuilder_html_results", // base url to use to request preview information from
        previewCountURL: "portal_factory/@@querybuildernumberofresults",
        patternDateOptions: {},
        patternAjaxSelectOptions: {},
        patternRelateditemsOptions: {},
        classSortLabelName: "querystring-sort-label",
        classSortReverseName: "querystring-sortreverse",
        classSortReverseLabelName: "querystring-sortreverse-label",
        classPreviewCountWrapperName: "querystring-previewcount-wrapper",
        classPreviewResultsWrapperName: "querystring-previewresults-wrapper",
        classPreviewWrapperName: "querystring-preview-wrapper",
        classPreviewName: "querystring-preview",
        classPreviewTitleName: "querystring-preview-title",
        classPreviewDescriptionName: "querystring-preview-description",
        classSortWrapperName: "querystring-sort-wrapper",
        showPreviews: true,
    },
    init: async function () {
        await import("../select2/select2");

        import("./querystring.scss");

        var self = this;

        // hide input element
        self.$el.hide();

        // create wrapper for out criteria
        self.$wrapper = $("<div/>");
        self.$el.after(self.$wrapper);

        // initialization can be detailed if by ajax
        self.initialized = false;

        // get remove icon for criterias
        self.options.criteria.remove = await utils.resolveIcon("x-circle");

        if (self.options.indexOptionsUrl) {
            try {
                const response = await fetch(self.options.indexOptionsUrl);
                const data = await response.json();
                self.options.indexes = data.indexes;
                self.options["sortable_indexes"] = data["sortable_indexes"];
                self._init();
            } catch {
                // XXX handle this...
            }
        }
    },
    _init: function () {
        var self = this;
        self.$criteriaWrapper = $("<div/>")
            .addClass(self.options.classWrapperName)
            .appendTo(self.$wrapper);

        self.$sortWrapper = $("<div/>")
            .addClass(self.options.classSortWrapperName)
            .appendTo(self.$wrapper);

        if (self.options.showPreviews === "false") {
            self.options.showPreviews = false;
        }
        if (self.options.showPreviews) {
            self.$previewWrapper = $("<div/>")
                .addClass(self.options.classPreviewWrapperName)
                .appendTo(self.$wrapper);

            // preview title and description
            $("<div/>")
                .addClass(self.options.classPreviewTitleName)
                .html(_t("Preview"))
                .appendTo(self.$previewWrapper);
            $("<div/>")
                .addClass(self.options.classPreviewDescriptionName)
                .html(_t("Preview of at most 10 items"))
                .appendTo(self.$previewWrapper);
        }

        self.criterias = [];

        // create populated criterias
        if (self.el.value) {
            for (const item of JSON.parse(self.el.value)) {
                self.createCriteria(item.i, item.o, item.v);
            }
        }

        // add empty criteria which enables users to create new cr
        self.createCriteria();

        // add sort/order fields
        self.createSort();

        // add criteria preview pane to see results from criteria query
        if (self.options.showPreviews) {
            self.refreshPreviewEvent();
        }
        self.$el.trigger("initialized");
        self.initialized = true;
    },
    createCriteria: function (index, operator, value) {
        var self = this,
            baseUrl = self.options.indexOptionsUrl.replace(/(@@.*)/g, ""),
            criteria = new Criteria(
                self.$criteriaWrapper,
                self,
                self.options.criteria,
                self.options.indexes,
                index,
                operator,
                value,
                baseUrl,
                self.options.patternDateOptions,
                self.options.patternAjaxSelectOptions,
                self.options.patternRelateditemsOptions
            );

        criteria.on("remove", function () {
            if (self.criterias[self.criterias.length - 1] === criteria) {
                self.createCriteria();
            }
        });

        criteria.on("index-changed", function () {
            if (self.criterias[self.criterias.length - 1] === criteria) {
                self.createCriteria();
            }
        });

        //This prevents multiple requests from going off after making a single change
        var _doupdates = function () {
            self.refreshPreviewEvent();
            self.updateValue();
        };
        var _updateTimeout = -1;
        var doupdates = function () {
            clearTimeout(_updateTimeout);
            _updateTimeout = setTimeout(_doupdates, 100);
        };

        criteria.on("remove", function (e, criteria) {
            if (self.criterias.indexOf(criteria) !== -1) {
                self.criterias.splice(self.criterias.indexOf(criteria), 1);
            }
            doupdates(e, criteria);
        });
        criteria.on("remove-clear", doupdates);
        criteria.on("remove-operator", doupdates);
        criteria.on("remove-value", doupdates);
        criteria.on("index-changed", doupdates);
        criteria.on("operator-changed", doupdates);
        criteria.on("create-criteria", doupdates);
        criteria.on("create-operator", doupdates);
        criteria.on("create-value", doupdates);
        criteria.on("value-changed", doupdates);
        criteria.on("depth-changed", doupdates);

        self.criterias.push(criteria);
    },
    createSort: function () {
        var self = this;

        // elements that may exist already on the page
        // XXX do this in a way so it'll work with other forms will work
        // as long as they provide sort_on and sort_reversed fields in z3c form
        var existingSortOn = $('[id$="-sort_on"]').filter('[id^="formfield-"]');
        var existingSortOrder = $('[id*="-sort_reversed"]').filter('[id^="formfield-"]');

        $("<span/>")
            .addClass(self.options.classSortLabelName)
            .html(_t("Sort on"))
            .appendTo(self.$sortWrapper);
        self.$sortOn = $("<select/>")
            .attr("name", "sort_on")
            .appendTo(self.$sortWrapper)
            .on("change", function () {
                self.refreshPreviewEvent();
                $('[id$="sort_on"]', existingSortOn).val($(this).val());
            });

        self.$sortOn.append($('<option value="">' + _t("No sorting") + "</option>")); // default no sorting
        for (var key in self.options["sortable_indexes"]) {
            self.$sortOn.append(
                $("<option/>").attr("value", key).html(self.options.indexes[key].title)
            );
        }
        self.$sortOn.patternSelect2({ width: "150px" });

        self.$sortOrder = $('<input type="checkbox" />')
            .attr("name", "sort_reversed:boolean")
            .on("change", function () {
                self.refreshPreviewEvent();
                if ($(this).prop("checked")) {
                    $('input[type="checkbox"]', existingSortOrder).prop("checked", true);
                } else {
                    $('input[type="checkbox"]', existingSortOrder).prop(
                        "checked",
                        false
                    );
                }
            });

        $("<span/>")
            .addClass(self.options.classSortReverseName)
            .appendTo(self.$sortWrapper)
            .append(self.$sortOrder)
            .append(
                $("<span/>")
                    .html(_t("Reversed Order"))
                    .addClass(self.options.classSortReverseLabelName)
            );

        // if the form already contains the sort fields, hide them! Their values
        // will be synced back and forth between the querystring's form elements
        if (existingSortOn.length >= 1 && existingSortOrder.length >= 1) {
            var reversed = $('input[type="checkbox"]', existingSortOrder).prop(
                "checked"
            );
            var sortOn = $('[id$="-sort_on"]', existingSortOn).val();
            if (reversed) {
                self.$sortOrder.prop("checked", true);
            }
            self.$sortOn.val(sortOn);
            $(existingSortOn).hide();
            $(existingSortOrder).hide();
        }
    },
    refreshPreviewEvent: function () {
        var self = this;

        if (!self.options.showPreviews) {
            return; // cut out of this if there are no previews available
        }

        if (typeof self._previewXhr !== "undefined") {
            self._previewXhr.abort();
        }

        if (typeof self.$previewPane !== "undefined") {
            self.$previewPane.remove();
        }

        var query = [];
        for (const criteria of self.criterias) {
            var querypart = criteria.buildQueryPart();
            if (querypart !== "") {
                query.push(querypart);
            }
        };

        self.$previewPane = $("<div/>")
            .addClass(self.options.classPreviewName)
            .appendTo(self.$previewWrapper);

        if (query.length <= 0) {
            $("<div/>")
                .addClass(self.options.classPreviewCountWrapperName)
                .html("No results to preview")
                .prependTo(self.$previewPane);
            return; // no query means nothing to send out requests for
        }

        query.push("sort_on=" + self.$sortOn.val());
        if (self.$sortOrder.prop("checked")) {
            query.push("sort_order=reverse");
        }

        self._previewXhr = $.ajax({
            url: self.options.previewURL + "?" + query.join("&"),
            success: (data) => {
                $("<div/>")
                    .addClass(self.options.classPreviewResultsWrapperName)
                    .html(utils.parseBodyTag(data))
                    .appendTo(self.$previewPane);
            },
        });
    },
    updateValue: function () {
        // updating the original input with json data in the form:
        // [
        //    {i:'index', o:'operator', v:'value'}
        // ]

        var self = this;

        var criteriastrs = [];
        for (const criteria of self.criterias) {
            var jsonstr = criteria.getJSONListStr();
            if (jsonstr !== "") {
                criteriastrs.push(jsonstr);
            }
        }
        var val = "[" + criteriastrs.join(",") + "]";
        self.$el.val(val);
        self.$el.trigger("change");
    },
});
