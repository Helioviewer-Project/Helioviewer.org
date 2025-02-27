/**
 * @fileOverview Contains the class definition for an TimeControls class.
 * @author <a href="mailto:jeff.stys@nasa.gov">Jeff Stys</a>
 * @author <a href="mailto:keith.hughitt@nasa.gov">Keith Hughitt</a>
 * @see Time
 *
 * TODO: Use highlight or similar effect on date and time input fields themselves when
 * invalid data is specified.
 */
/*jslint browser: true, white: true, onevar: true, undef: true, nomen: false, eqeqeq: true, plusplus: true,
bitwise: true, regexp: true, strict: true, newcap: true, immed: true, maxlen: 120, sub: true */
/*global $, Helioviewer, window, Class */
"use strict";
var TimeControls = Class.extend(
    /** @lends TimeControls.prototype */
    {
    /**
     * Creates a new TimeControl component
     *
     * @constructs
     * @param {String} dateId          The id of the date form field associated with the Time.
     * @param {String} timeId          The id of the time form field associated with the Time.
     * @param {String} incrementSelect The id of the HTML element for selecting the time increment
     * @param {String} backBtn         The id of the time "Back" button
     * @param {String} forwardBtn      The id of the time "Forward" button
     */
    init : function (dateInput, timeInput, incrementSelect, backBtn, forwardBtn, dateTimestamp) {

        this._date = new Date(dateTimestamp);
        this._timeIncrement = Helioviewer.userSettings.get("state.timeStep");
        this._timer;

        this._dateInput       = $(dateInput);
        this._timeInput       = $(timeInput);
        this._backBtn         = $(backBtn);
        this._forwardBtn      = $(forwardBtn);
        this._incrementSelect = $(incrementSelect);

        this._addTimeIncrements();
        this._initDatePicker();
        this._updateInputFields();
        this._initEventHandlers();
    },

    /**
     * Returns the current observation date as a JavaScript Date object
     *
     * @returns int Unix timestamp representing the current observation date in UTC
     */
    getDate: function () {
        return new Date(this._date.getTime()); // return by value
    },

    /**
     * @description Returns a unix timestamp for the current observation time
     */
    getTimestamp: function () {
        return this._date.getTime();
    },

    /**
     * @description returns the contents of the date input field
     */
    getDateField: function () {
        return this._dateInput.val();
    },

    /**
     * Returns the contents of the time input field
     */
    getTimeField: function () {
        return this._timeInput.val();
    },

    /**
     * Returns the time increment currently displayed in Helioviewer.
     * @return {int} this._timeIncrement -- time increment in secons
     */
    getTimeIncrement: function () {
        return this._timeIncrement;
    },

    /**
     * Sets the observation date to that of the most recent available image for
     * the currently loaded layers
     *
     * @return void
     */
    goToPresent: function () {
        var dataType, callback, layers, date, mostRecent = new Date(0, 0, 0),
            self = this, letters=Array('a','b','c','d','e'),
            layerHierarchy = [];

        callback = function (dataSources) {

            // Get hierarchy of label:name for each layer accordion
            $.each( $("#TileLayerAccordion-Container .dynaccordion-section"),
                function (i, accordion) {
                    var idBase = $(accordion).attr('id'), label, name;

                    layerHierarchy[i] = [];
                    $.each( letters, function (j, letter) {
                        if ( $('#'+letters[j]+'-select-'+idBase).css('display') != 'none' ) {
                            label = $('#'+letters[j]+'-label-'+idBase).html()
                                    .slice(0,-1);
                            name  = $('#'+letters[j]+'-select-'+idBase
                                         +' option:selected').val();

                            layerHierarchy[i][j] = { 'label':label,
                                                     'name' :name }
                        }
                    });
                }
            );

            if(layerHierarchy.length == 0){
                var savedLayers = Helioviewer.userSettings.get('state.tileLayers');
                $.each( savedLayers, function (i, layer) {
                    layerHierarchy.push(layer.uiLabels);
                });
            }

            // For each data tile-layer accordion, get the data source "end"
            // date (which is the date/time of the most current piece of data
            // for that source).  Keep the overall most current "end" date.
            $.each( layerHierarchy, function (i, hierarchy) {
                var leaf = dataSources;
                $.each( hierarchy, function (j, property) {
                    leaf = leaf[property['name']];
                });

                if(leaf['end'] == null){
                    leaf['end'] = new Date().toUTCString();
                }

                date = Date.parseUTCDate(leaf['end']);
                if (date > mostRecent) {
                    mostRecent = date;
                }
            });

            // Set the date/time of the Viewport
            self.setDate(mostRecent);
        };
        $.get(Helioviewer.api, {action: "getDataSources"}, callback, Helioviewer.dataType);
    },

    /**
     * Sets the desired viewing date and time.
     *
     * @param {Date} date A JavaScript Date object with the new time to use
     */
    setDate: function (date, updateTimeline) {
        this._date = date;
        this._onDateChange(updateTimeline);
    },

    /**
     * Enables automatic updating of observation time every five minutes
     */
    enableAutoRefresh: function () {
        this._timer = setInterval($.proxy(this.goToPresent, this), 300000);
    },

    /**
     * Enables automatic updating of observation time every five minutes
     */
    disableAutoRefresh: function () {
        clearInterval(this._timer);
    },

   /**
    * Moves back one time incremement
    */
    timePrevious: function () {
        this._addSeconds(-this._timeIncrement);
    },

    /**
     * Moves forward one time increment
     */
    timeNext: function () {
        this._addSeconds(this._timeIncrement);
    },

    /**
     * Gets an ISO 8601 string representation of the current observation time
     */
    toISOString: function () {
        return this._date.toISOString();
    },

    /**
     * @descriptional Initialize date and Time-related events
     */
    _initEventHandlers: function () {
        this._backBtn.bind('click', $.proxy(this.timePrevious, this));
        this._forwardBtn.bind('click', $.proxy(this.timeNext, this));
        $("#timeNowBtn").click($.proxy(this.goToPresent, this));

        $(document).bind('timestep-backward', $.proxy(this.timePrevious, this))
                   .bind('timestep-forward',  $.proxy(this.timeNext, this));
    },

    /**
     * Adds or subtracts a number of seconds to the current date
     * @param {int} seconds The number of seconds to adjust the date by
     */
    _addSeconds: function (seconds) {
        this._date = new Date(this._date.getTime() + seconds*1000);
        this._onDateChange();
    },

    /**
     * @description Populates the time increment select item
     */
    _addTimeIncrements: function () {
        var timeSteps, select, opt;

        timeSteps = [
            {numSecs: 1,        txt: "1&nbsp;Sec"},
            {numSecs: 60,       txt: "1&nbsp;Min"},
            {numSecs: 300,      txt: "5&nbsp;Mins"},
            {numSecs: 900,      txt: "15&nbsp;Mins"},
            {numSecs: 3600,     txt: "1&nbsp;Hour"},
            {numSecs: 21600,    txt: "6&nbsp;Hours"},
            {numSecs: 43200,    txt: "12&nbsp;Hours"},
            {numSecs: 86400,    txt: "1&nbsp;Day"},
            {numSecs: 604800,   txt: "1&nbsp;Week"},
            {numSecs: 2356583,  txt: "Carrington&nbsp;rotation"},
            {numSecs: 2419200,  txt: "28&nbsp;Days"},
            {numSecs: 31556926, txt: "1&nbsp;Year"}
        ];

        // Add time-steps to the select menu
        select = this._incrementSelect;

        $(timeSteps).each(function (i, timestep) {
            opt = $("<option value='" + timestep.numSecs + "'>" + timestep.txt + "</option>");
            select.append(opt);
        });

        // Select default timestep and bind event listener
        select.bind('change', $.proxy(this._onTimeIncrementChange, this))
              .find("[value = " + this._timeIncrement + "]").attr("selected", "selected");
    },

    /**
     * Initializes the observation time datepicker
     */
    _initDatePicker: function () {
        let createCloseFunction = (element) => {
            return (event) => {
                if (event.key == "Enter") {
                    element._flatpickr.close();
                }
            }
        };

        // Compensate for a problem with flatpickr where if the user updates
        // the date manually, then all events fire (onYearChange, onMonthChange, onChange).
        // By using a very short timeout, we can fire our internal update event
        // only once, instead of 3 times. Note that updating the viewport is
        // a heavy operation since it triggers image loading, event loading, etc.
        let delayed_flatpickr_update = (flatpickr) => {
            clearTimeout(flatpickr.__delayed_trigger);
            flatpickr.__delayed_trigger = setTimeout(() => {this._onTextFieldChange();}, 50);
        }
        this._dateInput._flatpickr = this._dateInput.flatpickr({
            allowInput: true,
            dateFormat: 'Y/m/d',
            disableMobile: true,
            // onChange: $.proxy(this._onTextFieldChange, this),
            onClose: (a, b, flatpickr) => {
                this._onTextFieldChange();
            },
            onChange: (a, b, flatpickr) => {
                delayed_flatpickr_update(flatpickr);
            },
            onMonthChange: (a, b, flatpickr) => {
                a[0].setMonth(flatpickr.currentMonth);
                flatpickr.setDate(a[0]);
                delayed_flatpickr_update(flatpickr);
            },
            onYearChange: (a, b, flatpickr) => {
                a[0].setYear(flatpickr.currentYear);
                flatpickr.setDate(a[0]);
                delayed_flatpickr_update(flatpickr);
            }
        });

        this._dateInput.keydown(createCloseFunction(this._dateInput));

        //TimePicker
        this._timeInput._flatpickr = this._timeInput.flatpickr({
            allowInput: true,
            noCalendar: true,
            enableTime: true,
            enableSeconds: true,
            time_24hr: true,
            minuteIncrement: 1,
            secondIncrement: 1,
            disableMobile: true,
            position: "above",
            onChange: $.proxy(this._onTextFieldChange, this),
            onClose: (a, b, flatpickr) => {
                this._onTextFieldChange();
            },
        });
        this._timeInput.keydown(createCloseFunction(this._timeInput));
    },

    /**
     * Updates form fields and lets other interested objects know about new time
     */
    _onDateChange: function (updateTimeline) {
        this._updateInputFields();
        Helioviewer.userSettings.set("state.date", this._date.getTime());
        $(document).trigger("observation-time-changed", [this._date]);
        if(typeof updateTimeline == 'undefined'){
            $(document).trigger("observation-time-changed-update-timeline", [this._date]);
        }
    },

    /**
     * Handles changes to date and time text fields
     */
    _onTextFieldChange: function () {
        if (this._validateDate() && this._validateTime()) {
            this.setDate(this._timeFieldsToDateObj());
        }
        // IE8: Prevent default button click from being triggered
        return false;
    },

   /**
    * @description Time-increment change event handler
    * @param {Event} e Prototype Event Object
    */
    _onTimeIncrementChange: function (e) {
        this._timeIncrement = parseInt(e.target.value, 10);
        Helioviewer.userSettings.set("state.timeStep", this._timeIncrement);
    },

    /**
     * Returns a JavaScript Date object with the user's local timezone offset factored out
     */
    _timeFieldsToDateObj: function () {
        return Date.parseUTCDate(this.getDateField() + " " + this.getTimeField());
    },

    /**
     * @description Updates the HTML form fields associated with the time manager.
     */
    _updateInputFields: function () {
        if (this._dateInput._flatpickr && this._dateInput._flatpickr.setDate) {
            this._dateInput._flatpickr.setDate(this._date.toUTCDateString());
            this._timeInput._flatpickr.setDate(this._date.toUTCTimeString());
        }
    },

    /**
     * Returns true if the date input field is a valid date and displays a warning message to
     * the user otherwise
     */
    _validateDate: function () {
        var dateString = this.getDateField();

        if (dateString.match(/^\d{4}\/\d{2}\/\d{2}?/) && (dateString.length === 10)) {
            return true;
        } else {
            $(document).trigger("message-console-warn", ["Invalid date. Please enter a date of the form YYYY/MM/DD."]);
            return false;
        }
    },

    /**
     * Returns true if the time input field is a valid date and displays a warning message to
     * the user otherwise
     */
    _validateTime: function () {
        var timeString = this.getTimeField();

        if (timeString.match(/^\d{2}:\d{2}:\d{2}?/) && (timeString.length === 8)) {
            return true;
        } else {
            $(document).trigger("message-console-warn", ["Invalid time. Please enter a time of the form HH:MM:SS."]);
            return false;
        }
    }
});
