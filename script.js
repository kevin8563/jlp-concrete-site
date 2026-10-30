/* ==========================================================
   script.js  -  all behavior for the JLP Concrete website

   1. Fade-in on scroll
   2. Header that hides on scroll down / returns on scroll up
   3. Partner row arrows (always stop at the start of a box)
   4. Portfolio photo sliders (the < and > on each card)
   5. Photo viewer / lightbox with zoom
   (The contact form is handled by Formspree's script in index.html)

   Smooth scrolling for menu links is handled in style.css
   (scroll-behavior: smooth), so no script is needed for it.
   ========================================================== */
(function () {
  "use strict";

  // True if the visitor asked their device for less motion
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----------------------------------------------------------
     1. FADE-IN ON SCROLL
     Sections below the screen start slightly low and transparent
     (.reveal), then fade up once (.is-visible) when scrolled into view.
     ---------------------------------------------------------- */
  if ("IntersectionObserver" in window && !reduceMotion) {
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealer.unobserve(entry.target);          // animate only once
        }
      });
    }, { threshold: 0.12 });

    document.querySelectorAll("main > section:not(.hero)").forEach(function (section) {
      // Sections already on screen at page load are left alone
      if (section.getBoundingClientRect().top < window.innerHeight * 0.85) { return; }
      section.classList.add("reveal");
      revealer.observe(section);
    });
  }

  /* ----------------------------------------------------------
     2. HEADER AUTO-HIDE
     Scroll down: header slides up out of view. Scroll up even
     slightly: it slides back. (The slide itself is CSS.)
     ---------------------------------------------------------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var lastY = window.pageYOffset;
    var waiting = false;
    var MIN_MOVE = 4;                                // ignore tiny movements

    function updateHeader() {
      var y = Math.max(window.pageYOffset, 0);
      if (y <= header.offsetHeight) {
        header.classList.remove("is-hidden");        // always visible at the top
      } else if (y > lastY + MIN_MOVE) {
        header.classList.add("is-hidden");           // scrolling down
      } else if (y < lastY - MIN_MOVE) {
        header.classList.remove("is-hidden");        // scrolling up
      }
      if (Math.abs(y - lastY) > MIN_MOVE) { lastY = y; }
      waiting = false;
    }
    window.addEventListener("scroll", function () {
      if (!waiting) { waiting = true; window.requestAnimationFrame(updateHeader); }
    }, { passive: true });
    header.addEventListener("focusin", function () { header.classList.remove("is-hidden"); });
  }

  /* ----------------------------------------------------------
     3. PARTNER ROW ARROWS
     The row itself snaps to the start of a company box after any
     swipe (CSS scroll-snap). The arrows jump to the next or
     previous box start, never to the middle of a name.
     ---------------------------------------------------------- */
  var track = document.getElementById("partnerTrack");
  if (track) {
    document.querySelectorAll("[data-partner-dir]").forEach(function (button) {
      button.addEventListener("click", function () {
        var direction = Number(button.dataset.partnerDir);        // -1 = left, 1 = right
        var pad = parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
        var rowLeft = track.getBoundingClientRect().left;
        var now = track.scrollLeft;

        // Where each box begins, measured inside the scrolling row
        var starts = Array.prototype.map.call(track.children, function (box) {
          return box.getBoundingClientRect().left - rowLeft + now - pad;
        });

        var target = now;
        if (direction > 0) {
          for (var i = 0; i < starts.length; i++) {
            if (starts[i] > now + 4) { target = starts[i]; break; }
          }
        } else {
          for (var k = starts.length - 1; k >= 0; k--) {
            if (starts[k] < now - 4) { target = starts[k]; break; }
          }
        }
        track.scrollTo({ left: target, behavior: reduceMotion ? "auto" : "smooth" });
      });
    });
  }

  /* ----------------------------------------------------------
     4. PORTFOLIO PHOTO SLIDERS
     Each card's < and > buttons slide between that card's images.
     Add more <div class="slide"> blocks to a card and it still works.
     ---------------------------------------------------------- */
  document.querySelectorAll(".slider").forEach(function (slider) {
    var strip = slider.querySelector(".slides");
    var total = strip.children.length;
    var index = 0;

    function go(direction) {
      index = (index + direction + total) % total;               // wraps around
      strip.style.transform = "translateX(-" + (index * 100) + "%)";
    }
    slider.querySelector(".prev").addEventListener("click", function () { go(-1); });
    slider.querySelector(".next").addEventListener("click", function () { go(1); });
  });

  /* ----------------------------------------------------------
     5. PHOTO VIEWER (LIGHTBOX)
     Click or tap any portfolio photo to open it full-screen.
       Next / Previous: arrow buttons, keyboard arrows, or swipe
       Zoom: tap or click the photo, mouse wheel, + and - buttons
             or keys, or pinch on a phone
       Move around while zoomed: drag
       Close: X button, Esc key, or tap the dark background
     The photos shown are every ".photo" image inside the
     portfolio cards, in page order.
     ---------------------------------------------------------- */
  var box = document.getElementById("lightbox");
  var photos = Array.prototype.slice.call(document.querySelectorAll(".slide .photo"));

  if (box && photos.length) {
    var stage = box.querySelector(".lb-stage");
    var bigImg = box.querySelector(".lb-img");
    var caption = box.querySelector(".lb-caption");
    var counter = box.querySelector(".lb-count");
    var closeButton = box.querySelector(".lb-close");

    var MAX_ZOOM = 4;          // 4 = four times normal size
    var TAP_ZOOM = 2.5;        // zoom level when you tap or click the photo
    var current = 0;           // which photo is showing
    var opener = null;         // the photo that opened the viewer (focus returns to it)
    var scale = 1, panX = 0, panY = 0;

    function clamp(value, low, high) { return Math.min(high, Math.max(low, value)); }

    function render() {
      bigImg.style.transform = "translate(" + panX + "px," + panY + "px) scale(" + scale + ")";
      box.classList.toggle("is-zoomed", scale > 1);
    }

    // Keeps the zoomed photo from being dragged completely off screen
    function limitPan() {
      var maxX = Math.max(0, (bigImg.clientWidth * scale - stage.clientWidth) / 2);
      var maxY = Math.max(0, (bigImg.clientHeight * scale - stage.clientHeight) / 2);
      panX = clamp(panX, -maxX, maxX);
      panY = clamp(panY, -maxY, maxY);
    }

    // Zoom to newScale, keeping the point (cx, cy) under the finger or cursor.
    // cx and cy are measured from the center of the screen.
    function zoomAt(newScale, cx, cy) {
      newScale = clamp(newScale, 1, MAX_ZOOM);
      var ratio = newScale / scale;
      panX = cx - (cx - panX) * ratio;
      panY = cy - (cy - panY) * ratio;
      scale = newScale;
      if (scale === 1) { panX = 0; panY = 0; }
      limitPan();
      render();
    }

    function fromCenter(e) {
      var r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
    }

    function show(index) {
      current = (index + photos.length) % photos.length;         // wraps around
      var photo = photos[current];
      bigImg.src = photo.currentSrc || photo.src;
      bigImg.alt = photo.alt;
      caption.textContent = photo.alt;
      counter.textContent = (current + 1) + " / " + photos.length;
      scale = 1; panX = 0; panY = 0; render();
      // Quietly load the neighbors so Next and Previous feel instant
      [1, -1].forEach(function (step) {
        new Image().src = photos[(current + step + photos.length) % photos.length].src;
      });
    }

    function openViewer(index) {
      opener = document.activeElement;
      box.hidden = false;
      document.body.classList.add("lb-open");
      show(index);
      closeButton.focus();
    }

    function closeViewer() {
      box.hidden = true;
      document.body.classList.remove("lb-open");
      if (opener) { opener.focus(); }
    }

    // Make every portfolio photo clickable (and keyboard-friendly)
    photos.forEach(function (photo, index) {
      photo.tabIndex = 0;
      photo.setAttribute("role", "button");
      photo.addEventListener("click", function () { openViewer(index); });
      photo.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openViewer(index); }
      });
    });

    // Buttons
    box.querySelector(".lb-prev").addEventListener("click", function () { show(current - 1); });
    box.querySelector(".lb-next").addEventListener("click", function () { show(current + 1); });
    closeButton.addEventListener("click", closeViewer);
    box.querySelector(".lb-zoom-in").addEventListener("click", function () { zoomAt(scale * 1.5, 0, 0); });
    box.querySelector(".lb-zoom-out").addEventListener("click", function () { zoomAt(scale / 1.5, 0, 0); });

    // Mouse wheel (and trackpad pinch) zoom
    stage.addEventListener("wheel", function (e) {
      e.preventDefault();
      var c = fromCenter(e);
      zoomAt(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), c.x, c.y);
    }, { passive: false });

    // Mouse, finger and pen input all arrive as "pointer" events
    var pointers = {};         // fingers or mouse currently down
    var gesture = null;        // what the current touch is doing

    stage.addEventListener("pointerdown", function (e) {
      stage.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      box.classList.add("is-dragging");
      var ids = Object.keys(pointers);
      if (ids.length === 1) {
        gesture = { mode: "one", startX: e.clientX, startY: e.clientY, moved: false, onPhoto: e.target === bigImg };
      } else if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        gesture = { mode: "pinch", startDistance: Math.hypot(a.x - b.x, a.y - b.y), startScale: scale };
      }
    });

    stage.addEventListener("pointermove", function (e) {
      if (!pointers[e.pointerId] || !gesture) { return; }
      var before = pointers[e.pointerId];
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);

      if (gesture.mode === "pinch" && ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var r = stage.getBoundingClientRect();
        zoomAt(gesture.startScale * Math.hypot(a.x - b.x, a.y - b.y) / gesture.startDistance,
               (a.x + b.x) / 2 - r.left - r.width / 2,
               (a.y + b.y) / 2 - r.top - r.height / 2);
      } else if (gesture.mode === "one") {
        if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 8) { gesture.moved = true; }
        if (scale > 1) {                                         // drag to look around
          panX += e.clientX - before.x;
          panY += e.clientY - before.y;
          limitPan();
          render();
        }
      }
    });

    function endPointer(e) {
      if (!pointers[e.pointerId]) { return; }
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length > 0) { gesture = null; return; }   // a pinch is ending
      box.classList.remove("is-dragging");

      var g = gesture;
      gesture = null;
      if (!g || g.mode !== "one" || e.type === "pointercancel") { return; }

      var dx = e.clientX - g.startX, dy = e.clientY - g.startY;
      if (!g.moved) {
        // A tap or click: on the photo it zooms, on the dark background it closes
        if (g.onPhoto) {
          var c = fromCenter(e);
          zoomAt(scale > 1 ? 1 : TAP_ZOOM, c.x, c.y);
        } else {
          closeViewer();
        }
      } else if (scale === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        show(current + (dx < 0 ? 1 : -1));                       // swipe left = next photo
      }
    }
    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", endPointer);

    // Keyboard: Esc closes, arrows browse, + and - zoom, 0 resets, Tab stays inside
    document.addEventListener("keydown", function (e) {
      if (box.hidden) { return; }
      if (e.key === "Escape") { closeViewer(); }
      else if (e.key === "ArrowRight") { show(current + 1); }
      else if (e.key === "ArrowLeft") { show(current - 1); }
      else if (e.key === "+" || e.key === "=") { zoomAt(scale * 1.5, 0, 0); }
      else if (e.key === "-") { zoomAt(scale / 1.5, 0, 0); }
      else if (e.key === "0") { zoomAt(1, 0, 0); }
      else if (e.key === "Tab") {
        var buttons = box.querySelectorAll("button");
        var first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }
})();
