/*
 * This file is part of Privacy Ferret <https://www.eff.org/privacybadger>
 * Updated from the current WebExtension fingerprinting detector.
 *
 * Content script (Add-on SDK). Communicates with background via self.port.emit('fpReport').
 */

(function () {

  // Don't inject into non-HTML documents (such as XML documents)
  // but do inject into XHTML documents.
  try {
    if (document instanceof HTMLDocument === false && (
      document instanceof XMLDocument === false ||
      document.createElement('div') instanceof HTMLDivElement === false
    )) {
      return;
    }
  } catch (e) {
    // If we can't reliably detect document type, be conservative.
    return;
  }

  function getPageScript(event_id) {
    // code below is not a content script: no Firefox APIs ////////////////////
    return "(" + function (EVENT_ID, DOCUMENT, dispatchEvent, CUSTOM_EVENT, ERROR, DATE, setTimeout, OBJECT, FUNCTION, UNDEFINED) {

      function hasOwn(obj, prop) {
        return OBJECT.prototype.hasOwnProperty.call(obj, prop);
      }

      const V8_STACK_TRACE_API = !!(ERROR &&
        ERROR.captureStackTrace &&
        hasOwn(ERROR, "stackTraceLimit"));

      if (V8_STACK_TRACE_API) {
        ERROR.stackTraceLimit = Infinity; // collect all frames
      }

      function apply(obj, context, args) {
        return FUNCTION.prototype.apply.call(obj, context, args);
      }

      // adapted from Underscore v1.6.0
      function debounce(func, wait, immediate) {
        let timeout, args, context, timestamp, result;

        let later = function () {
          let last = DATE.now() - timestamp;
          if (last < wait) {
            timeout = setTimeout(later, wait - last);
          } else {
            timeout = null;
            if (!immediate) {
              result = apply(func, context, args);
              context = args = null;
            }
          }
        };

        return function () {
          context = this; // eslint-disable-line consistent-this
          args = arguments;
          timestamp = DATE.now();
          let callNow = immediate && !timeout;
          if (!timeout) {
            timeout = setTimeout(later, wait);
          }
          if (callNow) {
            result = apply(func, context, args);
            context = args = null;
          }

          return result;
        };
      }

      // messages the injected script
      let send = (function () {
        let messages = [];

        // debounce sending queued messages
        let _send = debounce(function () {
          dispatchEvent.call(DOCUMENT, new CUSTOM_EVENT(EVENT_ID, {
            detail: messages
          }));

          // clear the queue
          messages = [];
        }, 100);

        return function (msg) {
          // queue the message
          messages.push(msg);

          _send();
        };
      }());

      /**
       * Gets the stack trace by throwing and catching an exception (Firefox).
       * @returns {Array} stack trace lines
       */
      function getStackTraceFirefox() {
        let stack;
        try {
          throw new ERROR();
        } catch (err) {
          stack = err.stack;
        }
        return (stack || "").split('\n');
      }

      /**
       * Gets the stack trace using the V8 stack trace API.
       * @returns {*} Returns structured stack trace
       */
      function getStackTrace() {
        let err = {},
          origFormatter,
          stack;

        origFormatter = ERROR.prepareStackTrace;
        ERROR.prepareStackTrace = function (_, structuredStackTrace) {
          return structuredStackTrace;
        };

        ERROR.captureStackTrace(err, getStackTrace);
        stack = err.stack;

        ERROR.prepareStackTrace = origFormatter;
        return stack;
      }

      function stripLineAndColumnNumbers(script_url) {
        return script_url.replace(/:\d+:\d+$/, '');
      }

      // from https://github.com/csnover/TraceKit
      const geckoCallSiteRe = /^\s*(.*?)(?:\((.*?)\))?@?((?:file|https?|chrome):.*?):(\d+)(?::(\d+))?\s*$/i;

      function getOriginatingScriptUrl() {
        let script_url = "";

        if (V8_STACK_TRACE_API) {
          let trace = getStackTrace();
          // trace[0] is this function
          // trace[1] is our wrapper
          // trace[2] is the trapped function call
          let callSite = trace && trace[3];
          if (callSite && callSite.getFileName) {
            script_url = callSite.getFileName() || "";
          }
        } else {
          let trace = getStackTraceFirefox();
          if (trace.length >= 4) {
            // this script is at 0, 1 and 2
            let callSite = trace[3] || "";
            let scriptUrlMatches = callSite.match(geckoCallSiteRe);
            script_url = (scriptUrlMatches && scriptUrlMatches[3]) || "";
          }
        }

        if (!script_url) return "";
        return stripLineAndColumnNumbers(script_url);
      }

      function trapInstanceMethod(item) {
        const is_canvas_write = (
          item.propName == 'fillText' || item.propName == 'strokeText'
        );

        item.obj[item.propName] = (function (orig) {
          return function () {
            // Don't report reads without prior writes.
            if (!is_canvas_write) {
              // For reads, report extra metadata.
            }

            // report
            try {
              send({
                obj: item.objName,
                prop: item.propName,
                scriptUrl: getOriginatingScriptUrl(),
                extra: item.extra ? apply(item.extra, this, arguments) : {}
              });
            } catch (e) {}

            return apply(orig, this, arguments);
          };
        }(item.obj[item.propName]));
      }

      // set up method traps
      let methods = [];
      let canvas2d = null;
      try {
        canvas2d = CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
      } catch (e) {}

      if (canvas2d) {
        const canvas_methods = ['fillText', 'strokeText', 'getImageData'];

        for (let method of canvas_methods) {
          let item = {
            objName: 'CanvasRenderingContext2D.prototype',
            propName: method,
            obj: canvas2d,
            extra: function () {
              return { canvas: true };
            }
          };

          if (method == 'getImageData') {
            item.extra = function () {
              let args = arguments,
                width = args[2],
                height = args[3];

              // "this" is a CanvasRenderingContext2D object
              if (width === UNDEFINED) {
                width = this.canvas.width;
              }
              if (height === UNDEFINED) {
                height = this.canvas.height;
              }

              return { canvas: true, width: width, height: height };
            };
          }

          methods.push(item);
        }
      }

      try {
        methods.push({
          objName: 'HTMLCanvasElement.prototype',
          propName: 'toDataURL',
          obj: HTMLCanvasElement.prototype,
          extra: function () {
            return { canvas: true, width: this.width, height: this.height };
          }
        });
      } catch (e) {}

      for (let method of methods) {
        try { trapInstanceMethod(method); } catch (e) {}
      }

    // save locally to keep from getting overwritten by site code
    } + "(" + event_id + ", document, document.dispatchEvent, CustomEvent, Error, Date, setTimeout, Object, Function));";

    // code above is not a content script: no Firefox APIs ////////////////////
  }

  function insertScript(text) {
    var parent = document.documentElement;
    if (!parent) { return; }
    var script = document.createElement('script');
    script.text = text;
    script.async = false;
    parent.insertBefore(script, parent.firstChild);
    parent.removeChild(script);
  }

  const event_id = Math.random();

  document.addEventListener(event_id, function (e) {
    try {
      self.port.emit('fpReport', e.detail);
    } catch (err) {}
  });

  insertScript(getPageScript(event_id));

}());
