(function (global) {
  "use strict";

  var PARTIAL = 0.65;
  var app;

  function getApp() {
    if (!app) app = new global.Framework7({ el: document.getElementById("md") });
    return app;
  }

  global.DraftSheetPreview = {
    mount: function (sheetEl, options) {
      options = options || {};
      var onClose = options.onClose || function () {};
      var instance, opened = false, destroyed = false, inertState = [];
      var header, expand, closeButton, previousFocus;

      if (!sheetEl || !sheetEl.querySelector("#mdside")) throw new Error("Player sheet requires #mdside");
      sheetEl.classList.add("sheet-modal", "draft-preview-sheet");
      sheetEl.setAttribute("role", "dialog");
      sheetEl.setAttribute("aria-modal", "true");
      sheetEl.setAttribute("aria-label", "Player details and draft advice");

      header = document.createElement("div");
      header.className = "draft-preview-header";
      header.innerHTML = '<div class="draft-preview-grip" aria-hidden="true"><span></span></div>';
      expand = document.createElement("button");
      expand.type = "button";
      expand.className = "ghostbtn draft-preview-expand f7-preview-expand";
      expand.textContent = "Expand";
      expand.setAttribute("aria-expanded", "false");
      closeButton = sheetEl.querySelector(".mobile-sheet-close");
      if (!closeButton) {
        closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "ghostbtn mobile-sheet-close";
        closeButton.textContent = "Close";
      }
      closeButton.textContent = "Close";
      closeButton.setAttribute("aria-label", "Close player details");
      header.append(expand, closeButton);
      sheetEl.prepend(header);

      function setInert(value) {
        var node = sheetEl;
        while (node && node !== document.body) {
          var parent = node.parentElement;
          if (!parent) break;
          Array.prototype.forEach.call(parent.children, function (sibling) {
            if (sibling !== node && sibling !== instance?.backdropEl) {
              if (value) {
                inertState.push([sibling, sibling.inert]);
                sibling.inert = true;
              }
            }
          });
          node = parent;
        }
        if (!value) {
          inertState.forEach(function (entry) { entry[0].inert = entry[1]; });
          inertState = [];
        }
      }

      function focusables() {
        return Array.prototype.slice.call(sheetEl.querySelectorAll(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )).filter(function (el) { return el.getClientRects().length > 0 && !el.closest("[hidden]") && el.getAttribute("aria-hidden") !== "true"; });
      }

      function keydown(event) {
        if (!opened) return;
        if (event.key === "Escape") {
          event.preventDefault();
          instance.close();
        } else if (event.key === "Tab") {
          var items = focusables(), first = items[0], last = items[items.length - 1];
          if (!first) { event.preventDefault(); sheetEl.focus(); }
          else if (event.shiftKey && (document.activeElement === first || !sheetEl.contains(document.activeElement))) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && (document.activeElement === last || !sheetEl.contains(document.activeElement))) {
            event.preventDefault(); first.focus();
          }
        }
      }

      function didClose() {
        if (!opened || destroyed) return;
        opened = false;
        sheetEl.removeAttribute("open");
        document.removeEventListener("keydown", keydown, true);
        setInert(false);
        onClose();
        if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
      }

      function syncBreakpoint(sheet, breakpoint) {
        var full = breakpoint >= 0.95;
        expand.setAttribute("aria-expanded", full ? "true" : "false");
        expand.textContent = full ? "Less" : "Expand";
      }

      instance = getApp().sheet.create({
        el: sheetEl,
        containerEl: document.getElementById("md"),
        backdrop: true,
        backdropUnique: true,
        closeByBackdropClick: true,
        closeOnEscape: false,
        swipeToClose: true,
        swipeHandler: header,
        breakpoints: [PARTIAL],
        on: { closed: didClose, breakpoint: syncBreakpoint }
      });

      expand.addEventListener("click", function () {
        var full = expand.getAttribute("aria-expanded") === "true";
        instance.setBreakpoint(full ? PARTIAL : 1);
        expand.setAttribute("aria-expanded", full ? "false" : "true");
        expand.textContent = full ? "Expand" : "Less";
      });
      closeButton.addEventListener("click", function () { instance.close(); });

      return {
        open: function () {
          if (destroyed || opened) return;
          opened = true;
          sheetEl.setAttribute("open", "");
          previousFocus = document.activeElement;
          setInert(true);
          document.addEventListener("keydown", keydown, true);
          instance.open();
          instance.setBreakpoint(PARTIAL);
          closeButton.focus({ preventScroll: true });
        },
        close: function () { if (instance && instance.opened) instance.close(); },
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          document.removeEventListener("keydown", keydown, true);
          opened = false;
          setInert(false);
          instance.close(false);
          instance.destroy();
          sheetEl.remove();
        }
      };
    }
  };
})(window);
