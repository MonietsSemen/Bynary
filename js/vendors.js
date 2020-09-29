//@prepros-append baguetteBox.js
//@prepros-append script.js
/*!
 * baguetteBox.js
 * @author  feimosi
 * @version %%INJECT_VERSION%%
 * @url https://github.com/feimosi/baguetteBox.js
 */

/* global define, module */

(function (root, factory) {
    'use strict';
    if (typeof define === 'function' && define.amd) {
        define(factory);
    } else if (typeof exports === 'object') {
        module.exports = factory();
    } else {
        root.baguetteBox = factory();
    }
}(this, function () {
    'use strict';

    // SVG shapes used on the buttons
    var leftArrow = '<svg width="44" height="60">' +
            '<polyline points="30 10 10 30 30 50" stroke="rgba(255,255,255,0.5)" stroke-width="4"' +
              'stroke-linecap="butt" fill="none" stroke-linejoin="round"/>' +
            '</svg>',
        rightArrow = '<svg width="44" height="60">' +
            '<polyline points="14 10 34 30 14 50" stroke="rgba(255,255,255,0.5)" stroke-width="4"' +
              'stroke-linecap="butt" fill="none" stroke-linejoin="round"/>' +
            '</svg>',
        closeX = '<svg width="30" height="30">' +
            '<g stroke="rgb(160,160,160)" stroke-width="4">' +
            '<line x1="5" y1="5" x2="25" y2="25"/>' +
            '<line x1="5" y1="25" x2="25" y2="5"/>' +
            '</g></svg>';
    // Global options and their defaults
    var options = {},
        defaults = {
            captions: true,
            buttons: 'auto',
            fullScreen: false,
            noScrollbars: false,
            bodyClass: 'baguetteBox-open',
            titleTag: false,
            async: false,
            preload: 2,
            animation: 'slideIn',
            afterShow: null,
            afterHide: null,
            onChange: null,
            overlayBackgroundColor: 'rgba(0,0,0,.8)'
        };
    // Object containing information about features compatibility
    var supports = {};
    // DOM Elements references
    var overlay, slider, previousButton, nextButton, closeButton;
    // An array with all images in the current gallery
    var currentGallery = [];
    // Current image index inside the slider
    var currentIndex = 0;
    // Visibility of the overlay
    var isOverlayVisible = false;
    // Touch event start position (for slide gesture)
    var touch = {};
    // If set to true ignore touch events because animation was already fired
    var touchFlag = false;
    // Regex pattern to match image files
    var regex = /.+\.(gif|jpe?g|png|webp)/i;
    // Object of all used galleries
    var data = {};
    // Array containing temporary images DOM elements
    var imagesElements = [];
    // The last focused element before opening the overlay
    var documentLastFocus = null;
    var overlayClickHandler = function(event) {
        // Close the overlay when user clicks directly on the background
        if (event.target.id.indexOf('baguette-img') !== -1) {
            hideOverlay();
        }
    };
    var previousButtonClickHandler = function(event) {
        event.stopPropagation ? event.stopPropagation() : event.cancelBubble = true; // eslint-disable-line no-unused-expressions
        showPreviousImage();
    };
    var nextButtonClickHandler = function(event) {
        event.stopPropagation ? event.stopPropagation() : event.cancelBubble = true; // eslint-disable-line no-unused-expressions
        showNextImage();
    };
    var closeButtonClickHandler = function(event) {
        event.stopPropagation ? event.stopPropagation() : event.cancelBubble = true; // eslint-disable-line no-unused-expressions
        hideOverlay();
    };
    var touchstartHandler = function(event) {
        touch.count++;
        if (touch.count > 1) {
            touch.multitouch = true;
        }
        // Save x and y axis position
        touch.startX = event.changedTouches[0].pageX;
        touch.startY = event.changedTouches[0].pageY;
    };
    var touchmoveHandler = function(event) {
        // If action was already triggered or multitouch return
        if (touchFlag || touch.multitouch) {
            return;
        }
        event.preventDefault ? event.preventDefault() : event.returnValue = false; // eslint-disable-line no-unused-expressions
        var touchEvent = event.touches[0] || event.changedTouches[0];
        // Move at least 40 pixels to trigger the action
        if (touchEvent.pageX - touch.startX > 40) {
            touchFlag = true;
            showPreviousImage();
        } else if (touchEvent.pageX - touch.startX < -40) {
            touchFlag = true;
            showNextImage();
        // Move 100 pixels up to close the overlay
        } else if (touch.startY - touchEvent.pageY > 100) {
            hideOverlay();
        }
    };
    var touchendHandler = function() {
        touch.count--;
        if (touch.count <= 0) {
            touch.multitouch = false;
        }
        touchFlag = false;
    };
    var contextmenuHandler = function() {
        touchendHandler();
    };

    var trapFocusInsideOverlay = function(event) {
        if (overlay.style.display === 'block' && (overlay.contains && !overlay.contains(event.target))) {
            event.stopPropagation();
            initFocus();
        }
    };

    // forEach polyfill for IE8
    // http://stackoverflow.com/a/14827443/1077846
    /* eslint-disable */
    if (![].forEach) {
        Array.prototype.forEach = function(callback, thisArg) {
            for (var i = 0; i < this.length; i++) {
                callback.call(thisArg, this[i], i, this);
            }
        };
    }

    // filter polyfill for IE8
    // https://gist.github.com/eliperelman/1031656
    if (![].filter) {
        Array.prototype.filter = function(a, b, c, d, e) {
            c = this;
            d = [];
            for (e = 0; e < c.length; e++)
                a.call(b, c[e], e, c) && d.push(c[e]);
            return d;
        };
    }
    /* eslint-enable */

    // Script entry point
    function run(selector, userOptions) {
        // Fill supports object
        supports.transforms = testTransformsSupport();
        supports.svg = testSvgSupport();
        supports.passiveEvents = testPassiveEventsSupport();

        buildOverlay();
        removeFromCache(selector);
        return bindImageClickListeners(selector, userOptions);
    }

    function bindImageClickListeners(selector, userOptions) {
        // For each gallery bind a click event to every image inside it
        var galleryNodeList = document.querySelectorAll(selector);
        var selectorData = {
            galleries: [],
            nodeList: galleryNodeList
        };
        data[selector] = selectorData;

        [].forEach.call(galleryNodeList, function(galleryElement) {
            if (userOptions && userOptions.filter) {
                regex = userOptions.filter;
            }

            // Get nodes from gallery elements or single-element galleries
            var tagsNodeList = [];
            if (galleryElement.tagName === 'A') {
                tagsNodeList = [galleryElement];
            } else {
                tagsNodeList = galleryElement.getElementsByTagName('a');
            }

            // Filter 'a' elements from those not linking to images
            tagsNodeList = [].filter.call(tagsNodeList, function(element) {
                if (element.className.indexOf(userOptions && userOptions.ignoreClass) === -1) {
                    return regex.test(element.href);
                }
            });
            if (tagsNodeList.length === 0) {
                return;
            }

            var gallery = [];
            [].forEach.call(tagsNodeList, function(imageElement, imageIndex) {
                var imageElementClickHandler = function(event) {
                    event.preventDefault ? event.preventDefault() : event.returnValue = false; // eslint-disable-line no-unused-expressions
                    prepareOverlay(gallery, userOptions);
                    showOverlay(imageIndex);
                };
                var imageItem = {
                    eventHandler: imageElementClickHandler,
                    imageElement: imageElement
                };
                bind(imageElement, 'click', imageElementClickHandler);
                gallery.push(imageItem);
            });
            selectorData.galleries.push(gallery);
        });

        return selectorData.galleries;
    }

    function clearCachedData() {
        for (var selector in data) {
            if (data.hasOwnProperty(selector)) {
                removeFromCache(selector);
            }
        }
    }

    function removeFromCache(selector) {
        if (!data.hasOwnProperty(selector)) {
            return;
        }
        var galleries = data[selector].galleries;
        [].forEach.call(galleries, function(gallery) {
            [].forEach.call(gallery, function(imageItem) {
                unbind(imageItem.imageElement, 'click', imageItem.eventHandler);
            });

            if (currentGallery === gallery) {
                currentGallery = [];
            }
        });

        delete data[selector];
    }

    function buildOverlay() {
        overlay = getByID('baguetteBox-overlay');
        // Check if the overlay already exists
        if (overlay) {
            slider = getByID('baguetteBox-slider');
            previousButton = getByID('previous-button');
            nextButton = getByID('next-button');
            closeButton = getByID('close-button');
            return;
        }
        // Create overlay element
        overlay = create('div');
        overlay.setAttribute('role', 'dialog');
        overlay.id = 'baguetteBox-overlay';
        document.getElementsByTagName('body')[0].appendChild(overlay);
        // Create gallery slider element
        slider = create('div');
        slider.id = 'baguetteBox-slider';
        overlay.appendChild(slider);
        // Create all necessary buttons
        previousButton = create('button');
        previousButton.setAttribute('type', 'button');
        previousButton.id = 'previous-button';
        previousButton.setAttribute('aria-label', 'Previous');
        previousButton.innerHTML = supports.svg ? leftArrow : '&lt;';
        overlay.appendChild(previousButton);

        nextButton = create('button');
        nextButton.setAttribute('type', 'button');
        nextButton.id = 'next-button';
        nextButton.setAttribute('aria-label', 'Next');
        nextButton.innerHTML = supports.svg ? rightArrow : '&gt;';
        overlay.appendChild(nextButton);

        closeButton = create('button');
        closeButton.setAttribute('type', 'button');
        closeButton.id = 'close-button';
        closeButton.setAttribute('aria-label', 'Close');
        closeButton.innerHTML = supports.svg ? closeX : '&times;';
        overlay.appendChild(closeButton);

        previousButton.className = nextButton.className = closeButton.className = 'baguetteBox-button';

        bindEvents();
    }

    function keyDownHandler(event) {
        switch (event.keyCode) {
        case 37: // Left arrow
            showPreviousImage();
            break;
        case 39: // Right arrow
            showNextImage();
            break;
        case 27: // Esc
            hideOverlay();
            break;
        case 36: // Home
            showFirstImage(event);
            break;
        case 35: // End
            showLastImage(event);
            break;
        }
    }

    function bindEvents() {
        var options = supports.passiveEvents ? { passive: true } : null;
        bind(overlay, 'click', overlayClickHandler);
        bind(previousButton, 'click', previousButtonClickHandler);
        bind(nextButton, 'click', nextButtonClickHandler);
        bind(closeButton, 'click', closeButtonClickHandler);
        bind(slider, 'contextmenu', contextmenuHandler);
        bind(overlay, 'touchstart', touchstartHandler, options);
        bind(overlay, 'touchmove', touchmoveHandler, options);
        bind(overlay, 'touchend', touchendHandler);
        bind(document, 'focus', trapFocusInsideOverlay, true);
    }

    function unbindEvents() {
        var options = supports.passiveEvents ? { passive: true } : null;
        unbind(overlay, 'click', overlayClickHandler);
        unbind(previousButton, 'click', previousButtonClickHandler);
        unbind(nextButton, 'click', nextButtonClickHandler);
        unbind(closeButton, 'click', closeButtonClickHandler);
        unbind(slider, 'contextmenu', contextmenuHandler);
        unbind(overlay, 'touchstart', touchstartHandler, options);
        unbind(overlay, 'touchmove', touchmoveHandler, options);
        unbind(overlay, 'touchend', touchendHandler);
        unbind(document, 'focus', trapFocusInsideOverlay, true);
    }

    function prepareOverlay(gallery, userOptions) {
        // If the same gallery is being opened prevent from loading it once again
        if (currentGallery === gallery) {
            return;
        }
        currentGallery = gallery;
        // Update gallery specific options
        setOptions(userOptions);
        // Empty slider of previous contents (more effective than .innerHTML = "")
        while (slider.firstChild) {
            slider.removeChild(slider.firstChild);
        }
        imagesElements.length = 0;

        var imagesFiguresIds = [];
        var imagesCaptionsIds = [];
        // Prepare and append images containers and populate figure and captions IDs arrays
        for (var i = 0, fullImage; i < gallery.length; i++) {
            fullImage = create('div');
            fullImage.className = 'full-image';
            fullImage.id = 'baguette-img-' + i;
            imagesElements.push(fullImage);

            imagesFiguresIds.push('baguetteBox-figure-' + i);
            imagesCaptionsIds.push('baguetteBox-figcaption-' + i);
            slider.appendChild(imagesElements[i]);
        }
        overlay.setAttribute('aria-labelledby', imagesFiguresIds.join(' '));
        overlay.setAttribute('aria-describedby', imagesCaptionsIds.join(' '));
    }

    function setOptions(newOptions) {
        if (!newOptions) {
            newOptions = {};
        }
        // Fill options object
        for (var item in defaults) {
            options[item] = defaults[item];
            if (typeof newOptions[item] !== 'undefined') {
                options[item] = newOptions[item];
            }
        }
        /* Apply new options */
        // Change transition for proper animation
        slider.style.transition = slider.style.webkitTransition = (options.animation === 'fadeIn' ? 'opacity .4s ease' :
            options.animation === 'slideIn' ? '' : 'none');
        // Hide buttons if necessary
        if (options.buttons === 'auto' && ('ontouchstart' in window || currentGallery.length === 1)) {
            options.buttons = false;
        }
        // Set buttons style to hide or display them
        previousButton.style.display = nextButton.style.display = (options.buttons ? '' : 'none');
        // Set overlay color
        try {
            overlay.style.backgroundColor = options.overlayBackgroundColor;
        } catch (e) {
            // Silence the error and continue
        }
    }

    function showOverlay(chosenImageIndex) {
        if (options.noScrollbars) {
            document.documentElement.style.overflowY = 'hidden';
            document.body.style.overflowY = 'scroll';
        }
        if (overlay.style.display === 'block') {
            return;
        }

        bind(document, 'keydown', keyDownHandler);
        currentIndex = chosenImageIndex;
        touch = {
            count: 0,
            startX: null,
            startY: null
        };
        loadImage(currentIndex, function() {
            preloadNext(currentIndex);
            preloadPrev(currentIndex);
        });

        updateOffset();
        overlay.style.display = 'block';
        if (options.fullScreen) {
            enterFullScreen();
        }
        // Fade in overlay
        setTimeout(function() {
            overlay.className = 'visible';
            if (options.bodyClass && document.body.classList) {
                document.body.classList.add(options.bodyClass);
            }
            if (options.afterShow) {
                options.afterShow();
            }
        }, 50);
        if (options.onChange) {
            options.onChange(currentIndex, imagesElements.length);
        }
        documentLastFocus = document.activeElement;
        initFocus();
        isOverlayVisible = true;
    }

    function initFocus() {
        if (options.buttons) {
            previousButton.focus();
        } else {
            closeButton.focus();
        }
    }

    function enterFullScreen() {
        if (overlay.requestFullscreen) {
            overlay.requestFullscreen();
        } else if (overlay.webkitRequestFullscreen) {
            overlay.webkitRequestFullscreen();
        } else if (overlay.mozRequestFullScreen) {
            overlay.mozRequestFullScreen();
        }
    }

    function exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }

    function hideOverlay() {
        if (options.noScrollbars) {
            document.documentElement.style.overflowY = 'auto';
            document.body.style.overflowY = 'auto';
        }
        if (overlay.style.display === 'none') {
            return;
        }

        unbind(document, 'keydown', keyDownHandler);
        // Fade out and hide the overlay
        overlay.className = '';
        setTimeout(function() {
            overlay.style.display = 'none';
            if (document.fullscreen) {
                exitFullscreen();
            }
            if (options.bodyClass && document.body.classList) {
                document.body.classList.remove(options.bodyClass);
            }
            if (options.afterHide) {
                options.afterHide();
            }
            documentLastFocus && documentLastFocus.focus();
            isOverlayVisible = false;
        }, 500);
    }

    function loadImage(index, callback) {
        var imageContainer = imagesElements[index];
        var galleryItem = currentGallery[index];

        // Return if the index exceeds prepared images in the overlay
        // or if the current gallery has been changed / closed
        if (typeof imageContainer === 'undefined' || typeof galleryItem === 'undefined') {
            return;
        }

        // If image is already loaded run callback and return
        if (imageContainer.getElementsByTagName('img')[0]) {
            if (callback) {
                callback();
            }
            return;
        }

        // Get element reference, optional caption and source path
        var imageElement = galleryItem.imageElement;
        var thumbnailElement = imageElement.getElementsByTagName('img')[0];
        var imageCaption = typeof options.captions === 'function' ?
            options.captions.call(currentGallery, imageElement) :
            imageElement.getAttribute('data-caption') || imageElement.title;
        var imageSrc = getImageSrc(imageElement);

        // Prepare figure element
        var figure = create('figure');
        figure.id = 'baguetteBox-figure-' + index;
        figure.innerHTML = '<div class="baguetteBox-spinner">' +
            '<div class="baguetteBox-double-bounce1"></div>' +
            '<div class="baguetteBox-double-bounce2"></div>' +
            '</div>';
        // Insert caption if available
        if (options.captions && imageCaption) {
            var figcaption = create('figcaption');
            figcaption.id = 'baguetteBox-figcaption-' + index;
            figcaption.innerHTML = imageCaption;
            figure.appendChild(figcaption);
        }
        imageContainer.appendChild(figure);

        // Prepare gallery img element
        var image = create('img');
        image.onload = function() {
            // Remove loader element
            var spinner = document.querySelector('#baguette-img-' + index + ' .baguetteBox-spinner');
            figure.removeChild(spinner);
            if (!options.async && callback) {
                callback();
            }
        };
        image.setAttribute('src', imageSrc);
        image.alt = thumbnailElement ? thumbnailElement.alt || '' : '';
        if (options.titleTag && imageCaption) {
            image.title = imageCaption;
        }
        figure.appendChild(image);

        // Run callback
        if (options.async && callback) {
            callback();
        }
    }

    // Get image source location, mostly used for responsive images
    function getImageSrc(image) {
        // Set default image path from href
        var result = image.href;
        // If dataset is supported find the most suitable image
        if (image.dataset) {
            var srcs = [];
            // Get all possible image versions depending on the resolution
            for (var item in image.dataset) {
                if (item.substring(0, 3) === 'at-' && !isNaN(item.substring(3))) {
                    srcs[item.replace('at-', '')] = image.dataset[item];
                }
            }
            // Sort resolutions ascending
            var keys = Object.keys(srcs).sort(function(a, b) {
                return parseInt(a, 10) < parseInt(b, 10) ? -1 : 1;
            });
            // Get real screen resolution
            var width = window.innerWidth * window.devicePixelRatio;
            // Find the first image bigger than or equal to the current width
            var i = 0;
            while (i < keys.length - 1 && keys[i] < width) {
                i++;
            }
            result = srcs[keys[i]] || result;
        }
        return result;
    }

    // Return false at the right end of the gallery
    function showNextImage() {
        return show(currentIndex + 1);
    }

    // Return false at the left end of the gallery
    function showPreviousImage() {
        return show(currentIndex - 1);
    }

    // Return false at the left end of the gallery
    function showFirstImage(event) {
        if (event) {
            event.preventDefault();
        }
        return show(0);
    }

    // Return false at the right end of the gallery
    function showLastImage(event) {
        if (event) {
            event.preventDefault();
        }
        return show(currentGallery.length - 1);
    }

    /**
     * Move the gallery to a specific index
     * @param `index` {number} - the position of the image
     * @param `gallery` {array} - gallery which should be opened, if omitted assumes the currently opened one
     * @return {boolean} - true on success or false if the index is invalid
     */
    function show(index, gallery) {
        if (!isOverlayVisible && index >= 0 && index < gallery.length) {
            prepareOverlay(gallery, options);
            showOverlay(index);
            return true;
        }
        if (index < 0) {
            if (options.animation) {
                bounceAnimation('left');
            }
            return false;
        }
        if (index >= imagesElements.length) {
            if (options.animation) {
                bounceAnimation('right');
            }
            return false;
        }

        currentIndex = index;
        loadImage(currentIndex, function() {
            preloadNext(currentIndex);
            preloadPrev(currentIndex);
        });
        updateOffset();

        if (options.onChange) {
            options.onChange(currentIndex, imagesElements.length);
        }

        return true;
    }

    /**
     * Triggers the bounce animation
     * @param {('left'|'right')} direction - Direction of the movement
     */
    function bounceAnimation(direction) {
        slider.className = 'bounce-from-' + direction;
        setTimeout(function() {
            slider.className = '';
        }, 400);
    }

    function updateOffset() {
        var offset = -currentIndex * 100 + '%';
        if (options.animation === 'fadeIn') {
            slider.style.opacity = 0;
            setTimeout(function() {
                supports.transforms ?
                    slider.style.transform = slider.style.webkitTransform = 'translate3d(' + offset + ',0,0)'
                    : slider.style.left = offset;
                slider.style.opacity = 1;
            }, 400);
        } else {
            supports.transforms ?
                slider.style.transform = slider.style.webkitTransform = 'translate3d(' + offset + ',0,0)'
                : slider.style.left = offset;
        }
    }

    // CSS 3D Transforms test
    function testTransformsSupport() {
        var div = create('div');
        return typeof div.style.perspective !== 'undefined' || typeof div.style.webkitPerspective !== 'undefined';
    }

    // Inline SVG test
    function testSvgSupport() {
        var div = create('div');
        div.innerHTML = '<svg/>';
        return (div.firstChild && div.firstChild.namespaceURI) === 'http://www.w3.org/2000/svg';
    }

    // Borrowed from https://github.com/seiyria/bootstrap-slider/pull/680/files
    /* eslint-disable getter-return */
    function testPassiveEventsSupport() {
        var passiveEvents = false;
        try {
            var opts = Object.defineProperty({}, 'passive', {
                get: function() {
                    passiveEvents = true;
                }
            });
            window.addEventListener('test', null, opts);
        } catch (e) { /* Silence the error and continue */ }

        return passiveEvents;
    }
    /* eslint-enable getter-return */

    function preloadNext(index) {
        if (index - currentIndex >= options.preload) {
            return;
        }
        loadImage(index + 1, function() {
            preloadNext(index + 1);
        });
    }

    function preloadPrev(index) {
        if (currentIndex - index >= options.preload) {
            return;
        }
        loadImage(index - 1, function() {
            preloadPrev(index - 1);
        });
    }

    function bind(element, event, callback, options) {
        if (element.addEventListener) {
            element.addEventListener(event, callback, options);
        } else {
            // IE8 fallback
            element.attachEvent('on' + event, function(event) {
                // `event` and `event.target` are not provided in IE8
                event = event || window.event;
                event.target = event.target || event.srcElement;
                callback(event);
            });
        }
    }

    function unbind(element, event, callback, options) {
        if (element.removeEventListener) {
            element.removeEventListener(event, callback, options);
        } else {
            // IE8 fallback
            element.detachEvent('on' + event, callback);
        }
    }

    function getByID(id) {
        return document.getElementById(id);
    }

    function create(element) {
        return document.createElement(element);
    }

    function destroyPlugin() {
        unbindEvents();
        clearCachedData();
        unbind(document, 'keydown', keyDownHandler);
        document.getElementsByTagName('body')[0].removeChild(document.getElementById('baguetteBox-overlay'));
        data = {};
        currentGallery = [];
        currentIndex = 0;
    }

    return {
        run: run,
        show: show,
        showNext: showNextImage,
        showPrevious: showPreviousImage,
        hide: hideOverlay,
        destroy: destroyPlugin
    };
}));

	var isMobile = {Android: function() {return navigator.userAgent.match(/Android/i);},BlackBerry: function() {return navigator.userAgent.match(/BlackBerry/i);},iOS: function() {return navigator.userAgent.match(/iPhone|iPad|iPod/i);},Opera: function() {return navigator.userAgent.match(/Opera Mini/i);},Windows: function() {return navigator.userAgent.match(/IEMobile/i);},any: function() {return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());}};if(isMobile.any()){}	if(location.hash){		var hsh=location.hash.replace('#','');	if($('.popup-'+hsh).length>0){		popupOpen(hsh);	}else if($('div.'+hsh).length>0){		$('body,html').animate({scrollTop:$('div.'+hsh).offset().top,},500, function(){});	}}$('.wrapper').addClass('loaded');	var act="click";if(isMobile.iOS()){	var act="touchstart";}$('.header-menu__icon').click(function(event) {	$(this).toggleClass('active');	$('.header-menu').toggleClass('active');	if($(this).hasClass('active')){		$('body').data('scroll',$(window).scrollTop());	}		$('body').toggleClass('lock');	if(!$(this).hasClass('active')){		$('body,html').scrollTop(parseInt($('body').data('scroll')));	}});//ZOOMif($('.gallery').length>0){	baguetteBox.run('.gallery', {		// Custom options	});}/*CLOUD-ZOOM<a rel="position:'right',adjustX:25,adjustY:0,Width: 432" href="img/product/zoom.jpg" class="cloud-zoom product-main-mainimage__item">	<img class="cloudzoom-gallery" src="img/product/zoom.jpg" alt="" /></a>*///POPUP$('.pl').click(function(event) {		var pl=$(this).attr('href').replace('#','');		var v=$(this).data('vid');	popupOpen(pl,v);	return false;});function popupOpen(pl,v){	$('.popup').removeClass('active').hide();	if(!$('.header-menu').hasClass('active')){		$('body').data('scroll',$(window).scrollTop());	}	if(!isMobile.any()){		$('body').css({paddingRight:$(window).outerWidth()-$('.wrapper').outerWidth()}).addClass('lock');		$('.pdb').css({paddingRight:$(window).outerWidth()-$('.wrapper').outerWidth()});	}else{		setTimeout(function() {			$('body').addClass('lock');		},300);	}	history.pushState('', '', '#'+pl);	if(v!='' && v!=null){		$('.popup-'+pl+' .popup-video__value').html('<iframe src="https://www.youtube.com/embed/'+v+'?autoplay=1"  allow="autoplay; encrypted-media" allowfullscreen></iframe>');	}	$('.popup-'+pl).fadeIn(300).delay(300).addClass('active');	if($('.popup-'+pl).find('.slick-slider').length>0){		$('.popup-'+pl).find('.slick-slider').slick('setPosition');	}}function openPopupById(popup_id){	$('#'+popup_id).fadeIn(300).delay(300).addClass('active');}function popupClose(){	$('.popup').removeClass('active').fadeOut(300);	if(!$('.header-menu').hasClass('active')){		if(!isMobile.any()){			setTimeout(function() {				$('body').css({paddingRight:0});				$('.pdb').css({paddingRight:0});			},200);			setTimeout(function() {				$('body').removeClass('lock');				$('body,html').scrollTop(parseInt($('body').data('scroll')));			},200);		}else{			$('body').removeClass('lock');			$('body,html').scrollTop(parseInt($('body').data('scroll')));		}	}	$('.popup-video__value').html('');	history.pushState('', '', window.location.href.split('#')[0]);}$('.popup-close,.popup__close').click(function(event) {	popupClose();	return false;});$('.popup').click(function(e) {	if (!$(e.target).is(".popup>.popup-table>.cell *") || $(e.target).is(".popup-close") || $(e.target).is(".popup__close")) {		popupClose();		return false;	}});$(document).on('keydown',function(e) {	if(e.which==27){		popupClose();	}});$('.goto').click(function() {		var el=$(this).attr('href').replace('#','');		var offset=0;	$('body,html').animate({scrollTop:$('.'+el).offset().top+offset},500, function() {});	if($('.header-menu').hasClass('active')){		$('.header-menu,.header-menu__icon').removeClass('active');		$('body').removeClass('lock');	}	return false;});function ibg(){	$.each($('.ibg'), function(index, val) {		if($(this).find('img').length>0){			$(this).css('background-image','url("'+$(this).find('img').attr('src')+'")');		}	});}ibg();	//Клик вне области$(document).on('click touchstart',function(e) {	if (!$(e.target).is(".select *")) {		$('.select').removeClass('active');	};});//UP$(window).scroll(function() {		var w=$(window).width();	if($(window).scrollTop()>50){		$('#up').fadeIn(300);	}else{		$('#up').fadeOut(300);	}});$('#up').click(function(event) {	$('body,html').animate({scrollTop:0},300);});$('body').on('click','.tab__navitem',function(event) {			var eq=$(this).index();		if($(this).hasClass('parent')){			var eq=$(this).parent().index();		}	if(!$(this).hasClass('active')){			$(this).closest('.tabs').find('.tab__navitem').removeClass('active');			$(this).addClass('active');			$(this).closest('.tabs').find('.tab__item').removeClass('active').eq(eq).addClass('active');		if($(this).closest('.tabs').find('.slick-slider').length>0){			$(this).closest('.tabs').find('.slick-slider').slick('setPosition');		}	}});$.each($('.spoller.active'), function(index, val) {	$(this).next().show();});$('body').on('click','.spoller',function(event) {	if($(this).hasClass('mob') && !isMobile.any()){		return false;	}	if($(this).hasClass('closeall') && !$(this).hasClass('active')){		$.each($(this).closest('.spollers').find('.spoller'), function(index, val) {			$(this).removeClass('active');			$(this).next().slideUp(300);		});	}	$(this).toggleClass('active').next().slideToggle(300,function(index, val) {			if($(this).parent().find('.slick-slider').length>0){				$(this).parent().find('.slick-slider').slick('setPosition');			}	});	return false;});function scrolloptions(){		var scs=100;		var mss=50;		var bns=false;	if(isMobile.any()){		scs=10;		mss=1;		bns=true;	}	var opt={		cursorcolor:"#fff",		cursorwidth: "4px",		background: "",		autohidemode:true,		cursoropacitymax: 0.4,		bouncescroll:bns,		cursorborderradius: "0px",		scrollspeed:scs,		mousescrollstep:mss,		directionlockdeadzone:0,		cursorborder: "0px solid #fff",	};	return opt;}function scroll(){	$('.scroll-body').niceScroll('.scroll-list',scrolloptions());}if(navigator.appVersion.indexOf("Mac")!=-1){}else{	if($('.scroll-body').length>0){scroll();}}/*function scrollwhouse(){		var scs=100;		var mss=50;		var bns=false;	if(isMobile.any()){		scs=10;		mss=1;		bns=true;	}	var opt={		cursorcolor:"#afafaf",		cursorwidth: "5px",		background: "",		autohidemode:false,		railalign: 'left',		cursoropacitymax: 1,		bouncescroll:bns,		cursorborderradius: "0px",		scrollspeed:scs,		mousescrollstep:mss,		directionlockdeadzone:0,		cursorborder: "0px solid #fff",	};	return opt;}$('.whouse-content-body').niceScroll('.whouse-content-scroll',scrollwhouse());$('.whouse-content-body').scroll(function(event) {		var s=$(this).scrollTop();		var r=Math.abs($(this).outerHeight()-$('.whouse-content-scroll').outerHeight());		var p=s/r*100;	$('.whouse-content__shadow').css({opacity:1-1/100*p});});*/if($('.t,.tip').length>0){	tip();}function tip(){	$('.t,.tip').webuiPopover({		placement:'top',		trigger:'hover',		backdrop: false,		//selector:true,		animation:'fade',		dismissible: true,		padding:false,		//hideEmpty: true		onShow: function($element) {},		onHide: function($element) {},	}).on('show.webui.popover hide.webui.popover', function(e){		$(this).toggleClass('active');	});}$('.filter__item').click(function(event) {		var i=$(this).data('filter');	if (i==1){		$(".portfolio__block").show();	}else{		$(".portfolio__block").hide();		$(".portfolio__block.f__"+i).show();	}	$('.filter__item').removeClass("active");	$(this).addClass("active");	return false;});$(window).scroll(function(event) {	var s=0-$(this).scrollTop()/2;	$('.main-screen__bg').css('transform','translate3d(0, '+s+'px, 0)');});
