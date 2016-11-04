/**
 * MovieManagerUI class definition
 * @author <a href="mailto:jeff.stys@nasa.gov">Jeff Stys</a>
 * @author <a href="mailto:keith.hughitt@nasa.gov">Keith Hughitt</a>
 */
/*jslint browser: true, white: true, onevar: true, undef: true, nomen: false,
eqeqeq: true, plusplus: true, bitwise: true, regexp: false, strict: true,
newcap: true, immed: true, maxlen: 80, sub: true */
/*global $, window, MovieManager, MediaManagerUI, Helioviewer, helioviewer,
  layerStringToLayerArray, humanReadableNumSeconds
 */
"use strict";
var MovieManagerUI = MediaManagerUI.extend(
    /** @lends MovieManagerUI */
    {
    /**
     * @constructs
     * Creates a new MovieManagerUI instance
     *
     * @param {MovieManager} model MovieManager instance
     */
    init: function (movieManager) {
        var movies = Helioviewer.userSettings.get('history.movies');
        this._manager = new MovieManager(movies);
        this._super("movie");
        this._settingsDialog   = $("#movie-settings-container");
        this._advancedSettings = $("#movie-settings-advanced");
        this._settingsHelp     = $("#movie-settings-help");
        this._settingsForm     = $("#movie-settings-form-container");
        this._settingsConsole  = $("#movie-settings-validation-console");
        this._movieScale = null;
        this._movieROI = null;
        this._movieLayers = null;
        this._movieEvents = null;
        this._movieEventsLabels = null;
        this._initEvents();
        this._initSettings();

        this.show();
    },

    /**
     * Plays the movie with the specified id if it is ready
     */
    playMovie: function (id) {
        var movie = this._manager.get(id);

        // If the movie is ready, open movie player
        if (movie.status === 2) {
            this._createMoviePlayerDialog(movie);
        } else {
            return;
        }
    },

    /**
     * Uses the layers passed in to send an Ajax request to api.php, to have it
     * build a movie. Upon completion, it displays a notification that lets the
     * user click to view it in a popup.
     */
    _buildMovieRequest: function (serializedFormParams) {
        var formParams, baseParams, params, frameRate;

        // Convert to an associative array for easier processing
        formParams = {};

        $.each(serializedFormParams, function (i, field) {
            formParams[field.name] = field.value;
        });

        this.building = true;

        if ( Helioviewer.userSettings.get("state.eventLayerVisible") === false ) {
            this._movieEvents = '';
            this._movieEventsLabels = false;
        }
		
		if(typeof formParams['startTime'] != 'undefined'){
	        var roi = helioviewer.getViewportRegionOfInterest();
	        var layers = helioviewer.getVisibleLayers(roi);
	        var events = helioviewer.getEvents();
	
	        // Make sure selection region and number of layers are acceptible
	        if (!this._validateRequest(roi, layers)) {
	            return;
	        }
	
	        // Store chosen ROI and layers
	        this._movieScale  = helioviewer.getImageScale();
	        this._movieROI    = this._toArcsecCoords(roi, this._movieScale);
	        this._movieLayers = layers;
	        this._movieEvents = events;
	        this._movieEventsLabels = helioviewer.getEventsLabels();
	    }    
		
        // Movie request parameters
        baseParams = {
            action       : "queueMovie",
            imageScale   : this._movieScale,
            layers       : this._movieLayers,
            events       : this._movieEvents,
            eventsLabels : this._movieEventsLabels,
            scale        : Helioviewer.userSettings.get("state.scale"),
            scaleType    : Helioviewer.userSettings.get("state.scaleType"),
            scaleX       : Helioviewer.userSettings.get("state.scaleX"),
            scaleY       : Helioviewer.userSettings.get("state.scaleY"),
            format       : this._manager.format
        };

        // Add ROI and start and end dates
        if(typeof formParams['startTime'] != 'undefined'){
	        var dates =  {
	            "startTime": formParams['startTime'],
	            "endTime"  : formParams['endTime']
	        };
	        params = $.extend(baseParams, this._movieROI, dates);
        }else{
	        params = $.extend(baseParams, this._movieROI, this._getMovieTimeWindow());
        }

        // (Optional) Frame-rate or movie-length
        if (formParams['speed-method'] === "framerate") {
            frameRate = parseInt(formParams['framerate'], 10);
            if (frameRate < 1 || frameRate > 30) {
                throw "Frame-rate must be between 1 and 30.";
            }
            baseParams['frameRate'] = formParams['framerate'];
        }
        else {
            if (formParams['movie-length'] < 5 ||
                formParams['movie-length'] > 100) {
                throw "Movie length must be between 5 and 100 seconds.";
            }
            baseParams['movieLength'] = formParams['movie-length'];
        }

        // Submit request
        this._queueMovie(params);

        this._advancedSettings.hide();
        this._settingsDialog.hide();

        this.show();

        this.building = false;
    },

    /**
     * Determines the start and end dates to use when requesting a movie
     */
    _getMovieTimeWindow: function () {
        var movieLength, currentTime, endTime, startTimeStr, endTimeStr,
            now, diff;

        movieLength = Helioviewer.userSettings.get("options.movies.duration");

        // Webkit doesn't like new Date("2010-07-27T12:00:00.000Z")
        currentTime = helioviewer.getDate();

        // We want shift start and end time if needed to ensure that entire
        // duration will be used. For now, we will assume that the most
        // recent data available is close to now() to make things simple
        
        endTime = new Date(helioviewer.getDate().getTime() + (movieLength / 2) * 1000);

        now = new Date();
        diff = endTime.getTime() - now.getTime();
        currentTime = new Date(currentTime.getTime() + Math.min(0, -diff));
		
		startTimeStr = new Date(currentTime.getTime() + (-movieLength / 2) * 1000);
		endTimeStr = new Date(currentTime.getTime() + (movieLength / 2) * 1000);
        // Start and end datetime strings
        return {
            "startTime": startTimeStr.toISOString(),
            "endTime"  : endTimeStr.toISOString()
        };
    },

    /**
     * Displays movie settings dialog
     */
    _showMovieSettings: function (roi) {
        if (typeof roi === "undefined") {
            roi = helioviewer.getViewportRegionOfInterest();
        }

        var layers = helioviewer.getVisibleLayers(roi);
        var events = helioviewer.getEvents();

        // Make sure selection region and number of layers are acceptible
        if (!this._validateRequest(roi, layers)) {
            return;
        }

        // Store chosen ROI and layers
        this._movieScale  = helioviewer.getImageScale();
        this._movieROI    = this._toArcsecCoords(roi, this._movieScale);
        this._movieLayers = layers;
        this._movieEvents = events;
        this._movieEventsLabels = helioviewer.getEventsLabels();

        this.hide();
        this._settingsConsole.hide();
        this._settingsDialog.show();
        this._advancedSettings.show();
    },

    /**
     * Queues a movie request
     */
    _queueMovie: function (params) {
        var callback, self = this;

        // AJAX Responder
        callback = function (response) {
            var msg, movie, waitTime;

            if ((response === null) || response.error) {
                // Queue full
                if (response.errno === 40) {
                    msg = response.error;
                } else {
                    // Other error
                    msg = "We are unable to create a movie for the time you " +
                        "requested. Please select a different time range " +
                        "and try again. ("+response.error+")";
                }
                $(document).trigger("message-console-info", msg);
                return;
            } else if (response.warning) {
                $(document).trigger("message-console-info", response.warning);
                return;
            }

            movie = self._manager.queue(
                response.id, response.eta, response.token,
                params.imageScale, params.layers, params.events,
                params.eventsLabels, params.scale, params.scaleType,
                params.scaleX, params.scaleY, new Date().toISOString(),
                params.startTime, params.endTime, params.x1, params.x2,
                params.y1, params.y2
            );
            self._addItem(movie);

            waitTime = humanReadableNumSeconds(response.eta);
            msg = "Your video is processing and will be available in " +
                  "approximately " + waitTime + ". You may view it at any " +
                  "time after it is ready by clicking the 'Movie' button";
            $(document).trigger("message-console-info", msg);
            self._refresh();
        };

        // Make request
        $.get(Helioviewer.api, params, callback, Helioviewer.dataType);
    },


    /**
     * Initializes MovieManager-related event handlers
     */
    _initEvents: function () {
        var timer, self = this;

        this._super();

        // ROI selection buttons
        this._fullViewportBtn.click(function () {
            self._showMovieSettings();
        });

        this._selectAreaBtn.click(function () {
            self._cleanupFunctions = [];

            if ( helioviewer.drawerLeftOpened ) {
                self._cleanupFunctions.push('helioviewer.drawerLeftClick()');
                helioviewer.drawerLeftClick();
            }
            self._cleanupFunctions.push('helioviewer.drawerMoviesClick()');
            helioviewer.drawerMoviesClick();

            $(document).trigger("enable-select-tool",
                                [$.proxy(self._showMovieSettings, self),
                                 $.proxy(self._cleanup, self)]);
        });

        // Setup hover and click handlers for movie history items
        $("#movie-history").on('click', '.history-entry', $.proxy(this._onMovieClick, this));
        $("#message-console").on('click', '.message-console-movie-ready', $.proxy(this._onMovieClick, this));
        $("#movie-history .history-entry").on('mouseover mouseout', $.proxy(this._onMovieHover, this));


        // Download completion notification link
        $(".message-console-movie-ready").on('click', function (event) {
            var movie = $(event.currentTarget).data('movie');
            self._createMoviePlayerDialog(movie);
        });

        // Update tooltip when movie is finished downloading
        $(document).bind("movie-ready", function (event, movie) {
            $("#" + self._type + "-" + movie.id).qtip("destroy");
            self._buildPreviewTooltip(movie);
            self._refresh();
        });

        // Upload form submission
        $("#youtube-video-info").submit(function () {
            self.submitVideoUploadForm();
            return false;
        });

        // Toggle advanced settings display
        $("#movie-settings-toggle-advanced").click(function () {
            // If help is visible, simply hide
            if (self._settingsHelp.is(":visible")) {
                self._settingsHelp.hide();
                self._settingsForm.show();
                return;
            }

            // Otherwise, toggle advanced settings visibility
            if (self._advancedSettings.is(":visible")) {
                self._advancedSettings.animate({"height": 0}, function () {
                    self._advancedSettings.hide();
                });
            } else {
                self._advancedSettings.css('height', 0).show();
                self._advancedSettings.animate({"height": 85}, function () {
                });
            }
        });

        // Toggle help display
        $("#movie-settings-toggle-help").click(function () {
            self._settingsForm.toggle();
            self._settingsHelp.toggle();
        });
    },

    /**
     * Initializes movie settings events
     */
    _initSettings: function () {
        var length, lengthInput, duration, durationSelect,
            frameRateInput, settingsForm, self = this;

        // Advanced movie settings
        frameRateInput = $("#frame-rate");
        lengthInput    = $("#movie-length");
        durationSelect = $("#movie-duration");

        // Speed method enable/disable
        $("#speed-method-f").change(function () {
            lengthInput.attr("disabled", true);
            frameRateInput.attr("disabled", false);
        }).attr("checked", "checked").change();

        $("#speed-method-l").change(function () {
            frameRateInput.attr("disabled", true);
            lengthInput.attr("disabled", false);
        });

        // Cancel button
        $("#movie-settings-cancel-btn").button().click(function (e) {
            self._advancedSettings.hide();
            self._settingsDialog.hide();
            self.show();
        });

        // Submit button
        settingsForm = $("#movie-settings-form");

        $("#movie-settings-submit-btn").button().click(function (e) {
            // Validate and submit movie request
            try {
                self._buildMovieRequest(settingsForm.serializeArray());
            } catch (ex) {
                // Display an error message if invalid values are specified
                // for movie settings
                self._settingsConsole.text(ex).fadeIn(1000, function () {
                    setTimeout(function () {
                        self._settingsConsole.text(ex).fadeOut(1000);
                    }, 10000);
                });
            }
            return false;
        });

        // Movie duration
        duration = Helioviewer.userSettings.get("options.movies.duration"),

        // Duration event listener
        durationSelect.bind('change', function (e) {
            Helioviewer.userSettings.set("options.movies.duration",
            parseInt(this.value, 10));
        });

        // Reset to default values
        frameRateInput.val(15);
        lengthInput.val(20);
        durationSelect.find("[value=" + duration + "]").attr("selected", "selected");
    },

    /**
     * If the movie is ready, play the movie in a popup dialog. Otherwise do
     * nothing.
     */
    _onMovieClick: function (event) {
        var id, movie, dialog, action, dateRequested;

        id    = $(event.currentTarget).data('id');
        movie = this._manager.get(id);
		
		dateRequested = Date.parseUTCDate(movie.dateRequested);
        if((new Date) - dateRequested >= 180 * 24 * 60 * 60 * 1000 || movie.status === 3){
			this._rebuildItem(movie);
			return false;
        }
		
        // If the movie is ready, open movie player
        if (movie.status === 2) {
            dialog = $("movie-player-" + id);

            // If the dialog has already been created, toggle display
            if (dialog.length > 0) {
                action = dialog.dialog('isOpen') ? "close" : "open";
                dialog.dialog(action);

            // Otherwise create and display the movie player dialog
            } else {
                this._createMoviePlayerDialog(movie);
            }
        }
        return false;
    },

   /**
    * Shows movie details and preview.
    */
    _onMovieHover: function (event) {
        if (event.type === 'mouseover') {
            //console.log('hover on');
        } else {
            //console.log('hover off');
        }
    },

    /**
     * Creates HTML for a preview tooltip with a preview thumbnail,
     * if available, and some basic information about the screenshot or movie
     */
    _buildPreviewTooltipHTML: function (movie) {
        var width, height, thumbnail, html = "", dateRequested;
		
		dateRequested = Date.parseUTCDate(movie.dateRequested);
		
        if (movie.status === 2 && (new Date) - dateRequested <= 180 * 24 * 60 * 60 * 1000) {
            thumbnail = movie.thumbnail;

            html += "<div style='text-align: center;'>" +
                "<img src='" + thumbnail +
                "' width='95%' alt='preview thumbnail' /></div>";

            width  = movie.width;
            height = movie.height;
        } else {
            width  = Math.round(movie.x2 - movie.x1);
            height = Math.round(movie.y2 - movie.y1);
        }

        html += "<table class='preview-tooltip'>" +
            "<tr><td><b>Start:</b></td><td>" + movie.startDate + "</td></tr>" +
            "<tr><td><b>End:</b></td><td>"   + movie.endDate   + "</td></tr>" +
            "<tr><td><b>Scale:</b></td><td>" + movie.imageScale.toFixed(2) +
            " arcsec/px</td></tr>" +
            "<tr><td><b>Dimensions:</b></td><td>" + width +
            "x" + height +
            " px</td></tr>" +
            "</table>";

        return html;
    },

    /**
     * @description Opens a pop-up with the movie player in it.
     */
    _createMoviePlayerDialog: function (movie) {
        var dimensions, title, uploadURL, flvURL, swfURL, html, dialog,
            screenshot, callback, self = this;

        // Make sure dialog fits nicely inside the browser window
        dimensions = this.getVideoPlayerDimensions(movie.width, movie.height);

        // Movie player HTML
        html = self.getVideoPlayerHTML(movie, dimensions.width,
                                       dimensions.height);

        // Movie player dialog
        dialog = $(
            "<div id='movie-player-" + movie.id + "' " +
            "class='movie-player-dialog'></div>"
        ).append(html);

        dialog.find(".video-download-icon").click(function () {
            // Google analytics event
            if (typeof(_gaq) != "undefined") {
                _gaq.push(['_trackEvent', 'Movies', 'Download']);
            }
        });

        // Movie dialog title
        title = movie.name + " (" + movie.startDate + " - " +
                movie.endDate + " UTC)";

        // Have to append the video player here, otherwise adding it to the div
        // beforehand results in the browser attempting to download it.
        dialog.dialog({
            dialogClass: "movie-player-dialog-" + movie.id,
            title     : "Movie Player: " + title,
            width     : ((dimensions.width < 575)?600:dimensions.width+25),
            height    : dimensions.height + 90,
            resizable : $.support.h264 || $.support.vp8,
            close     : function () {
                            $(this).remove();
                        },
            zIndex    : 9999,
            show      : 'fade'
        });

        // TODO 2011/01/04: Disable keyboard shortcuts when in text fields!
        // (already done for input fields...)

        // Initialize YouTube upload button
        $('#youtube-upload-' + movie.id).on('click', function () {
            self.showYouTubeUploadDialog(movie);
            return false;
        });

        // Initialize video link button
        $('#video-link-' + movie.id).on('click', function () {
            // Hide flash movies to prevent blocking
            if (!($.support.h264 || $.support.vp8)) {
                $(".movie-player-dialog").dialog("close");
            }
            helioviewer.displayMovieURL(movie.id);
            return false;
        });

        // Flash video URL
        flvURL = Helioviewer.api +
                "?action=downloadMovie&format=flv&id=" + movie.id;

        // SWF URL (The flowplayer SWF directly provides best Facebook support)
        swfURL = Helioviewer.root +
                 "/lib/flowplayer/flowplayer-3.2.8.swf?config=" +
                 encodeURIComponent("{'clip':{'url': '../../" + flvURL + "'}}");

        screenshot = movie.thumbnail.substr(0, movie.thumbnail.length - 9) + "full.png";
        
        $("video").mediaelementplayer({
			enableAutosize: true,
			features: ["playpause","progress","current","duration", "fullscreen"],
			alwaysShowControls: true
		});
    },

    /**
     * Opens YouTube uploader either in a separate tab or in a dialog
     */
    showYouTubeUploadDialog: function (movie) {
        var title, tags, url1, url2, description;

        // Suggested movie title
        title = movie.name + " (" + movie.startDate + " - " +
                movie.endDate + " UTC)";

        // Suggested YouTube tags
        tags = [];

        $.each(movie.layers.split("],["), function (i, layerStr) {
			//console.error('MovieManagerUI.showYouTubeUploadDialog() assumes 4-level hierarchy in layerStr');
            var parts = layerStr.replace(']', "").replace('[', "")
                        .split(",").slice(0, 4);

            // Add observatories, instruments, detectors and measurements
            $.each(parts, function (i, item) {
                if ($.inArray(item, tags) === -1) {
                    tags.push(item);
                }
            });
        });

        // URLs
        url1 = Helioviewer.api + "?action=playMovie&id=" + movie.id +
               "&format=mp4&hq=true";
        url2 = Helioviewer.api + "?action=downloadMovie&id=" + movie.id +
               "&format=mp4&hq=true";

        // Suggested Description
        description = "This movie was produced by Helioviewer.org. See the " +
                      "original at " + url1 + " or download a high-quality " +
                      "version from " + url2;

        // Update form defaults
        $("#youtube-title").val(title);
        $("#youtube-tags").val(tags);
        $("#youtube-desc").val(description);
        $("#youtube-movie-id").val(movie.id);

        // Hide movie dialogs (Flash player blocks upload form)
        $(".movie-player-dialog").dialog("close");

        // Open upload dialog
        $("#upload-dialog").dialog({
            "title" : "Upload video to YouTube",
            "width" : 550,
            "height": 440
        });
    },

    /**
     * Processes form and submits video upload request to YouTube
     */
    submitVideoUploadForm: function (event) {
        var params, successMsg, uploadDialog, url, form, loader, callback,
            self = this;

        // Validate and submit form
        try {
            this._validateVideoUploadForm();
        } catch (ex) {
            this._displayValidationErrorMsg(ex);
            return false;
        }

        // Clear any remaining error messages before continuing
        $("#upload-error-console").hide();

        form = $("#upload-form").hide();
        loader = $("#youtube-auth-loading-indicator").show();

        // Callback function
        callback = function (auth) {
            loader.hide();
            form.show();

            // Base URL
            url = Helioviewer.api + "?" + $("#youtube-video-info").serialize();

            // If the user has already authorized Helioviewer, upload the movie
            if (auth) {
                $.get(url, {"action": "uploadMovieToYouTube"},
                    function (response) {
                        if (response.error) {
                            self.hide();
                            $(document).trigger("message-console-warn",
                                                [response.error]);
                        }
                }, "json");
            } else {
                // Otherwise open an authorization page in a new tab/window
                window.open(url + "&action=getYouTubeAuth", "_blank");
            }

            // Close the dialog
            $("#upload-dialog").dialog("close");
            return false;
        }

        // Check YouTube authorization
        $.ajax({
            url : Helioviewer.api + "?action=checkYouTubeAuth",
            dataType: Helioviewer.dataType,
            success: callback
        });
    },

    /**
     * Displays an error message in the YouTube upload dialog
     *
     * @param string Error message
     */
    _displayValidationErrorMsg: function (ex) {
        var errorConsole = $("#upload-error-console");

        errorConsole.html("<b>Error:</b> " + ex).fadeIn(function () {
            window.setTimeout(function () {
                errorConsole.fadeOut();
            }, 15000);
        });
    },

    /**
     * Validates title, description and keyword fields for YouTube upload.
     *
     * @see http://code.google.com/apis/youtube/2.0/reference.html
     *      #Media_RSS_elements_reference
     */
    _validateVideoUploadForm: function () {
        var keywords         = $("#youtube-tags").val(),
            keywordMinLength = 1,
            keywordMaxLength = 30;

        // Make sure the title field is not empty
        if ($("#youtube-title").val().length === 0) {
            throw "Please specify a title for the movie.";
        }

        // User must specify at least one keyword
        if (keywords.length === 0) {
            throw "You must specifiy at least one tag for your video.";
        }

        // Make sure each keywords are between 2 and 30 characters each
        $.each(keywords.split(","), function (i, keyword) {
            var len = $.trim(keyword).length;

            if (len > keywordMaxLength) {
                throw "YouTube tags must not be longer than " +
                      keywordMaxLength + " characters each.";
            } else if (len < keywordMinLength) {
                throw "YouTube tags must be at least " + keywordMinLength +
                      " characters each.";
            }
            return;
        });

        // < and > are not allowed in title, description or keywords
        $.each($("#youtube-video-info input[type='text'], " +
                 "#youtube-video-info textarea"), function (i, input) {
            if ($(input).val().match(/[<>]/)) {
                throw "< and > characters are not allowed";
            }
            return;
        });
    },

    /**
     * Adds a movie to the history using it's id
     */
    addMovieUsingId: function (id) {
        var callback, params, movie, self = this;

        callback = function (response) {
            if (response.status === 2) {
                movie = self._manager.add(
                    id,
                    response.duration,
                    response.imageScale,
                    response.layers,
                    response.events,
                    response.eventsLabels,
                    response.scale,
                    response.scaleType,
                    response.scaleX,
                    response.scaleY,
                    response.timestamp.replace(" ", "T") + ".000Z",
                    response.startDate,
                    response.endDate,
                    response.frameRate,
                    response.numFrames,
                    response.x1,
                    response.x2,
                    response.y1,
                    response.y2,
                    response.width,
                    response.height,
                    response.thumbnails.small,
                    response.url
                );

                self._addItem(movie);
                self._createMoviePlayerDialog(movie);
            }
        };

        params = {
            "action" : "getMovieStatus",
            "id"     : id,
            "format" : self._manager.format,
            "verbose": true
        };
        $.get(Helioviewer.api, params, callback, Helioviewer.dataType);
    },

    /**
     * Determines dimensions for which movie should be displayed
     */
    getVideoPlayerDimensions: function (width, height) {
        var maxWidth    = $(window).width() * 0.80,
            maxHeight   = $(window).height() * 0.80,
            scaleFactor = Math.max(1, width / maxWidth, height / maxHeight);

        return {
            "width"  : Math.floor(width  / scaleFactor),
            "height" : Math.floor(height / scaleFactor)
        };
    },

    /**
     * Decides how to display video and returns HTML corresponding to that
     * method
     */
    getVideoPlayerHTML: function (movie, width, height) {
        var downloadURL, downloadLink, youtubeBtn,
            linkBtn, linkURL, gifLink, gifURL, tweetBtn, facebookBtn;

        // Download
        downloadURL = Helioviewer.api + "?action=downloadMovie&id=" + movie.id +
                      "&format=mp4&hq=true";
        var gifURLEncoded = movie.url;
        gifURL = encodeURIComponent(gifURLEncoded).replace(/'/g,"%27").replace(/"/g,"%22");
        //gifURL = Helioviewer.api + "?action=downloadMovie&id=" + movie.id +
        //              "&format=gif";

        downloadLink = "<div style='float:left;'><a target='_parent' href='" + downloadURL +
            "' title='Download high-quality video'>" +
            "<img style='width:93px; height:32px;' class='video-download-icon' " +
            "src='resources/images/download_93x32.png' /></a></div>";
         
        gifLink = "<div style='float:left;'><a target='_blank' href='http://imgur.com/vidgif/video?url=" + gifURL +
            "' title='Create animated GIF image with Imgur'>" +
            "<img style='width:93px; height:32px;' class='video-download-icon' " +
            "src='resources/images/gif_imgur_93x32.png' /></a></div>"; 
         
        //gifLink = "<div style='float:left;'><a target='_parent' href='" + gifURL +
        //    "' title='Download animated GIF image'>" +
        //    "<img style='width:93px; height:32px;' class='video-download-icon' " +
        //    "src='resources/images/gif_93x32.png' /></a></div>";    

        // Upload to YouTube
        youtubeBtn = '<div style="float:left;"><a id="youtube-upload-' + movie.id + '" href="#" ' +
            'target="_blank"><img class="youtube-icon" ' +
            'title="Upload video to YouTube" style="width:79px;height:32px;" ' +
            'src="resources/images/youtube_79x32.png" /></a></div>';

        // Link
        linkURL = helioviewer.serverSettings.rootURL + "/?movieId=" + movie.id;

        linkBtn = "<div style='float:left;'><a id='video-link-" + movie.id + "' href='" + linkURL +
            "' title='Get a link to the movie' " +
            "target='_blank'><img class='video-link-icon' " +
            "style='width:79px; height:32px;' " +
            "src='resources/images/link_79x32.png' /></a></div>";

        // Tweet Movie Button
        tweetBtn = '<div style="float:right;"><a href="https://twitter.com/share" class="twitter-share-button" data-related="helioviewer" data-lang="en" data-size="medium" data-count="horizontal" data-url="http://'+document.domain+'/?movieId='+movie.id+'" data-text="Movie of the Sun created on Helioviewer.org:" data-hashtags="helioviewer" data-related="helioviewer">Tweet</a><script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0];if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src="https://platform.twitter.com/widgets.js";fjs.parentNode.insertBefore(js,fjs);}}(document,"script","twitter-wjs");</script></div>';

        // Like Movie on Facebook Button
        facebookBtn = '<div style="float:right;"><iframe src="//www.facebook.com/plugins/like.php?href='+encodeURIComponent('http://'+document.domain+'/?movieId='+movie.id)+'&amp;width=90&amp;height=21&amp;colorscheme=dark&amp;layout=button_count&amp;action=like&amp;show_faces=false&amp;send=false&amp;appId=6899099925" scrolling="no" frameborder="0" style="border:none; overflow:hidden; height:21px; width:90px;" allowTransparency="false"></iframe></div>';

        // HTML5 Video (H.264 or WebM)
        //if ($.support.vp8 || $.support.h264) {
            // Work-around: use relative paths to simplify debugging
			var url = movie.url.substr(movie.url.search("cache"));
			var fileNameIndex = url.lastIndexOf("/") + 1;
			var filename = url.substr(fileNameIndex);
			var filenameHQ = filename.replace('.mp4', '-hq.mp4');
			var filenameWebM = filename.replace('.mp4', '-.webm');
			var filePath = url.substring(0, url.lastIndexOf("/"));
			var autoplay = (Helioviewer.userSettings.get("options.movieautoplay") ? 'autoplay="autoplay"' : '');
			
			return '<style>.mejs-container .mejs-controls {bottom: -20px;}.mejs-container.mejs-container-fullscreen .mejs-controls{bottom: 0px;}</style>\
				    <div>\
						<video id="movie-player-' + movie.id + '" width="'+(width - 15)+'" height="'+(height - 20)+'" poster="'+helioviewer.serverSettings.rootURL+'/'+filePath+'/preview-full.png" controls="controls" preload="none" '+autoplay+'>\
						    <source type="video/mp4" src="'+helioviewer.serverSettings.rootURL+'/'+filePath+'/'+filenameHQ+'" />\
						    <source type="video/webm" src="'+helioviewer.serverSettings.rootURL+'/'+filePath+'/'+filenameWebM+'" />\
						    <object width="'+width+'" height="'+(height - 20)+'" type="application/x-shockwave-flash" data="/resources/lib/mediaelement-2.22.0/build/flashmediaelement.swf">\
						        <param name="movie" value="/resources/lib/mediaelement-2.22.0/build/flashmediaelement.swf" />\
						        <param name="flashvars" value="controls=true&amp;poster='+helioviewer.serverSettings.rootURL+'/'+filePath+'/preview-full.png&amp;file='+helioviewer.serverSettings.rootURL+'/'+filePath+'/'+filename+'" />\
						        <img src="'+helioviewer.serverSettings.rootURL+'/'+filePath+'/preview-full.png" width="'+width+'" height="'+height+'" title="No video playback capabilities" />\
						    </object>\
						</video>\
					</div>\
					<div style="width:100%;padding-top: 25px;">\
						<div style="float:left;" class="video-links">' + 
							youtubeBtn + linkBtn + downloadLink + gifLink + 
						'</div>\
						<div style="float:right;">' + facebookBtn + tweetBtn + '</div>\
					</div>';
		   	

        /*}

        // Fallback (flash player)
        else {
            var url = Helioviewer.api + '?action=playMovie&id=' + movie.id +
                  '&width=' + width + "&height=" + height +
                  '&format=flv';

            return '<div id="movie-player-' + movie.id + '">' +
                       '<iframe id="movie-player-iframe" src="' + url + '" width="' + width +
                       '" height="' + height + '" marginheight="0" marginwidth="0" ' +
                       'scrolling="no" frameborder="0" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true"/>' +
                   '</div>' +
                   '<div style="width:100%;">' +
                       '<div style="float:left;" class="video-links">' +
                        youtubeBtn + linkBtn + downloadLink + gifLink +
                   '</div>' +
                   '<div style="float:right;">' + facebookBtn + tweetBtn +
                   '</div>';
        }*/
    },

    /**
     * Refreshes status information for movies in the history
     */
    _refresh: function () {
        var status, statusMsg, dateRequested;

        // Update the status information for each row in the history
        $.each(this._manager.toArray(), function (i, item) {
            status = $("#movie-" + item.id).find(".status");

            // For completed entries, display elapsed time
            if (item.status === 2) {
                dateRequested = Date.parseUTCDate(item.dateRequested);
                if((new Date) - dateRequested >= 180 * 24 * 60 * 60 * 1000){
					statusMsg = '<span class="rebuild-item" data-id="'+item.id+'" title="Regenerate movie"> regenerate <span class="fa fa-refresh"></span></span>';
                }else{
	                statusMsg = dateRequested.getElapsedTime();
                }
            // For failed movie requests, display an error
            } else if (item.status === 3) {
                statusMsg = '<span style="color:LightCoral;" class="rebuild-item" data-id="'+item.id+'">error</span>';
            // Otherwise show the item as processing
            } else if (item.status === 1) {
                statusMsg = '<span class="processing">processing '+item.progress+'%</span>';
            // Otherwise show the item as processing
            } else {
                statusMsg = '<span style="color:#f9a331">queued</span>';
            }
            status.html(statusMsg);
        });
    },

    /**
     * Refreshes status information for movies in the history
     */
    _rebuildItem: function (movie) {
	    var callback, self = this, params = {};
		
		params = {
			'action': 'reQueueMovie',
			'id': movie.id,
			'force': true
		};
		
        // AJAX Responder
        callback = function (response) {
            var msg, waitTime;

            if ((response === null) || response.error) {
                // Queue full
                if (response.errno === 40) {
                    msg = response.error;
                } else {
                    // Other error
                    msg = "We are unable to create a movie for the time you " +
                        "requested. Please select a different time range " +
                        "and try again. ("+response.error+")";
                }
                $(document).trigger("message-console-info", msg);
                return;
            } else if (response.warning) {
                $(document).trigger("message-console-info", response.warning);
                return;
            }

            self._manager.update( movie.id, {'status':0, 'dateRequested':new Date().toISOString(), 'token': response.token});
            self._manager._monitorQueuedMovie(movie.id, new Date().toISOString(), response.token, 5);

            waitTime = humanReadableNumSeconds(response.eta);
            msg = "Your video is processing and will be available in " +
                  "approximately " + waitTime + ". You may view it at any " +
                  "time after it is ready by clicking the 'Movie' button";
            $(document).trigger("message-console-info", msg);
            self._refresh();
        };

        // Make request
        $.get(Helioviewer.api, params, callback, Helioviewer.dataType);
    },

    /**
     * Validates the request and returns false if any of the requirements are
     * not met
     */
    _validateRequest: function (roi, layerString) {
        var layers, visibleLayers, message;

        layers = layerStringToLayerArray(layerString);
        visibleLayers = $.grep(layers, function (layer, i) {
            var parts = layer.split(",");
            return (parts[4] === "1" && parts[5] !== "0");
        });

        if (visibleLayers.length > 3) {
            message = "Movies cannot have more than three layers. " +
                      "Please hide/remove layers until there are no more " +
                      "than three layers visible.";

            $(document).trigger("message-console-warn", [message]);

            return false;
        }
        return this._super(roi, layerString);
    },

    _cleanup: function () {
        $.each(this._cleanupFunctions, function(i, func) {
            eval(func);
        });
    }
});
