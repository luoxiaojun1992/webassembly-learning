// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}

var ENVIRONMENT_IS_PTHREAD;
if (!ENVIRONMENT_IS_PTHREAD) ENVIRONMENT_IS_PTHREAD = false; // ENVIRONMENT_IS_PTHREAD=true will have been preset in pthread-main.js. Make it false in the main runtime thread.
var PthreadWorkerInit; // Collects together variables that are needed at initialization time for the web workers that host pthreads.
if (!ENVIRONMENT_IS_PTHREAD) PthreadWorkerInit = {};
var currentScriptUrl = ENVIRONMENT_IS_WORKER ? undefined : document.currentScript.src;

if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    if (!nodeFS) nodeFS = require('fs');
    if (!nodePath) nodePath = require('path');
    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  Module['load'] = function load(f) {
    globalEval(read(f));
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function shell_read() { throw 'no read() available' };
  }

  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status, toThrow) {
      quit(status);
    }
  }

}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function shell_read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function readBinary(url) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.responseType = 'arraybuffer';
      xhr.send(null);
      return xhr.response;
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function shell_print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function shell_printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (ENVIRONMENT_IS_WORKER) {
    Module['load'] = importScripts;
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}

function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}
if (!Module['quit']) {
  Module['quit'] = function(status, toThrow) {
    throw toThrow;
  }
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
    return value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      assert(args.length == sig.length-1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
    } else {
      assert(sig.length == 1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      // optimize away arguments usage in common cases
      if (sig.length === 1) {
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func);
        };
      } else if (sig.length === 2) {
        sigCache[func] = function dynCall_wrapper(arg) {
          return Runtime.dynCall(sig, func, [arg]);
        };
      } else {
        // general case
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func, Array.prototype.slice.call(arguments));
        };
      }
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16);(assert((((STACKTOP|0) < (STACK_MAX|0))|0))|0); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + (assert(!staticSealed),size))|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { assert(DYNAMICTOP_PTR);var ret = HEAP32[DYNAMICTOP_PTR>>2];var end = (((ret + size + 15)|0) & -16);HEAP32[DYNAMICTOP_PTR>>2] = end;if (end >= TOTAL_MEMORY) {var success = enlargeMemory();if (!success) {HEAP32[DYNAMICTOP_PTR>>2] = ret;return 0;}}return ret;},
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}



Module["Runtime"] = Runtime;



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  if (!func) {
    try { func = eval('_' + ident); } catch(e) {}
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}

var cwrap, ccall;
(function(){
  var JSfuncs = {
    // Helpers for cwrap -- it can't refer to Runtime directly because it might
    // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
    // out what the minified function name is.
    'stackSave': function() {
      Runtime.stackSave()
    },
    'stackRestore': function() {
      Runtime.stackRestore()
    },
    // type conversion from js to c
    'arrayToC' : function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    'stringToC' : function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        var len = (str.length << 2) + 1;
        ret = Runtime.stackAlloc(len);
        stringToUTF8(str, ret, len);
      }
      return ret;
    }
  };
  // For fast lookup of conversion functions
  var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

  // C calling interface.
  ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    assert(returnType !== 'array', 'Return type should not be "array".');
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if ((!opts || !opts.async) && typeof EmterpreterAsync === 'object') {
      assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling ccall');
    }
    if (opts && opts.async) assert(!returnType, 'async ccalls cannot return values');
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) {
      if (opts && opts.async) {
        EmterpreterAsync.asyncFinalizers.push(function() {
          Runtime.stackRestore(stack);
        });
        return;
      }
      Runtime.stackRestore(stack);
    }
    return ret;
  }

  var sourceRegex = /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    // Match the body and the return value of a javascript function source
    var parsed = jsfunc.toString().match(sourceRegex).slice(1);
    return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
  }

  // sources of useful functions. we create this lazily as it can trigger a source decompression on this entire file
  var JSsource = null;
  function ensureJSsource() {
    if (!JSsource) {
      JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }
    }
  }

  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every(function(type){ return type === 'number'});
    var numericRet = (returnType !== 'string');
    if ( numericRet && numericArgs) {
      return cfunc;
    }
    // Creation of the arguments list (["$1","$2",...,"$nargs"])
    var argNames = argTypes.map(function(x,i){return '$'+i});
    var funcstr = "(function(" + argNames.join(',') + ") {";
    var nargs = argTypes.length;
    if (!numericArgs) {
      // Generate the code needed to convert the arguments from javascript
      // values to pointers
      ensureJSsource();
      funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i], type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC']; // [code, return]
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=(' + convertCode.returnValue + ');';
      }
    }

    // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
    var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
    // Call the function
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) { // Return type can only by 'string' or 'number'
      // Convert the result to a string
      var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    funcstr += "if (typeof EmterpreterAsync === 'object') { assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling cwrap') }";
    if (!numericArgs) {
      // If we had a stack, restore it
      ensureJSsource();
      funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}
Module["setValue"] = setValue;

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}
Module["getValue"] = getValue;

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}
Module["allocate"] = allocate;

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if (!runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}
Module["getMemory"] = getMemory;

/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}
Module["Pointer_stringify"] = Pointer_stringify;

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}
Module["AsciiToString"] = AsciiToString;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}
Module["stringToAscii"] = stringToAscii;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}
Module["UTF8ArrayToString"] = UTF8ArrayToString;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}
Module["UTF8ToString"] = UTF8ToString;

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}
Module["stringToUTF8Array"] = stringToUTF8Array;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}
Module["stringToUTF8"] = stringToUTF8;

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}
Module["lengthBytesUTF8"] = lengthBytesUTF8;

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var __cxa_demangle_func = Module['___cxa_demangle'] || Module['__cxa_demangle'];
  if (__cxa_demangle_func) {
    try {
      var s =
        func.substr(1);
      var len = lengthBytesUTF8(s)+1;
      var buf = _malloc(len);
      stringToUTF8(s, buf, len);
      var status = _malloc(4);
      var ret = __cxa_demangle_func(buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed
    } catch(e) {
      // ignore problems here
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
    // failure when using libcxxabi, don't demangle
    return func;
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}
Module["stackTrace"] = stackTrace;

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

if (!ENVIRONMENT_IS_PTHREAD) { // Pthreads have already initialized these variables in src/pthread-main.js, where they were passed to the thread worker at startup time
  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;
}

if (ENVIRONMENT_IS_PTHREAD) {
  staticSealed = true; // The static memory area has been initialized already in the main thread, pthreads skip this.
}

// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - Module['asm'].stackSave() + allocSize) + ' bytes available!');
}

function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abort('Cannot enlarge memory arrays, since compiling with pthreads support enabled (-s USE_PTHREADS=1).');
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');


if (typeof SharedArrayBuffer !== 'undefined') {
  if (!ENVIRONMENT_IS_PTHREAD) buffer = new SharedArrayBuffer(TOTAL_MEMORY);
  // Currently SharedArrayBuffer does not have a slice() operation, so polyfill it in.
  // Adapted from https://github.com/ttaubert/node-arraybuffer-slice, (c) 2014 Tim Taubert <tim@timtaubert.de>
  // arraybuffer-slice may be freely distributed under the MIT license.
  (function (undefined) {
    "use strict";
    function clamp(val, length) {
      val = (val|0) || 0;
      if (val < 0) return Math.max(val + length, 0);
      return Math.min(val, length);
    }
    if (typeof SharedArrayBuffer !== 'undefined' && !SharedArrayBuffer.prototype.slice) {
      SharedArrayBuffer.prototype.slice = function (from, to) {
        var length = this.byteLength;
        var begin = clamp(from, length);
        var end = length;
        if (to !== undefined) end = clamp(to, length);
        if (begin > end) return new ArrayBuffer(0);
        var num = end - begin;
        var target = new ArrayBuffer(num);
        var targetArray = new Uint8Array(target);
        var sourceArray = new Uint8Array(this, begin, num);
        targetArray.set(sourceArray);
        return target;
      };
    }
  })();
} else {
  if (!ENVIRONMENT_IS_PTHREAD) buffer = new ArrayBuffer(TOTAL_MEMORY);
}
updateGlobalBufferViews();

if (typeof Atomics === 'undefined') {
  // Polyfill singlethreaded atomics ops from http://lars-t-hansen.github.io/ecmascript_sharedmem/shmem.html#Atomics.add
  // No thread-safety needed since we don't have multithreading support.
  Atomics = {};
  Atomics['add'] = function(t, i, v) { var w = t[i]; t[i] += v; return w; }
  Atomics['and'] = function(t, i, v) { var w = t[i]; t[i] &= v; return w; }
  Atomics['compareExchange'] = function(t, i, e, r) { var w = t[i]; if (w == e) t[i] = r; return w; }
  Atomics['exchange'] = function(t, i, v) { var w = t[i]; t[i] = v; return w; }
  Atomics['wait'] = function(t, i, v, o) { if (t[i] != v) return 'not-equal'; else return 'timed-out'; }
  Atomics['wake'] = function(t, i, c) { return 0; }
  Atomics['wakeOrRequeue'] = function(t, i1, c, i2, v) { return 0; }
  Atomics['isLockFree'] = function(s) { return true; }
  Atomics['load'] = function(t, i) { return t[i]; }
  Atomics['or'] = function(t, i, v) { var w = t[i]; t[i] |= v; return w; }
  Atomics['store'] = function(t, i, v) { t[i] = v; return v; }
  Atomics['sub'] = function(t, i, v) { var w = t[i]; t[i] -= v; return w; }
  Atomics['xor'] = function(t, i, v) { var w = t[i]; t[i] ^= v; return w; }
}


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
if (!ENVIRONMENT_IS_PTHREAD) {
  HEAP32[0] = 0x63736d65; /* 'emsc' */
} else {
  if (HEAP32[0] !== 0x63736d65) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;

if (ENVIRONMENT_IS_PTHREAD) runtimeInitialized = true; // The runtime is hosted in the main thread, and bits shared to pthreads via SharedArrayBuffer. No need to init again in pthread.

function preRun() {
  if (ENVIRONMENT_IS_PTHREAD) return; // PThreads reuse the runtime from the main thread.
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (ENVIRONMENT_IS_PTHREAD) return; // PThreads reuse the runtime from the main thread.
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  if (ENVIRONMENT_IS_PTHREAD) return; // PThreads reuse the runtime from the main thread.
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  if (ENVIRONMENT_IS_PTHREAD) return; // PThreads reuse the runtime from the main thread.
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  if (ENVIRONMENT_IS_PTHREAD) return; // PThreads reuse the runtime from the main thread.
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
Module["addOnPreRun"] = addOnPreRun;

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
Module["addOnInit"] = addOnInit;

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}
Module["addOnPreMain"] = addOnPreMain;

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}
Module["addOnExit"] = addOnExit;

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
Module["addOnPostRun"] = addOnPostRun;

// Tools

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
Module["intArrayFromString"] = intArrayFromString;

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}
Module["intArrayToString"] = intArrayToString;

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  Runtime.warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}
Module["writeStringToMemory"] = writeStringToMemory;

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}
Module["writeArrayToMemory"] = writeArrayToMemory;

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}

// Atomics.exchange is not yet implemented in the spec, so polyfill that in via compareExchange in the meanwhile.
// TODO: Keep an eye out for the opportunity to remove this once Atomics.exchange is available.
if (typeof Atomics !== 'undefined' && !Atomics['exchange']) {
  Atomics['exchange'] = function(heap, index, val) {
    var oldVal, oldVal2;
    do {
      oldVal = Atomics['load'](heap, index);
      oldVal2 = Atomics['compareExchange'](heap, index, oldVal, val);
    } while(oldVal != oldVal2);
    return oldVal;
  }
}

// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];


if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

if (!Math['trunc']) Math['trunc'] = function(x) {
  return x < 0 ? Math.ceil(x) : Math.floor(x);
};
Math.trunc = Math['trunc'];

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  // We should never get here in pthreads (could no-op this out if called in pthreads, but that might indicate a bug in caller side,
  // so good to be very explicit)
  assert(!ENVIRONMENT_IS_PTHREAD);
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}
Module["addRunDependency"] = addRunDependency;

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}
Module["removeRunDependency"] = removeRunDependency;

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;






// === Body ===

var ASM_CONSTS = [function($0) { { console.log('Queued fetch to fetch-worker to process. There are now ' + $0 + ' operations in the queue.') } },
 function($0) { { Module['printErr']('emscripten_fetch("' + Pointer_stringify($0) + '") failed! Synchronous blocking XHRs and IndexedDB operations are not supported on the main browser thread. Try dropping the EMSCRIPTEN_FETCH_SYNCHRONOUS flag, or run with the linker flag --proxy-to-worker to decouple main C runtime thread from the main browser thread.') } },
 function() { { console.log('fetch: emscripten_fetch_wait..') } },
 function() { { console.log('fetch: emscripten_fetch_wait done..') } },
 function() { postMessage({ cmd: 'processQueuedMainThreadWork' }) }];

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}

function _emscripten_asm_const_v(code) {
  return ASM_CONSTS[code]();
}



STATIC_BASE = Runtime.GLOBAL_BASE;

STATICTOP = STATIC_BASE + 9760;
/* global initializers */ if (!ENVIRONMENT_IS_PTHREAD) __ATINIT__.push({ func: function() { __GLOBAL__sub_I_fetch_cpp() } }, { func: function() { __GLOBAL__sub_I_bind_cpp() } }, { func: function() { ___emscripten_pthread_data_constructor() } });


if (!ENVIRONMENT_IS_PTHREAD) {
/* memory initializer */ allocate([140,2,0,0,180,6,0,0,140,2,0,0,211,6,0,0,140,2,0,0,242,6,0,0,140,2,0,0,17,7,0,0,140,2,0,0,48,7,0,0,140,2,0,0,79,7,0,0,140,2,0,0,110,7,0,0,140,2,0,0,141,7,0,0,140,2,0,0,172,7,0,0,140,2,0,0,203,7,0,0,140,2,0,0,234,7,0,0,140,2,0,0,9,8,0,0,140,2,0,0,40,8,0,0,248,2,0,0,59,8,0,0,0,0,0,0,1,0,0,0,136,0,0,0,0,0,0,0,140,2,0,0,122,8,0,0,248,2,0,0,160,8,0,0,0,0,0,0,1,0,0,0,136,0,0,0,0,0,0,0,248,2,0,0,223,8,0,0,0,0,0,0,1,0,0,0,136,0,0,0,0,0,0,0,180,2,0,0,227,22,0,0,208,0,0,0,0,0,0,0,180,2,0,0,144,22,0,0,224,0,0,0,0,0,0,0,140,2,0,0,177,22,0,0,180,2,0,0,190,22,0,0,192,0,0,0,0,0,0,0,180,2,0,0,5,23,0,0,208,0,0,0,0,0,0,0,220,2,0,0,45,23,0,0,220,2,0,0,47,23,0,0,220,2,0,0,49,23,0,0,220,2,0,0,51,23,0,0,220,2,0,0,53,23,0,0,220,2,0,0,55,23,0,0,220,2,0,0,57,23,0,0,220,2,0,0,59,23,0,0,220,2,0,0,61,23,0,0,220,2,0,0,63,23,0,0,220,2,0,0,65,23,0,0,220,2,0,0,67,23,0,0,220,2,0,0,69,23,0,0,180,2,0,0,71,23,0,0,192,0,0,0,0,0,0,0,1,0,0,0,136,1,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,3,0,0,0,30,34,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,136,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,192,0,0,0,5,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,11,0,0,0,12,0,0,0,0,0,0,0,232,0,0,0,5,0,0,0,13,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,14,0,0,0,15,0,0,0,16,0,0,0,0,0,0,0,248,0,0,0,5,0,0,0,17,0,0,0,7,0,0,0,8,0,0,0,18,0,0,0,0,0,0,0,112,1,0,0,5,0,0,0,19,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,20,0,0,0,21,0,0,0,22,0,0,0,70,105,110,105,115,104,101,100,32,100,111,119,110,108,111,97,100,105,110,103,32,37,108,108,117,32,98,121,116,101,115,32,102,114,111,109,32,85,82,76,32,37,115,46,10,0,68,111,119,110,108,111,97,100,105,110,103,32,37,115,32,102,97,105,108,101,100,44,32,72,84,84,80,32,102,97,105,108,117,114,101,32,115,116,97,116,117,115,32,99,111,100,101,58,32,37,100,46,10,0,71,69,84,0,104,116,116,112,115,58,47,47,119,119,119,46,98,97,105,100,117,46,99,111,109,47,0,118,111,105,100,0,98,111,111,108,0,99,104,97,114,0,115,105,103,110,101,100,32,99,104,97,114,0,117,110,115,105,103,110,101,100,32,99,104,97,114,0,115,104,111,114,116,0,117,110,115,105,103,110,101,100,32,115,104,111,114,116,0,105,110,116,0,117,110,115,105,103,110,101,100,32,105,110,116,0,108,111,110,103,0,117,110,115,105,103,110,101,100,32,108,111,110,103,0,102,108,111,97,116,0,100,111,117,98,108,101,0,115,116,100,58,58,115,116,114,105,110,103,0,115,116,100,58,58,98,97,115,105,99,95,115,116,114,105,110,103,60,117,110,115,105,103,110,101,100,32,99,104,97,114,62,0,115,116,100,58,58,119,115,116,114,105,110,103,0,101,109,115,99,114,105,112,116,101,110,58,58,118,97,108,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,99,104,97,114,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,115,105,103,110,101,100,32,99,104,97,114,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,99,104,97,114,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,115,104,111,114,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,115,104,111,114,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,105,110,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,108,111,110,103,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,108,111,110,103,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,56,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,105,110,116,56,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,49,54,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,105,110,116,49,54,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,51,50,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,105,110,116,51,50,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,102,108,111,97,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,100,111,117,98,108,101,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,108,111,110,103,32,100,111,117,98,108,101,62,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,101,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,100,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,102,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,109,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,108,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,106,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,105,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,116,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,115,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,104,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,97,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,99,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,51,118,97,108,69,0,78,83,116,51,95,95,50,49,50,98,97,115,105,99,95,115,116,114,105,110,103,73,119,78,83,95,49,49,99,104,97,114,95,116,114,97,105,116,115,73,119,69,69,78,83,95,57,97,108,108,111,99,97,116,111,114,73,119,69,69,69,69,0,78,83,116,51,95,95,50,50,49,95,95,98,97,115,105,99,95,115,116,114,105,110,103,95,99,111,109,109,111,110,73,76,98,49,69,69,69,0,78,83,116,51,95,95,50,49,50,98,97,115,105,99,95,115,116,114,105,110,103,73,104,78,83,95,49,49,99,104,97,114,95,116,114,97,105,116,115,73,104,69,69,78,83,95,57,97,108,108,111,99,97,116,111,114,73,104,69,69,69,69,0,78,83,116,51,95,95,50,49,50,98,97,115,105,99,95,115,116,114,105,110,103,73,99,78,83,95,49,49,99,104,97,114,95,116,114,97,105,116,115,73,99,69,69,78,83,95,57,97,108,108,111,99,97,116,111,114,73,99,69,69,69,69,0,123,32,99,111,110,115,111,108,101,46,108,111,103,40,39,81,117,101,117,101,100,32,102,101,116,99,104,32,116,111,32,102,101,116,99,104,45,119,111,114,107,101,114,32,116,111,32,112,114,111,99,101,115,115,46,32,84,104,101,114,101,32,97,114,101,32,110,111,119,32,39,32,43,32,36,48,32,43,32,39,32,111,112,101,114,97,116,105,111,110,115,32,105,110,32,116,104,101,32,113,117,101,117,101,46,39,41,32,125,0,69,77,95,73,68,66,95,0,123,32,77,111,100,117,108,101,91,39,112,114,105,110,116,69,114,114,39,93,40,39,101,109,115,99,114,105,112,116,101,110,95,102,101,116,99,104,40,34,39,32,43,32,80,111,105,110,116,101,114,95,115,116,114,105,110,103,105,102,121,40,36,48,41,32,43,32,39,34,41,32,102,97,105,108,101,100,33,32,83,121,110,99,104,114,111,110,111,117,115,32,98,108,111,99,107,105,110,103,32,88,72,82,115,32,97,110,100,32,73,110,100,101,120,101,100,68,66,32,111,112,101,114,97,116,105,111,110,115,32,97,114,101,32,110,111,116,32,115,117,112,112,111,114,116,101,100,32,111,110,32,116,104,101,32,109,97,105,110,32,98,114,111,119,115,101,114,32,116,104,114,101,97,100,46,32,84,114,121,32,100,114,111,112,112,105,110,103,32,116,104,101,32,69,77,83,67,82,73,80,84,69,78,95,70,69,84,67,72,95,83,89,78,67,72,82,79,78,79,85,83,32,102,108,97,103,44,32,111,114,32,114,117,110,32,119,105,116,104,32,116,104,101,32,108,105,110,107,101,114,32,102,108,97,103,32,45,45,112,114,111,120,121,45,116,111,45,119,111,114,107,101,114,32,116,111,32,100,101,99,111,117,112,108,101,32,109,97,105,110,32,67,32,114,117,110,116,105,109,101,32,116,104,114,101,97,100,32,102,114,111,109,32,116,104,101,32,109,97,105,110,32,98,114,111,119,115,101,114,32,116,104,114,101,97,100,46,39,41,32,125,0,123,32,99,111,110,115,111,108,101,46,108,111,103,40,39,102,101,116,99,104,58,32,101,109,115,99,114,105,112,116,101,110,95,102,101,116,99,104,95,119,97,105,116,46,46,39,41,32,125,0,123,32,99,111,110,115,111,108,101,46,108,111,103,40,39,102,101,116,99,104,58,32,101,109,115,99,114,105,112,116,101,110,95,102,101,116,99,104,95,119,97,105,116,32,100,111,110,101,46,46,39,41,32,125,0,97,98,111,114,116,101,100,32,119,105,116,104,32,101,109,115,99,114,105,112,116,101,110,95,102,101,116,99,104,95,99,108,111,115,101,40,41,0,17,0,10,0,17,17,17,0,0,0,0,5,0,0,0,0,0,0,9,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,15,10,17,17,17,3,10,7,0,1,19,9,11,11,0,0,9,6,11,0,0,11,0,6,17,0,0,0,17,17,17,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,10,10,17,17,17,0,10,0,0,2,0,9,11,0,0,0,9,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,4,13,0,0,0,0,9,14,0,0,0,0,0,14,0,0,14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,15,0,0,0,0,15,0,0,0,0,9,16,0,0,0,0,0,16,0,0,16,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,0,10,0,0,0,0,9,11,0,0,0,0,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,45,43,32,32,32,48,88,48,120,0,40,110,117,108,108,41,0,45,48,88,43,48,88,32,48,88,45,48,120,43,48,120,32,48,120,0,105,110,102,0,73,78,70,0,110,97,110,0,78,65,78,0,48,49,50,51,52,53,54,55,56,57,65,66,67,68,69,70,46,0,84,33,34,25,13,1,2,3,17,75,28,12,16,4,11,29,18,30,39,104,110,111,112,113,98,32,5,6,15,19,20,21,26,8,22,7,40,36,23,24,9,10,14,27,31,37,35,131,130,125,38,42,43,60,61,62,63,67,71,74,77,88,89,90,91,92,93,94,95,96,97,99,100,101,102,103,105,106,107,108,114,115,116,121,122,123,124,0,73,108,108,101,103,97,108,32,98,121,116,101,32,115,101,113,117,101,110,99,101,0,68,111,109,97,105,110,32,101,114,114,111,114,0,82,101,115,117,108,116,32,110,111,116,32,114,101,112,114,101,115,101,110,116,97,98,108,101,0,78,111,116,32,97,32,116,116,121,0,80,101,114,109,105,115,115,105,111,110,32,100,101,110,105,101,100,0,79,112,101,114,97,116,105,111,110,32,110,111,116,32,112,101,114,109,105,116,116,101,100,0,78,111,32,115,117,99,104,32,102,105,108,101,32,111,114,32,100,105,114,101,99,116,111,114,121,0,78,111,32,115,117,99,104,32,112,114,111,99,101,115,115,0,70,105,108,101,32,101,120,105,115,116,115,0,86,97,108,117,101,32,116,111,111,32,108,97,114,103,101,32,102,111,114,32,100,97,116,97,32,116,121,112,101,0,78,111,32,115,112,97,99,101,32,108,101,102,116,32,111,110,32,100,101,118,105,99,101,0,79,117,116,32,111,102,32,109,101,109,111,114,121,0,82,101,115,111,117,114,99,101,32,98,117,115,121,0,73,110,116,101,114,114,117,112,116,101,100,32,115,121,115,116,101,109,32,99,97,108,108,0,82,101,115,111,117,114,99,101,32,116,101,109,112,111,114,97,114,105,108,121,32,117,110,97,118,97,105,108,97,98,108,101,0,73,110,118,97,108,105,100,32,115,101,101,107,0,67,114,111,115,115,45,100,101,118,105,99,101,32,108,105,110,107,0,82,101,97,100,45,111,110,108,121,32,102,105,108,101,32,115,121,115,116,101,109,0,68,105,114,101,99,116,111,114,121,32,110,111,116,32,101,109,112,116,121,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,112,101,101,114,0,79,112,101,114,97,116,105,111,110,32,116,105,109,101,100,32,111,117,116,0,67,111,110,110,101,99,116,105,111,110,32,114,101,102,117,115,101,100,0,72,111,115,116,32,105,115,32,100,111,119,110,0,72,111,115,116,32,105,115,32,117,110,114,101,97,99,104,97,98,108,101,0,65,100,100,114,101,115,115,32,105,110,32,117,115,101,0,66,114,111,107,101,110,32,112,105,112,101,0,73,47,79,32,101,114,114,111,114,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,32,111,114,32,97,100,100,114,101,115,115,0,66,108,111,99,107,32,100,101,118,105,99,101,32,114,101,113,117,105,114,101,100,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,0,78,111,116,32,97,32,100,105,114,101,99,116,111,114,121,0,73,115,32,97,32,100,105,114,101,99,116,111,114,121,0,84,101,120,116,32,102,105,108,101,32,98,117,115,121,0,69,120,101,99,32,102,111,114,109,97,116,32,101,114,114,111,114,0,73,110,118,97,108,105,100,32,97,114,103,117,109,101,110,116,0,65,114,103,117,109,101,110,116,32,108,105,115,116,32,116,111,111,32,108,111,110,103,0,83,121,109,98,111,108,105,99,32,108,105,110,107,32,108,111,111,112,0,70,105,108,101,110,97,109,101,32,116,111,111,32,108,111,110,103,0,84,111,111,32,109,97,110,121,32,111,112,101,110,32,102,105,108,101,115,32,105,110,32,115,121,115,116,101,109,0,78,111,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,115,32,97,118,97,105,108,97,98,108,101,0,66,97,100,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,0,78,111,32,99,104,105,108,100,32,112,114,111,99,101,115,115,0,66,97,100,32,97,100,100,114,101,115,115,0,70,105,108,101,32,116,111,111,32,108,97,114,103,101,0,84,111,111,32,109,97,110,121,32,108,105,110,107,115,0,78,111,32,108,111,99,107,115,32,97,118,97,105,108,97,98,108,101,0,82,101,115,111,117,114,99,101,32,100,101,97,100,108,111,99,107,32,119,111,117,108,100,32,111,99,99,117,114,0,83,116,97,116,101,32,110,111,116,32,114,101,99,111,118,101,114,97,98,108,101,0,80,114,101,118,105,111,117,115,32,111,119,110,101,114,32,100,105,101,100,0,79,112,101,114,97,116,105,111,110,32,99,97,110,99,101,108,101,100,0,70,117,110,99,116,105,111,110,32,110,111,116,32,105,109,112,108,101,109,101,110,116,101,100,0,78,111,32,109,101,115,115,97,103,101,32,111,102,32,100,101,115,105,114,101,100,32,116,121,112,101,0,73,100,101,110,116,105,102,105,101,114,32,114,101,109,111,118,101,100,0,68,101,118,105,99,101,32,110,111,116,32,97,32,115,116,114,101,97,109,0,78,111,32,100,97,116,97,32,97,118,97,105,108,97,98,108,101,0,68,101,118,105,99,101,32,116,105,109,101,111,117,116,0,79,117,116,32,111,102,32,115,116,114,101,97,109,115,32,114,101,115,111,117,114,99,101,115,0,76,105,110,107,32,104,97,115,32,98,101,101,110,32,115,101,118,101,114,101,100,0,80,114,111,116,111,99,111,108,32,101,114,114,111,114,0,66,97,100,32,109,101,115,115,97,103,101,0,70,105,108,101,32,100,101,115,99,114,105,112,116,111,114,32,105,110,32,98,97,100,32,115,116,97,116,101,0,78,111,116,32,97,32,115,111,99,107,101,116,0,68,101,115,116,105,110,97,116,105,111,110,32,97,100,100,114,101,115,115,32,114,101,113,117,105,114,101,100,0,77,101,115,115,97,103,101,32,116,111,111,32,108,97,114,103,101,0,80,114,111,116,111,99,111,108,32,119,114,111,110,103,32,116,121,112,101,32,102,111,114,32,115,111,99,107,101,116,0,80,114,111,116,111,99,111,108,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,80,114,111,116,111,99,111,108,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,83,111,99,107,101,116,32,116,121,112,101,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,78,111,116,32,115,117,112,112,111,114,116,101,100,0,80,114,111,116,111,99,111,108,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,65,100,100,114,101,115,115,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,32,98,121,32,112,114,111,116,111,99,111,108,0,65,100,100,114,101,115,115,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,78,101,116,119,111,114,107,32,105,115,32,100,111,119,110,0,78,101,116,119,111,114,107,32,117,110,114,101,97,99,104,97,98,108,101,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,110,101,116,119,111,114,107,0,67,111,110,110,101,99,116,105,111,110,32,97,98,111,114,116,101,100,0,78,111,32,98,117,102,102,101,114,32,115,112,97,99,101,32,97,118,97,105,108,97,98,108,101,0,83,111,99,107,101,116,32,105,115,32,99,111,110,110,101,99,116,101,100,0,83,111,99,107,101,116,32,110,111,116,32,99,111,110,110,101,99,116,101,100,0,67,97,110,110,111,116,32,115,101,110,100,32,97,102,116,101,114,32,115,111,99,107,101,116,32,115,104,117,116,100,111,119,110,0,79,112,101,114,97,116,105,111,110,32,97,108,114,101,97,100,121,32,105,110,32,112,114,111,103,114,101,115,115,0,79,112,101,114,97,116,105,111,110,32,105,110,32,112,114,111,103,114,101,115,115,0,83,116,97,108,101,32,102,105,108,101,32,104,97,110,100,108,101,0,82,101,109,111,116,101,32,73,47,79,32,101,114,114,111,114,0,81,117,111,116,97,32,101,120,99,101,101,100,101,100,0,78,111,32,109,101,100,105,117,109,32,102,111,117,110,100,0,87,114,111,110,103,32,109,101,100,105,117,109,32,116,121,112,101,0,78,111,32,101,114,114,111,114,32,105,110,102,111,114,109,97,116,105,111,110,0,0,101,109,115,99,114,105,112,116,101,110,95,105,115,95,109,97,105,110,95,114,117,110,116,105,109,101,95,116,104,114,101,97,100,40,41,32,38,38,32,34,101,109,115,99,114,105,112,116,101,110,95,109,97,105,110,95,116,104,114,101,97,100,95,112,114,111,99,101,115,115,95,113,117,101,117,101,100,95,99,97,108,108,115,32,109,117,115,116,32,98,101,32,99,97,108,108,101,100,32,102,114,111,109,32,116,104,101,32,109,97,105,110,32,116,104,114,101,97,100,33,34,0,47,85,115,101,114,115,47,108,117,111,120,105,97,111,106,117,110,47,119,101,98,97,115,115,101,109,98,108,121,47,101,109,115,100,107,47,101,109,115,99,114,105,112,116,101,110,47,105,110,99,111,109,105,110,103,47,115,121,115,116,101,109,47,108,105,98,47,112,116,104,114,101,97,100,47,108,105,98,114,97,114,121,95,112,116,104,114,101,97,100,46,99,0,101,109,115,99,114,105,112,116,101,110,95,109,97,105,110,95,116,104,114,101,97,100,95,112,114,111,99,101,115,115,95,113,117,101,117,101,100,95,99,97,108,108,115,0,48,32,38,38,32,34,73,110,118,97,108,105,100,32,69,109,115,99,114,105,112,116,101,110,32,112,116,104,114,101,97,100,32,95,100,111,95,99,97,108,108,32,111,112,99,111,100,101,33,34,0,95,100,111,95,99,97,108,108,0,99,97,108,108,0,101,109,115,99,114,105,112,116,101,110,95,97,115,121,110,99,95,114,117,110,95,105,110,95,109,97,105,110,95,116,104,114,101,97,100,0,112,111,115,116,77,101,115,115,97,103,101,40,123,32,99,109,100,58,32,39,112,114,111,99,101,115,115,81,117,101,117,101,100,77,97,105,110,84,104,114,101,97,100,87,111,114,107,39,32,125,41,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,54,95,95,115,104,105,109,95,116,121,112,101,95,105,110,102,111,69,0,83,116,57,116,121,112,101,95,105,110,102,111,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,48,95,95,115,105,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,51,95,95,102,117,110,100,97,109,101,110,116,97,108,95,116,121,112,101,95,105,110,102,111,69,0,118,0,98,0,99,0,104,0,97,0,115,0,116,0,105,0,106,0,108,0,109,0,102,0,100,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,49,95,95,118,109,105,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);
}





/* no memory initializer */
var tempDoublePtr;

if (!ENVIRONMENT_IS_PTHREAD) tempDoublePtr = Runtime.alignMemory(allocate(12, "i8", ALLOC_STATIC), 8);

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  
  
  
  var PROCINFO={ppid:1,pid:42,sid:42,pgid:42};
  
  
  var __pthread_ptr=0;
  
  var __pthread_is_main_runtime_thread=0;
  
  var __pthread_is_main_browser_thread=0;function __register_pthread_ptr(pthreadPtr, isMainBrowserThread, isMainRuntimeThread) {
      pthreadPtr = pthreadPtr|0;
      isMainBrowserThread = isMainBrowserThread|0;
      isMainRuntimeThread = isMainRuntimeThread|0;
      __pthread_ptr = pthreadPtr;
      __pthread_is_main_browser_thread = isMainBrowserThread;
      __pthread_is_main_runtime_thread = isMainRuntimeThread;
    }
  
  var _emscripten_main_thread_process_queued_calls=undefined;var PThread={MAIN_THREAD_ID:1,mainThreadInfo:{schedPolicy:0,schedPrio:0},unusedWorkerPool:[],runningWorkers:[],initMainThreadBlock:function () {
        if (ENVIRONMENT_IS_PTHREAD) return undefined;
        PThread.mainThreadBlock = allocate(244, "i32*", ALLOC_STATIC);
        __register_pthread_ptr(PThread.mainThreadBlock, /*isMainBrowserThread=*/!ENVIRONMENT_IS_WORKER, /*isMainRuntimeThread=*/1); // Pass the thread address inside the asm.js scope to store it for fast access that avoids the need for a FFI out.
  
        for (var i = 0; i < 244/4; ++i) HEAPU32[PThread.mainThreadBlock/4+i] = 0;
  
        // The pthread struct has a field that points to itself - this is used as a magic ID to detect whether the pthread_t
        // structure is 'alive'.
        HEAP32[(((PThread.mainThreadBlock)+(24))>>2)]=PThread.mainThreadBlock;
  
        // Allocate memory for thread-local storage.
        var tlsMemory = allocate(128 * 4, "i32*", ALLOC_STATIC);
        for (var i = 0; i < 128; ++i) HEAPU32[tlsMemory/4+i] = 0;
        Atomics.store(HEAPU32, (PThread.mainThreadBlock + 116 ) >> 2, tlsMemory); // Init thread-local-storage memory array.
        Atomics.store(HEAPU32, (PThread.mainThreadBlock + 52 ) >> 2, PThread.mainThreadBlock); // Main thread ID.
        Atomics.store(HEAPU32, (PThread.mainThreadBlock + 56 ) >> 2, PROCINFO.pid); // Process ID.
  
      },pthreads:{},pthreadIdCounter:2,exitHandlers:null,setThreadStatus:function () {},runExitHandlers:function () {
        if (PThread.exitHandlers !== null) {
          while (PThread.exitHandlers.length > 0) {
            PThread.exitHandlers.pop()();
          }
          PThread.exitHandlers = null;
        }
  
        // Call into the musl function that runs destructors of all thread-specific data.
        if (ENVIRONMENT_IS_PTHREAD && threadInfoStruct) ___pthread_tsd_run_dtors();
      },threadExit:function (exitCode) {
        var tb = _pthread_self();
        if (tb) { // If we haven't yet exited?
          Atomics.store(HEAPU32, (tb + 4 ) >> 2, exitCode);
          // When we publish this, the main thread is free to deallocate the thread object and we are done.
          // Therefore set threadInfoStruct = 0; above to 'release' the object in this worker thread.
          Atomics.store(HEAPU32, (tb + 0 ) >> 2, 1);
  
          // Disable all cancellation so that executing the cleanup handlers won't trigger another JS
          // canceled exception to be thrown.
          Atomics.store(HEAPU32, (tb + 72 ) >> 2, 1/*PTHREAD_CANCEL_DISABLE*/);
          Atomics.store(HEAPU32, (tb + 76 ) >> 2, 0/*PTHREAD_CANCEL_DEFERRED*/);
          PThread.runExitHandlers();
  
          _emscripten_futex_wake(tb + 0, 2147483647);
          __register_pthread_ptr(0, 0, 0); // Unregister the thread block also inside the asm.js scope.
          threadInfoStruct = 0;
          if (ENVIRONMENT_IS_PTHREAD) {
            // This worker no longer owns any WebGL OffscreenCanvases, so transfer them back to parent thread.
            var transferList = [];
  
  
            postMessage({ cmd: 'exit' });
          }
        }
      },threadCancel:function () {
        PThread.runExitHandlers();
        Atomics.store(HEAPU32, (threadInfoStruct + 4 ) >> 2, -1/*PTHREAD_CANCELED*/);
        Atomics.store(HEAPU32, (threadInfoStruct + 0 ) >> 2, 1); // Mark the thread as no longer running.
        _emscripten_futex_wake(threadInfoStruct + 0, 2147483647); // wake all threads
        threadInfoStruct = selfThreadId = 0; // Not hosting a pthread anymore in this worker, reset the info structures to null.
        __register_pthread_ptr(0, 0, 0); // Unregister the thread block also inside the asm.js scope.
        postMessage({ cmd: 'cancelDone' });
      },terminateAllThreads:function () {
        for (var t in PThread.pthreads) {
          var pthread = PThread.pthreads[t];
          if (pthread) {
            PThread.freeThreadData(pthread);
            if (pthread.worker) pthread.worker.terminate();
          }
        }
        PThread.pthreads = {};
        for (var t in PThread.unusedWorkerPool) {
          var pthread = PThread.unusedWorkerPool[t];
          if (pthread) {
            PThread.freeThreadData(pthread);
            if (pthread.worker) pthread.worker.terminate();
          }
        }
        PThread.unusedWorkerPool = [];
        for (var t in PThread.runningWorkers) {
          var pthread = PThread.runningWorkers[t];
          if (pthread) {
            PThread.freeThreadData(pthread);
            if (pthread.worker) pthread.worker.terminate();
          }
        }
        PThread.runningWorkers = [];
      },freeThreadData:function (pthread) {
        if (!pthread) return;
        if (pthread.threadInfoStruct) {
          var tlsMemory = HEAP32[(((pthread.threadInfoStruct)+(116))>>2)];
          HEAP32[(((pthread.threadInfoStruct)+(116))>>2)]=0;
          _free(pthread.tlsMemory);
          _free(pthread.threadInfoStruct);
        }
        pthread.threadInfoStruct = 0;
        if (pthread.allocatedOwnStack && pthread.stackBase) _free(pthread.stackBase);
        pthread.stackBase = 0;
        if (pthread.worker) pthread.worker.pthread = null;
      },receiveObjectTransfer:function (data) {
      },allocateUnusedWorkers:function (numWorkers, onFinishedLoading) {
        if (typeof SharedArrayBuffer === 'undefined') return; // No multithreading support, no-op.
        Module['print']('Preallocating ' + numWorkers + ' workers for a pthread spawn pool.');
  
        var numWorkersLoaded = 0;
        for (var i = 0; i < numWorkers; ++i) {
          var pthreadMainJs = 'pthread-main.js';
          // Allow HTML module to configure the location where the 'pthread-main.js' file will be loaded from,
          // either via Module.locateFile() function, or via Module.pthreadMainPrefixURL string. If neither
          // of these are passed, then the default URL 'pthread-main.js' relative to the main html file is loaded.
          if (typeof Module['locateFile'] === 'function') pthreadMainJs = Module['locateFile'](pthreadMainJs);
          else if (Module['pthreadMainPrefixURL']) pthreadMainJs = Module['pthreadMainPrefixURL'] + pthreadMainJs;
          var worker = new Worker(pthreadMainJs);
  
          worker.onmessage = function(e) {
            // If this message is intended to a recipient that is not the main thread, forward it to the target thread.
            if (e.data.targetThread && e.data.targetThread != _pthread_self()) {
              var thread = PThread.pthreads[e.data.targetThread];
              if (thread) {
                thread.worker.postMessage(e.data, e.data.transferList);
              } else {
                console.error('Internal error! Worker sent a message "' + e.data.cmd + '" to target pthread ' + e.data.targetThread + ', but that thread no longer exists!');
              }
              return;
            }
  
            if (e.data.cmd === 'processQueuedMainThreadWork') {
              // TODO: Must post message to main Emscripten thread in PROXY_TO_WORKER mode.
              _emscripten_main_thread_process_queued_calls();
            } else if (e.data.cmd === 'spawnThread') {
              __spawn_thread(e.data);
            } else if (e.data.cmd === 'cleanupThread') {
              __cleanup_thread(e.data.thread);
            } else if (e.data.cmd === 'killThread') {
              __kill_thread(e.data.thread);
            } else if (e.data.cmd === 'cancelThread') {
              __cancel_thread(e.data.thread);
            } else if (e.data.cmd === 'loaded') {
              ++numWorkersLoaded;
              if (numWorkersLoaded === numWorkers && onFinishedLoading) {
                onFinishedLoading();
              }
            } else if (e.data.cmd === 'print') {
              Module['print']('Thread ' + e.data.threadId + ': ' + e.data.text);
            } else if (e.data.cmd === 'printErr') {
              Module['printErr']('Thread ' + e.data.threadId + ': ' + e.data.text);
            } else if (e.data.cmd === 'alert') {
              alert('Thread ' + e.data.threadId + ': ' + e.data.text);
            } else if (e.data.cmd === 'exit') {
              // currently no-op
            } else if (e.data.cmd === 'cancelDone') {
              PThread.freeThreadData(worker.pthread);
              worker.pthread = undefined; // Detach the worker from the pthread object, and return it to the worker pool as an unused worker.
              PThread.unusedWorkerPool.push(worker);
              // TODO: Free if detached.
              PThread.runningWorkers.splice(PThread.runningWorkers.indexOf(worker.pthread), 1); // Not a running Worker anymore.
            } else if (e.data.cmd === 'objectTransfer') {
              PThread.receiveObjectTransfer(e.data);
            } else {
              Module['printErr']("worker sent an unknown command " + e.data.cmd);
            }
          };
  
          worker.onerror = function(e) {
            Module['printErr']('pthread sent an error! ' + e.filename + ':' + e.lineno + ': ' + e.message);
          };
  
          // Allocate tempDoublePtr for the worker. This is done here on the worker's behalf, since we may need to do this statically
          // if the runtime has not been loaded yet, etc. - so we just use getMemory, which is main-thread only.
          var tempDoublePtr = getMemory(8); // TODO: leaks. Cleanup after worker terminates.
  
          // Ask the new worker to load up the Emscripten-compiled page. This is a heavy operation.
          worker.postMessage({
              cmd: 'load',
              url: currentScriptUrl,
              buffer: HEAPU8.buffer,
              tempDoublePtr: tempDoublePtr,
              TOTAL_MEMORY: TOTAL_MEMORY,
              STATICTOP: STATICTOP,
              DYNAMIC_BASE: DYNAMIC_BASE,
              DYNAMICTOP_PTR: DYNAMICTOP_PTR,
              PthreadWorkerInit: PthreadWorkerInit
            });
          PThread.unusedWorkerPool.push(worker);
        }
      },getNewWorker:function () {
        if (PThread.unusedWorkerPool.length == 0) PThread.allocateUnusedWorkers(1);
        if (PThread.unusedWorkerPool.length > 0) return PThread.unusedWorkerPool.pop();
        else return null;
      },busySpinWait:function (msecs) {
        var t = performance.now() + msecs;
        while(performance.now() < t) {
          ;
        }
      }};function _emscripten_set_current_thread_status_js(newStatus) {
    } 
  Module["_emscripten_set_current_thread_status"] = _emscripten_set_current_thread_status;

  
  var _tzname; if (ENVIRONMENT_IS_PTHREAD) _tzname = PthreadWorkerInit._tzname; else PthreadWorkerInit._tzname = _tzname = allocate(8, "i32*", ALLOC_STATIC);
  
  var _daylight; if (ENVIRONMENT_IS_PTHREAD) _daylight = PthreadWorkerInit._daylight; else PthreadWorkerInit._daylight = _daylight = allocate(1, "i32*", ALLOC_STATIC);
  
  var _timezone; if (ENVIRONMENT_IS_PTHREAD) _timezone = PthreadWorkerInit._timezone; else PthreadWorkerInit._timezone = _timezone = allocate(1, "i32*", ALLOC_STATIC);function _tzset() {
      if (ENVIRONMENT_IS_PTHREAD) return _emscripten_sync_run_in_main_thread_0(119);
      // TODO: Use (malleable) environment variables instead of system settings.
      if (_tzset.called) return;
      _tzset.called = true;
  
      HEAP32[((_timezone)>>2)]=-(new Date()).getTimezoneOffset() * 60;
  
      var winter = new Date(2000, 0, 1);
      var summer = new Date(2000, 6, 1);
      HEAP32[((_daylight)>>2)]=Number(winter.getTimezoneOffset() != summer.getTimezoneOffset());
  
      function extractZone(date) {
        var match = date.toTimeString().match(/\(([A-Za-z ]+)\)$/);
        return match ? match[1] : "GMT";
      };
      var winterName = extractZone(winter);
      var summerName = extractZone(summer);
      var winterNamePtr = allocate(intArrayFromString(winterName), 'i8', ALLOC_NORMAL);
      var summerNamePtr = allocate(intArrayFromString(summerName), 'i8', ALLOC_NORMAL);
      if (summer.getTimezoneOffset() < winter.getTimezoneOffset()) {
        // Northern hemisphere
        HEAP32[((_tzname)>>2)]=winterNamePtr;
        HEAP32[(((_tzname)+(4))>>2)]=summerNamePtr;
      } else {
        HEAP32[((_tzname)>>2)]=summerNamePtr;
        HEAP32[(((_tzname)+(4))>>2)]=winterNamePtr;
      }
    }

   
  Module["_i64Subtract"] = _i64Subtract;

  function ___assert_fail(condition, filename, line, func) {
      ABORT = true;
      throw 'Assertion failed: ' + Pointer_stringify(condition) + ', at: ' + [filename ? Pointer_stringify(filename) : 'unknown filename', line, func ? Pointer_stringify(func) : 'unknown function'] + ' at ' + stackTrace();
    }

  
  
  
  function embind_init_charCodes() {
      var codes = new Array(256);
      for (var i = 0; i < 256; ++i) {
          codes[i] = String.fromCharCode(i);
      }
      embind_charCodes = codes;
    }var embind_charCodes=undefined;function readLatin1String(ptr) {
      var ret = "";
      var c = ptr;
      while (HEAPU8[c]) {
          ret += embind_charCodes[HEAPU8[c++]];
      }
      return ret;
    }
  
  
  var awaitingDependencies={};
  
  var registeredTypes={};
  
  var typeDependencies={};
  
  
  
  
  
  
  var char_0=48;
  
  var char_9=57;function makeLegalFunctionName(name) {
      if (undefined === name) {
          return '_unknown';
      }
      name = name.replace(/[^a-zA-Z0-9_]/g, '$');
      var f = name.charCodeAt(0);
      if (f >= char_0 && f <= char_9) {
          return '_' + name;
      } else {
          return name;
      }
    }function createNamedFunction(name, body) {
      name = makeLegalFunctionName(name);
      /*jshint evil:true*/
      return new Function(
          "body",
          "return function " + name + "() {\n" +
          "    \"use strict\";" +
          "    return body.apply(this, arguments);\n" +
          "};\n"
      )(body);
    }function extendError(baseErrorType, errorName) {
      var errorClass = createNamedFunction(errorName, function(message) {
          this.name = errorName;
          this.message = message;
  
          var stack = (new Error(message)).stack;
          if (stack !== undefined) {
              this.stack = this.toString() + '\n' +
                  stack.replace(/^Error(:[^\n]*)?\n/, '');
          }
      });
      errorClass.prototype = Object.create(baseErrorType.prototype);
      errorClass.prototype.constructor = errorClass;
      errorClass.prototype.toString = function() {
          if (this.message === undefined) {
              return this.name;
          } else {
              return this.name + ': ' + this.message;
          }
      };
  
      return errorClass;
    }var BindingError=undefined;function throwBindingError(message) {
      throw new BindingError(message);
    }
  
  
  
  var InternalError=undefined;function throwInternalError(message) {
      throw new InternalError(message);
    }function whenDependentTypesAreResolved(myTypes, dependentTypes, getTypeConverters) {
      myTypes.forEach(function(type) {
          typeDependencies[type] = dependentTypes;
      });
  
      function onComplete(typeConverters) {
          var myTypeConverters = getTypeConverters(typeConverters);
          if (myTypeConverters.length !== myTypes.length) {
              throwInternalError('Mismatched type converter count');
          }
          for (var i = 0; i < myTypes.length; ++i) {
              registerType(myTypes[i], myTypeConverters[i]);
          }
      }
  
      var typeConverters = new Array(dependentTypes.length);
      var unregisteredTypes = [];
      var registered = 0;
      dependentTypes.forEach(function(dt, i) {
          if (registeredTypes.hasOwnProperty(dt)) {
              typeConverters[i] = registeredTypes[dt];
          } else {
              unregisteredTypes.push(dt);
              if (!awaitingDependencies.hasOwnProperty(dt)) {
                  awaitingDependencies[dt] = [];
              }
              awaitingDependencies[dt].push(function() {
                  typeConverters[i] = registeredTypes[dt];
                  ++registered;
                  if (registered === unregisteredTypes.length) {
                      onComplete(typeConverters);
                  }
              });
          }
      });
      if (0 === unregisteredTypes.length) {
          onComplete(typeConverters);
      }
    }function registerType(rawType, registeredInstance, options) {
      options = options || {};
  
      if (!('argPackAdvance' in registeredInstance)) {
          throw new TypeError('registerType registeredInstance requires argPackAdvance');
      }
  
      var name = registeredInstance.name;
      if (!rawType) {
          throwBindingError('type "' + name + '" must have a positive integer typeid pointer');
      }
      if (registeredTypes.hasOwnProperty(rawType)) {
          if (options.ignoreDuplicateRegistrations) {
              return;
          } else {
              throwBindingError("Cannot register type '" + name + "' twice");
          }
      }
  
      registeredTypes[rawType] = registeredInstance;
      delete typeDependencies[rawType];
  
      if (awaitingDependencies.hasOwnProperty(rawType)) {
          var callbacks = awaitingDependencies[rawType];
          delete awaitingDependencies[rawType];
          callbacks.forEach(function(cb) {
              cb();
          });
      }
    }function __embind_register_void(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          isVoid: true, // void return values can be optimized out sometimes
          name: name,
          'argPackAdvance': 0,
          'fromWireType': function() {
              return undefined;
          },
          'toWireType': function(destructors, o) {
              // TODO: assert if anything else is given?
              return undefined;
          },
      });
    }

   
  Module["_memset"] = _memset;

  
  function getShiftFromSize(size) {
      switch (size) {
          case 1: return 0;
          case 2: return 1;
          case 4: return 2;
          case 8: return 3;
          default:
              throw new TypeError('Unknown type size: ' + size);
      }
    }function __embind_register_bool(rawType, name, size, trueValue, falseValue) {
      var shift = getShiftFromSize(size);
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(wt) {
              // ambiguous emscripten ABI: sometimes return values are
              // true or false, and sometimes integers (0 or 1)
              return !!wt;
          },
          'toWireType': function(destructors, o) {
              return o ? trueValue : falseValue;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': function(pointer) {
              // TODO: if heap is fixed (like in asm.js) this could be executed outside
              var heap;
              if (size === 1) {
                  heap = HEAP8;
              } else if (size === 2) {
                  heap = HEAP16;
              } else if (size === 4) {
                  heap = HEAP32;
              } else {
                  throw new TypeError("Unknown boolean type size: " + name);
              }
              return this['fromWireType'](heap[pointer >> shift]);
          },
          destructorFunction: null, // This type does not need a destructor
      });
    }

  function ___pthread_setcancelstate() { return 0 }

  function _atexit(func, arg) {
      if (ENVIRONMENT_IS_PTHREAD) return _emscripten_sync_run_in_main_thread_2(110, func, arg);
      __ATEXIT__.unshift({ func: func, arg: arg });
    }

  function _abort() {
      Module['abort']();
    }

  
  function _free() {
  }
  Module["_free"] = _free;
  
  function _malloc(bytes) {
      /* Over-allocate to make sure it is byte-aligned by 8.
       * This will leak memory, but this is only the dummy
       * implementation (replaced by dlmalloc normally) so
       * not an issue.
       */
      var ptr = Runtime.dynamicAlloc(bytes + 8);
      return (ptr+8) & 0xFFFFFFF8;
    }
  Module["_malloc"] = _malloc;
  
  function simpleReadValueFromPointer(pointer) {
      return this['fromWireType'](HEAPU32[pointer >> 2]);
    }function __embind_register_std_string(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var length = HEAPU32[value >> 2];
              var a = new Array(length);
              for (var i = 0; i < length; ++i) {
                  a[i] = String.fromCharCode(HEAPU8[value + 4 + i]);
              }
              _free(value);
              return a.join('');
          },
          'toWireType': function(destructors, value) {
              if (value instanceof ArrayBuffer) {
                  value = new Uint8Array(value);
              }
  
              function getTAElement(ta, index) {
                  return ta[index];
              }
              function getStringElement(string, index) {
                  return string.charCodeAt(index);
              }
              var getElement;
              if (value instanceof Uint8Array) {
                  getElement = getTAElement;
              } else if (value instanceof Uint8ClampedArray) {
                  getElement = getTAElement;
              } else if (value instanceof Int8Array) {
                  getElement = getTAElement;
              } else if (typeof value === 'string') {
                  getElement = getStringElement;
              } else {
                  throwBindingError('Cannot pass non-string to std::string');
              }
  
              // assumes 4-byte alignment
              var length = value.length;
              var ptr = _malloc(4 + length);
              HEAPU32[ptr >> 2] = length;
              for (var i = 0; i < length; ++i) {
                  var charCode = getElement(value, i);
                  if (charCode > 255) {
                      _free(ptr);
                      throwBindingError('String has UTF-16 code units that do not fit in 8 bits');
                  }
                  HEAPU8[ptr + 4 + i] = charCode;
              }
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  
  function _embind_repr(v) {
      if (v === null) {
          return 'null';
      }
      var t = typeof v;
      if (t === 'object' || t === 'array' || t === 'function') {
          return v.toString();
      } else {
          return '' + v;
      }
    }
  
  function integerReadValueFromPointer(name, shift, signed) {
      // integers are quite common, so generate very specialized functions
      switch (shift) {
          case 0: return signed ?
              function readS8FromPointer(pointer) { return HEAP8[pointer]; } :
              function readU8FromPointer(pointer) { return HEAPU8[pointer]; };
          case 1: return signed ?
              function readS16FromPointer(pointer) { return HEAP16[pointer >> 1]; } :
              function readU16FromPointer(pointer) { return HEAPU16[pointer >> 1]; };
          case 2: return signed ?
              function readS32FromPointer(pointer) { return HEAP32[pointer >> 2]; } :
              function readU32FromPointer(pointer) { return HEAPU32[pointer >> 2]; };
          default:
              throw new TypeError("Unknown integer type: " + name);
      }
    }function __embind_register_integer(primitiveType, name, size, minRange, maxRange) {
      name = readLatin1String(name);
      if (maxRange === -1) { // LLVM doesn't have signed and unsigned 32-bit types, so u32 literals come out as 'i32 -1'. Always treat those as max u32.
          maxRange = 4294967295;
      }
  
      var shift = getShiftFromSize(size);
      
      var fromWireType = function(value) {
          return value;
      };
      
      if (minRange === 0) {
          var bitshift = 32 - 8*size;
          fromWireType = function(value) {
              return (value << bitshift) >>> bitshift;
          };
      }
  
      registerType(primitiveType, {
          name: name,
          'fromWireType': fromWireType,
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following two if()s and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              if (value < minRange || value > maxRange) {
                  throw new TypeError('Passing a number "' + _embind_repr(value) + '" from JS side to C/C++ side to an argument of type "' + name + '", which is outside the valid range [' + minRange + ', ' + maxRange + ']!');
              }
              return value | 0;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': integerReadValueFromPointer(name, shift, minRange !== 0),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  function _emscripten_is_main_browser_thread() {
      return __pthread_is_main_browser_thread|0; // Semantically the same as testing "!ENVIRONMENT_IS_WORKER" outside the asm.js scope
    }

  
  function __spawn_thread(threadParams) {
      if (ENVIRONMENT_IS_PTHREAD) throw 'Internal Error! _spawn_thread() can only ever be called from main application thread!';
  
      var worker = PThread.getNewWorker();
      if (worker.pthread !== undefined) throw 'Internal error!';
      if (!threadParams.pthread_ptr) throw 'Internal error, no pthread ptr!';
      PThread.runningWorkers.push(worker);
  
      // Allocate memory for thread-local storage and initialize it to zero.
      var tlsMemory = _malloc(128 * 4);
      for (var i = 0; i < 128; ++i) {
        HEAP32[(((tlsMemory)+(i*4))>>2)]=0;
      }
  
      var pthread = PThread.pthreads[threadParams.pthread_ptr] = { // Create a pthread info object to represent this thread.
        worker: worker,
        stackBase: threadParams.stackBase,
        stackSize: threadParams.stackSize,
        allocatedOwnStack: threadParams.allocatedOwnStack,
        thread: threadParams.pthread_ptr,
        threadInfoStruct: threadParams.pthread_ptr // Info area for this thread in Emscripten HEAP (shared)
      };
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 0 ) >> 2, 0); // threadStatus <- 0, meaning not yet exited.
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 4 ) >> 2, 0); // threadExitCode <- 0.
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 20 ) >> 2, 0); // profilerBlock <- 0.
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 80 ) >> 2, threadParams.detached);
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 116 ) >> 2, tlsMemory); // Init thread-local-storage memory array.
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 60 ) >> 2, 0); // Mark initial status to unused.
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 52 ) >> 2, pthread.threadInfoStruct); // Main thread ID.
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 56 ) >> 2, PROCINFO.pid); // Process ID.
  
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 120) >> 2, threadParams.stackSize);
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 96) >> 2, threadParams.stackSize);
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 92) >> 2, threadParams.stackBase);
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 120 + 8) >> 2, threadParams.stackBase);
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 120 + 12) >> 2, threadParams.detached);
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 120 + 20) >> 2, threadParams.schedPolicy);
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 120 + 24) >> 2, threadParams.schedPrio);
  
      var global_libc = _emscripten_get_global_libc();
      var global_locale = global_libc + 40;
      Atomics.store(HEAPU32, (pthread.threadInfoStruct + 188) >> 2, global_locale);
  
  
      worker.pthread = pthread;
  
      // Ask the worker to start executing its pthread entry point function.
      worker.postMessage({
        cmd: 'run',
        start_routine: threadParams.startRoutine,
        arg: threadParams.arg,
        threadInfoStruct: threadParams.pthread_ptr,
        selfThreadId: threadParams.pthread_ptr, // TODO: Remove this since thread ID is now the same as the thread address.
        parentThreadId: threadParams.parent_pthread_ptr,
        stackBase: threadParams.stackBase,
        stackSize: threadParams.stackSize,
      }, threadParams.transferList);
    }
  
  function _pthread_getschedparam(thread, policy, schedparam) {
      if (!policy && !schedparam) return ERRNO_CODES.EINVAL;
  
      if (!thread) {
        Module['printErr']('pthread_getschedparam called with a null thread pointer!');
        return ERRNO_CODES.ESRCH;
      }
      var self = HEAP32[(((thread)+(24))>>2)];
      if (self != thread) {
        Module['printErr']('pthread_getschedparam attempted on thread ' + thread + ', which does not point to a valid thread, or does not exist anymore!');
        return ERRNO_CODES.ESRCH;
      }
  
      var schedPolicy = Atomics.load(HEAPU32, (thread + 120 + 20 ) >> 2);
      var schedPrio = Atomics.load(HEAPU32, (thread + 120 + 24 ) >> 2);
  
      if (policy) HEAP32[((policy)>>2)]=schedPolicy;
      if (schedparam) HEAP32[((schedparam)>>2)]=schedPrio;
      return 0;
    }
  
  function _pthread_self() {
      return __pthread_ptr|0;
    }function _pthread_create(pthread_ptr, attr, start_routine, arg) {
      if (typeof SharedArrayBuffer === 'undefined') {
        Module['printErr']('Current environment does not support SharedArrayBuffer, pthreads are not available!');
        return 11;
      }
      if (!pthread_ptr) {
        Module['printErr']('pthread_create called with a null thread pointer!');
        return 22;
      }
  
      var transferList = []; // List of JS objects that will transfer ownership to the Worker hosting the thread
  
  
      // Synchronously proxy the thread creation to main thread if possible. If we need to transfer ownership of objects, then
      // proxy asynchronously via postMessage.
      if (ENVIRONMENT_IS_PTHREAD && transferList.length == 0) {
        return _emscripten_sync_run_in_main_thread_4(137, pthread_ptr, attr, start_routine, arg);
      }
  
      var stackSize = 0;
      var stackBase = 0;
      var detached = 0; // Default thread attr is PTHREAD_CREATE_JOINABLE, i.e. start as not detached.
      var schedPolicy = 0; /*SCHED_OTHER*/
      var schedPrio = 0;
      if (attr) {
        stackSize = HEAP32[((attr)>>2)];
        stackBase = HEAP32[(((attr)+(8))>>2)];
        detached = HEAP32[(((attr)+(12))>>2)] != 0/*PTHREAD_CREATE_JOINABLE*/;
        var inheritSched = HEAP32[(((attr)+(16))>>2)] == 0/*PTHREAD_INHERIT_SCHED*/;
        if (inheritSched) {
          var prevSchedPolicy = HEAP32[(((attr)+(20))>>2)];
          var prevSchedPrio = HEAP32[(((attr)+(24))>>2)];
          _pthread_getschedparam(_pthread_self(), attr + 20, attr + 24);
          schedPolicy = HEAP32[(((attr)+(20))>>2)];
          schedPrio = HEAP32[(((attr)+(24))>>2)];
          HEAP32[(((attr)+(20))>>2)]=prevSchedPolicy;
          HEAP32[(((attr)+(24))>>2)]=prevSchedPrio;
        } else {
          schedPolicy = HEAP32[(((attr)+(20))>>2)];
          schedPrio = HEAP32[(((attr)+(24))>>2)];
        }
      }
      stackSize += 81920 /*DEFAULT_STACK_SIZE*/;
      var allocatedOwnStack = stackBase == 0; // If allocatedOwnStack == true, then the pthread impl maintains the stack allocation.
      if (allocatedOwnStack) {
        stackBase = _malloc(stackSize); // Allocate a stack if the user doesn't want to place the stack in a custom memory area.
      } else {
        // Musl stores the stack base address assuming stack grows downwards, so adjust it to Emscripten convention that the
        // stack grows upwards instead.
        stackBase -= stackSize;
        assert(stackBase > 0);
      }
  
      // Allocate thread block (pthread_t structure).
      var threadInfoStruct = _malloc(244);
      for (var i = 0; i < 244 >> 2; ++i) HEAPU32[(threadInfoStruct>>2) + i] = 0; // zero-initialize thread structure.
      HEAP32[((pthread_ptr)>>2)]=threadInfoStruct;
  
      // The pthread struct has a field that points to itself - this is used as a magic ID to detect whether the pthread_t
      // structure is 'alive'.
      HEAP32[(((threadInfoStruct)+(24))>>2)]=threadInfoStruct;
  
      // pthread struct robust_list head should point to itself.
      var headPtr = threadInfoStruct + 168;
      HEAP32[((headPtr)>>2)]=headPtr;
  
      var threadParams = {
        stackBase: stackBase,
        stackSize: stackSize,
        allocatedOwnStack: allocatedOwnStack,
        schedPolicy: schedPolicy,
        schedPrio: schedPrio,
        detached: detached,
        startRoutine: start_routine,
        pthread_ptr: threadInfoStruct,
        parent_pthread_ptr: _pthread_self(),
        arg: arg,
        transferList: transferList
      };
  
      if (ENVIRONMENT_IS_PTHREAD) {
        // The prepopulated pool of web workers that can host pthreads is stored in the main JS thread. Therefore if a
        // pthread is attempting to spawn a new thread, the thread creation must be deferred to the main JS thread.
        threadParams.cmd = 'spawnThread';
        postMessage(threadParams, transferList);
      } else {
        // We are the main thread, so we have the pthread warmup pool in this thread and can fire off JS thread creation
        // directly ourselves.
        __spawn_thread(threadParams);
      }
  
      return 0;
    }

  function ___lock() {}

  function ___unlock() {}

  var _emscripten_asm_const=true;

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    }
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _chroot(path) {
      if (ENVIRONMENT_IS_PTHREAD) return _emscripten_sync_run_in_main_thread_1(37, path);
      // int chroot(const char *path);
      // http://pubs.opengroup.org/onlinepubs/7908799/xsh/chroot.html
      ___setErrNo(ERRNO_CODES.EACCES);
      return -1;
    }

   
  Module["_i64Add"] = _i64Add;

  
  
  
  
  var _environ; if (ENVIRONMENT_IS_PTHREAD) _environ = PthreadWorkerInit._environ; else PthreadWorkerInit._environ = _environ = allocate(1, "i32*", ALLOC_STATIC);var ___environ=_environ;function ___buildEnvironment(env) {
      // WARNING: Arbitrary limit!
      var MAX_ENV_VALUES = 64;
      var TOTAL_ENV_SIZE = 1024;
  
      // Statically allocate memory for the environment.
      var poolPtr;
      var envPtr;
      if (!___buildEnvironment.called) {
        ___buildEnvironment.called = true;
        // Set default values. Use string keys for Closure Compiler compatibility.
        ENV['USER'] = ENV['LOGNAME'] = 'web_user';
        ENV['PATH'] = '/';
        ENV['PWD'] = '/';
        ENV['HOME'] = '/home/web_user';
        ENV['LANG'] = 'C';
        ENV['_'] = Module['thisProgram'];
        // Allocate memory.
        poolPtr = allocate(TOTAL_ENV_SIZE, 'i8', ALLOC_STATIC);
        envPtr = allocate(MAX_ENV_VALUES * 4,
                          'i8*', ALLOC_STATIC);
        HEAP32[((envPtr)>>2)]=poolPtr;
        HEAP32[((_environ)>>2)]=envPtr;
      } else {
        envPtr = HEAP32[((_environ)>>2)];
        poolPtr = HEAP32[((envPtr)>>2)];
      }
  
      // Collect key=value lines.
      var strings = [];
      var totalSize = 0;
      for (var key in env) {
        if (typeof env[key] === 'string') {
          var line = key + '=' + env[key];
          strings.push(line);
          totalSize += line.length;
        }
      }
      if (totalSize > TOTAL_ENV_SIZE) {
        throw new Error('Environment size exceeded TOTAL_ENV_SIZE!');
      }
  
      // Make new.
      var ptrSize = 4;
      for (var i = 0; i < strings.length; i++) {
        var line = strings[i];
        writeAsciiToMemory(line, poolPtr);
        HEAP32[(((envPtr)+(i * ptrSize))>>2)]=poolPtr;
        poolPtr += line.length + 1;
      }
      HEAP32[(((envPtr)+(strings.length * ptrSize))>>2)]=0;
    }var ENV={};function _putenv(string) {
      if (ENVIRONMENT_IS_PTHREAD) return _emscripten_sync_run_in_main_thread_1(115, string);
      // int putenv(char *string);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/putenv.html
      // WARNING: According to the standard (and the glibc implementation), the
      //          string is taken by reference so future changes are reflected.
      //          We copy it instead, possibly breaking some uses.
      if (string === 0) {
        ___setErrNo(ERRNO_CODES.EINVAL);
        return -1;
      }
      string = Pointer_stringify(string);
      var splitPoint = string.indexOf('=')
      if (string === '' || string.indexOf('=') === -1) {
        ___setErrNo(ERRNO_CODES.EINVAL);
        return -1;
      }
      var name = string.slice(0, splitPoint);
      var value = string.slice(splitPoint + 1);
      if (!(name in ENV) || ENV[name] !== value) {
        ENV[name] = value;
        ___buildEnvironment(ENV);
      }
      return 0;
    }

  
  
  
  var ERRNO_MESSAGES={0:"Success",1:"Not super-user",2:"No such file or directory",3:"No such process",4:"Interrupted system call",5:"I/O error",6:"No such device or address",7:"Arg list too long",8:"Exec format error",9:"Bad file number",10:"No children",11:"No more processes",12:"Not enough core",13:"Permission denied",14:"Bad address",15:"Block device required",16:"Mount device busy",17:"File exists",18:"Cross-device link",19:"No such device",20:"Not a directory",21:"Is a directory",22:"Invalid argument",23:"Too many open files in system",24:"Too many open files",25:"Not a typewriter",26:"Text file busy",27:"File too large",28:"No space left on device",29:"Illegal seek",30:"Read only file system",31:"Too many links",32:"Broken pipe",33:"Math arg out of domain of func",34:"Math result not representable",35:"File locking deadlock error",36:"File or path name too long",37:"No record locks available",38:"Function not implemented",39:"Directory not empty",40:"Too many symbolic links",42:"No message of desired type",43:"Identifier removed",44:"Channel number out of range",45:"Level 2 not synchronized",46:"Level 3 halted",47:"Level 3 reset",48:"Link number out of range",49:"Protocol driver not attached",50:"No CSI structure available",51:"Level 2 halted",52:"Invalid exchange",53:"Invalid request descriptor",54:"Exchange full",55:"No anode",56:"Invalid request code",57:"Invalid slot",59:"Bad font file fmt",60:"Device not a stream",61:"No data (for no delay io)",62:"Timer expired",63:"Out of streams resources",64:"Machine is not on the network",65:"Package not installed",66:"The object is remote",67:"The link has been severed",68:"Advertise error",69:"Srmount error",70:"Communication error on send",71:"Protocol error",72:"Multihop attempted",73:"Cross mount point (not really error)",74:"Trying to read unreadable message",75:"Value too large for defined data type",76:"Given log. name not unique",77:"f.d. invalid for this operation",78:"Remote address changed",79:"Can   access a needed shared lib",80:"Accessing a corrupted shared lib",81:".lib section in a.out corrupted",82:"Attempting to link in too many libs",83:"Attempting to exec a shared library",84:"Illegal byte sequence",86:"Streams pipe error",87:"Too many users",88:"Socket operation on non-socket",89:"Destination address required",90:"Message too long",91:"Protocol wrong type for socket",92:"Protocol not available",93:"Unknown protocol",94:"Socket type not supported",95:"Not supported",96:"Protocol family not supported",97:"Address family not supported by protocol family",98:"Address already in use",99:"Address not available",100:"Network interface is not configured",101:"Network is unreachable",102:"Connection reset by network",103:"Connection aborted",104:"Connection reset by peer",105:"No buffer space available",106:"Socket is already connected",107:"Socket is not connected",108:"Can't send after socket shutdown",109:"Too many references",110:"Connection timed out",111:"Connection refused",112:"Host is down",113:"Host is unreachable",114:"Socket already connected",115:"Connection already in progress",116:"Stale file handle",122:"Quota exceeded",123:"No medium (in tape drive)",125:"Operation canceled",130:"Previous owner died",131:"State not recoverable"};
  
  var PATH={splitPath:function (filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },normalizeArray:function (parts, allowAboveRoot) {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up--; up) {
            parts.unshift('..');
          }
        }
        return parts;
      },normalize:function (path) {
        var isAbsolute = path.charAt(0) === '/',
            trailingSlash = path.substr(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },dirname:function (path) {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },basename:function (path) {
        // EMSCRIPTEN return '/'' for '/', not an empty string
        if (path === '/') return '/';
        var lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return path;
        return path.substr(lastSlash+1);
      },extname:function (path) {
        return PATH.splitPath(path)[3];
      },join:function () {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join('/'));
      },join2:function (l, r) {
        return PATH.normalize(l + '/' + r);
      },resolve:function () {
        var resolvedPath = '',
          resolvedAbsolute = false;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path = (i >= 0) ? arguments[i] : FS.cwd();
          // Skip empty and invalid entries
          if (typeof path !== 'string') {
            throw new TypeError('Arguments to path.resolve must be strings');
          } else if (!path) {
            return ''; // an invalid portion invalidates the whole thing
          }
          resolvedPath = path + '/' + resolvedPath;
          resolvedAbsolute = path.charAt(0) === '/';
        }
        // At this point the path should be resolved to a full absolute path, but
        // handle relative paths to be safe (might happen when process.cwd() fails)
        resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter(function(p) {
          return !!p;
        }), !resolvedAbsolute).join('/');
        return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
      },relative:function (from, to) {
        from = PATH.resolve(from).substr(1);
        to = PATH.resolve(to).substr(1);
        function trim(arr) {
          var start = 0;
          for (; start < arr.length; start++) {
            if (arr[start] !== '') break;
          }
          var end = arr.length - 1;
          for (; end >= 0; end--) {
            if (arr[end] !== '') break;
          }
          if (start > end) return [];
          return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split('/'));
        var toParts = trim(to.split('/'));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
          if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
          }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
          outputParts.push('..');
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join('/');
      }};
  
  var TTY={ttys:[],init:function () {
        // https://github.com/kripken/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
        //   // device, it always assumes it's a TTY device. because of this, we're forcing
        //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
        //   // with text files until FS.init can be refactored.
        //   process['stdin']['setEncoding']('utf8');
        // }
      },shutdown:function () {
        // https://github.com/kripken/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
        //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
        //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
        //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
        //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
        //   process['stdin']['pause']();
        // }
      },register:function (dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },stream_ops:{open:function (stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          stream.tty = tty;
          stream.seekable = false;
        },close:function (stream) {
          // flush any pending line data
          stream.tty.ops.flush(stream.tty);
        },flush:function (stream) {
          stream.tty.ops.flush(stream.tty);
        },read:function (stream, buffer, offset, length, pos /* ignored */) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            if (result === undefined && bytesRead === 0) {
              throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset+i] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },write:function (stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          for (var i = 0; i < length; i++) {
            try {
              stream.tty.ops.put_char(stream.tty, buffer[offset+i]);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        }},default_tty_ops:{get_char:function (tty) {
          if (!tty.input.length) {
            var result = null;
            if (ENVIRONMENT_IS_NODE) {
              // we will read data by chunks of BUFSIZE
              var BUFSIZE = 256;
              var buf = new Buffer(BUFSIZE);
              var bytesRead = 0;
  
              var isPosixPlatform = (process.platform != 'win32'); // Node doesn't offer a direct check, so test by exclusion
  
              var fd = process.stdin.fd;
              if (isPosixPlatform) {
                // Linux and Mac cannot use process.stdin.fd (which isn't set up as sync)
                var usingDevice = false;
                try {
                  fd = fs.openSync('/dev/stdin', 'r');
                  usingDevice = true;
                } catch (e) {}
              }
  
              try {
                bytesRead = fs.readSync(fd, buf, 0, BUFSIZE, null);
              } catch(e) {
                // Cross-platform differences: on Windows, reading EOF throws an exception, but on other OSes,
                // reading EOF returns 0. Uniformize behavior by treating the EOF exception to return 0.
                if (e.toString().indexOf('EOF') != -1) bytesRead = 0;
                else throw e;
              }
  
              if (usingDevice) { fs.closeSync(fd); }
              if (bytesRead > 0) {
                result = buf.slice(0, bytesRead).toString('utf-8');
              } else {
                result = null;
              }
  
            } else if (typeof window != 'undefined' &&
              typeof window.prompt == 'function') {
              // Browser.
              result = window.prompt('Input: ');  // returns null on cancel
              if (result !== null) {
                result += '\n';
              }
            } else if (typeof readline == 'function') {
              // Command line.
              result = readline();
              if (result !== null) {
                result += '\n';
              }
            }
            if (!result) {
              return null;
            }
            tty.input = intArrayFromString(result, true);
          }
          return tty.input.shift();
        },put_char:function (tty, val) {
          if (val === null || val === 10) {
            Module['print'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            Module['print'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }},default_tty1_ops:{put_char:function (tty, val) {
          if (val === null || val === 10) {
            Module['printErr'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            Module['printErr'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }}};
  
  var MEMFS={ops_table:null,mount:function (mount) {
        return MEMFS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
      },createNode:function (parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          // no supported
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (!MEMFS.ops_table) {
          MEMFS.ops_table = {
            dir: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                lookup: MEMFS.node_ops.lookup,
                mknod: MEMFS.node_ops.mknod,
                rename: MEMFS.node_ops.rename,
                unlink: MEMFS.node_ops.unlink,
                rmdir: MEMFS.node_ops.rmdir,
                readdir: MEMFS.node_ops.readdir,
                symlink: MEMFS.node_ops.symlink
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek
              }
            },
            file: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek,
                read: MEMFS.stream_ops.read,
                write: MEMFS.stream_ops.write,
                allocate: MEMFS.stream_ops.allocate,
                mmap: MEMFS.stream_ops.mmap,
                msync: MEMFS.stream_ops.msync
              }
            },
            link: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                readlink: MEMFS.node_ops.readlink
              },
              stream: {}
            },
            chrdev: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: FS.chrdev_stream_ops
            }
          };
        }
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          node.usedBytes = 0; // The actual number of bytes used in the typed array, as opposed to contents.length which gives the whole capacity.
          // When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
          // for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
          // penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
          node.contents = null; 
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.timestamp = Date.now();
        // add the new node to the parent
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },getFileDataAsRegularArray:function (node) {
        if (node.contents && node.contents.subarray) {
          var arr = [];
          for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
          return arr; // Returns a copy of the original data.
        }
        return node.contents; // No-op, the file contents are already in a JS array. Return as-is.
      },getFileDataAsTypedArray:function (node) {
        if (!node.contents) return new Uint8Array;
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
        return new Uint8Array(node.contents);
      },expandFileStorage:function (node, newCapacity) {
        // If we are asked to expand the size of a file that already exists, revert to using a standard JS array to store the file
        // instead of a typed array. This makes resizing the array more flexible because we can just .push() elements at the back to
        // increase the size.
        if (node.contents && node.contents.subarray && newCapacity > node.contents.length) {
          node.contents = MEMFS.getFileDataAsRegularArray(node);
          node.usedBytes = node.contents.length; // We might be writing to a lazy-loaded file which had overridden this property, so force-reset it.
        }
  
        if (!node.contents || node.contents.subarray) { // Keep using a typed array if creating a new storage, or if old one was a typed array as well.
          var prevCapacity = node.contents ? node.contents.length : 0;
          if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
          // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
          // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
          // avoid overshooting the allocation cap by a very large margin.
          var CAPACITY_DOUBLING_MAX = 1024 * 1024;
          newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) | 0);
          if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
          var oldContents = node.contents;
          node.contents = new Uint8Array(newCapacity); // Allocate new storage.
          if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0); // Copy old data over to the new storage.
          return;
        }
        // Not using a typed array to back the file storage. Use a standard JS array instead.
        if (!node.contents && newCapacity > 0) node.contents = [];
        while (node.contents.length < newCapacity) node.contents.push(0);
      },resizeFileStorage:function (node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
          node.contents = null; // Fully decommit when requesting a resize to zero.
          node.usedBytes = 0;
          return;
        }
        if (!node.contents || node.contents.subarray) { // Resize a typed array if that is being used as the backing store.
          var oldContents = node.contents;
          node.contents = new Uint8Array(new ArrayBuffer(newSize)); // Allocate new storage.
          if (oldContents) {
            node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
          }
          node.usedBytes = newSize;
          return;
        }
        // Backing with a JS array.
        if (!node.contents) node.contents = [];
        if (node.contents.length > newSize) node.contents.length = newSize;
        else while (node.contents.length < newSize) node.contents.push(0);
        node.usedBytes = newSize;
      },node_ops:{getattr:function (node) {
          var attr = {};
          // device numbers reuse inode numbers.
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.timestamp);
          attr.mtime = new Date(node.timestamp);
          attr.ctime = new Date(node.timestamp);
          // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
          //       but this is not required by the standard.
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
          if (attr.size !== undefined) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },lookup:function (parent, name) {
          throw FS.genericErrors[ERRNO_CODES.ENOENT];
        },mknod:function (parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },rename:function (old_node, new_dir, new_name) {
          // if we're overwriting a directory at new_name, make sure it's empty.
          if (FS.isDir(old_node.mode)) {
            var new_node;
            try {
              new_node = FS.lookupNode(new_dir, new_name);
            } catch (e) {
            }
            if (new_node) {
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
              }
            }
          }
          // do the internal rewiring
          delete old_node.parent.contents[old_node.name];
          old_node.name = new_name;
          new_dir.contents[new_name] = old_node;
          old_node.parent = new_dir;
        },unlink:function (parent, name) {
          delete parent.contents[name];
        },rmdir:function (parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
          }
          delete parent.contents[name];
        },readdir:function (node) {
          var entries = ['.', '..']
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },symlink:function (parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 511 /* 0777 */ | 40960, 0);
          node.link = oldpath;
          return node;
        },readlink:function (node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return node.link;
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          assert(size >= 0);
          if (size > 8 && contents.subarray) { // non-trivial, and typed array
            buffer.set(contents.subarray(position, position + size), offset);
          } else {
            for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
          }
          return size;
        },write:function (stream, buffer, offset, length, position, canOwn) {
          if (!length) return 0;
          var node = stream.node;
          node.timestamp = Date.now();
  
          if (buffer.subarray && (!node.contents || node.contents.subarray)) { // This write is from a typed array to a typed array?
            if (canOwn) {
              assert(position === 0, 'canOwn must imply no weird position inside the file');
              node.contents = buffer.subarray(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (node.usedBytes === 0 && position === 0) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
              node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
              node.usedBytes = length;
              return length;
            } else if (position + length <= node.usedBytes) { // Writing to an already allocated and used subrange of the file?
              node.contents.set(buffer.subarray(offset, offset + length), position);
              return length;
            }
          }
  
          // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
          MEMFS.expandFileStorage(node, position+length);
          if (node.contents.subarray && buffer.subarray) node.contents.set(buffer.subarray(offset, offset + length), position); // Use typed array write if available.
          else {
            for (var i = 0; i < length; i++) {
             node.contents[position + i] = buffer[offset + i]; // Or fall back to manual write if not.
            }
          }
          node.usedBytes = Math.max(node.usedBytes, position+length);
          return length;
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        },allocate:function (stream, offset, length) {
          MEMFS.expandFileStorage(stream.node, offset + length);
          stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
        },mmap:function (stream, buffer, offset, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          // Only make a new copy when MAP_PRIVATE is specified.
          if ( !(flags & 2) &&
                (contents.buffer === buffer || contents.buffer === buffer.buffer) ) {
            // We can't emulate MAP_SHARED when the file is not backed by the buffer
            // we're mapping to (e.g. the HEAP buffer).
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            // Try to avoid unnecessary slices.
            if (position > 0 || position + length < stream.node.usedBytes) {
              if (contents.subarray) {
                contents = contents.subarray(position, position + length);
              } else {
                contents = Array.prototype.slice.call(contents, position, position + length);
              }
            }
            allocated = true;
            ptr = _malloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(ERRNO_CODES.ENOMEM);
            }
            buffer.set(contents, ptr);
          }
          return { ptr: ptr, allocated: allocated };
        },msync:function (stream, buffer, offset, length, mmapFlags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          if (mmapFlags & 2) {
            // MAP_PRIVATE calls need not to be synced back to underlying fs
            return 0;
          }
  
          var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          // should we check if bytesWritten and length are the same?
          return 0;
        }}};
  
  var IDBFS={dbs:{},indexedDB:function () {
        if (typeof indexedDB !== 'undefined') return indexedDB;
        var ret = null;
        if (typeof window === 'object') ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        assert(ret, 'IDBFS used, but indexedDB not supported');
        return ret;
      },DB_VERSION:21,DB_STORE_NAME:"FILE_DATA",mount:function (mount) {
        // reuse all of the core MEMFS functionality
        return MEMFS.mount.apply(null, arguments);
      },syncfs:function (mount, populate, callback) {
        IDBFS.getLocalSet(mount, function(err, local) {
          if (err) return callback(err);
  
          IDBFS.getRemoteSet(mount, function(err, remote) {
            if (err) return callback(err);
  
            var src = populate ? remote : local;
            var dst = populate ? local : remote;
  
            IDBFS.reconcile(src, dst, callback);
          });
        });
      },getDB:function (name, callback) {
        // check the cache first
        var db = IDBFS.dbs[name];
        if (db) {
          return callback(null, db);
        }
  
        var req;
        try {
          req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
        } catch (e) {
          return callback(e);
        }
        if (!req) {
          return callback("Unable to connect to IndexedDB");
        }
        req.onupgradeneeded = function(e) {
          var db = e.target.result;
          var transaction = e.target.transaction;
  
          var fileStore;
  
          if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
            fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
          } else {
            fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME);
          }
  
          if (!fileStore.indexNames.contains('timestamp')) {
            fileStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        req.onsuccess = function() {
          db = req.result;
  
          // add to the cache
          IDBFS.dbs[name] = db;
          callback(null, db);
        };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },getLocalSet:function (mount, callback) {
        var entries = {};
  
        function isRealDir(p) {
          return p !== '.' && p !== '..';
        };
        function toAbsolute(root) {
          return function(p) {
            return PATH.join2(root, p);
          }
        };
  
        var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
  
        while (check.length) {
          var path = check.pop();
          var stat;
  
          try {
            stat = FS.stat(path);
          } catch (e) {
            return callback(e);
          }
  
          if (FS.isDir(stat.mode)) {
            check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)));
          }
  
          entries[path] = { timestamp: stat.mtime };
        }
  
        return callback(null, { type: 'local', entries: entries });
      },getRemoteSet:function (mount, callback) {
        var entries = {};
  
        IDBFS.getDB(mount.mountpoint, function(err, db) {
          if (err) return callback(err);
  
          var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readonly');
          transaction.onerror = function(e) {
            callback(this.error);
            e.preventDefault();
          };
  
          var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
          var index = store.index('timestamp');
  
          index.openKeyCursor().onsuccess = function(event) {
            var cursor = event.target.result;
  
            if (!cursor) {
              return callback(null, { type: 'remote', db: db, entries: entries });
            }
  
            entries[cursor.primaryKey] = { timestamp: cursor.key };
  
            cursor.continue();
          };
        });
      },loadLocalEntry:function (path, callback) {
        var stat, node;
  
        try {
          var lookup = FS.lookupPath(path);
          node = lookup.node;
          stat = FS.stat(path);
        } catch (e) {
          return callback(e);
        }
  
        if (FS.isDir(stat.mode)) {
          return callback(null, { timestamp: stat.mtime, mode: stat.mode });
        } else if (FS.isFile(stat.mode)) {
          // Performance consideration: storing a normal JavaScript array to a IndexedDB is much slower than storing a typed array.
          // Therefore always convert the file contents to a typed array first before writing the data to IndexedDB.
          node.contents = MEMFS.getFileDataAsTypedArray(node);
          return callback(null, { timestamp: stat.mtime, mode: stat.mode, contents: node.contents });
        } else {
          return callback(new Error('node type not supported'));
        }
      },storeLocalEntry:function (path, entry, callback) {
        try {
          if (FS.isDir(entry.mode)) {
            FS.mkdir(path, entry.mode);
          } else if (FS.isFile(entry.mode)) {
            FS.writeFile(path, entry.contents, { encoding: 'binary', canOwn: true });
          } else {
            return callback(new Error('node type not supported'));
          }
  
          FS.chmod(path, entry.mode);
          FS.utime(path, entry.timestamp, entry.timestamp);
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },removeLocalEntry:function (path, callback) {
        try {
          var lookup = FS.lookupPath(path);
          var stat = FS.stat(path);
  
          if (FS.isDir(stat.mode)) {
            FS.rmdir(path);
          } else if (FS.isFile(stat.mode)) {
            FS.unlink(path);
          }
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },loadRemoteEntry:function (store, path, callback) {
        var req = store.get(path);
        req.onsuccess = function(event) { callback(null, event.target.result); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },storeRemoteEntry:function (store, path, entry, callback) {
        var req = store.put(entry, path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },removeRemoteEntry:function (store, path, callback) {
        var req = store.delete(path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },reconcile:function (src, dst, callback) {
        var total = 0;
  
        var create = [];
        Object.keys(src.entries).forEach(function (key) {
          var e = src.entries[key];
          var e2 = dst.entries[key];
          if (!e2 || e.timestamp > e2.timestamp) {
            create.push(key);
            total++;
          }
        });
  
        var remove = [];
        Object.keys(dst.entries).forEach(function (key) {
          var e = dst.entries[key];
          var e2 = src.entries[key];
          if (!e2) {
            remove.push(key);
            total++;
          }
        });
  
        if (!total) {
          return callback(null);
        }
  
        var errored = false;
        var completed = 0;
        var db = src.type === 'remote' ? src.db : dst.db;
        var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readwrite');
        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return callback(err);
            }
            return;
          }
          if (++completed >= total) {
            return callback(null);
          }
        };
  
        transaction.onerror = function(e) {
          done(this.error);
          e.preventDefault();
        };
  
        // sort paths in ascending order so directory entries are created
        // before the files inside them
        create.sort().forEach(function (path) {
          if (dst.type === 'local') {
            IDBFS.loadRemoteEntry(store, path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeLocalEntry(path, entry, done);
            });
          } else {
            IDBFS.loadLocalEntry(path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeRemoteEntry(store, path, entry, done);
            });
          }
        });
  
        // sort paths in descending order so files are deleted before their
        // parent directories
        remove.sort().reverse().forEach(function(path) {
          if (dst.type === 'local') {
            IDBFS.removeLocalEntry(path, done);
          } else {
            IDBFS.removeRemoteEntry(store, path, done);
          }
        });
      }};
  
  var NODEFS={isWindows:false,staticInit:function () {
        NODEFS.isWindows = !!process.platform.match(/^win/);
      },mount:function (mount) {
        assert(ENVIRONMENT_IS_NODE);
        return NODEFS.createNode(null, '/', NODEFS.getMode(mount.opts.root), 0);
      },createNode:function (parent, name, mode, dev) {
        if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node = FS.createNode(parent, name, mode);
        node.node_ops = NODEFS.node_ops;
        node.stream_ops = NODEFS.stream_ops;
        return node;
      },getMode:function (path) {
        var stat;
        try {
          stat = fs.lstatSync(path);
          if (NODEFS.isWindows) {
            // On Windows, directories return permission bits 'rw-rw-rw-', even though they have 'rwxrwxrwx', so
            // propagate write bits to execute bits.
            stat.mode = stat.mode | ((stat.mode & 146) >> 1);
          }
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
        return stat.mode;
      },realPath:function (node) {
        var parts = [];
        while (node.parent !== node) {
          parts.push(node.name);
          node = node.parent;
        }
        parts.push(node.mount.opts.root);
        parts.reverse();
        return PATH.join.apply(null, parts);
      },flagsToPermissionStringMap:{0:"r",1:"r+",2:"r+",64:"r",65:"r+",66:"r+",129:"rx+",193:"rx+",514:"w+",577:"w",578:"w+",705:"wx",706:"wx+",1024:"a",1025:"a",1026:"a+",1089:"a",1090:"a+",1153:"ax",1154:"ax+",1217:"ax",1218:"ax+",4096:"rs",4098:"rs+"},flagsToPermissionString:function (flags) {
        flags &= ~0x200000 /*O_PATH*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x800 /*O_NONBLOCK*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x8000 /*O_LARGEFILE*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x80000 /*O_CLOEXEC*/; // Some applications may pass it; it makes no sense for a single process.
        if (flags in NODEFS.flagsToPermissionStringMap) {
          return NODEFS.flagsToPermissionStringMap[flags];
        } else {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
      },node_ops:{getattr:function (node) {
          var path = NODEFS.realPath(node);
          var stat;
          try {
            stat = fs.lstatSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          // node.js v0.10.20 doesn't report blksize and blocks on Windows. Fake them with default blksize of 4096.
          // See http://support.microsoft.com/kb/140365
          if (NODEFS.isWindows && !stat.blksize) {
            stat.blksize = 4096;
          }
          if (NODEFS.isWindows && !stat.blocks) {
            stat.blocks = (stat.size+stat.blksize-1)/stat.blksize|0;
          }
          return {
            dev: stat.dev,
            ino: stat.ino,
            mode: stat.mode,
            nlink: stat.nlink,
            uid: stat.uid,
            gid: stat.gid,
            rdev: stat.rdev,
            size: stat.size,
            atime: stat.atime,
            mtime: stat.mtime,
            ctime: stat.ctime,
            blksize: stat.blksize,
            blocks: stat.blocks
          };
        },setattr:function (node, attr) {
          var path = NODEFS.realPath(node);
          try {
            if (attr.mode !== undefined) {
              fs.chmodSync(path, attr.mode);
              // update the common node structure mode as well
              node.mode = attr.mode;
            }
            if (attr.timestamp !== undefined) {
              var date = new Date(attr.timestamp);
              fs.utimesSync(path, date, date);
            }
            if (attr.size !== undefined) {
              fs.truncateSync(path, attr.size);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },lookup:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          var mode = NODEFS.getMode(path);
          return NODEFS.createNode(parent, name, mode);
        },mknod:function (parent, name, mode, dev) {
          var node = NODEFS.createNode(parent, name, mode, dev);
          // create the backing node for this in the fs root as well
          var path = NODEFS.realPath(node);
          try {
            if (FS.isDir(node.mode)) {
              fs.mkdirSync(path, node.mode);
            } else {
              fs.writeFileSync(path, '', { mode: node.mode });
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          return node;
        },rename:function (oldNode, newDir, newName) {
          var oldPath = NODEFS.realPath(oldNode);
          var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
          try {
            fs.renameSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },unlink:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.unlinkSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },rmdir:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.rmdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readdir:function (node) {
          var path = NODEFS.realPath(node);
          try {
            return fs.readdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },symlink:function (parent, newName, oldPath) {
          var newPath = PATH.join2(NODEFS.realPath(parent), newName);
          try {
            fs.symlinkSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readlink:function (node) {
          var path = NODEFS.realPath(node);
          try {
            path = fs.readlinkSync(path);
            path = NODEJS_PATH.relative(NODEJS_PATH.resolve(node.mount.opts.root), path);
            return path;
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        }},stream_ops:{open:function (stream) {
          var path = NODEFS.realPath(stream.node);
          try {
            if (FS.isFile(stream.node.mode)) {
              stream.nfd = fs.openSync(path, NODEFS.flagsToPermissionString(stream.flags));
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },close:function (stream) {
          try {
            if (FS.isFile(stream.node.mode) && stream.nfd) {
              fs.closeSync(stream.nfd);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },read:function (stream, buffer, offset, length, position) {
          if (length === 0) return 0; // node errors on 0 length reads
          // FIXME this is terrible.
          var nbuffer = new Buffer(length);
          var res;
          try {
            res = fs.readSync(stream.nfd, nbuffer, 0, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          if (res > 0) {
            for (var i = 0; i < res; i++) {
              buffer[offset + i] = nbuffer[i];
            }
          }
          return res;
        },write:function (stream, buffer, offset, length, position) {
          // FIXME this is terrible.
          var nbuffer = new Buffer(buffer.subarray(offset, offset + length));
          var res;
          try {
            res = fs.writeSync(stream.nfd, nbuffer, 0, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          return res;
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              try {
                var stat = fs.fstatSync(stream.nfd);
                position += stat.size;
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
              }
            }
          }
  
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
  
          return position;
        }}};
  
  var WORKERFS={DIR_MODE:16895,FILE_MODE:33279,reader:null,mount:function (mount) {
        assert(ENVIRONMENT_IS_WORKER);
        if (!WORKERFS.reader) WORKERFS.reader = new FileReaderSync();
        var root = WORKERFS.createNode(null, '/', WORKERFS.DIR_MODE, 0);
        var createdParents = {};
        function ensureParent(path) {
          // return the parent node, creating subdirs as necessary
          var parts = path.split('/');
          var parent = root;
          for (var i = 0; i < parts.length-1; i++) {
            var curr = parts.slice(0, i+1).join('/');
            // Issue 4254: Using curr as a node name will prevent the node
            // from being found in FS.nameTable when FS.open is called on
            // a path which holds a child of this node,
            // given that all FS functions assume node names
            // are just their corresponding parts within their given path,
            // rather than incremental aggregates which include their parent's
            // directories.
            if (!createdParents[curr]) {
              createdParents[curr] = WORKERFS.createNode(parent, parts[i], WORKERFS.DIR_MODE, 0);
            }
            parent = createdParents[curr];
          }
          return parent;
        }
        function base(path) {
          var parts = path.split('/');
          return parts[parts.length-1];
        }
        // We also accept FileList here, by using Array.prototype
        Array.prototype.forEach.call(mount.opts["files"] || [], function(file) {
          WORKERFS.createNode(ensureParent(file.name), base(file.name), WORKERFS.FILE_MODE, 0, file, file.lastModifiedDate);
        });
        (mount.opts["blobs"] || []).forEach(function(obj) {
          WORKERFS.createNode(ensureParent(obj["name"]), base(obj["name"]), WORKERFS.FILE_MODE, 0, obj["data"]);
        });
        (mount.opts["packages"] || []).forEach(function(pack) {
          pack['metadata'].files.forEach(function(file) {
            var name = file.filename.substr(1); // remove initial slash
            WORKERFS.createNode(ensureParent(name), base(name), WORKERFS.FILE_MODE, 0, pack['blob'].slice(file.start, file.end));
          });
        });
        return root;
      },createNode:function (parent, name, mode, dev, contents, mtime) {
        var node = FS.createNode(parent, name, mode);
        node.mode = mode;
        node.node_ops = WORKERFS.node_ops;
        node.stream_ops = WORKERFS.stream_ops;
        node.timestamp = (mtime || new Date).getTime();
        assert(WORKERFS.FILE_MODE !== WORKERFS.DIR_MODE);
        if (mode === WORKERFS.FILE_MODE) {
          node.size = contents.size;
          node.contents = contents;
        } else {
          node.size = 4096;
          node.contents = {};
        }
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },node_ops:{getattr:function (node) {
          return {
            dev: 1,
            ino: undefined,
            mode: node.mode,
            nlink: 1,
            uid: 0,
            gid: 0,
            rdev: undefined,
            size: node.size,
            atime: new Date(node.timestamp),
            mtime: new Date(node.timestamp),
            ctime: new Date(node.timestamp),
            blksize: 4096,
            blocks: Math.ceil(node.size / 4096),
          };
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
        },lookup:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        },mknod:function (parent, name, mode, dev) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rename:function (oldNode, newDir, newName) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },unlink:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rmdir:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readdir:function (node) {
          var entries = ['.', '..'];
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },symlink:function (parent, newName, oldPath) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readlink:function (node) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          if (position >= stream.node.size) return 0;
          var chunk = stream.node.contents.slice(position, position + length);
          var ab = WORKERFS.reader.readAsArrayBuffer(chunk);
          buffer.set(new Uint8Array(ab), offset);
          return chunk.size;
        },write:function (stream, buffer, offset, length, position) {
          throw new FS.ErrnoError(ERRNO_CODES.EIO);
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.size;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        }}};
  
  var _stdin; if (ENVIRONMENT_IS_PTHREAD) _stdin = PthreadWorkerInit._stdin; else PthreadWorkerInit._stdin = _stdin = allocate(1, "i32*", ALLOC_STATIC);
  
  var _stdout; if (ENVIRONMENT_IS_PTHREAD) _stdout = PthreadWorkerInit._stdout; else PthreadWorkerInit._stdout = _stdout = allocate(1, "i32*", ALLOC_STATIC);
  
  var _stderr; if (ENVIRONMENT_IS_PTHREAD) _stderr = PthreadWorkerInit._stderr; else PthreadWorkerInit._stderr = _stderr = allocate(1, "i32*", ALLOC_STATIC);var FS={root:null,mounts:[],devices:[null],streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,trackingDelegate:{},tracking:{openFlags:{READ:1,WRITE:2}},ErrnoError:null,genericErrors:{},filesystems:null,syncFSRequests:0,handleFSError:function (e) {
        if (!(e instanceof FS.ErrnoError)) throw e + ' : ' + stackTrace();
        return ___setErrNo(e.errno);
      },lookupPath:function (path, opts) {
        path = PATH.resolve(FS.cwd(), path);
        opts = opts || {};
  
        if (!path) return { path: '', node: null };
  
        var defaults = {
          follow_mount: true,
          recurse_count: 0
        };
        for (var key in defaults) {
          if (opts[key] === undefined) {
            opts[key] = defaults[key];
          }
        }
  
        if (opts.recurse_count > 8) {  // max recursive lookup of 8
          throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
        }
  
        // split the path
        var parts = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), false);
  
        // start at the root
        var current = FS.root;
        var current_path = '/';
  
        for (var i = 0; i < parts.length; i++) {
          var islast = (i === parts.length-1);
          if (islast && opts.parent) {
            // stop resolving
            break;
          }
  
          current = FS.lookupNode(current, parts[i]);
          current_path = PATH.join2(current_path, parts[i]);
  
          // jump to the mount's root node if this is a mountpoint
          if (FS.isMountpoint(current)) {
            if (!islast || (islast && opts.follow_mount)) {
              current = current.mounted.root;
            }
          }
  
          // by default, lookupPath will not follow a symlink if it is the final path component.
          // setting opts.follow = true will override this behavior.
          if (!islast || opts.follow) {
            var count = 0;
            while (FS.isLink(current.mode)) {
              var link = FS.readlink(current_path);
              current_path = PATH.resolve(PATH.dirname(current_path), link);
  
              var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count });
              current = lookup.node;
  
              if (count++ > 40) {  // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
                throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
              }
            }
          }
        }
  
        return { path: current_path, node: current };
      },getPath:function (node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length-1] !== '/' ? mount + '/' + path : mount + path;
          }
          path = path ? node.name + '/' + path : node.name;
          node = node.parent;
        }
      },hashName:function (parentid, name) {
        var hash = 0;
  
  
        for (var i = 0; i < name.length; i++) {
          hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
      },hashAddNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },hashRemoveNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },lookupNode:function (parent, name) {
        var err = FS.mayLookup(parent);
        if (err) {
          throw new FS.ErrnoError(err, parent);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        // if we failed to find it in the cache, call into the VFS
        return FS.lookup(parent, name);
      },createNode:function (parent, name, mode, rdev) {
        if (!FS.FSNode) {
          FS.FSNode = function(parent, name, mode, rdev) {
            if (!parent) {
              parent = this;  // root node sets parent to itself
            }
            this.parent = parent;
            this.mount = parent.mount;
            this.mounted = null;
            this.id = FS.nextInode++;
            this.name = name;
            this.mode = mode;
            this.node_ops = {};
            this.stream_ops = {};
            this.rdev = rdev;
          };
  
          FS.FSNode.prototype = {};
  
          // compatibility
          var readMode = 292 | 73;
          var writeMode = 146;
  
          // NOTE we must use Object.defineProperties instead of individual calls to
          // Object.defineProperty in order to make closure compiler happy
          Object.defineProperties(FS.FSNode.prototype, {
            read: {
              get: function() { return (this.mode & readMode) === readMode; },
              set: function(val) { val ? this.mode |= readMode : this.mode &= ~readMode; }
            },
            write: {
              get: function() { return (this.mode & writeMode) === writeMode; },
              set: function(val) { val ? this.mode |= writeMode : this.mode &= ~writeMode; }
            },
            isFolder: {
              get: function() { return FS.isDir(this.mode); }
            },
            isDevice: {
              get: function() { return FS.isChrdev(this.mode); }
            }
          });
        }
  
        var node = new FS.FSNode(parent, name, mode, rdev);
  
        FS.hashAddNode(node);
  
        return node;
      },destroyNode:function (node) {
        FS.hashRemoveNode(node);
      },isRoot:function (node) {
        return node === node.parent;
      },isMountpoint:function (node) {
        return !!node.mounted;
      },isFile:function (mode) {
        return (mode & 61440) === 32768;
      },isDir:function (mode) {
        return (mode & 61440) === 16384;
      },isLink:function (mode) {
        return (mode & 61440) === 40960;
      },isChrdev:function (mode) {
        return (mode & 61440) === 8192;
      },isBlkdev:function (mode) {
        return (mode & 61440) === 24576;
      },isFIFO:function (mode) {
        return (mode & 61440) === 4096;
      },isSocket:function (mode) {
        return (mode & 49152) === 49152;
      },flagModes:{"r":0,"rs":1052672,"r+":2,"w":577,"wx":705,"xw":705,"w+":578,"wx+":706,"xw+":706,"a":1089,"ax":1217,"xa":1217,"a+":1090,"ax+":1218,"xa+":1218},modeStringToFlags:function (str) {
        var flags = FS.flagModes[str];
        if (typeof flags === 'undefined') {
          throw new Error('Unknown file open mode: ' + str);
        }
        return flags;
      },flagsToPermissionString:function (flag) {
        var perms = ['r', 'w', 'rw'][flag & 3];
        if ((flag & 512)) {
          perms += 'w';
        }
        return perms;
      },nodePermissions:function (node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        // return 0 if any user, group or owner bits are set.
        if (perms.indexOf('r') !== -1 && !(node.mode & 292)) {
          return ERRNO_CODES.EACCES;
        } else if (perms.indexOf('w') !== -1 && !(node.mode & 146)) {
          return ERRNO_CODES.EACCES;
        } else if (perms.indexOf('x') !== -1 && !(node.mode & 73)) {
          return ERRNO_CODES.EACCES;
        }
        return 0;
      },mayLookup:function (dir) {
        var err = FS.nodePermissions(dir, 'x');
        if (err) return err;
        if (!dir.node_ops.lookup) return ERRNO_CODES.EACCES;
        return 0;
      },mayCreate:function (dir, name) {
        try {
          var node = FS.lookupNode(dir, name);
          return ERRNO_CODES.EEXIST;
        } catch (e) {
        }
        return FS.nodePermissions(dir, 'wx');
      },mayDelete:function (dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var err = FS.nodePermissions(dir, 'wx');
        if (err) {
          return err;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return ERRNO_CODES.ENOTDIR;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return ERRNO_CODES.EBUSY;
          }
        } else {
          if (FS.isDir(node.mode)) {
            return ERRNO_CODES.EISDIR;
          }
        }
        return 0;
      },mayOpen:function (node, flags) {
        if (!node) {
          return ERRNO_CODES.ENOENT;
        }
        if (FS.isLink(node.mode)) {
          return ERRNO_CODES.ELOOP;
        } else if (FS.isDir(node.mode)) {
          if (FS.flagsToPermissionString(flags) !== 'r' || // opening for write
              (flags & 512)) { // TODO: check for O_SEARCH? (== search for dir only)
            return ERRNO_CODES.EISDIR;
          }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
      },MAX_OPEN_FDS:4096,nextfd:function (fd_start, fd_end) {
        fd_start = fd_start || 0;
        fd_end = fd_end || FS.MAX_OPEN_FDS;
        for (var fd = fd_start; fd <= fd_end; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(ERRNO_CODES.EMFILE);
      },getStream:function (fd) {
        return FS.streams[fd];
      },createStream:function (stream, fd_start, fd_end) {
        if (!FS.FSStream) {
          FS.FSStream = function(){};
          FS.FSStream.prototype = {};
          // compatibility
          Object.defineProperties(FS.FSStream.prototype, {
            object: {
              get: function() { return this.node; },
              set: function(val) { this.node = val; }
            },
            isRead: {
              get: function() { return (this.flags & 2097155) !== 1; }
            },
            isWrite: {
              get: function() { return (this.flags & 2097155) !== 0; }
            },
            isAppend: {
              get: function() { return (this.flags & 1024); }
            }
          });
        }
        // clone it, so we can return an instance of FSStream
        var newStream = new FS.FSStream();
        for (var p in stream) {
          newStream[p] = stream[p];
        }
        stream = newStream;
        var fd = FS.nextfd(fd_start, fd_end);
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },closeStream:function (fd) {
        FS.streams[fd] = null;
      },chrdev_stream_ops:{open:function (stream) {
          var device = FS.getDevice(stream.node.rdev);
          // override node's stream ops with the device's
          stream.stream_ops = device.stream_ops;
          // forward the open call
          if (stream.stream_ops.open) {
            stream.stream_ops.open(stream);
          }
        },llseek:function () {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }},major:function (dev) {
        return ((dev) >> 8);
      },minor:function (dev) {
        return ((dev) & 0xff);
      },makedev:function (ma, mi) {
        return ((ma) << 8 | (mi));
      },registerDevice:function (dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },getDevice:function (dev) {
        return FS.devices[dev];
      },getMounts:function (mount) {
        var mounts = [];
        var check = [mount];
  
        while (check.length) {
          var m = check.pop();
  
          mounts.push(m);
  
          check.push.apply(check, m.mounts);
        }
  
        return mounts;
      },syncfs:function (populate, callback) {
        if (typeof(populate) === 'function') {
          callback = populate;
          populate = false;
        }
  
        FS.syncFSRequests++;
  
        if (FS.syncFSRequests > 1) {
          console.log('warning: ' + FS.syncFSRequests + ' FS.syncfs operations in flight at once, probably just doing extra work');
        }
  
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
  
        function doCallback(err) {
          assert(FS.syncFSRequests > 0);
          FS.syncFSRequests--;
          return callback(err);
        }
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(err);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        };
  
        // sync all mounts
        mounts.forEach(function (mount) {
          if (!mount.type.syncfs) {
            return done(null);
          }
          mount.type.syncfs(mount, populate, done);
        });
      },mount:function (type, opts, mountpoint) {
        var root = mountpoint === '/';
        var pseudo = !mountpoint;
        var node;
  
        if (root && FS.root) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
          mountpoint = lookup.path;  // use the absolute path
          node = lookup.node;
  
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
          }
  
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
          }
        }
  
        var mount = {
          type: type,
          opts: opts,
          mountpoint: mountpoint,
          mounts: []
        };
  
        // create a root node for the fs
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
  
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          // set as a mountpoint
          node.mounted = mount;
  
          // add the new mount to the current mount's children
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
  
        return mountRoot;
      },unmount:function (mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
  
        // destroy the nodes for this mount, and all its child mounts
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
  
        Object.keys(FS.nameTable).forEach(function (hash) {
          var current = FS.nameTable[hash];
  
          while (current) {
            var next = current.name_next;
  
            if (mounts.indexOf(current.mount) !== -1) {
              FS.destroyNode(current);
            }
  
            current = next;
          }
        });
  
        // no longer a mountpoint
        node.mounted = null;
  
        // remove this mount from the child mounts
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
      },lookup:function (parent, name) {
        return parent.node_ops.lookup(parent, name);
      },mknod:function (path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === '.' || name === '..') {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.mayCreate(parent, name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },create:function (path, mode) {
        mode = mode !== undefined ? mode : 438 /* 0666 */;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },mkdir:function (path, mode) {
        mode = mode !== undefined ? mode : 511 /* 0777 */;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },mkdirTree:function (path, mode) {
        var dirs = path.split('/');
        var d = '';
        for (var i = 0; i < dirs.length; ++i) {
          if (!dirs[i]) continue;
          d += '/' + dirs[i];
          try {
            FS.mkdir(d, mode);
          } catch(e) {
            if (e.errno != ERRNO_CODES.EEXIST) throw e;
          }
        }
      },mkdev:function (path, mode, dev) {
        if (typeof(dev) === 'undefined') {
          dev = mode;
          mode = 438 /* 0666 */;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },symlink:function (oldpath, newpath) {
        if (!PATH.resolve(oldpath)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var newname = PATH.basename(newpath);
        var err = FS.mayCreate(parent, newname);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },rename:function (old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        // parents must exist
        var lookup, old_dir, new_dir;
        try {
          lookup = FS.lookupPath(old_path, { parent: true });
          old_dir = lookup.node;
          lookup = FS.lookupPath(new_path, { parent: true });
          new_dir = lookup.node;
        } catch (e) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        if (!old_dir || !new_dir) throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        // need to be part of the same mount
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(ERRNO_CODES.EXDEV);
        }
        // source must exist
        var old_node = FS.lookupNode(old_dir, old_name);
        // old path should not be an ancestor of the new path
        var relative = PATH.relative(old_path, new_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        // new path should not be an ancestor of the old path
        relative = PATH.relative(new_path, old_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
        }
        // see if the new path already exists
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
          // not fatal
        }
        // early out if nothing needs to change
        if (old_node === new_node) {
          return;
        }
        // we'll need to delete the old entry
        var isdir = FS.isDir(old_node.mode);
        var err = FS.mayDelete(old_dir, old_name, isdir);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        // need delete permissions if we'll be overwriting.
        // need create permissions if new doesn't already exist.
        err = new_node ?
          FS.mayDelete(new_dir, new_name, isdir) :
          FS.mayCreate(new_dir, new_name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        // if we are going to change the parent, check write permissions
        if (new_dir !== old_dir) {
          err = FS.nodePermissions(old_dir, 'w');
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        try {
          if (FS.trackingDelegate['willMovePath']) {
            FS.trackingDelegate['willMovePath'](old_path, new_path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
        // remove the node from the lookup hash
        FS.hashRemoveNode(old_node);
        // do the underlying fs rename
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
        } catch (e) {
          throw e;
        } finally {
          // add the node back to the hash (in case node_ops.rename
          // changed its name)
          FS.hashAddNode(old_node);
        }
        try {
          if (FS.trackingDelegate['onMovePath']) FS.trackingDelegate['onMovePath'](old_path, new_path);
        } catch(e) {
          console.log("FS.trackingDelegate['onMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
      },rmdir:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, true);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        return node.node_ops.readdir(node);
      },unlink:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, false);
        if (err) {
          // According to POSIX, we should map EISDIR to EPERM, but
          // we instead do what Linux does (and we must, as we use
          // the musl linux libc).
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readlink:function (path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        return PATH.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
      },stat:function (path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        if (!node) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!node.node_ops.getattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return node.node_ops.getattr(node);
      },lstat:function (path) {
        return FS.stat(path, true);
      },chmod:function (path, mode, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, {
          mode: (mode & 4095) | (node.mode & ~4095),
          timestamp: Date.now()
        });
      },lchmod:function (path, mode) {
        FS.chmod(path, mode, true);
      },fchmod:function (fd, mode) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chmod(stream.node, mode);
      },chown:function (path, uid, gid, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, {
          timestamp: Date.now()
          // we ignore the uid / gid for now
        });
      },lchown:function (path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },fchown:function (fd, uid, gid) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chown(stream.node, uid, gid);
      },truncate:function (path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.nodePermissions(node, 'w');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        node.node_ops.setattr(node, {
          size: len,
          timestamp: Date.now()
        });
      },ftruncate:function (fd, len) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        FS.truncate(stream.node, len);
      },utime:function (path, atime, mtime) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        node.node_ops.setattr(node, {
          timestamp: Math.max(atime, mtime)
        });
      },open:function (path, flags, mode, fd_start, fd_end) {
        if (path === "") {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        flags = typeof flags === 'string' ? FS.modeStringToFlags(flags) : flags;
        mode = typeof mode === 'undefined' ? 438 /* 0666 */ : mode;
        if ((flags & 64)) {
          mode = (mode & 4095) | 32768;
        } else {
          mode = 0;
        }
        var node;
        if (typeof path === 'object') {
          node = path;
        } else {
          path = PATH.normalize(path);
          try {
            var lookup = FS.lookupPath(path, {
              follow: !(flags & 131072)
            });
            node = lookup.node;
          } catch (e) {
            // ignore
          }
        }
        // perhaps we need to create the node
        var created = false;
        if ((flags & 64)) {
          if (node) {
            // if O_CREAT and O_EXCL are set, error out if the node already exists
            if ((flags & 128)) {
              throw new FS.ErrnoError(ERRNO_CODES.EEXIST);
            }
          } else {
            // node doesn't exist, try to create it
            node = FS.mknod(path, mode, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        // can't truncate a device
        if (FS.isChrdev(node.mode)) {
          flags &= ~512;
        }
        // if asked only for a directory, then this must be one
        if ((flags & 65536) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        // check permissions, if this is not a file we just created now (it is ok to
        // create and write to a file with read-only permissions; it is read-only
        // for later use)
        if (!created) {
          var err = FS.mayOpen(node, flags);
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        // do truncation if necessary
        if ((flags & 512)) {
          FS.truncate(node, 0);
        }
        // we've already handled these, don't pass down to the underlying vfs
        flags &= ~(128 | 512);
  
        // register the stream with the filesystem
        var stream = FS.createStream({
          node: node,
          path: FS.getPath(node),  // we want the absolute path to the node
          flags: flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          // used by the file family libc calls (fopen, fwrite, ferror, etc.)
          ungotten: [],
          error: false
        }, fd_start, fd_end);
        // call the new stream's open function
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (Module['logReadFiles'] && !(flags & 1)) {
          if (!FS.readFiles) FS.readFiles = {};
          if (!(path in FS.readFiles)) {
            FS.readFiles[path] = 1;
            Module['printErr']('read file: ' + path);
          }
        }
        try {
          if (FS.trackingDelegate['onOpenFile']) {
            var trackingFlags = 0;
            if ((flags & 2097155) !== 1) {
              trackingFlags |= FS.tracking.openFlags.READ;
            }
            if ((flags & 2097155) !== 0) {
              trackingFlags |= FS.tracking.openFlags.WRITE;
            }
            FS.trackingDelegate['onOpenFile'](path, trackingFlags);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['onOpenFile']('"+path+"', flags) threw an exception: " + e.message);
        }
        return stream;
      },close:function (stream) {
        if (stream.getdents) stream.getdents = null; // free readdir state
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
      },llseek:function (stream, offset, whence) {
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },read:function (stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var seeking = true;
        if (typeof position === 'undefined') {
          position = stream.position;
          seeking = false;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },write:function (stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if (stream.flags & 1024) {
          // seek to the end before writing in append mode
          FS.llseek(stream, 0, 2);
        }
        var seeking = true;
        if (typeof position === 'undefined') {
          position = stream.position;
          seeking = false;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        try {
          if (stream.path && FS.trackingDelegate['onWriteToFile']) FS.trackingDelegate['onWriteToFile'](stream.path);
        } catch(e) {
          console.log("FS.trackingDelegate['onWriteToFile']('"+path+"') threw an exception: " + e.message);
        }
        return bytesWritten;
      },allocate:function (stream, offset, length) {
        if (offset < 0 || length <= 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        if (!stream.stream_ops.allocate) {
          throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
        }
        stream.stream_ops.allocate(stream, offset, length);
      },mmap:function (stream, buffer, offset, length, position, prot, flags) {
        // TODO if PROT is PROT_WRITE, make sure we have write access
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(ERRNO_CODES.EACCES);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags);
      },msync:function (stream, buffer, offset, length, mmapFlags) {
        if (!stream || !stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
      },munmap:function (stream) {
        return 0;
      },ioctl:function (stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTTY);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },readFile:function (path, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'r';
        opts.encoding = opts.encoding || 'binary';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === 'utf8') {
          ret = UTF8ArrayToString(buf, 0);
        } else if (opts.encoding === 'binary') {
          ret = buf;
        }
        FS.close(stream);
        return ret;
      },writeFile:function (path, data, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'w';
        opts.encoding = opts.encoding || 'utf8';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var stream = FS.open(path, opts.flags, opts.mode);
        if (opts.encoding === 'utf8') {
          var buf = new Uint8Array(lengthBytesUTF8(data)+1);
          var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
          FS.write(stream, buf, 0, actualNumBytes, 0, opts.canOwn);
        } else if (opts.encoding === 'binary') {
          FS.write(stream, data, 0, data.length, 0, opts.canOwn);
        }
        FS.close(stream);
      },cwd:function () {
        return FS.currentPath;
      },chdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        var err = FS.nodePermissions(lookup.node, 'x');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        FS.currentPath = lookup.path;
      },createDefaultDirectories:function () {
        FS.mkdir('/tmp');
        FS.mkdir('/home');
        FS.mkdir('/home/web_user');
      },createDefaultDevices:function () {
        // create /dev
        FS.mkdir('/dev');
        // setup /dev/null
        FS.registerDevice(FS.makedev(1, 3), {
          read: function() { return 0; },
          write: function(stream, buffer, offset, length, pos) { return length; }
        });
        FS.mkdev('/dev/null', FS.makedev(1, 3));
        // setup /dev/tty and /dev/tty1
        // stderr needs to print output using Module['printErr']
        // so we register a second tty just for it.
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev('/dev/tty', FS.makedev(5, 0));
        FS.mkdev('/dev/tty1', FS.makedev(6, 0));
        // setup /dev/[u]random
        var random_device;
        if (typeof crypto !== 'undefined') {
          // for modern web browsers
          var randomBuffer = new Uint8Array(1);
          random_device = function() { crypto.getRandomValues(randomBuffer); return randomBuffer[0]; };
        } else if (ENVIRONMENT_IS_NODE) {
          // for nodejs
          random_device = function() { return require('crypto').randomBytes(1)[0]; };
        } else {
          // default for ES5 platforms
          random_device = function() { return (Math.random()*256)|0; };
        }
        FS.createDevice('/dev', 'random', random_device);
        FS.createDevice('/dev', 'urandom', random_device);
        // we're not going to emulate the actual shm device,
        // just create the tmp dirs that reside in it commonly
        FS.mkdir('/dev/shm');
        FS.mkdir('/dev/shm/tmp');
      },createSpecialDirectories:function () {
        // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the name of the stream for fd 6 (see test_unistd_ttyname)
        FS.mkdir('/proc');
        FS.mkdir('/proc/self');
        FS.mkdir('/proc/self/fd');
        FS.mount({
          mount: function() {
            var node = FS.createNode('/proc/self', 'fd', 16384 | 511 /* 0777 */, 73);
            node.node_ops = {
              lookup: function(parent, name) {
                var fd = +name;
                var stream = FS.getStream(fd);
                if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
                var ret = {
                  parent: null,
                  mount: { mountpoint: 'fake' },
                  node_ops: { readlink: function() { return stream.path } }
                };
                ret.parent = ret; // make it look like a simple root node
                return ret;
              }
            };
            return node;
          }
        }, {}, '/proc/self/fd');
      },createStandardStreams:function () {
        // TODO deprecate the old functionality of a single
        // input / output callback and that utilizes FS.createDevice
        // and instead require a unique set of stream ops
  
        // by default, we symlink the standard streams to the
        // default tty devices. however, if the standard streams
        // have been overwritten we create a unique device for
        // them instead.
        if (Module['stdin']) {
          FS.createDevice('/dev', 'stdin', Module['stdin']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdin');
        }
        if (Module['stdout']) {
          FS.createDevice('/dev', 'stdout', null, Module['stdout']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdout');
        }
        if (Module['stderr']) {
          FS.createDevice('/dev', 'stderr', null, Module['stderr']);
        } else {
          FS.symlink('/dev/tty1', '/dev/stderr');
        }
  
        // open default streams for the stdin, stdout and stderr devices
        var stdin = FS.open('/dev/stdin', 'r');
        assert(stdin.fd === 0, 'invalid handle for stdin (' + stdin.fd + ')');
  
        var stdout = FS.open('/dev/stdout', 'w');
        assert(stdout.fd === 1, 'invalid handle for stdout (' + stdout.fd + ')');
  
        var stderr = FS.open('/dev/stderr', 'w');
        assert(stderr.fd === 2, 'invalid handle for stderr (' + stderr.fd + ')');
      },ensureErrnoError:function () {
        if (FS.ErrnoError) return;
        FS.ErrnoError = function ErrnoError(errno, node) {
          //Module.printErr(stackTrace()); // useful for debugging
          this.node = node;
          this.setErrno = function(errno) {
            this.errno = errno;
            for (var key in ERRNO_CODES) {
              if (ERRNO_CODES[key] === errno) {
                this.code = key;
                break;
              }
            }
          };
          this.setErrno(errno);
          this.message = ERRNO_MESSAGES[errno];
          if (this.stack) this.stack = demangleAll(this.stack);
        };
        FS.ErrnoError.prototype = new Error();
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
        // Some errors may happen quite a bit, to avoid overhead we reuse them (and suffer a lack of stack info)
        [ERRNO_CODES.ENOENT].forEach(function(code) {
          FS.genericErrors[code] = new FS.ErrnoError(code);
          FS.genericErrors[code].stack = '<generic error, no stack>';
        });
      },staticInit:function () {
        FS.ensureErrnoError();
  
        FS.nameTable = new Array(4096);
  
        FS.mount(MEMFS, {}, '/');
  
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
  
        FS.filesystems = {
          'MEMFS': MEMFS,
          'IDBFS': IDBFS,
          'NODEFS': NODEFS,
          'WORKERFS': WORKERFS,
        };
      },init:function (input, output, error) {
        assert(!FS.init.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
        FS.init.initialized = true;
  
        FS.ensureErrnoError();
  
        // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
        Module['stdin'] = input || Module['stdin'];
        Module['stdout'] = output || Module['stdout'];
        Module['stderr'] = error || Module['stderr'];
  
        FS.createStandardStreams();
      },quit:function () {
        FS.init.initialized = false;
        // force-flush all streams, so we get musl std streams printed out
        var fflush = Module['_fflush'];
        if (fflush) fflush(0);
        // close all of our streams
        for (var i = 0; i < FS.streams.length; i++) {
          var stream = FS.streams[i];
          if (!stream) {
            continue;
          }
          FS.close(stream);
        }
      },getMode:function (canRead, canWrite) {
        var mode = 0;
        if (canRead) mode |= 292 | 73;
        if (canWrite) mode |= 146;
        return mode;
      },joinPath:function (parts, forceRelative) {
        var path = PATH.join.apply(null, parts);
        if (forceRelative && path[0] == '/') path = path.substr(1);
        return path;
      },absolutePath:function (relative, base) {
        return PATH.resolve(base, relative);
      },standardizePath:function (path) {
        return PATH.normalize(path);
      },findObject:function (path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (ret.exists) {
          return ret.object;
        } else {
          ___setErrNo(ret.error);
          return null;
        }
      },analyzePath:function (path, dontResolveLastLink) {
        // operate from within the context of the symlink's target
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {
        }
        var ret = {
          isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
          parentExists: false, parentPath: null, parentObject: null
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === '/';
        } catch (e) {
          ret.error = e.errno;
        };
        return ret;
      },createFolder:function (parent, name, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.mkdir(path, mode);
      },createPath:function (parent, path, canRead, canWrite) {
        parent = typeof parent === 'string' ? parent : FS.getPath(parent);
        var parts = path.split('/').reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {
            // ignore EEXIST
          }
          parent = current;
        }
        return current;
      },createFile:function (parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.create(path, mode);
      },createDataFile:function (parent, name, data, canRead, canWrite, canOwn) {
        var path = name ? PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name) : parent;
        var mode = FS.getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          if (typeof data === 'string') {
            var arr = new Array(data.length);
            for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
            data = arr;
          }
          // make sure we can write to the file
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 'w');
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
        return node;
      },createDevice:function (parent, name, input, output) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(!!input, !!output);
        if (!FS.createDevice.major) FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        // Create a fake device that a set of stream ops to emulate
        // the old behavior.
        FS.registerDevice(dev, {
          open: function(stream) {
            stream.seekable = false;
          },
          close: function(stream) {
            // flush any pending line data
            if (output && output.buffer && output.buffer.length) {
              output(10);
            }
          },
          read: function(stream, buffer, offset, length, pos /* ignored */) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
              }
              if (result === undefined && bytesRead === 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset+i] = result;
            }
            if (bytesRead) {
              stream.node.timestamp = Date.now();
            }
            return bytesRead;
          },
          write: function(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset+i]);
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
              }
            }
            if (length) {
              stream.node.timestamp = Date.now();
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },createLink:function (parent, name, target, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        return FS.symlink(target, path);
      },forceLoadFile:function (obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        var success = true;
        if (typeof XMLHttpRequest !== 'undefined') {
          throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
        } else if (Module['read']) {
          // Command-line.
          try {
            // WARNING: Can't read binary files in V8's d8 or tracemonkey's js, as
            //          read() will try to parse UTF8.
            obj.contents = intArrayFromString(Module['read'](obj.url), true);
            obj.usedBytes = obj.contents.length;
          } catch (e) {
            success = false;
          }
        } else {
          throw new Error('Cannot load without read() or XMLHttpRequest.');
        }
        if (!success) ___setErrNo(ERRNO_CODES.EIO);
        return success;
      },createLazyFile:function (parent, name, url, canRead, canWrite) {
        // Lazy chunked Uint8Array (implements get and length from Uint8Array). Actual getting is abstracted away for eventual reuse.
        function LazyUint8Array() {
          this.lengthKnown = false;
          this.chunks = []; // Loaded chunks. Index is the chunk number
        }
        LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
          if (idx > this.length-1 || idx < 0) {
            return undefined;
          }
          var chunkOffset = idx % this.chunkSize;
          var chunkNum = (idx / this.chunkSize)|0;
          return this.getter(chunkNum)[chunkOffset];
        }
        LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
          this.getter = getter;
        }
        LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
          // Find length
          var xhr = new XMLHttpRequest();
          xhr.open('HEAD', url, false);
          xhr.send(null);
          if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
          var datalength = Number(xhr.getResponseHeader("Content-length"));
          var header;
          var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
          var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
  
          var chunkSize = 1024*1024; // Chunk size in bytes
  
          if (!hasByteServing) chunkSize = datalength;
  
          // Function to get a range from the remote URL.
          var doXHR = (function(from, to) {
            if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
            if (to > datalength-1) throw new Error("only " + datalength + " bytes available! programmer error!");
  
            // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
  
            // Some hints to the browser that we want binary data.
            if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
            if (xhr.overrideMimeType) {
              xhr.overrideMimeType('text/plain; charset=x-user-defined');
            }
  
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            if (xhr.response !== undefined) {
              return new Uint8Array(xhr.response || []);
            } else {
              return intArrayFromString(xhr.responseText || '', true);
            }
          });
          var lazyArray = this;
          lazyArray.setDataGetter(function(chunkNum) {
            var start = chunkNum * chunkSize;
            var end = (chunkNum+1) * chunkSize - 1; // including this byte
            end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") {
              lazyArray.chunks[chunkNum] = doXHR(start, end);
            }
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") throw new Error("doXHR failed!");
            return lazyArray.chunks[chunkNum];
          });
  
          if (usesGzip || !datalength) {
            // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
            chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
            datalength = this.getter(0).length;
            chunkSize = datalength;
            console.log("LazyFiles on gzip forces download of the whole file when length is accessed");
          }
  
          this._length = datalength;
          this._chunkSize = chunkSize;
          this.lengthKnown = true;
        }
        if (typeof XMLHttpRequest !== 'undefined') {
          if (!ENVIRONMENT_IS_WORKER) throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
          var lazyArray = new LazyUint8Array();
          Object.defineProperties(lazyArray, {
            length: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._length;
              }
            },
            chunkSize: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._chunkSize;
              }
            }
          });
  
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
  
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        // This is a total hack, but I want to get this lazy file code out of the
        // core of MEMFS. If we want to keep this lazy file concept I feel it should
        // be its own thin LAZYFS proxying calls to MEMFS.
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        // Add a function that defers querying the file size until it is asked the first time.
        Object.defineProperties(node, {
          usedBytes: {
            get: function() { return this.contents.length; }
          }
        });
        // override each stream op with one that tries to force load the lazy file first
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach(function(key) {
          var fn = node.stream_ops[key];
          stream_ops[key] = function forceLoadLazyFile() {
            if (!FS.forceLoadFile(node)) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            return fn.apply(null, arguments);
          };
        });
        // use a custom read function
        stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
          if (!FS.forceLoadFile(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO);
          }
          var contents = stream.node.contents;
          if (position >= contents.length)
            return 0;
          var size = Math.min(contents.length - position, length);
          assert(size >= 0);
          if (contents.slice) { // normal array
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        };
        node.stream_ops = stream_ops;
        return node;
      },createPreloadedFile:function (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
        Browser.init(); // XXX perhaps this method should move onto Browser?
        // TODO we should allow people to just pass in a complete filename instead
        // of parent and name being that we just join them anyways
        var fullname = name ? PATH.resolve(PATH.join2(parent, name)) : parent;
        var dep = getUniqueRunDependency('cp ' + fullname); // might have several active requests for the same fullname
        function processData(byteArray) {
          function finish(byteArray) {
            if (preFinish) preFinish();
            if (!dontCreateFile) {
              FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
            }
            if (onload) onload();
            removeRunDependency(dep);
          }
          var handled = false;
          Module['preloadPlugins'].forEach(function(plugin) {
            if (handled) return;
            if (plugin['canHandle'](fullname)) {
              plugin['handle'](byteArray, fullname, finish, function() {
                if (onerror) onerror();
                removeRunDependency(dep);
              });
              handled = true;
            }
          });
          if (!handled) finish(byteArray);
        }
        addRunDependency(dep);
        if (typeof url == 'string') {
          Browser.asyncLoad(url, function(byteArray) {
            processData(byteArray);
          }, onerror);
        } else {
          processData(url);
        }
      },indexedDB:function () {
        return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
      },DB_NAME:function () {
        return 'EM_FS_' + window.location.pathname;
      },DB_VERSION:20,DB_STORE_NAME:"FILE_DATA",saveFilesToDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
          console.log('creating db');
          var db = openRequest.result;
          db.createObjectStore(FS.DB_STORE_NAME);
        };
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          var transaction = db.transaction([FS.DB_STORE_NAME], 'readwrite');
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var putRequest = files.put(FS.analyzePath(path).object.contents, path);
            putRequest.onsuccess = function putRequest_onsuccess() { ok++; if (ok + fail == total) finish() };
            putRequest.onerror = function putRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      },loadFilesFromDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = onerror; // no database to load from
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          try {
            var transaction = db.transaction([FS.DB_STORE_NAME], 'readonly');
          } catch(e) {
            onerror(e);
            return;
          }
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var getRequest = files.get(path);
            getRequest.onsuccess = function getRequest_onsuccess() {
              if (FS.analyzePath(path).exists) {
                FS.unlink(path);
              }
              FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
              ok++;
              if (ok + fail == total) finish();
            };
            getRequest.onerror = function getRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      }};var SYSCALLS={DEFAULT_POLLMASK:5,mappings:{},umask:511,calculateAt:function (dirfd, path) {
        if (path[0] !== '/') {
          // relative path
          var dir;
          if (dirfd === -100) {
            dir = FS.cwd();
          } else {
            var dirstream = FS.getStream(dirfd);
            if (!dirstream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
            dir = dirstream.path;
          }
          path = PATH.join2(dir, path);
        }
        return path;
      },doStat:function (func, path, buf) {
        try {
          var stat = func(path);
        } catch (e) {
          if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
            // an error occurred while trying to look up the path; we should just report ENOTDIR
            return -ERRNO_CODES.ENOTDIR;
          }
          throw e;
        }
        HEAP32[((buf)>>2)]=stat.dev;
        HEAP32[(((buf)+(4))>>2)]=0;
        HEAP32[(((buf)+(8))>>2)]=stat.ino;
        HEAP32[(((buf)+(12))>>2)]=stat.mode;
        HEAP32[(((buf)+(16))>>2)]=stat.nlink;
        HEAP32[(((buf)+(20))>>2)]=stat.uid;
        HEAP32[(((buf)+(24))>>2)]=stat.gid;
        HEAP32[(((buf)+(28))>>2)]=stat.rdev;
        HEAP32[(((buf)+(32))>>2)]=0;
        HEAP32[(((buf)+(36))>>2)]=stat.size;
        HEAP32[(((buf)+(40))>>2)]=4096;
        HEAP32[(((buf)+(44))>>2)]=stat.blocks;
        HEAP32[(((buf)+(48))>>2)]=(stat.atime.getTime() / 1000)|0;
        HEAP32[(((buf)+(52))>>2)]=0;
        HEAP32[(((buf)+(56))>>2)]=(stat.mtime.getTime() / 1000)|0;
        HEAP32[(((buf)+(60))>>2)]=0;
        HEAP32[(((buf)+(64))>>2)]=(stat.ctime.getTime() / 1000)|0;
        HEAP32[(((buf)+(68))>>2)]=0;
        HEAP32[(((buf)+(72))>>2)]=stat.ino;
        return 0;
      },doMsync:function (addr, stream, len, flags) {
        var buffer = new Uint8Array(HEAPU8.subarray(addr, addr + len));
        FS.msync(stream, buffer, 0, len, flags);
      },doMkdir:function (path, mode) {
        // remove a trailing slash, if one - /a/b/ has basename of '', but
        // we want to create b in the context of this function
        path = PATH.normalize(path);
        if (path[path.length-1] === '/') path = path.substr(0, path.length-1);
        FS.mkdir(path, mode, 0);
        return 0;
      },doMknod:function (path, mode, dev) {
        // we don't want this in the JS API as it uses mknod to create all nodes.
        switch (mode & 61440) {
          case 32768:
          case 8192:
          case 24576:
          case 4096:
          case 49152:
            break;
          default: return -ERRNO_CODES.EINVAL;
        }
        FS.mknod(path, mode, dev);
        return 0;
      },doReadlink:function (path, buf, bufsize) {
        if (bufsize <= 0) return -ERRNO_CODES.EINVAL;
        var ret = FS.readlink(path);
  
        var len = Math.min(bufsize, lengthBytesUTF8(ret));
        var endChar = HEAP8[buf+len];
        stringToUTF8(ret, buf, bufsize+1);
        // readlink is one of the rare functions that write out a C string, but does never append a null to the output buffer(!)
        // stringToUTF8() always appends a null byte, so restore the character under the null byte after the write.
        HEAP8[buf+len] = endChar;
  
        return len;
      },doAccess:function (path, amode) {
        if (amode & ~7) {
          // need a valid mode
          return -ERRNO_CODES.EINVAL;
        }
        var node;
        var lookup = FS.lookupPath(path, { follow: true });
        node = lookup.node;
        var perms = '';
        if (amode & 4) perms += 'r';
        if (amode & 2) perms += 'w';
        if (amode & 1) perms += 'x';
        if (perms /* otherwise, they've just passed F_OK */ && FS.nodePermissions(node, perms)) {
          return -ERRNO_CODES.EACCES;
        }
        return 0;
      },doDup:function (path, flags, suggestFD) {
        var suggest = FS.getStream(suggestFD);
        if (suggest) FS.close(suggest);
        return FS.open(path, flags, 0, suggestFD, suggestFD).fd;
      },doReadv:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.read(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
          if (curr < len) break; // nothing more to read
        }
        return ret;
      },doWritev:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.write(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
        }
        return ret;
      },varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },getStreamFromFD:function () {
        var stream = FS.getStream(SYSCALLS.get());
        if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return stream;
      },getSocketFromFD:function () {
        var socket = SOCKFS.getSocket(SYSCALLS.get());
        if (!socket) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return socket;
      },getSocketAddress:function (allowNull) {
        var addrp = SYSCALLS.get(), addrlen = SYSCALLS.get();
        if (allowNull && addrp === 0) return null;
        var info = __read_sockaddr(addrp, addrlen);
        if (info.errno) throw new FS.ErrnoError(info.errno);
        info.addr = DNS.lookup_addr(info.addr) || info.addr;
        return info;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall6(which, varargs) {if (ENVIRONMENT_IS_PTHREAD) { return _emscripten_sync_run_in_main_thread_2(138, 6, varargs) }
  SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  var _emscripten_asm_const_int=true;

  function _setenv(envname, envval, overwrite) {
      if (ENVIRONMENT_IS_PTHREAD) return _emscripten_sync_run_in_main_thread_3(113, envname, envval, overwrite);
      // int setenv(const char *envname, const char *envval, int overwrite);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/setenv.html
      if (envname === 0) {
        ___setErrNo(ERRNO_CODES.EINVAL);
        return -1;
      }
      var name = Pointer_stringify(envname);
      var val = Pointer_stringify(envval);
      if (name === '' || name.indexOf('=') !== -1) {
        ___setErrNo(ERRNO_CODES.EINVAL);
        return -1;
      }
      if (ENV.hasOwnProperty(name) && !overwrite) return 0;
      ENV[name] = val;
      ___buildEnvironment(ENV);
      return 0;
    }

  
  
  var emval_free_list=[];
  
  var emval_handle_array=[{},{value:undefined},{value:null},{value:true},{value:false}];function __emval_decref(handle) {
      if (handle > 4 && 0 === --emval_handle_array[handle].refcount) {
          emval_handle_array[handle] = undefined;
          emval_free_list.push(handle);
      }
    }
  
  
  
  function count_emval_handles() {
      var count = 0;
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              ++count;
          }
      }
      return count;
    }
  
  function get_first_emval() {
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              return emval_handle_array[i];
          }
      }
      return null;
    }function init_emval() {
      Module['count_emval_handles'] = count_emval_handles;
      Module['get_first_emval'] = get_first_emval;
    }function __emval_register(value) {
  
      switch(value){
        case undefined :{ return 1; }
        case null :{ return 2; }
        case true :{ return 3; }
        case false :{ return 4; }
        default:{
          var handle = emval_free_list.length ?
              emval_free_list.pop() :
              emval_handle_array.length;
  
          emval_handle_array[handle] = {refcount: 1, value: value};
          return handle;
          }
        }
    }function __embind_register_emval(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(handle) {
              var rv = emval_handle_array[handle].value;
              __emval_decref(handle);
              return rv;
          },
          'toWireType': function(destructors, value) {
              return __emval_register(value);
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: null, // This type does not need a destructor
  
          // TODO: do we need a deleteObject here?  write a test where
          // emval is passed into JS via an interface
      });
    }

  function _emscripten_get_now() { abort() }

  
  var _fetch_work_queue; if (ENVIRONMENT_IS_PTHREAD) _fetch_work_queue = PthreadWorkerInit._fetch_work_queue; else PthreadWorkerInit._fetch_work_queue = _fetch_work_queue = allocate(12, "i32*", ALLOC_STATIC);function __emscripten_get_fetch_work_queue() {
      return _fetch_work_queue;
    }

  function ___syscall54(which, varargs) {if (ENVIRONMENT_IS_PTHREAD) { return _emscripten_sync_run_in_main_thread_2(138, 54, varargs) }
  SYSCALLS.varargs = varargs;
  try {
   // ioctl
      var stream = SYSCALLS.getStreamFromFD(), op = SYSCALLS.get();
      switch (op) {
        case 21505: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        case 21506: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21519: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          var argp = SYSCALLS.get();
          HEAP32[((argp)>>2)]=0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return -ERRNO_CODES.EINVAL; // not supported
        }
        case 21531: {
          var argp = SYSCALLS.get();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          // TODO: in theory we should write to the winsize struct that gets
          // passed in, but for now musl doesn't read anything on it
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        default: abort('bad ioctl syscall ' + op);
      }
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  var Fetch={attr_t_offset_requestMethod:0,attr_t_offset_userData:32,attr_t_offset_onsuccess:36,attr_t_offset_onerror:40,attr_t_offset_onprogress:44,attr_t_offset_attributes:48,attr_t_offset_timeoutMSecs:52,attr_t_offset_withCredentials:56,attr_t_offset_destinationPath:60,attr_t_offset_userName:64,attr_t_offset_password:68,attr_t_offset_requestHeaders:72,attr_t_offset_overriddenMimeType:76,attr_t_offset_requestData:80,attr_t_offset_requestDataSize:84,fetch_t_offset_id:0,fetch_t_offset_userData:4,fetch_t_offset_url:8,fetch_t_offset_data:12,fetch_t_offset_numBytes:16,fetch_t_offset_dataOffset:24,fetch_t_offset_totalBytes:32,fetch_t_offset_readyState:40,fetch_t_offset_status:42,fetch_t_offset_statusText:44,fetch_t_offset___proxyState:108,fetch_t_offset___attributes:112,xhrs:[],worker:undefined,dbInstance:undefined,setu64:function (addr, val) {
      HEAPU32[addr >> 2] = val;
      HEAPU32[addr + 4 >> 2] = (val / 4294967296)|0;
    },openDatabase:function (dbname, dbversion, onsuccess, onerror) {
      try {
        var openRequest = indexedDB.open(dbname, dbversion);
      } catch (e) { return onerror(e); }
  
      openRequest.onupgradeneeded = function(event) {
        var db = event.target.result;
        if (db.objectStoreNames.contains('FILES')) {
          db.deleteObjectStore('FILES');
        }
        db.createObjectStore('FILES');
      };
      openRequest.onsuccess = function(event) { onsuccess(event.target.result); };
      openRequest.onerror = function(error) { onerror(error); };
    },initFetchWorker:function () {
      var stackSize = 128*1024;
      var stack = allocate(stackSize>>2, "i32*", ALLOC_DYNAMIC);
      Fetch.worker.postMessage({cmd: 'init', TOTAL_MEMORY: TOTAL_MEMORY, DYNAMICTOP_PTR: DYNAMICTOP_PTR, STACKTOP: stack, STACK_MAX: stack + stackSize, queuePtr: _fetch_work_queue, buffer: HEAPU8.buffer});
    },staticInit:function () {
      var isMainThread = (typeof ENVIRONMENT_IS_FETCH_WORKER === 'undefined' && !ENVIRONMENT_IS_PTHREAD);
  
      var onsuccess = function(db) {
        Fetch.dbInstance = db;
  
        if (isMainThread) {
          if (typeof SharedArrayBuffer !== 'undefined') Fetch.initFetchWorker();
          removeRunDependency('library_fetch_init');
        }
      };
      var onerror = function() {
        Fetch.dbInstance = false;
  
        if (isMainThread) {
          if (typeof SharedArrayBuffer !== 'undefined') Fetch.initFetchWorker();
          removeRunDependency('library_fetch_init');
        }
      };
      Fetch.openDatabase('emscripten_filesystem', 1, onsuccess, onerror);
  
      if (isMainThread) {
        addRunDependency('library_fetch_init');
  
        var fetchJs = 'fetch-worker.js';
        // Allow HTML module to configure the location where the 'pthread-main.js' file will be loaded from,
        // either via Module.locateFile() function, or via Module.pthreadMainPrefixURL string. If neither
        // of these are passed, then the default URL 'pthread-main.js' relative to the main html file is loaded.
        if (typeof Module['locateFile'] === 'function') fetchJs = Module['locateFile'](fetchJs);
        else if (Module['pthreadMainPrefixURL']) fetchJs = Module['pthreadMainPrefixURL'] + fetchJs;
        Fetch.worker = new Worker(fetchJs);
        Fetch.worker.onmessage = function(e) {
          Module['print']('fetch-worker sent a message: ' + e.filename + ':' + e.lineno + ': ' + e.message);
        };
        Fetch.worker.onerror = function(e) {
          Module['printErr']('fetch-worker sent an error! ' + e.filename + ':' + e.lineno + ': ' + e.message);
        };
      }
    }};
  
  function __emscripten_fetch_xhr(fetch, onsuccess, onerror, onprogress) {
    var url = HEAPU32[fetch + Fetch.fetch_t_offset_url >> 2];
    if (!url) {
      onerror(fetch, 0, 'no url specified!');
      return;
    }
    var url_ = Pointer_stringify(url);
  
    var fetch_attr = fetch + Fetch.fetch_t_offset___attributes;
    var requestMethod = Pointer_stringify(fetch_attr);
    if (!requestMethod) requestMethod = 'GET';
    var userData = HEAPU32[fetch_attr + Fetch.attr_t_offset_userData >> 2];
    var fetchAttributes = HEAPU32[fetch_attr + Fetch.attr_t_offset_attributes >> 2];
    var timeoutMsecs = HEAPU32[fetch_attr + Fetch.attr_t_offset_timeoutMSecs >> 2];
    var withCredentials = !!HEAPU32[fetch_attr + Fetch.attr_t_offset_withCredentials >> 2];
    var destinationPath = HEAPU32[fetch_attr + Fetch.attr_t_offset_destinationPath >> 2];
    var userName = HEAPU32[fetch_attr + Fetch.attr_t_offset_userName >> 2];
    var password = HEAPU32[fetch_attr + Fetch.attr_t_offset_password >> 2];
    var requestHeaders = HEAPU32[fetch_attr + Fetch.attr_t_offset_requestHeaders >> 2];
    var overriddenMimeType = HEAPU32[fetch_attr + Fetch.attr_t_offset_overriddenMimeType >> 2];
  
    var fetchAttrLoadToMemory = !!(fetchAttributes & 1/*EMSCRIPTEN_FETCH_LOAD_TO_MEMORY*/);
    var fetchAttrStreamData = !!(fetchAttributes & 2/*EMSCRIPTEN_FETCH_STREAM_DATA*/);
    var fetchAttrPersistFile = !!(fetchAttributes & 4/*EMSCRIPTEN_FETCH_PERSIST_FILE*/);
    var fetchAttrAppend = !!(fetchAttributes & 8/*EMSCRIPTEN_FETCH_APPEND*/);
    var fetchAttrReplace = !!(fetchAttributes & 16/*EMSCRIPTEN_FETCH_REPLACE*/);
    var fetchAttrNoDownload = !!(fetchAttributes & 32/*EMSCRIPTEN_FETCH_NO_DOWNLOAD*/);
    var fetchAttrSynchronous = !!(fetchAttributes & 64/*EMSCRIPTEN_FETCH_SYNCHRONOUS*/);
    var fetchAttrWaitable = !!(fetchAttributes & 128/*EMSCRIPTEN_FETCH_WAITABLE*/);
  
    var userNameStr = userName ? Pointer_stringify(userName) : undefined;
    var passwordStr = password ? Pointer_stringify(password) : undefined;
    var overriddenMimeTypeStr = overriddenMimeType ? Pointer_stringify(overriddenMimeType) : undefined;
  
    var xhr = new XMLHttpRequest();
    xhr.withCredentials = withCredentials;
    xhr.open(requestMethod, url_, !fetchAttrSynchronous, userNameStr, passwordStr);
    if (!fetchAttrSynchronous) xhr.timeout = timeoutMsecs; // XHR timeout field is only accessible in async XHRs, and must be set after .open() but before .send().
    xhr.url_ = url_; // Save the url for debugging purposes (and for comparing to the responseURL that server side advertised)
    xhr.responseType = fetchAttrStreamData ? 'moz-chunked-arraybuffer' : 'arraybuffer';
  
    if (overriddenMimeType) {
      xhr.overrideMimeType(overriddenMimeTypeStr);
    }
    if (requestHeaders) {
      for(;;) {
        var key = HEAPU32[requestHeaders >> 2];
        if (!key) break;
        var value = HEAPU32[requestHeaders + 4 >> 2];
        if (!value) break;
        requestHeaders += 8;
        var keyStr = Pointer_stringify(key);
        var valueStr = Pointer_stringify(value);
        xhr.setRequestHeader(keyStr, valueStr);
      }
    }
    Fetch.xhrs.push(xhr);
    var id = Fetch.xhrs.length;
    HEAPU32[fetch + Fetch.fetch_t_offset_id >> 2] = id;
    var data = null; // TODO: Support user to pass data to request.
    // TODO: Support specifying custom headers to the request.
  
    xhr.onload = function(e) {
      var len = xhr.response ? xhr.response.byteLength : 0;
      var ptr = 0;
      var ptrLen = 0;
      if (fetchAttrLoadToMemory && !fetchAttrStreamData) {
        ptrLen = len;
        // The data pointer malloc()ed here has the same lifetime as the emscripten_fetch_t structure itself has, and is
        // freed when emscripten_fetch_close() is called.
        ptr = _malloc(ptrLen);
        HEAPU8.set(new Uint8Array(xhr.response), ptr);
      }
      HEAPU32[fetch + Fetch.fetch_t_offset_data >> 2] = ptr;
      Fetch.setu64(fetch + Fetch.fetch_t_offset_numBytes, ptrLen);
      Fetch.setu64(fetch + Fetch.fetch_t_offset_dataOffset, 0);
      if (len) {
        // If the final XHR.onload handler receives the bytedata to compute total length, report that,
        // otherwise don't write anything out here, which will retain the latest byte size reported in
        // the most recent XHR.onprogress handler.
        Fetch.setu64(fetch + Fetch.fetch_t_offset_totalBytes, len);
      }
      HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = xhr.readyState;
      if (xhr.readyState === 4 && xhr.status === 0) {
        if (len > 0) xhr.status = 200; // If loading files from a source that does not give HTTP status code, assume success if we got data bytes.
        else xhr.status = 404; // Conversely, no data bytes is 404.
      }
      HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = xhr.status;
      if (xhr.statusText) stringToUTF8(xhr.statusText, fetch + Fetch.fetch_t_offset_statusText, 64);
      if (xhr.status == 200) {
        if (onsuccess) onsuccess(fetch, xhr, e);
      } else {
        if (onerror) onerror(fetch, xhr, e);
      }
    }
    xhr.onerror = function(e) {
      var status = xhr.status; // XXX TODO: Overwriting xhr.status doesn't work here, so don't override anywhere else either.
      if (xhr.readyState == 4 && status == 0) status = 404; // If no error recorded, pretend it was 404 Not Found.
      HEAPU32[fetch + Fetch.fetch_t_offset_data >> 2] = 0;
      Fetch.setu64(fetch + Fetch.fetch_t_offset_numBytes, 0);
      Fetch.setu64(fetch + Fetch.fetch_t_offset_dataOffset, 0);
      Fetch.setu64(fetch + Fetch.fetch_t_offset_totalBytes, 0);
      HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = xhr.readyState;
      HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = status;
      if (onerror) onerror(fetch, xhr, e);
    }
    xhr.ontimeout = function(e) {
      if (onerror) onerror(fetch, xhr, e);
    }
    xhr.onprogress = function(e) {
      var ptrLen = (fetchAttrLoadToMemory && fetchAttrStreamData && xhr.response) ? xhr.response.byteLength : 0;
      var ptr = 0;
      if (fetchAttrLoadToMemory && fetchAttrStreamData) {
        // The data pointer malloc()ed here has the same lifetime as the emscripten_fetch_t structure itself has, and is
        // freed when emscripten_fetch_close() is called.
        ptr = _malloc(ptrLen);
        HEAPU8.set(new Uint8Array(xhr.response), ptr);
      }
      HEAPU32[fetch + Fetch.fetch_t_offset_data >> 2] = ptr;
      Fetch.setu64(fetch + Fetch.fetch_t_offset_numBytes, ptrLen);
      Fetch.setu64(fetch + Fetch.fetch_t_offset_dataOffset, e.loaded - ptrLen);
      Fetch.setu64(fetch + Fetch.fetch_t_offset_totalBytes, e.total);
      HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = xhr.readyState;
      if (xhr.readyState >= 3 && xhr.status === 0 && e.loaded > 0) xhr.status = 200; // If loading files from a source that does not give HTTP status code, assume success if we get data bytes
      HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = xhr.status;
      if (xhr.statusText) stringToUTF8(xhr.statusText, fetch + Fetch.fetch_t_offset_statusText, 64);
      if (onprogress) onprogress(fetch, xhr, e);
    }
    try {
      xhr.send(data);
    } catch(e) {
      if (onerror) onerror(fetch, xhr, e);
    }
  }
  
  function __emscripten_fetch_cache_data(db, fetch, data, onsuccess, onerror) {
    if (!db) {
      onerror(fetch, 0, 'IndexedDB not available!');
      return;
    }
  
    var fetch_attr = fetch + Fetch.fetch_t_offset___attributes;
    var destinationPath = HEAPU32[fetch_attr + Fetch.attr_t_offset_destinationPath >> 2];
    if (!destinationPath) destinationPath = HEAPU32[fetch + Fetch.fetch_t_offset_url >> 2];
    var destinationPathStr = Pointer_stringify(destinationPath);
  
    try {
      var transaction = db.transaction(['FILES'], 'readwrite');
      var packages = transaction.objectStore('FILES');
      var putRequest = packages.put(data, destinationPathStr);
      putRequest.onsuccess = function(event) {
        HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = 4; // Mimic XHR readyState 4 === 'DONE: The operation is complete'
        HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = 200; // Mimic XHR HTTP status code 200 "OK"
        stringToUTF8("OK", fetch + Fetch.fetch_t_offset_statusText, 64);
        onsuccess(fetch, 0, destinationPathStr);
      };
      putRequest.onerror = function(error) {
        // Most likely we got an error if IndexedDB is unwilling to store any more data for this page.
        // TODO: Can we identify and break down different IndexedDB-provided errors and convert those
        // to more HTTP status codes for more information?
        HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = 4; // Mimic XHR readyState 4 === 'DONE: The operation is complete'
        HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = 413; // Mimic XHR HTTP status code 413 "Payload Too Large"
        stringToUTF8("Payload Too Large", fetch + Fetch.fetch_t_offset_statusText, 64);
        onerror(fetch, 0, error);
      };
    } catch(e) {
      onerror(fetch, 0, e);
    }
  }
  
  function __emscripten_fetch_load_cached_data(db, fetch, onsuccess, onerror) {
    if (!db) {
      onerror(fetch, 0, 'IndexedDB not available!');
      return;
    }
  
    var fetch_attr = fetch + Fetch.fetch_t_offset___attributes;
    var path = HEAPU32[fetch_attr + Fetch.attr_t_offset_destinationPath >> 2];
    if (!path) path = HEAPU32[fetch + Fetch.fetch_t_offset_url >> 2];
    var pathStr = Pointer_stringify(path);
  
    try {
      var transaction = db.transaction(['FILES'], 'readonly');
      var packages = transaction.objectStore('FILES');
      var getRequest = packages.get(pathStr);
      getRequest.onsuccess = function(event) {
        if (event.target.result) {
          var value = event.target.result;
          var len = value.byteLength || value.length;
  
          // The data pointer malloc()ed here has the same lifetime as the emscripten_fetch_t structure itself has, and is
          // freed when emscripten_fetch_close() is called.
          var ptr = _malloc(len);
          HEAPU8.set(new Uint8Array(value), ptr);
          HEAPU32[fetch + Fetch.fetch_t_offset_data >> 2] = ptr;
          Fetch.setu64(fetch + Fetch.fetch_t_offset_numBytes, len);
          Fetch.setu64(fetch + Fetch.fetch_t_offset_dataOffset, 0);
          Fetch.setu64(fetch + Fetch.fetch_t_offset_totalBytes, len);
          HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = 4; // Mimic XHR readyState 4 === 'DONE: The operation is complete'
          HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = 200; // Mimic XHR HTTP status code 200 "OK"
          stringToUTF8("OK", fetch + Fetch.fetch_t_offset_statusText, 64);
          onsuccess(fetch, 0, value);
        } else {
          // Succeeded to load, but the load came back with the value of undefined, treat that as an error since we never store undefined in db.
          HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = 4; // Mimic XHR readyState 4 === 'DONE: The operation is complete'
          HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = 404; // Mimic XHR HTTP status code 404 "Not Found"
          stringToUTF8("Not Found", fetch + Fetch.fetch_t_offset_statusText, 64);
          onerror(fetch, 0, 'no data');
        }
      };
      getRequest.onerror = function(error) {
        HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = 4; // Mimic XHR readyState 4 === 'DONE: The operation is complete'
        HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = 404; // Mimic XHR HTTP status code 404 "Not Found"
        stringToUTF8("Not Found", fetch + Fetch.fetch_t_offset_statusText, 64);
        onerror(fetch, 0, error);
      };
    } catch(e) {
      onerror(fetch, 0, e);
    }
  }
  
  function __emscripten_fetch_delete_cached_data(db, fetch, onsuccess, onerror) {
    if (!db) {
      onerror(fetch, 0, 'IndexedDB not available!');
      return;
    }
  
    var fetch_attr = fetch + Fetch.fetch_t_offset___attributes;
    var path = HEAPU32[fetch_attr + Fetch.attr_t_offset_destinationPath >> 2];
    if (!path) path = HEAPU32[fetch + Fetch.fetch_t_offset_url >> 2];
    var pathStr = Pointer_stringify(path);
  
    try {
      var transaction = db.transaction(['FILES'], 'readwrite');
      var packages = transaction.objectStore('FILES');
      var request = packages.delete(pathStr);
      request.onsuccess = function(event) {
        var value = event.target.result;
        HEAPU32[fetch + Fetch.fetch_t_offset_data >> 2] = 0;
        Fetch.setu64(fetch + Fetch.fetch_t_offset_numBytes, 0);
        Fetch.setu64(fetch + Fetch.fetch_t_offset_dataOffset, 0);
        Fetch.setu64(fetch + Fetch.fetch_t_offset_dataOffset, 0);
        HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = 4; // Mimic XHR readyState 4 === 'DONE: The operation is complete'
        HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = 200; // Mimic XHR HTTP status code 200 "OK"
        stringToUTF8("OK", fetch + Fetch.fetch_t_offset_statusText, 64);
        onsuccess(fetch, 0, value);
      };
      request.onerror = function(error) {
        HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = 4; // Mimic XHR readyState 4 === 'DONE: The operation is complete'
        HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = 404; // Mimic XHR HTTP status code 404 "Not Found"
        stringToUTF8("Not Found", fetch + Fetch.fetch_t_offset_statusText, 64);
        onerror(fetch, 0, error);
      };
    } catch(e) {
      onerror(fetch, 0, e);
    }
  }
  
  function _emscripten_is_main_runtime_thread() {
      return __pthread_is_main_runtime_thread|0; // Semantically the same as testing "!ENVIRONMENT_IS_PTHREAD" outside the asm.js scope
    }
  
  var _pthread_mutex_lock=undefined;
  
  var _pthread_mutex_unlock=undefined;function _emscripten_start_fetch(fetch, successcb, errorcb, progresscb) {
    if (typeof Module !== 'undefined') Module['noExitRuntime'] = true; // If we are the main Emscripten runtime, we should not be closing down.
  
    var fetch_attr = fetch + Fetch.fetch_t_offset___attributes;
    var requestMethod = Pointer_stringify(fetch_attr);
    var onsuccess = HEAPU32[fetch_attr + Fetch.attr_t_offset_onsuccess >> 2];
    var onerror = HEAPU32[fetch_attr + Fetch.attr_t_offset_onerror >> 2];
    var onprogress = HEAPU32[fetch_attr + Fetch.attr_t_offset_onprogress >> 2];
    var fetchAttributes = HEAPU32[fetch_attr + Fetch.attr_t_offset_attributes >> 2];
    var fetchAttrLoadToMemory = !!(fetchAttributes & 1/*EMSCRIPTEN_FETCH_LOAD_TO_MEMORY*/);
    var fetchAttrStreamData = !!(fetchAttributes & 2/*EMSCRIPTEN_FETCH_STREAM_DATA*/);
    var fetchAttrPersistFile = !!(fetchAttributes & 4/*EMSCRIPTEN_FETCH_PERSIST_FILE*/);
    var fetchAttrAppend = !!(fetchAttributes & 8/*EMSCRIPTEN_FETCH_APPEND*/);
    var fetchAttrReplace = !!(fetchAttributes & 16/*EMSCRIPTEN_FETCH_REPLACE*/);
    var fetchAttrNoDownload = !!(fetchAttributes & 32/*EMSCRIPTEN_FETCH_NO_DOWNLOAD*/);
  
    var reportSuccess = function(fetch, xhr, e) {
      if (onsuccess && Runtime.dynCall) Module['dynCall_vi'](onsuccess, fetch);
      else if (successcb) successcb(fetch);
    };
  
    var cacheResultAndReportSuccess = function(fetch, xhr, e) {
      var storeSuccess = function(fetch, xhr, e) {
        if (onsuccess && Runtime.dynCall) Module['dynCall_vi'](onsuccess, fetch);
        else if (successcb) successcb(fetch);
      };
      var storeError = function(fetch, xhr, e) {
        if (onsuccess && Runtime.dynCall) Module['dynCall_vi'](onsuccess, fetch);
        else if (successcb) successcb(fetch);
      };
      __emscripten_fetch_cache_data(Fetch.dbInstance, fetch, xhr.response, storeSuccess, storeError);
    };
  
    var reportProgress = function(fetch, xhr, e) {
      if (onprogress && Runtime.dynCall) Module['dynCall_vi'](onprogress, fetch);
      else if (progresscb) progresscb(fetch);
    };
  
    var reportError = function(fetch, xhr, e) {
      if (onerror && Runtime.dynCall) Module['dynCall_vi'](onerror, fetch);
      else if (errorcb) errorcb(fetch);
    };
  
    var performUncachedXhr = function(fetch, xhr, e) {
      __emscripten_fetch_xhr(fetch, reportSuccess, reportError, reportProgress);
    };
  
    var performCachedXhr = function(fetch, xhr, e) {
      __emscripten_fetch_xhr(fetch, cacheResultAndReportSuccess, reportError, reportProgress);
    };
  
    // Should we try IndexedDB first?
    if (!fetchAttrReplace || requestMethod === 'EM_IDB_STORE' || requestMethod === 'EM_IDB_DELETE') {
      if (!Fetch.dbInstance) {
        reportError(fetch, 0, 'IndexedDB is not open');
        return 0; // todo: free
      }
  
      if (requestMethod === 'EM_IDB_STORE') {
        var dataPtr = HEAPU32[fetch_attr + Fetch.attr_t_offset_requestData >> 2];
        var dataLength = HEAPU32[fetch_attr + Fetch.attr_t_offset_requestDataSize >> 2];
        var data = HEAPU8.slice(dataPtr, dataPtr + dataLength); // TODO(?): Here we perform a clone of the data, because storing shared typed arrays to IndexedDB does not seem to be allowed.
        __emscripten_fetch_cache_data(Fetch.dbInstance, fetch, data, reportSuccess, reportError);
      } else if (requestMethod === 'EM_IDB_DELETE') {
        __emscripten_fetch_delete_cached_data(Fetch.dbInstance, fetch, reportSuccess, reportError);
      } else if (fetchAttrNoDownload) {
        __emscripten_fetch_load_cached_data(Fetch.dbInstance, fetch, reportSuccess, reportError);
      } else if (fetchAttrPersistFile) {
        __emscripten_fetch_load_cached_data(Fetch.dbInstance, fetch, reportSuccess, performCachedXhr);        
      } else {
        __emscripten_fetch_load_cached_data(Fetch.dbInstance, fetch, reportSuccess, performUncachedXhr);        
      }
    } else if (!fetchAttrNoDownload) {
      if (fetchAttrPersistFile) {
        __emscripten_fetch_xhr(fetch, cacheResultAndReportSuccess, reportError, reportProgress);
      } else {
        __emscripten_fetch_xhr(fetch, reportSuccess, reportError, reportProgress);        
      }
    } else {
      return 0; // todo: free
    }
    return fetch;
  }

  function _sysconf(name) {
      if (ENVIRONMENT_IS_PTHREAD) return _emscripten_sync_run_in_main_thread_1(72, name);
      // long sysconf(int name);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/sysconf.html
      switch(name) {
        case 30: return PAGE_SIZE;
        case 85:
          var maxHeapSize = 2*1024*1024*1024 - 16777216;
          maxHeapSize = HEAPU8.length;
          return maxHeapSize / PAGE_SIZE;
        case 132:
        case 133:
        case 12:
        case 137:
        case 138:
        case 15:
        case 235:
        case 16:
        case 17:
        case 18:
        case 19:
        case 20:
        case 149:
        case 13:
        case 10:
        case 236:
        case 153:
        case 9:
        case 21:
        case 22:
        case 159:
        case 154:
        case 14:
        case 77:
        case 78:
        case 139:
        case 80:
        case 81:
        case 82:
        case 68:
        case 67:
        case 164:
        case 11:
        case 29:
        case 47:
        case 48:
        case 95:
        case 52:
        case 51:
        case 46:
          return 200809;
        case 79:
          return 0;
        case 27:
        case 246:
        case 127:
        case 128:
        case 23:
        case 24:
        case 160:
        case 161:
        case 181:
        case 182:
        case 242:
        case 183:
        case 184:
        case 243:
        case 244:
        case 245:
        case 165:
        case 178:
        case 179:
        case 49:
        case 50:
        case 168:
        case 169:
        case 175:
        case 170:
        case 171:
        case 172:
        case 97:
        case 76:
        case 32:
        case 173:
        case 35:
          return -1;
        case 176:
        case 177:
        case 7:
        case 155:
        case 8:
        case 157:
        case 125:
        case 126:
        case 92:
        case 93:
        case 129:
        case 130:
        case 131:
        case 94:
        case 91:
          return 1;
        case 74:
        case 60:
        case 69:
        case 70:
        case 4:
          return 1024;
        case 31:
        case 42:
        case 72:
          return 32;
        case 87:
        case 26:
        case 33:
          return 2147483647;
        case 34:
        case 1:
          return 47839;
        case 38:
        case 36:
          return 99;
        case 43:
        case 37:
          return 2048;
        case 0: return 2097152;
        case 3: return 65536;
        case 28: return 32768;
        case 44: return 32767;
        case 75: return 16384;
        case 39: return 1000;
        case 89: return 700;
        case 71: return 256;
        case 40: return 255;
        case 2: return 100;
        case 180: return 64;
        case 25: return 20;
        case 5: return 16;
        case 6: return 6;
        case 73: return 4;
        case 84: {
          if (typeof navigator === 'object') return navigator['hardwareConcurrency'] || 1;
          return 1;
        }
      }
      ___setErrNo(ERRNO_CODES.EINVAL);
      return -1;
    }

   
  Module["_bitshift64Lshr"] = _bitshift64Lshr;

  function _confstr(name, buf, len) {
      if (ENVIRONMENT_IS_PTHREAD) return _emscripten_sync_run_in_main_thread_3(68, name, buf, len);
      // size_t confstr(int name, char *buf, size_t len);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/confstr.html
      var value;
      switch (name) {
        case 0:
          value = ENV['PATH'] || '/';
          break;
        case 1:
          // Mimicking glibc.
          value = 'POSIX_V6_ILP32_OFF32\nPOSIX_V6_ILP32_OFFBIG';
          break;
        case 2:
          // This JS implementation was tested against this glibc version.
          value = 'glibc 2.14';
          break;
        case 3:
          // We don't support pthreads.
          value = '';
          break;
        case 1118:
        case 1122:
        case 1124:
        case 1125:
        case 1126:
        case 1128:
        case 1129:
        case 1130:
          value = '';
          break;
        case 1116:
        case 1117:
        case 1121:
          value = '-m32';
          break;
        case 1120:
          value = '-m32 -D_LARGEFILE_SOURCE -D_FILE_OFFSET_BITS=64';
          break;
        default:
          ___setErrNo(ERRNO_CODES.EINVAL);
          return 0;
      }
      if (len == 0 || buf == 0) {
        return value.length + 1;
      } else {
        var length = Math.min(len, value.length);
        for (var i = 0; i < length; i++) {
          HEAP8[(((buf)+(i))>>0)]=value.charCodeAt(i);
        }
        if (len > length) HEAP8[(((buf)+(i++))>>0)]=0;
        return i;
      }
    }

  function _unsetenv(name) {
      if (ENVIRONMENT_IS_PTHREAD) return _emscripten_sync_run_in_main_thread_1(114, name);
      // int unsetenv(const char *name);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/unsetenv.html
      if (name === 0) {
        ___setErrNo(ERRNO_CODES.EINVAL);
        return -1;
      }
      name = Pointer_stringify(name);
      if (name === '' || name.indexOf('=') !== -1) {
        ___setErrNo(ERRNO_CODES.EINVAL);
        return -1;
      }
      if (ENV.hasOwnProperty(name)) {
        delete ENV[name];
        ___buildEnvironment(ENV);
      }
      return 0;
    }

  
  function floatReadValueFromPointer(name, shift) {
      switch (shift) {
          case 2: return function(pointer) {
              return this['fromWireType'](HEAPF32[pointer >> 2]);
          };
          case 3: return function(pointer) {
              return this['fromWireType'](HEAPF64[pointer >> 3]);
          };
          default:
              throw new TypeError("Unknown float type: " + name);
      }
    }function __embind_register_float(rawType, name, size) {
      var shift = getShiftFromSize(size);
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              return value;
          },
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following if() and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              return value;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': floatReadValueFromPointer(name, shift),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  
  
  function _emscripten_get_now_is_monotonic() {
      // return whether emscripten_get_now is guaranteed monotonic; the Date.now
      // implementation is not :(
      return ENVIRONMENT_IS_NODE || (typeof dateNow !== 'undefined') ||
          ((ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && self['performance'] && self['performance']['now']);
    }function _clock_gettime(clk_id, tp) {
      // int clock_gettime(clockid_t clk_id, struct timespec *tp);
      var now;
      if (clk_id === 0) {
        now = Date.now();
      } else if (clk_id === 1 && _emscripten_get_now_is_monotonic()) {
        now = _emscripten_get_now();
      } else {
        ___setErrNo(ERRNO_CODES.EINVAL);
        return -1;
      }
      HEAP32[((tp)>>2)]=(now/1000)|0; // seconds
      HEAP32[(((tp)+(4))>>2)]=((now % 1000)*1000*1000)|0; // nanoseconds
      return 0;
    }function ___clock_gettime() {
  return _clock_gettime.apply(null, arguments)
  }

  function _getenv(name) {
      if (ENVIRONMENT_IS_PTHREAD) return _emscripten_sync_run_in_main_thread_1(111, name);
      // char *getenv(const char *name);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/getenv.html
      if (name === 0) return 0;
      name = Pointer_stringify(name);
      if (!ENV.hasOwnProperty(name)) return 0;
  
      if (_getenv.ret) _free(_getenv.ret);
      _getenv.ret = allocate(intArrayFromString(ENV[name]), 'i8', ALLOC_NORMAL);
      return _getenv.ret;
    }

  
  function _emscripten_conditional_set_current_thread_status_js(expectedStatus, newStatus) {
    } 
  Module["_emscripten_conditional_set_current_thread_status"] = _emscripten_conditional_set_current_thread_status;

  function _gettimeofday(ptr) {
      var now = Date.now();
      HEAP32[((ptr)>>2)]=(now/1000)|0; // seconds
      HEAP32[(((ptr)+(4))>>2)]=((now % 1000)*1000)|0; // microseconds
      return 0;
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 
  Module["_memcpy"] = _memcpy;

  function _utime(path, times) {
      if (ENVIRONMENT_IS_PTHREAD) return _emscripten_sync_run_in_main_thread_2(12, path, times);
      // int utime(const char *path, const struct utimbuf *times);
      // http://pubs.opengroup.org/onlinepubs/009695399/basedefs/utime.h.html
      var time;
      if (times) {
        // NOTE: We don't keep track of access timestamps.
        var offset = 4;
        time = HEAP32[(((times)+(offset))>>2)];
        time *= 1000;
      } else {
        time = Date.now();
      }
      path = Pointer_stringify(path);
      try {
        FS.utime(path, time, time);
        return 0;
      } catch (e) {
        FS.handleFSError(e);
        return -1;
      }
    }

  
  
  var cttz_i8; if (ENVIRONMENT_IS_PTHREAD) cttz_i8 = PthreadWorkerInit.cttz_i8; else PthreadWorkerInit.cttz_i8 = cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_STATIC); 
  Module["_llvm_cttz_i32"] = _llvm_cttz_i32; 
  Module["___udivmoddi4"] = ___udivmoddi4; 
  Module["___udivdi3"] = ___udivdi3;

  
  var __main_thread_futex_wait_address; if (ENVIRONMENT_IS_PTHREAD) __main_thread_futex_wait_address = PthreadWorkerInit.__main_thread_futex_wait_address; else PthreadWorkerInit.__main_thread_futex_wait_address = __main_thread_futex_wait_address = allocate(1, "i32*", ALLOC_STATIC);function _emscripten_futex_wake(addr, count) {
      if (addr <= 0 || addr > HEAP8.length || addr&3 != 0 || count < 0) return -22;
      if (count == 0) return 0;
  //    dump('futex_wake addr:' + addr + ' by thread: ' + _pthread_self() + (ENVIRONMENT_IS_PTHREAD?'(pthread)':'') + '\n');
  
      // See if main thread is waiting on this address? If so, wake it up by resetting its wake location to zero.
      // Note that this is not a fair procedure, since we always wake main thread first before any workers, so
      // this scheme does not adhere to real queue-based waiting.
      var mainThreadWaitAddress = Atomics.load(HEAP32, __main_thread_futex_wait_address >> 2);
      var mainThreadWoken = 0;
      if (mainThreadWaitAddress == addr) {
        var loadedAddr = Atomics.compareExchange(HEAP32, __main_thread_futex_wait_address >> 2, mainThreadWaitAddress, 0);
        if (loadedAddr == mainThreadWaitAddress) {
          --count;
          mainThreadWoken = 1;
          if (count <= 0) return 1;
        }
      }
  
      // Wake any workers waiting on this address.
      var ret = Atomics.wake(HEAP32, addr >> 2, count);
      if (ret >= 0) return ret + mainThreadWoken;
      throw 'Atomics.wake returned an unexpected value ' + ret;
    }

  function _emscripten_syscall(which, varargs) {
    switch (which) {
      case 6: return ___syscall6(which, varargs);
      case 54: return ___syscall54(which, varargs);
      case 146: return ___syscall146(which, varargs);
      case 140: return ___syscall140(which, varargs);
      default: throw "surprising proxied syscall: " + which;
    }
  }

   
  Module["_bitshift64Shl"] = _bitshift64Shl;

  function __embind_register_std_wstring(rawType, charSize, name) {
      // nb. do not cache HEAPU16 and HEAPU32, they may be destroyed by enlargeMemory().
      name = readLatin1String(name);
      var getHeap, shift;
      if (charSize === 2) {
          getHeap = function() { return HEAPU16; };
          shift = 1;
      } else if (charSize === 4) {
          getHeap = function() { return HEAPU32; };
          shift = 2;
      }
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var HEAP = getHeap();
              var length = HEAPU32[value >> 2];
              var a = new Array(length);
              var start = (value + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  a[i] = String.fromCharCode(HEAP[start + i]);
              }
              _free(value);
              return a.join('');
          },
          'toWireType': function(destructors, value) {
              // assumes 4-byte alignment
              var HEAP = getHeap();
              var length = value.length;
              var ptr = _malloc(4 + length * charSize);
              HEAPU32[ptr >> 2] = length;
              var start = (ptr + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  HEAP[start + i] = value.charCodeAt(i);
              }
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  function ___syscall146(which, varargs) {if (ENVIRONMENT_IS_PTHREAD) { return _emscripten_sync_run_in_main_thread_2(138, 146, varargs) }
  SYSCALLS.varargs = varargs;
  try {
   // writev
      var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      return SYSCALLS.doWritev(stream, iov, iovcnt);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }


  
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  
  
  
  var EXCEPTIONS={last:0,caught:[],infos:{},deAdjust:function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
          var info = EXCEPTIONS.infos[ptr];
          if (info.adjusted === adjusted) {
            return ptr;
          }
        }
        return adjusted;
      },addRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
      },decRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        // A rethrown exception can reach refcount 0; it must not be discarded
        // Its next handler will clear the rethrown flag and addRef it, prior to
        // final decRef and destruction here
        if (info.refcount === 0 && !info.rethrown) {
          if (info.destructor) {
            Module['dynCall_vi'](info.destructor, ptr);
          }
          delete EXCEPTIONS.infos[ptr];
          ___cxa_free_exception(ptr);
        }
      },clearRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
      }};
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      throw ptr;
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((Runtime.setTempRet0(0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((Runtime.setTempRet0(0),thrown)|0);
      }
      var typeArray = Array.prototype.slice.call(arguments);
  
      var pointer = Module['___cxa_is_pointer_type'](throwntype);
      // can_catch receives a **, add indirection
      if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
      HEAP32[((___cxa_find_matching_catch.buffer)>>2)]=thrown;
      thrown = ___cxa_find_matching_catch.buffer;
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
          thrown = HEAP32[((thrown)>>2)]; // undo indirection
          info.adjusted = thrown;
          return ((Runtime.setTempRet0(typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((Runtime.setTempRet0(throwntype),thrown)|0);
    }function ___gxx_personality_v0() {
    }

   
  Module["___uremdi3"] = ___uremdi3;

  function _fpathconf(fildes, name) {
      if (ENVIRONMENT_IS_PTHREAD) return _emscripten_sync_run_in_main_thread_2(46, fildes, name);
      // long fpathconf(int fildes, int name);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/encrypt.html
      // NOTE: The first parameter is ignored, so pathconf == fpathconf.
      // The constants here aren't real values. Just mimicking glibc.
      switch (name) {
        case 0:
          return 32000;
        case 1:
        case 2:
        case 3:
          return 255;
        case 4:
        case 5:
        case 16:
        case 17:
        case 18:
          return 4096;
        case 6:
        case 7:
        case 20:
          return 1;
        case 8:
          return 0;
        case 9:
        case 10:
        case 11:
        case 12:
        case 14:
        case 15:
        case 19:
          return -1;
        case 13:
          return 64;
      }
      ___setErrNo(ERRNO_CODES.EINVAL);
      return -1;
    }

   
  Module["_llvm_bswap_i32"] = _llvm_bswap_i32;

   
  Module["_sbrk"] = _sbrk;

  function __embind_register_memory_view(rawType, dataTypeIndex, name) {
      var typeMapping = [
          Int8Array,
          Uint8Array,
          Int16Array,
          Uint16Array,
          Int32Array,
          Uint32Array,
          Float32Array,
          Float64Array,
      ];
  
      var TA = typeMapping[dataTypeIndex];
  
      function decodeMemoryView(handle) {
          handle = handle >> 2;
          var heap = HEAPU32;
          var size = heap[handle]; // in elements
          var data = heap[handle + 1]; // byte offset into emscripten heap
          return new TA(heap['buffer'], data, size);
      }
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': decodeMemoryView,
          'argPackAdvance': 8,
          'readValueFromPointer': decodeMemoryView,
      }, {
          ignoreDuplicateRegistrations: true,
      });
    }


  function ___syscall140(which, varargs) {if (ENVIRONMENT_IS_PTHREAD) { return _emscripten_sync_run_in_main_thread_2(138, 140, varargs) }
  SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      // NOTE: offset_high is unused - Emscripten's off_t is 32-bit
      var offset = offset_low;
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function _utimes(path, times) {
      if (ENVIRONMENT_IS_PTHREAD) return _emscripten_sync_run_in_main_thread_2(13, path, times);
      var time;
      if (times) {
        var offset = 8 + 0;
        time = HEAP32[(((times)+(offset))>>2)] * 1000;
        offset = 8 + 4;
        time += HEAP32[(((times)+(offset))>>2)] / 1000;
      } else {
        time = Date.now();
      }
      path = Pointer_stringify(path);
      try {
        FS.utime(path, time, time);
        return 0;
      } catch (e) {
        FS.handleFSError(e);
        return -1;
      }
    }

  function _clearenv(name) {
      if (ENVIRONMENT_IS_PTHREAD) return _emscripten_sync_run_in_main_thread_1(112, name);
      // int clearenv (void);
      // http://www.gnu.org/s/hello/manual/libc/Environment-Access.html#index-clearenv-3107
      ENV = {};
      ___buildEnvironment(ENV);
      return 0;
    }

  function _emscripten_futex_wait(addr, val, timeout) {
      if (addr <= 0 || addr > HEAP8.length || addr&3 != 0) return -22;
  //    dump('futex_wait addr:' + addr + ' by thread: ' + _pthread_self() + (ENVIRONMENT_IS_PTHREAD?'(pthread)':'') + '\n');
      if (ENVIRONMENT_IS_WORKER) {
        var ret = Atomics.wait(HEAP32, addr >> 2, val, timeout);
  //    dump('futex_wait done by thread: ' + _pthread_self() + (ENVIRONMENT_IS_PTHREAD?'(pthread)':'') + '\n');
        if (ret === 'timed-out') return -110;
        if (ret === 'not-equal') return -11;
        if (ret === 'ok') return 0;
        throw 'Atomics.wait returned an unexpected value ' + ret;
      } else {
        // Atomics.wait is not available in the main browser thread, so simulate it via busy spinning.
        var loadedVal = Atomics.load(HEAP32, addr >> 2);
        if (val != loadedVal) return -11;
  
        var tNow = performance.now();
        var tEnd = tNow + timeout;
  
  
        // Register globally which address the main thread is simulating to be waiting on. When zero, main thread is not waiting on anything,
        // and on nonzero, the contents of address pointed by __main_thread_futex_wait_address tell which address the main thread is simulating its wait on.
        Atomics.store(HEAP32, __main_thread_futex_wait_address >> 2, addr);
        var ourWaitAddress = addr; // We may recursively re-enter this function while processing queued calls, in which case we'll do a spurious wakeup of the older wait operation.
        while (addr == ourWaitAddress) {
          tNow = performance.now();
          if (tNow > tEnd) {
            return -110;
          }
          _emscripten_main_thread_process_queued_calls(); // We are performing a blocking loop here, so must pump any pthreads if they want to perform operations that are proxied.
          addr = Atomics.load(HEAP32, __main_thread_futex_wait_address >> 2); // Look for a worker thread waking us up.
        }
        return 0;
      }
    }
if (!ENVIRONMENT_IS_PTHREAD) PThread.initMainThreadBlock();;
embind_init_charCodes();
BindingError = Module['BindingError'] = extendError(Error, 'BindingError');;
InternalError = Module['InternalError'] = extendError(Error, 'InternalError');;
if (!ENVIRONMENT_IS_PTHREAD) ___buildEnvironment(ENV);;
FS.staticInit();__ATINIT__.unshift(function() { if (!Module["noFSInit"] && !FS.init.initialized) FS.init() });__ATMAIN__.push(function() { FS.ignorePermissions = false });__ATEXIT__.push(function() { FS.quit() });Module["FS_createFolder"] = FS.createFolder;Module["FS_createPath"] = FS.createPath;Module["FS_createDataFile"] = FS.createDataFile;Module["FS_createPreloadedFile"] = FS.createPreloadedFile;Module["FS_createLazyFile"] = FS.createLazyFile;Module["FS_createLink"] = FS.createLink;Module["FS_createDevice"] = FS.createDevice;Module["FS_unlink"] = FS.unlink;;
__ATINIT__.unshift(function() { TTY.init() });__ATEXIT__.push(function() { TTY.shutdown() });;
if (ENVIRONMENT_IS_NODE) { var fs = require("fs"); var NODEJS_PATH = require("path"); NODEFS.staticInit(); };
init_emval();;
if (ENVIRONMENT_IS_NODE) {
    _emscripten_get_now = function _emscripten_get_now_actual() {
      var t = process['hrtime']();
      return t[0] * 1e3 + t[1] / 1e6;
    };
  } else if (typeof dateNow !== 'undefined') {
    _emscripten_get_now = dateNow;
  } else if (typeof self === 'object' && self['performance'] && typeof self['performance']['now'] === 'function') {
    _emscripten_get_now = function() { return self['performance']['now'](); };
  } else if (typeof performance === 'object' && typeof performance['now'] === 'function') {
    _emscripten_get_now = function() { return performance['now'](); };
  } else {
    _emscripten_get_now = Date.now;
  };
if (!ENVIRONMENT_IS_PTHREAD) Fetch.staticInit();;
if (!ENVIRONMENT_IS_PTHREAD) {
 // Only main thread initializes these, pthreads copy them over at thread worker init time (in pthread-main.js)
DYNAMICTOP_PTR = allocate(1, "i32", ALLOC_STATIC);

STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = Runtime.alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

}


function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_i(x) { Module["printErr"]("Invalid function pointer called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viii(x) { Module["printErr"]("Invalid function pointer called with signature 'viii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iii(x) { Module["printErr"]("Invalid function pointer called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_i(index) {
  try {
    return Module["dynCall_i"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viii(index,a1,a2,a3) {
  try {
    Module["dynCall_viii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };
Module.asmGlobalArg['Atomics'] = Atomics;
Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_iiii": nullFunc_iiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_i": nullFunc_i, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_ii": nullFunc_ii, "nullFunc_viii": nullFunc_viii, "nullFunc_v": nullFunc_v, "nullFunc_viiiiii": nullFunc_viiiiii, "nullFunc_iii": nullFunc_iii, "nullFunc_viiii": nullFunc_viiii, "invoke_iiii": invoke_iiii, "invoke_viiiii": invoke_viiiii, "invoke_i": invoke_i, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_ii": invoke_ii, "invoke_viii": invoke_viii, "invoke_v": invoke_v, "invoke_viiiiii": invoke_viiiiii, "invoke_iii": invoke_iii, "invoke_viiii": invoke_viiii, "__spawn_thread": __spawn_thread, "___lock": ___lock, "_putenv": _putenv, "_emscripten_get_now_is_monotonic": _emscripten_get_now_is_monotonic, "simpleReadValueFromPointer": simpleReadValueFromPointer, "_emscripten_is_main_runtime_thread": _emscripten_is_main_runtime_thread, "___gxx_personality_v0": ___gxx_personality_v0, "__embind_register_memory_view": __embind_register_memory_view, "throwInternalError": throwInternalError, "get_first_emval": get_first_emval, "_abort": _abort, "throwBindingError": throwBindingError, "__emscripten_get_fetch_work_queue": __emscripten_get_fetch_work_queue, "_emscripten_syscall": _emscripten_syscall, "extendError": extendError, "___assert_fail": ___assert_fail, "__embind_register_void": __embind_register_void, "floatReadValueFromPointer": floatReadValueFromPointer, "___buildEnvironment": ___buildEnvironment, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "getShiftFromSize": getShiftFromSize, "_utimes": _utimes, "__embind_register_emval": __embind_register_emval, "_clock_gettime": _clock_gettime, "_emscripten_asm_const_v": _emscripten_asm_const_v, "_emscripten_futex_wait": _emscripten_futex_wait, "_tzset": _tzset, "___setErrNo": ___setErrNo, "__emval_register": __emval_register, "__emscripten_fetch_xhr": __emscripten_fetch_xhr, "__emscripten_fetch_delete_cached_data": __emscripten_fetch_delete_cached_data, "_pthread_getschedparam": _pthread_getschedparam, "__embind_register_std_wstring": __embind_register_std_wstring, "_emscripten_memcpy_big": _emscripten_memcpy_big, "__embind_register_bool": __embind_register_bool, "___resumeException": ___resumeException, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "_sysconf": _sysconf, "_utime": _utime, "_embind_repr": _embind_repr, "__embind_register_std_string": __embind_register_std_string, "___pthread_setcancelstate": ___pthread_setcancelstate, "createNamedFunction": createNamedFunction, "_clearenv": _clearenv, "embind_init_charCodes": embind_init_charCodes, "readLatin1String": readLatin1String, "_confstr": _confstr, "_pthread_self": _pthread_self, "__embind_register_integer": __embind_register_integer, "_emscripten_is_main_browser_thread": _emscripten_is_main_browser_thread, "__emval_decref": __emval_decref, "_getenv": _getenv, "__embind_register_float": __embind_register_float, "__emscripten_fetch_cache_data": __emscripten_fetch_cache_data, "makeLegalFunctionName": makeLegalFunctionName, "_pthread_create": _pthread_create, "___syscall54": ___syscall54, "___unlock": ___unlock, "init_emval": init_emval, "whenDependentTypesAreResolved": whenDependentTypesAreResolved, "__register_pthread_ptr": __register_pthread_ptr, "_emscripten_get_now": _emscripten_get_now, "_chroot": _chroot, "_emscripten_futex_wake": _emscripten_futex_wake, "integerReadValueFromPointer": integerReadValueFromPointer, "registerType": registerType, "_emscripten_set_current_thread_status_js": _emscripten_set_current_thread_status_js, "__emscripten_fetch_load_cached_data": __emscripten_fetch_load_cached_data, "___syscall6": ___syscall6, "_unsetenv": _unsetenv, "___clock_gettime": ___clock_gettime, "count_emval_handles": count_emval_handles, "_gettimeofday": _gettimeofday, "_emscripten_start_fetch": _emscripten_start_fetch, "_atexit": _atexit, "___syscall140": ___syscall140, "_fpathconf": _fpathconf, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "_setenv": _setenv, "___syscall146": ___syscall146, "_emscripten_conditional_set_current_thread_status_js": _emscripten_conditional_set_current_thread_status_js, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8 };
// EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
'almost asm';


  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);

  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var cttz_i8=env.cttz_i8|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntS = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_i=env.nullFunc_i;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_viii=env.nullFunc_viii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var nullFunc_iii=env.nullFunc_iii;
  var nullFunc_viiii=env.nullFunc_viiii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_i=env.invoke_i;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_ii=env.invoke_ii;
  var invoke_viii=env.invoke_viii;
  var invoke_v=env.invoke_v;
  var invoke_viiiiii=env.invoke_viiiiii;
  var invoke_iii=env.invoke_iii;
  var invoke_viiii=env.invoke_viiii;
  var __spawn_thread=env.__spawn_thread;
  var ___lock=env.___lock;
  var _putenv=env._putenv;
  var _emscripten_get_now_is_monotonic=env._emscripten_get_now_is_monotonic;
  var simpleReadValueFromPointer=env.simpleReadValueFromPointer;
  var _emscripten_is_main_runtime_thread=env._emscripten_is_main_runtime_thread;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var __embind_register_memory_view=env.__embind_register_memory_view;
  var throwInternalError=env.throwInternalError;
  var get_first_emval=env.get_first_emval;
  var _abort=env._abort;
  var throwBindingError=env.throwBindingError;
  var __emscripten_get_fetch_work_queue=env.__emscripten_get_fetch_work_queue;
  var _emscripten_syscall=env._emscripten_syscall;
  var extendError=env.extendError;
  var ___assert_fail=env.___assert_fail;
  var __embind_register_void=env.__embind_register_void;
  var floatReadValueFromPointer=env.floatReadValueFromPointer;
  var ___buildEnvironment=env.___buildEnvironment;
  var _emscripten_asm_const_ii=env._emscripten_asm_const_ii;
  var getShiftFromSize=env.getShiftFromSize;
  var _utimes=env._utimes;
  var __embind_register_emval=env.__embind_register_emval;
  var _clock_gettime=env._clock_gettime;
  var _emscripten_asm_const_v=env._emscripten_asm_const_v;
  var _emscripten_futex_wait=env._emscripten_futex_wait;
  var _tzset=env._tzset;
  var ___setErrNo=env.___setErrNo;
  var __emval_register=env.__emval_register;
  var __emscripten_fetch_xhr=env.__emscripten_fetch_xhr;
  var __emscripten_fetch_delete_cached_data=env.__emscripten_fetch_delete_cached_data;
  var _pthread_getschedparam=env._pthread_getschedparam;
  var __embind_register_std_wstring=env.__embind_register_std_wstring;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var __embind_register_bool=env.__embind_register_bool;
  var ___resumeException=env.___resumeException;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var _sysconf=env._sysconf;
  var _utime=env._utime;
  var _embind_repr=env._embind_repr;
  var __embind_register_std_string=env.__embind_register_std_string;
  var ___pthread_setcancelstate=env.___pthread_setcancelstate;
  var createNamedFunction=env.createNamedFunction;
  var _clearenv=env._clearenv;
  var embind_init_charCodes=env.embind_init_charCodes;
  var readLatin1String=env.readLatin1String;
  var _confstr=env._confstr;
  var _pthread_self=env._pthread_self;
  var __embind_register_integer=env.__embind_register_integer;
  var _emscripten_is_main_browser_thread=env._emscripten_is_main_browser_thread;
  var __emval_decref=env.__emval_decref;
  var _getenv=env._getenv;
  var __embind_register_float=env.__embind_register_float;
  var __emscripten_fetch_cache_data=env.__emscripten_fetch_cache_data;
  var makeLegalFunctionName=env.makeLegalFunctionName;
  var _pthread_create=env._pthread_create;
  var ___syscall54=env.___syscall54;
  var ___unlock=env.___unlock;
  var init_emval=env.init_emval;
  var whenDependentTypesAreResolved=env.whenDependentTypesAreResolved;
  var __register_pthread_ptr=env.__register_pthread_ptr;
  var _emscripten_get_now=env._emscripten_get_now;
  var _chroot=env._chroot;
  var _emscripten_futex_wake=env._emscripten_futex_wake;
  var integerReadValueFromPointer=env.integerReadValueFromPointer;
  var registerType=env.registerType;
  var _emscripten_set_current_thread_status_js=env._emscripten_set_current_thread_status_js;
  var __emscripten_fetch_load_cached_data=env.__emscripten_fetch_load_cached_data;
  var ___syscall6=env.___syscall6;
  var _unsetenv=env._unsetenv;
  var ___clock_gettime=env.___clock_gettime;
  var count_emval_handles=env.count_emval_handles;
  var _gettimeofday=env._gettimeofday;
  var _emscripten_start_fetch=env._emscripten_start_fetch;
  var _atexit=env._atexit;
  var ___syscall140=env.___syscall140;
  var _fpathconf=env._fpathconf;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var _setenv=env._setenv;
  var ___syscall146=env.___syscall146;
  var _emscripten_conditional_set_current_thread_status_js=env._emscripten_conditional_set_current_thread_status_js;
  var Atomics_load=global.Atomics.load;
  var Atomics_store=global.Atomics.store;
  var Atomics_exchange=global.Atomics.exchange;
  var Atomics_compareExchange=global.Atomics.compareExchange;
  var Atomics_add=global.Atomics.add;
  var Atomics_sub=global.Atomics.sub;
  var Atomics_and=global.Atomics.and;
  var Atomics_or=global.Atomics.or;
  var Atomics_xor=global.Atomics.xor;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
  if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(size|0);

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function __Z17downloadSucceededP18emscripten_fetch_t($fetch) {
 $fetch = $fetch|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $data = 0, $fetch$addr = 0, $numBytes = 0, $url = 0;
 var $vararg_buffer = 0, $vararg_buffer2 = 0, $vararg_ptr1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer2 = sp + 16|0;
 $vararg_buffer = sp;
 $fetch$addr = $fetch;
 $0 = $fetch$addr;
 $numBytes = ((($0)) + 16|0);
 $1 = $numBytes;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = (($1) + 4)|0;
 $5 = $4;
 $6 = HEAP32[$5>>2]|0;
 $7 = $fetch$addr;
 $url = ((($7)) + 8|0);
 $8 = HEAP32[$url>>2]|0;
 $9 = $vararg_buffer;
 $10 = $9;
 HEAP32[$10>>2] = $3;
 $11 = (($9) + 4)|0;
 $12 = $11;
 HEAP32[$12>>2] = $6;
 $vararg_ptr1 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr1>>2] = $8;
 (_printf(792,$vararg_buffer)|0);
 $13 = $fetch$addr;
 $data = ((($13)) + 12|0);
 $14 = HEAP32[$data>>2]|0;
 (_printf($14,$vararg_buffer2)|0);
 $15 = $fetch$addr;
 (_emscripten_fetch_close($15)|0);
 STACKTOP = sp;return;
}
function __Z14downloadFailedP18emscripten_fetch_t($fetch) {
 $fetch = $fetch|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $conv = 0, $fetch$addr = 0, $status = 0, $url = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $fetch$addr = $fetch;
 $0 = $fetch$addr;
 $url = ((($0)) + 8|0);
 $1 = HEAP32[$url>>2]|0;
 $2 = $fetch$addr;
 $status = ((($2)) + 42|0);
 $3 = HEAP16[$status>>1]|0;
 $conv = $3&65535;
 HEAP32[$vararg_buffer>>2] = $1;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $conv;
 (_printf(838,$vararg_buffer)|0);
 $4 = $fetch$addr;
 (_emscripten_fetch_close($4)|0);
 STACKTOP = sp;return;
}
function _main() {
 var $attr = 0, $attributes = 0, $onerror = 0, $onsuccess = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $attr = sp;
 _emscripten_fetch_attr_init($attr);
 (_strcpy($attr,892)|0);
 $attributes = ((($attr)) + 48|0);
 HEAP32[$attributes>>2] = 1;
 $onsuccess = ((($attr)) + 36|0);
 HEAP32[$onsuccess>>2] = 23;
 $onerror = ((($attr)) + 40|0);
 HEAP32[$onerror>>2] = 24;
 (_emscripten_fetch($attr,896)|0);
 STACKTOP = sp;return 0;
}
function ___cxx_global_var_init() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN45EmscriptenBindingInitializer_my_class_exampleC2Ev(8724);
 return;
}
function __ZN45EmscriptenBindingInitializer_my_class_exampleC2Ev($this) {
 $this = $this|0;
 var $this$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $this$addr = $this;
 STACKTOP = sp;return;
}
function __GLOBAL__sub_I_fetch_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init();
 return;
}
function __GLOBAL__sub_I_bind_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init_2();
 return;
}
function ___cxx_global_var_init_2() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev(8725);
 return;
}
function __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev($this) {
 $this = $this|0;
 var $call = 0, $call2 = 0, $call3 = 0, $call4 = 0, $call5 = 0, $call6 = 0, $this$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $this$addr = $this;
 $call = (__ZN10emscripten8internal6TypeIDIvE3getEv()|0);
 __embind_register_void(($call|0),(919|0));
 $call2 = (__ZN10emscripten8internal6TypeIDIbE3getEv()|0);
 __embind_register_bool(($call2|0),(924|0),1,1,0);
 __ZN12_GLOBAL__N_1L16register_integerIcEEvPKc(929);
 __ZN12_GLOBAL__N_1L16register_integerIaEEvPKc(934);
 __ZN12_GLOBAL__N_1L16register_integerIhEEvPKc(946);
 __ZN12_GLOBAL__N_1L16register_integerIsEEvPKc(960);
 __ZN12_GLOBAL__N_1L16register_integerItEEvPKc(966);
 __ZN12_GLOBAL__N_1L16register_integerIiEEvPKc(981);
 __ZN12_GLOBAL__N_1L16register_integerIjEEvPKc(985);
 __ZN12_GLOBAL__N_1L16register_integerIlEEvPKc(998);
 __ZN12_GLOBAL__N_1L16register_integerImEEvPKc(1003);
 __ZN12_GLOBAL__N_1L14register_floatIfEEvPKc(1017);
 __ZN12_GLOBAL__N_1L14register_floatIdEEvPKc(1023);
 $call3 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0);
 __embind_register_std_string(($call3|0),(1030|0));
 $call4 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv()|0);
 __embind_register_std_string(($call4|0),(1042|0));
 $call5 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv()|0);
 __embind_register_std_wstring(($call5|0),4,(1075|0));
 $call6 = (__ZN10emscripten8internal6TypeIDINS_3valEE3getEv()|0);
 __embind_register_emval(($call6|0),(1088|0));
 __ZN12_GLOBAL__N_1L20register_memory_viewIcEEvPKc(1104);
 __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc(1134);
 __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc(1171);
 __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc(1210);
 __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc(1241);
 __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc(1281);
 __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc(1310);
 __ZN12_GLOBAL__N_1L20register_memory_viewIlEEvPKc(1348);
 __ZN12_GLOBAL__N_1L20register_memory_viewImEEvPKc(1378);
 __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc(1417);
 __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc(1449);
 __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc(1482);
 __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc(1515);
 __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc(1549);
 __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc(1582);
 __ZN12_GLOBAL__N_1L20register_memory_viewIfEEvPKc(1616);
 __ZN12_GLOBAL__N_1L20register_memory_viewIdEEvPKc(1647);
 __ZN12_GLOBAL__N_1L20register_memory_viewIeEEvPKc(1679);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDIvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIvE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDIbE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIbE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_1L16register_integerIcEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $conv = 0, $conv3 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDIcE3getEv()|0);
 $0 = $name$addr;
 $conv = -128 << 24 >> 24;
 $conv3 = 127 << 24 >> 24;
 __embind_register_integer(($call|0),($0|0),1,($conv|0),($conv3|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIaEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $conv = 0, $conv3 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDIaE3getEv()|0);
 $0 = $name$addr;
 $conv = -128 << 24 >> 24;
 $conv3 = 127 << 24 >> 24;
 __embind_register_integer(($call|0),($0|0),1,($conv|0),($conv3|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIhEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $conv = 0, $conv3 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDIhE3getEv()|0);
 $0 = $name$addr;
 $conv = 0;
 $conv3 = 255;
 __embind_register_integer(($call|0),($0|0),1,($conv|0),($conv3|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIsEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $conv = 0, $conv3 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDIsE3getEv()|0);
 $0 = $name$addr;
 $conv = -32768 << 16 >> 16;
 $conv3 = 32767 << 16 >> 16;
 __embind_register_integer(($call|0),($0|0),2,($conv|0),($conv3|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerItEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $conv = 0, $conv3 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDItE3getEv()|0);
 $0 = $name$addr;
 $conv = 0;
 $conv3 = 65535;
 __embind_register_integer(($call|0),($0|0),2,($conv|0),($conv3|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIiEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDIiE3getEv()|0);
 $0 = $name$addr;
 __embind_register_integer(($call|0),($0|0),4,-2147483648,2147483647);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIjEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0);
 $0 = $name$addr;
 __embind_register_integer(($call|0),($0|0),4,0,-1);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIlEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDIlE3getEv()|0);
 $0 = $name$addr;
 __embind_register_integer(($call|0),($0|0),4,-2147483648,2147483647);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerImEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDImE3getEv()|0);
 $0 = $name$addr;
 __embind_register_integer(($call|0),($0|0),4,0,-1);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L14register_floatIfEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDIfE3getEv()|0);
 $0 = $name$addr;
 __embind_register_float(($call|0),($0|0),4);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L14register_floatIdEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDIdE3getEv()|0);
 $0 = $name$addr;
 __embind_register_float(($call|0),($0|0),8);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDINS_3valEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_3valEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIcEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIcEEE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIcEENS_15TypedArrayIndexEv()|0);
 $0 = $name$addr;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIaEEE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIaEENS_15TypedArrayIndexEv()|0);
 $0 = $name$addr;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIhEEE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIhEENS_15TypedArrayIndexEv()|0);
 $0 = $name$addr;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIsEEE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIsEENS_15TypedArrayIndexEv()|0);
 $0 = $name$addr;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewItEEE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexItEENS_15TypedArrayIndexEv()|0);
 $0 = $name$addr;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIiEEE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIiEENS_15TypedArrayIndexEv()|0);
 $0 = $name$addr;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIjEEE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIjEENS_15TypedArrayIndexEv()|0);
 $0 = $name$addr;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIlEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIlEEE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIlEENS_15TypedArrayIndexEv()|0);
 $0 = $name$addr;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewImEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewImEEE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexImEENS_15TypedArrayIndexEv()|0);
 $0 = $name$addr;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIfEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIfEEE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIfEENS_15TypedArrayIndexEv()|0);
 $0 = $name$addr;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIdEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIdEEE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIdEENS_15TypedArrayIndexEv()|0);
 $0 = $name$addr;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIeEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $name$addr = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIeEEE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIeEENS_15TypedArrayIndexEv()|0);
 $0 = $name$addr;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIeEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIeEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIeEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 7;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIeEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (8|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIdEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIdEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIdEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 7;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIdEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (16|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIfEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIfEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIfEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 6;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIfEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (24|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewImEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewImEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexImEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 5;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewImEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (32|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIlEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIlEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIlEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 4;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIlEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (40|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIjEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIjEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIjEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 5;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIjEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (48|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIiEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIiEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIiEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 4;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIiEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (56|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewItEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewItEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexItEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 3;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewItEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (64|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIsEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIsEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIsEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 2;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIsEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (72|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIhEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIhEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIhEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 1;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIhEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (80|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIaEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIaEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIaEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIaEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (88|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIcEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIcEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIcEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIcEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (96|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_3valEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (104|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (112|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (144|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (168|0);
}
function __ZN10emscripten8internal6TypeIDIdE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIdE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIdE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (360|0);
}
function __ZN10emscripten8internal6TypeIDIfE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIfE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIfE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (352|0);
}
function __ZN10emscripten8internal6TypeIDImE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDImE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDImE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (344|0);
}
function __ZN10emscripten8internal6TypeIDIlE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIlE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIlE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (336|0);
}
function __ZN10emscripten8internal6TypeIDIjE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIjE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIjE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (328|0);
}
function __ZN10emscripten8internal6TypeIDIiE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIiE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIiE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (320|0);
}
function __ZN10emscripten8internal6TypeIDItE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDItE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDItE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (312|0);
}
function __ZN10emscripten8internal6TypeIDIsE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIsE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIsE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (304|0);
}
function __ZN10emscripten8internal6TypeIDIhE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIhE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIhE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (288|0);
}
function __ZN10emscripten8internal6TypeIDIaE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIaE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIaE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (296|0);
}
function __ZN10emscripten8internal6TypeIDIcE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIcE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIcE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (280|0);
}
function __ZN10emscripten8internal11LightTypeIDIbE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (272|0);
}
function __ZN10emscripten8internal11LightTypeIDIvE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (264|0);
}
function ___getTypeName($ti) {
 $ti = $ti|0;
 var $0 = 0, $1 = 0, $__type_name$i = 0, $call1 = 0, $this$addr$i = 0, $this1$i = 0, $ti$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $ti$addr = $ti;
 $0 = $ti$addr;
 $this$addr$i = $0;
 $this1$i = $this$addr$i;
 $__type_name$i = ((($this1$i)) + 4|0);
 $1 = HEAP32[$__type_name$i>>2]|0;
 $call1 = (___strdup($1)|0);
 STACKTOP = sp;return ($call1|0);
}
function __emscripten_get_fetch_queue() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $call = 0, $call2 = 0, $mul = 0, $numQueuedItems = 0, $queue = 0, $queueSize = 0, $queueSize1 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $call = (__emscripten_get_fetch_work_queue()|0);
 $queue = $call;
 $0 = $queue;
 $1 = HEAP32[$0>>2]|0;
 $tobool = ($1|0)!=(0|0);
 if ($tobool) {
  $7 = $queue;
  STACKTOP = sp;return ($7|0);
 }
 $2 = $queue;
 $queueSize = ((($2)) + 8|0);
 HEAP32[$queueSize>>2] = 64;
 $3 = $queue;
 $numQueuedItems = ((($3)) + 4|0);
 HEAP32[$numQueuedItems>>2] = 0;
 $4 = $queue;
 $queueSize1 = ((($4)) + 8|0);
 $5 = HEAP32[$queueSize1>>2]|0;
 $mul = $5<<2;
 $call2 = (_malloc($mul)|0);
 $6 = $queue;
 HEAP32[$6>>2] = $call2;
 $7 = $queue;
 STACKTOP = sp;return ($7|0);
}
function __Z22emscripten_proxy_fetchP18emscripten_fetch_t($fetch) {
 $fetch = $fetch|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $arrayidx = 0, $call = 0, $call2 = 0, $fetch$addr = 0, $inc = 0, $numQueuedItems = 0, $numQueuedItems1 = 0, $queue = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $fetch$addr = $fetch;
 $call = (__emscripten_get_fetch_queue()|0);
 $queue = $call;
 $0 = $fetch$addr;
 $1 = $queue;
 $2 = HEAP32[$1>>2]|0;
 $3 = $queue;
 $numQueuedItems = ((($3)) + 4|0);
 $4 = HEAP32[$numQueuedItems>>2]|0;
 $inc = (($4) + 1)|0;
 HEAP32[$numQueuedItems>>2] = $inc;
 $arrayidx = (($2) + ($4<<2)|0);
 HEAP32[$arrayidx>>2] = $0;
 $5 = $queue;
 $numQueuedItems1 = ((($5)) + 4|0);
 $6 = HEAP32[$numQueuedItems1>>2]|0;
 $call2 = _emscripten_asm_const_ii(0, ($6|0))|0;
 STACKTOP = sp;return;
}
function _emscripten_fetch_attr_init($fetch_attr) {
 $fetch_attr = $fetch_attr|0;
 var $0 = 0, $fetch_attr$addr = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $fetch_attr$addr = $fetch_attr;
 $0 = $fetch_attr$addr;
 dest=$0; stop=dest+88|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 STACKTOP = sp;return;
}
function _emscripten_fetch($fetch_attr,$url) {
 $fetch_attr = $fetch_attr|0;
 $url = $url|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $__attributes = 0, $__attributes38 = 0, $__attributes40 = 0, $__attributes43 = 0, $__attributes45 = 0, $__attributes48 = 0, $__attributes54 = 0, $__attributes56 = 0, $__attributes59 = 0, $__attributes65 = 0, $__attributes67 = 0, $__attributes68 = 0, $__attributes71 = 0, $__attributes77 = 0, $__proxyState = 0, $and = 0, $and13 = 0, $and18 = 0;
 var $and5 = 0, $and9 = 0, $attributes = 0, $attributes12 = 0, $attributes17 = 0, $attributes4 = 0, $attributes8 = 0, $call = 0, $call21 = 0, $call32 = 0, $call34 = 0, $call36 = 0, $call42 = 0, $call50 = 0, $call61 = 0, $call73 = 0, $call87 = 0, $cmp = 0, $cmp10 = 0, $cmp14 = 0;
 var $cmp19 = 0, $cmp22 = 0, $cmp6 = 0, $cond = 0, $cond53 = 0, $cond64 = 0, $cond76 = 0, $destinationPath = 0, $destinationPath41 = 0, $destinationPath44 = 0, $fetch = 0, $fetch_attr$addr = 0, $frombool = 0, $frombool11 = 0, $frombool16 = 0, $frombool20 = 0, $frombool23 = 0, $frombool7 = 0, $inc = 0, $isMainBrowserThread = 0;
 var $lnot = 0, $overriddenMimeType = 0, $overriddenMimeType72 = 0, $overriddenMimeType78 = 0, $password = 0, $password60 = 0, $password66 = 0, $performXhr = 0, $readFromIndexedDB = 0, $requestHeaders = 0, $retval = 0, $synchronous = 0, $tobool = 0, $tobool1 = 0, $tobool15 = 0, $tobool24 = 0, $tobool25 = 0, $tobool27 = 0, $tobool28 = 0, $tobool30 = 0;
 var $tobool39 = 0, $tobool46 = 0, $tobool57 = 0, $tobool69 = 0, $tobool79 = 0, $tobool81 = 0, $tobool83 = 0, $tobool85 = 0, $tobool88 = 0, $url$addr = 0, $url37 = 0, $userData = 0, $userData35 = 0, $userName = 0, $userName49 = 0, $userName55 = 0, $waitable = 0, $writeToIndexedDB = 0, dest = 0, label = 0;
 var sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $fetch_attr$addr = $fetch_attr;
 $url$addr = $url;
 $0 = $fetch_attr$addr;
 $tobool = ($0|0)!=(0|0);
 if (!($tobool)) {
  $retval = 0;
  $61 = $retval;
  STACKTOP = sp;return ($61|0);
 }
 $1 = $url$addr;
 $tobool1 = ($1|0)!=(0|0);
 if (!($tobool1)) {
  $retval = 0;
  $61 = $retval;
  STACKTOP = sp;return ($61|0);
 }
 $2 = $fetch_attr$addr;
 $attributes = ((($2)) + 48|0);
 $3 = HEAP32[$attributes>>2]|0;
 $and = $3 & 128;
 $cmp = ($and|0)!=(0);
 $frombool = $cmp&1;
 $waitable = $frombool;
 $4 = $fetch_attr$addr;
 $attributes4 = ((($4)) + 48|0);
 $5 = HEAP32[$attributes4>>2]|0;
 $and5 = $5 & 64;
 $cmp6 = ($and5|0)!=(0);
 $frombool7 = $cmp6&1;
 $synchronous = $frombool7;
 $6 = $fetch_attr$addr;
 $attributes8 = ((($6)) + 48|0);
 $7 = HEAP32[$attributes8>>2]|0;
 $and9 = $7 & 40;
 $cmp10 = ($and9|0)!=(0);
 $frombool11 = $cmp10&1;
 $readFromIndexedDB = $frombool11;
 $8 = $fetch_attr$addr;
 $attributes12 = ((($8)) + 48|0);
 $9 = HEAP32[$attributes12>>2]|0;
 $and13 = $9 & 4;
 $cmp14 = ($and13|0)!=(0);
 if ($cmp14) {
  $11 = 1;
 } else {
  $10 = $fetch_attr$addr;
  $call = (_strncmp($10,2444,7)|0);
  $tobool15 = ($call|0)!=(0);
  $lnot = $tobool15 ^ 1;
  $11 = $lnot;
 }
 $frombool16 = $11&1;
 $writeToIndexedDB = $frombool16;
 $12 = $fetch_attr$addr;
 $attributes17 = ((($12)) + 48|0);
 $13 = HEAP32[$attributes17>>2]|0;
 $and18 = $13 & 32;
 $cmp19 = ($and18|0)==(0);
 $frombool20 = $cmp19&1;
 $performXhr = $frombool20;
 $call21 = (_emscripten_is_main_browser_thread()|0);
 $cmp22 = ($call21|0)!=(0);
 $frombool23 = $cmp22&1;
 $isMainBrowserThread = $frombool23;
 $14 = $isMainBrowserThread;
 $tobool24 = $14&1;
 do {
  if ($tobool24) {
   $15 = $synchronous;
   $tobool25 = $15&1;
   if ($tobool25) {
    $16 = $performXhr;
    $tobool27 = $16&1;
    if (!($tobool27)) {
     $17 = $readFromIndexedDB;
     $tobool28 = $17&1;
     if (!($tobool28)) {
      $18 = $writeToIndexedDB;
      $tobool30 = $18&1;
      if (!($tobool30)) {
       break;
      }
     }
    }
    $19 = $url$addr;
    $call32 = _emscripten_asm_const_ii(1, ($19|0))|0;
    $retval = 0;
    $61 = $retval;
    STACKTOP = sp;return ($61|0);
   }
  }
 } while(0);
 $call34 = (_malloc(200)|0);
 $fetch = $call34;
 $20 = $fetch;
 _memset(($20|0),0,200)|0;
 $21 = HEAP32[96]|0;
 $inc = (($21) + 1)|0;
 HEAP32[96] = $inc;
 $22 = $fetch;
 HEAP32[$22>>2] = $21;
 $23 = $fetch_attr$addr;
 $userData = ((($23)) + 32|0);
 $24 = HEAP32[$userData>>2]|0;
 $25 = $fetch;
 $userData35 = ((($25)) + 4|0);
 HEAP32[$userData35>>2] = $24;
 $26 = $url$addr;
 $call36 = (___strdup($26)|0);
 $27 = $fetch;
 $url37 = ((($27)) + 8|0);
 HEAP32[$url37>>2] = $call36;
 $28 = $fetch_attr$addr;
 $29 = $fetch;
 $__attributes = ((($29)) + 112|0);
 dest=$__attributes; src=$28; stop=dest+88|0; do { HEAP32[dest>>2]=HEAP32[src>>2]|0; dest=dest+4|0; src=src+4|0; } while ((dest|0) < (stop|0));
 $30 = $fetch;
 $__attributes38 = ((($30)) + 112|0);
 $destinationPath = ((($__attributes38)) + 60|0);
 $31 = HEAP32[$destinationPath>>2]|0;
 $tobool39 = ($31|0)!=(0|0);
 if ($tobool39) {
  $32 = $fetch;
  $__attributes40 = ((($32)) + 112|0);
  $destinationPath41 = ((($__attributes40)) + 60|0);
  $33 = HEAP32[$destinationPath41>>2]|0;
  $call42 = (___strdup($33)|0);
  $cond = $call42;
 } else {
  $cond = 0;
 }
 $34 = $fetch;
 $__attributes43 = ((($34)) + 112|0);
 $destinationPath44 = ((($__attributes43)) + 60|0);
 HEAP32[$destinationPath44>>2] = $cond;
 $35 = $fetch;
 $__attributes45 = ((($35)) + 112|0);
 $userName = ((($__attributes45)) + 64|0);
 $36 = HEAP32[$userName>>2]|0;
 $tobool46 = ($36|0)!=(0|0);
 if ($tobool46) {
  $37 = $fetch;
  $__attributes48 = ((($37)) + 112|0);
  $userName49 = ((($__attributes48)) + 64|0);
  $38 = HEAP32[$userName49>>2]|0;
  $call50 = (___strdup($38)|0);
  $cond53 = $call50;
 } else {
  $cond53 = 0;
 }
 $39 = $fetch;
 $__attributes54 = ((($39)) + 112|0);
 $userName55 = ((($__attributes54)) + 64|0);
 HEAP32[$userName55>>2] = $cond53;
 $40 = $fetch;
 $__attributes56 = ((($40)) + 112|0);
 $password = ((($__attributes56)) + 68|0);
 $41 = HEAP32[$password>>2]|0;
 $tobool57 = ($41|0)!=(0|0);
 if ($tobool57) {
  $42 = $fetch;
  $__attributes59 = ((($42)) + 112|0);
  $password60 = ((($__attributes59)) + 68|0);
  $43 = HEAP32[$password60>>2]|0;
  $call61 = (___strdup($43)|0);
  $cond64 = $call61;
 } else {
  $cond64 = 0;
 }
 $44 = $fetch;
 $__attributes65 = ((($44)) + 112|0);
 $password66 = ((($__attributes65)) + 68|0);
 HEAP32[$password66>>2] = $cond64;
 $45 = $fetch;
 $__attributes67 = ((($45)) + 112|0);
 $requestHeaders = ((($__attributes67)) + 72|0);
 HEAP32[$requestHeaders>>2] = 0;
 $46 = $fetch;
 $__attributes68 = ((($46)) + 112|0);
 $overriddenMimeType = ((($__attributes68)) + 76|0);
 $47 = HEAP32[$overriddenMimeType>>2]|0;
 $tobool69 = ($47|0)!=(0|0);
 if ($tobool69) {
  $48 = $fetch;
  $__attributes71 = ((($48)) + 112|0);
  $overriddenMimeType72 = ((($__attributes71)) + 76|0);
  $49 = HEAP32[$overriddenMimeType72>>2]|0;
  $call73 = (___strdup($49)|0);
  $cond76 = $call73;
 } else {
  $cond76 = 0;
 }
 $50 = $fetch;
 $__attributes77 = ((($50)) + 112|0);
 $overriddenMimeType78 = ((($__attributes77)) + 76|0);
 HEAP32[$overriddenMimeType78>>2] = $cond76;
 $51 = $waitable;
 $tobool79 = $51&1;
 do {
  if ($tobool79) {
   label = 25;
  } else {
   $52 = $synchronous;
   $tobool81 = $52&1;
   if ($tobool81) {
    $53 = $readFromIndexedDB;
    $tobool83 = $53&1;
    if ($tobool83) {
     label = 25;
     break;
    }
    $54 = $writeToIndexedDB;
    $tobool85 = $54&1;
    if ($tobool85) {
     label = 25;
     break;
    }
   }
   $59 = $fetch;
   _emscripten_start_fetch(($59|0));
  }
 } while(0);
 if ((label|0) == 25) {
  $55 = $fetch;
  $__proxyState = ((($55)) + 108|0);
  $call87 = (Atomics_store(HEAP32, $__proxyState>>2, 1)|0);
  $56 = $fetch;
  __Z22emscripten_proxy_fetchP18emscripten_fetch_t($56);
  $57 = $synchronous;
  $tobool88 = $57&1;
  if ($tobool88) {
   $58 = $fetch;
   (_emscripten_fetch_wait($58,inf)|0);
  }
 }
 $60 = $fetch;
 $retval = $60;
 $61 = $retval;
 STACKTOP = sp;return ($61|0);
}
function _emscripten_fetch_wait($fetch,$timeoutMsecs) {
 $fetch = $fetch|0;
 $timeoutMsecs = +$timeoutMsecs;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__proxyState = 0, $__proxyState7 = 0, $__proxyState9 = 0, $call = 0, $call10 = 0, $cmp = 0, $cmp11 = 0, $cmp3 = 0, $cmp6 = 0, $fetch$addr = 0;
 var $proxyState = 0, $retval = 0, $timeoutMsecs$addr = 0.0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $fetch$addr = $fetch;
 $timeoutMsecs$addr = $timeoutMsecs;
 $0 = $fetch$addr;
 $tobool = ($0|0)!=(0|0);
 do {
  if ($tobool) {
   $1 = $fetch$addr;
   $__proxyState = ((($1)) + 108|0);
   $call = (Atomics_load(HEAP32, $__proxyState>>2)|0);
   $proxyState = $call;
   $2 = $proxyState;
   $cmp = ($2|0)==(2);
   if ($cmp) {
    $retval = 0;
    break;
   }
   $3 = $proxyState;
   $cmp3 = ($3|0)!=(1);
   if ($cmp3) {
    $retval = -5;
    break;
   }
   _emscripten_asm_const_v(2);
   while(1) {
    $4 = $proxyState;
    $cmp6 = ($4|0)==(1);
    if (!($cmp6)) {
     break;
    }
    $5 = $fetch$addr;
    $__proxyState7 = ((($5)) + 108|0);
    $6 = $proxyState;
    (_emscripten_futex_wait(($__proxyState7|0),($6|0),100.0)|0);
    $7 = $fetch$addr;
    $__proxyState9 = ((($7)) + 108|0);
    $call10 = (Atomics_load(HEAP32, $__proxyState9>>2)|0);
    $proxyState = $call10;
   }
   _emscripten_asm_const_v(3);
   $8 = $proxyState;
   $cmp11 = ($8|0)==(2);
   if ($cmp11) {
    $retval = 0;
    break;
   } else {
    $retval = -6;
    break;
   }
  } else {
   $retval = -5;
  }
 } while(0);
 $9 = $retval;
 STACKTOP = sp;return ($9|0);
}
function _emscripten_fetch_close($fetch) {
 $fetch = $fetch|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var $__attributes = 0, $__attributes10 = 0, $__proxyState = 0, $call = 0, $cmp = 0, $cmp1 = 0, $cmp6 = 0, $conv = 0, $conv5 = 0, $data = 0, $fetch$addr = 0, $onerror = 0, $onerror11 = 0, $readyState = 0, $readyState4 = 0, $retval = 0, $status = 0, $statusText = 0, $tobool = 0, $tobool7 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $fetch$addr = $fetch;
 $0 = $fetch$addr;
 $tobool = ($0|0)!=(0|0);
 if (!($tobool)) {
  $retval = 0;
  $19 = $retval;
  STACKTOP = sp;return ($19|0);
 }
 $1 = $fetch$addr;
 $__proxyState = ((($1)) + 108|0);
 $call = (Atomics_store(HEAP32, $__proxyState>>2, 0)|0);
 $2 = $fetch$addr;
 $3 = HEAP32[$2>>2]|0;
 $cmp = ($3|0)==(0);
 if (!($cmp)) {
  $4 = $fetch$addr;
  $readyState = ((($4)) + 40|0);
  $5 = HEAP16[$readyState>>1]|0;
  $conv = $5&65535;
  $cmp1 = ($conv|0)>(4);
  if (!($cmp1)) {
   $6 = $fetch$addr;
   $readyState4 = ((($6)) + 40|0);
   $7 = HEAP16[$readyState4>>1]|0;
   $conv5 = $7&65535;
   $cmp6 = ($conv5|0)!=(4);
   if ($cmp6) {
    $8 = $fetch$addr;
    $__attributes = ((($8)) + 112|0);
    $onerror = ((($__attributes)) + 40|0);
    $9 = HEAP32[$onerror>>2]|0;
    $tobool7 = ($9|0)!=(0|0);
    if ($tobool7) {
     $10 = $fetch$addr;
     $status = ((($10)) + 42|0);
     HEAP16[$status>>1] = -1;
     $11 = $fetch$addr;
     $statusText = ((($11)) + 44|0);
     (_strcpy($statusText,2900)|0);
     $12 = $fetch$addr;
     $__attributes10 = ((($12)) + 112|0);
     $onerror11 = ((($__attributes10)) + 40|0);
     $13 = HEAP32[$onerror11>>2]|0;
     $14 = $fetch$addr;
     FUNCTION_TABLE_vi[$13 & 31]($14);
    }
   }
   $15 = $fetch$addr;
   HEAP32[$15>>2] = 0;
   $16 = $fetch$addr;
   $data = ((($16)) + 12|0);
   $17 = HEAP32[$data>>2]|0;
   _free($17);
   $18 = $fetch$addr;
   _free($18);
   $retval = 0;
   $19 = $retval;
   STACKTOP = sp;return ($19|0);
  }
 }
 $retval = -5;
 $19 = $retval;
 STACKTOP = sp;return ($19|0);
}
function _emscripten_get_global_libc() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (6000|0);
}
function ___emscripten_pthread_data_constructor() {
 var $call = 0, $locale = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (_pthread_self()|0);
 $locale = ((($call)) + 188|0);
 HEAP32[$locale>>2] = (6040);
 return;
}
function ___stdio_close($f) {
 $f = $f|0;
 var $0 = 0, $call = 0, $call1 = 0, $call2 = 0, $fd = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $fd = ((($f)) + 60|0);
 $0 = HEAP32[$fd>>2]|0;
 $call = (_dummy_568($0)|0);
 HEAP32[$vararg_buffer>>2] = $call;
 $call1 = (___syscall6(6,($vararg_buffer|0))|0);
 $call2 = (___syscall_ret($call1)|0);
 STACKTOP = sp;return ($call2|0);
}
function ___stdio_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add$ptr = 0, $add$ptr32 = 0, $buf8 = 0, $buf_size = 0, $call = 0, $call40 = 0;
 var $call7 = 0, $call741 = 0, $call746 = 0, $cmp = 0, $cmp12 = 0, $cmp17 = 0, $cmp24 = 0, $cmp42 = 0, $cnt$0 = 0, $dec = 0, $fd = 0, $incdec$ptr = 0, $iov$043 = 0, $iov$1 = 0, $iov_base2 = 0, $iov_len = 0, $iov_len19 = 0, $iov_len23 = 0, $iov_len3 = 0, $iov_len36 = 0;
 var $iovcnt$045 = 0, $iovcnt$1 = 0, $iovs = 0, $or = 0, $rem$044 = 0, $retval$0 = 0, $sub = 0, $sub$ptr$sub = 0, $sub21 = 0, $sub28 = 0, $sub37 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, $wbase = 0, $wend = 0, $wend14 = 0;
 var $wpos = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $iovs = sp + 32|0;
 $wbase = ((($f)) + 28|0);
 $0 = HEAP32[$wbase>>2]|0;
 HEAP32[$iovs>>2] = $0;
 $iov_len = ((($iovs)) + 4|0);
 $wpos = ((($f)) + 20|0);
 $1 = HEAP32[$wpos>>2]|0;
 $sub$ptr$sub = (($1) - ($0))|0;
 HEAP32[$iov_len>>2] = $sub$ptr$sub;
 $iov_base2 = ((($iovs)) + 8|0);
 HEAP32[$iov_base2>>2] = $buf;
 $iov_len3 = ((($iovs)) + 12|0);
 HEAP32[$iov_len3>>2] = $len;
 $add = (($sub$ptr$sub) + ($len))|0;
 $fd = ((($f)) + 60|0);
 $2 = HEAP32[$fd>>2]|0;
 $3 = $iovs;
 HEAP32[$vararg_buffer>>2] = $2;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $3;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = 2;
 $call40 = (___syscall146(146,($vararg_buffer|0))|0);
 $call741 = (___syscall_ret($call40)|0);
 $cmp42 = ($add|0)==($call741|0);
 L1: do {
  if ($cmp42) {
   label = 3;
  } else {
   $call746 = $call741;$iov$043 = $iovs;$iovcnt$045 = 2;$rem$044 = $add;
   while(1) {
    $cmp12 = ($call746|0)<(0);
    if ($cmp12) {
     break;
    }
    $sub21 = (($rem$044) - ($call746))|0;
    $iov_len23 = ((($iov$043)) + 4|0);
    $8 = HEAP32[$iov_len23>>2]|0;
    $cmp24 = ($call746>>>0)>($8>>>0);
    $incdec$ptr = ((($iov$043)) + 8|0);
    $iov$1 = $cmp24 ? $incdec$ptr : $iov$043;
    $dec = $cmp24 << 31 >> 31;
    $iovcnt$1 = (($dec) + ($iovcnt$045))|0;
    $sub28 = $cmp24 ? $8 : 0;
    $cnt$0 = (($call746) - ($sub28))|0;
    $9 = HEAP32[$iov$1>>2]|0;
    $add$ptr32 = (($9) + ($cnt$0)|0);
    HEAP32[$iov$1>>2] = $add$ptr32;
    $iov_len36 = ((($iov$1)) + 4|0);
    $10 = HEAP32[$iov_len36>>2]|0;
    $sub37 = (($10) - ($cnt$0))|0;
    HEAP32[$iov_len36>>2] = $sub37;
    $11 = HEAP32[$fd>>2]|0;
    $12 = $iov$1;
    HEAP32[$vararg_buffer3>>2] = $11;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $12;
    $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
    HEAP32[$vararg_ptr7>>2] = $iovcnt$1;
    $call = (___syscall146(146,($vararg_buffer3|0))|0);
    $call7 = (___syscall_ret($call)|0);
    $cmp = ($sub21|0)==($call7|0);
    if ($cmp) {
     label = 3;
     break L1;
    } else {
     $call746 = $call7;$iov$043 = $iov$1;$iovcnt$045 = $iovcnt$1;$rem$044 = $sub21;
    }
   }
   $wend14 = ((($f)) + 16|0);
   HEAP32[$wend14>>2] = 0;
   HEAP32[$wbase>>2] = 0;
   HEAP32[$wpos>>2] = 0;
   $6 = HEAP32[$f>>2]|0;
   $or = $6 | 32;
   HEAP32[$f>>2] = $or;
   $cmp17 = ($iovcnt$045|0)==(2);
   if ($cmp17) {
    $retval$0 = 0;
   } else {
    $iov_len19 = ((($iov$043)) + 4|0);
    $7 = HEAP32[$iov_len19>>2]|0;
    $sub = (($len) - ($7))|0;
    $retval$0 = $sub;
   }
  }
 } while(0);
 if ((label|0) == 3) {
  $buf8 = ((($f)) + 44|0);
  $4 = HEAP32[$buf8>>2]|0;
  $buf_size = ((($f)) + 48|0);
  $5 = HEAP32[$buf_size>>2]|0;
  $add$ptr = (($4) + ($5)|0);
  $wend = ((($f)) + 16|0);
  HEAP32[$wend>>2] = $add$ptr;
  HEAP32[$wbase>>2] = $4;
  HEAP32[$wpos>>2] = $4;
  $retval$0 = $len;
 }
 STACKTOP = sp;return ($retval$0|0);
}
function ___stdio_seek($f,$off,$whence) {
 $f = $f|0;
 $off = $off|0;
 $whence = $whence|0;
 var $$pre = 0, $0 = 0, $1 = 0, $2 = 0, $call = 0, $call1 = 0, $cmp = 0, $fd = 0, $ret = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $ret = sp + 20|0;
 $fd = ((($f)) + 60|0);
 $0 = HEAP32[$fd>>2]|0;
 $1 = $ret;
 HEAP32[$vararg_buffer>>2] = $0;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $off;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $1;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $whence;
 $call = (___syscall140(140,($vararg_buffer|0))|0);
 $call1 = (___syscall_ret($call)|0);
 $cmp = ($call1|0)<(0);
 if ($cmp) {
  HEAP32[$ret>>2] = -1;
  $2 = -1;
 } else {
  $$pre = HEAP32[$ret>>2]|0;
  $2 = $$pre;
 }
 STACKTOP = sp;return ($2|0);
}
function ___syscall_ret($r) {
 $r = $r|0;
 var $call = 0, $cmp = 0, $retval$0 = 0, $sub = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($r>>>0)>(4294963200);
 if ($cmp) {
  $sub = (0 - ($r))|0;
  $call = (___errno_location()|0);
  HEAP32[$call>>2] = $sub;
  $retval$0 = -1;
 } else {
  $retval$0 = $r;
 }
 return ($retval$0|0);
}
function ___errno_location() {
 var $call = 0, $errno_val = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (___pthread_self_103()|0);
 $errno_val = ((($call)) + 64|0);
 return ($errno_val|0);
}
function ___pthread_self_103() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (_pthread_self()|0);
 return ($call|0);
}
function _dummy_568($fd) {
 $fd = $fd|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($fd|0);
}
function ___stdout_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $0 = 0, $1 = 0, $2 = 0, $and = 0, $call = 0, $call3 = 0, $fd = 0, $lbf = 0, $tobool = 0, $tobool2 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $write = 0, $wsz = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $wsz = sp + 16|0;
 $write = ((($f)) + 36|0);
 HEAP32[$write>>2] = 25;
 $0 = HEAP32[$f>>2]|0;
 $and = $0 & 64;
 $tobool = ($and|0)==(0);
 if ($tobool) {
  $fd = ((($f)) + 60|0);
  $1 = HEAP32[$fd>>2]|0;
  $2 = $wsz;
  HEAP32[$vararg_buffer>>2] = $1;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21523;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $2;
  $call = (___syscall54(54,($vararg_buffer|0))|0);
  $tobool2 = ($call|0)==(0);
  if (!($tobool2)) {
   $lbf = ((($f)) + 75|0);
   HEAP8[$lbf>>0] = -1;
  }
 }
 $call3 = (___stdio_write($f,$buf,$len)|0);
 STACKTOP = sp;return ($call3|0);
}
function _strcmp($l,$r) {
 $l = $l|0;
 $r = $r|0;
 var $$lcssa = 0, $$lcssa6 = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $cmp = 0, $cmp7 = 0, $conv5 = 0, $conv6 = 0, $incdec$ptr = 0, $incdec$ptr4 = 0, $l$addr$010 = 0, $or$cond = 0, $or$cond9 = 0, $r$addr$011 = 0, $sub = 0, $tobool = 0, $tobool8 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $0 = HEAP8[$l>>0]|0;
 $1 = HEAP8[$r>>0]|0;
 $cmp7 = ($0<<24>>24)!=($1<<24>>24);
 $tobool8 = ($0<<24>>24)==(0);
 $or$cond9 = $tobool8 | $cmp7;
 if ($or$cond9) {
  $$lcssa = $1;$$lcssa6 = $0;
 } else {
  $l$addr$010 = $l;$r$addr$011 = $r;
  while(1) {
   $incdec$ptr = ((($l$addr$010)) + 1|0);
   $incdec$ptr4 = ((($r$addr$011)) + 1|0);
   $2 = HEAP8[$incdec$ptr>>0]|0;
   $3 = HEAP8[$incdec$ptr4>>0]|0;
   $cmp = ($2<<24>>24)!=($3<<24>>24);
   $tobool = ($2<<24>>24)==(0);
   $or$cond = $tobool | $cmp;
   if ($or$cond) {
    $$lcssa = $3;$$lcssa6 = $2;
    break;
   } else {
    $l$addr$010 = $incdec$ptr;$r$addr$011 = $incdec$ptr4;
   }
  }
 }
 $conv5 = $$lcssa6&255;
 $conv6 = $$lcssa&255;
 $sub = (($conv5) - ($conv6))|0;
 return ($sub|0);
}
function _strncmp($_l,$_r,$n) {
 $_l = $_l|0;
 $_r = $_r|0;
 $n = $n|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $cmp = 0, $conv = 0, $conv$lcssa = 0, $conv14 = 0, $conv2 = 0, $conv2$lcssa = 0, $conv20 = 0, $conv216 = 0, $conv221 = 0, $incdec$ptr = 0, $incdec$ptr9 = 0, $l$017 = 0, $n$addr$019 = 0, $n$addr$019$in = 0;
 var $or$cond = 0, $or$cond12 = 0, $r$018 = 0, $retval$0 = 0, $sub = 0, $tobool = 0, $tobool1 = 0, $tobool115 = 0, $tobool3 = 0, $tobool5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($n|0)==(0);
 if ($tobool) {
  $retval$0 = 0;
 } else {
  $0 = HEAP8[$_l>>0]|0;
  $conv14 = $0&255;
  $tobool115 = ($0<<24>>24)==(0);
  $1 = HEAP8[$_r>>0]|0;
  $conv216 = $1&255;
  L3: do {
   if ($tobool115) {
    $conv$lcssa = $conv14;$conv2$lcssa = $conv216;
   } else {
    $2 = $1;$3 = $0;$conv20 = $conv14;$conv221 = $conv216;$l$017 = $_l;$n$addr$019$in = $n;$r$018 = $_r;
    while(1) {
     $n$addr$019 = (($n$addr$019$in) + -1)|0;
     $tobool3 = ($2<<24>>24)!=(0);
     $tobool5 = ($n$addr$019|0)!=(0);
     $or$cond = $tobool5 & $tobool3;
     $cmp = ($3<<24>>24)==($2<<24>>24);
     $or$cond12 = $cmp & $or$cond;
     if (!($or$cond12)) {
      $conv$lcssa = $conv20;$conv2$lcssa = $conv221;
      break L3;
     }
     $incdec$ptr = ((($l$017)) + 1|0);
     $incdec$ptr9 = ((($r$018)) + 1|0);
     $4 = HEAP8[$incdec$ptr>>0]|0;
     $conv = $4&255;
     $tobool1 = ($4<<24>>24)==(0);
     $5 = HEAP8[$incdec$ptr9>>0]|0;
     $conv2 = $5&255;
     if ($tobool1) {
      $conv$lcssa = $conv;$conv2$lcssa = $conv2;
      break;
     } else {
      $2 = $5;$3 = $4;$conv20 = $conv;$conv221 = $conv2;$l$017 = $incdec$ptr;$n$addr$019$in = $n$addr$019;$r$018 = $incdec$ptr9;
     }
    }
   }
  } while(0);
  $sub = (($conv$lcssa) - ($conv2$lcssa))|0;
  $retval$0 = $sub;
 }
 return ($retval$0|0);
}
function _vsnprintf($s,$n,$fmt,$ap) {
 $s = $s|0;
 $n = $n|0;
 $fmt = $fmt|0;
 $ap = $ap|0;
 var $0 = 0, $1 = 0, $add$ptr = 0, $arrayidx = 0, $b = 0, $buf = 0, $buf_size = 0, $call = 0, $call10 = 0, $cmp = 0, $cmp16 = 0, $cmp4 = 0, $f = 0, $n$addr$0 = 0, $retval$0 = 0, $s$addr$0 = 0, $sub = 0, $sub$ptr$rhs$cast = 0, $sub17 = 0, $sub3 = 0;
 var $sub3$n$addr$0 = 0, $tobool = 0, $tobool11 = 0, $wbase = 0, $wend = 0, $wpos = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $b = sp + 124|0;
 $f = sp;
 dest=$f; src=520; stop=dest+124|0; do { HEAP32[dest>>2]=HEAP32[src>>2]|0; dest=dest+4|0; src=src+4|0; } while ((dest|0) < (stop|0));
 $sub = (($n) + -1)|0;
 $cmp = ($sub>>>0)>(2147483646);
 if ($cmp) {
  $tobool = ($n|0)==(0);
  if ($tobool) {
   $n$addr$0 = 1;$s$addr$0 = $b;
   label = 4;
  } else {
   $call = (___errno_location()|0);
   HEAP32[$call>>2] = 75;
   $retval$0 = -1;
  }
 } else {
  $n$addr$0 = $n;$s$addr$0 = $s;
  label = 4;
 }
 if ((label|0) == 4) {
  $sub$ptr$rhs$cast = $s$addr$0;
  $sub3 = (-2 - ($sub$ptr$rhs$cast))|0;
  $cmp4 = ($n$addr$0>>>0)>($sub3>>>0);
  $sub3$n$addr$0 = $cmp4 ? $sub3 : $n$addr$0;
  $buf_size = ((($f)) + 48|0);
  HEAP32[$buf_size>>2] = $sub3$n$addr$0;
  $wpos = ((($f)) + 20|0);
  HEAP32[$wpos>>2] = $s$addr$0;
  $buf = ((($f)) + 44|0);
  HEAP32[$buf>>2] = $s$addr$0;
  $add$ptr = (($s$addr$0) + ($sub3$n$addr$0)|0);
  $wend = ((($f)) + 16|0);
  HEAP32[$wend>>2] = $add$ptr;
  $wbase = ((($f)) + 28|0);
  HEAP32[$wbase>>2] = $add$ptr;
  $call10 = (_vfprintf($f,$fmt,$ap)|0);
  $tobool11 = ($sub3$n$addr$0|0)==(0);
  if ($tobool11) {
   $retval$0 = $call10;
  } else {
   $0 = HEAP32[$wpos>>2]|0;
   $1 = HEAP32[$wend>>2]|0;
   $cmp16 = ($0|0)==($1|0);
   $sub17 = $cmp16 << 31 >> 31;
   $arrayidx = (($0) + ($sub17)|0);
   HEAP8[$arrayidx>>0] = 0;
   $retval$0 = $call10;
  }
 }
 STACKTOP = sp;return ($retval$0|0);
}
function _vfprintf($f,$fmt,$ap) {
 $f = $f|0;
 $fmt = $fmt|0;
 $ap = $ap|0;
 var $$call21 = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $add$ptr = 0, $and = 0, $and11 = 0, $and36 = 0, $ap2 = 0, $buf = 0, $buf_size = 0, $call = 0, $call21 = 0, $call2130 = 0, $call6 = 0;
 var $cmp = 0, $cmp5 = 0, $cmp7 = 0, $cond = 0, $internal_buf = 0, $lock = 0, $mode = 0, $nl_arg = 0, $nl_type = 0, $or = 0, $ret$1 = 0, $ret$1$ = 0, $retval$0 = 0, $tobool = 0, $tobool22 = 0, $tobool26 = 0, $tobool37 = 0, $tobool41 = 0, $vacopy_currentptr = 0, $wbase = 0;
 var $wend = 0, $wpos = 0, $write = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $ap2 = sp + 120|0;
 $nl_type = sp + 80|0;
 $nl_arg = sp;
 $internal_buf = sp + 136|0;
 dest=$nl_type; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$ap>>2]|0;
 HEAP32[$ap2>>2] = $vacopy_currentptr;
 $call = (_printf_core(0,$fmt,$ap2,$nl_arg,$nl_type)|0);
 $cmp = ($call|0)<(0);
 if ($cmp) {
  $retval$0 = -1;
 } else {
  $lock = ((($f)) + 76|0);
  $0 = (Atomics_load(HEAP32,$lock>>2)|0);
  $cmp5 = ($0|0)>(-1);
  if ($cmp5) {
   $call6 = (___lockfile($f)|0);
   $cond = $call6;
  } else {
   $cond = 0;
  }
  $1 = HEAP32[$f>>2]|0;
  $and = $1 & 32;
  $mode = ((($f)) + 74|0);
  $2 = HEAP8[$mode>>0]|0;
  $cmp7 = ($2<<24>>24)<(1);
  if ($cmp7) {
   $and11 = $1 & -33;
   HEAP32[$f>>2] = $and11;
  }
  $buf_size = ((($f)) + 48|0);
  $3 = HEAP32[$buf_size>>2]|0;
  $tobool = ($3|0)==(0);
  if ($tobool) {
   $buf = ((($f)) + 44|0);
   $4 = HEAP32[$buf>>2]|0;
   HEAP32[$buf>>2] = $internal_buf;
   $wbase = ((($f)) + 28|0);
   HEAP32[$wbase>>2] = $internal_buf;
   $wpos = ((($f)) + 20|0);
   HEAP32[$wpos>>2] = $internal_buf;
   HEAP32[$buf_size>>2] = 80;
   $add$ptr = ((($internal_buf)) + 80|0);
   $wend = ((($f)) + 16|0);
   HEAP32[$wend>>2] = $add$ptr;
   $call21 = (_printf_core($f,$fmt,$ap2,$nl_arg,$nl_type)|0);
   $tobool22 = ($4|0)==(0|0);
   if ($tobool22) {
    $ret$1 = $call21;
   } else {
    $write = ((($f)) + 36|0);
    $5 = HEAP32[$write>>2]|0;
    (FUNCTION_TABLE_iiii[$5 & 31]($f,0,0)|0);
    $6 = HEAP32[$wpos>>2]|0;
    $tobool26 = ($6|0)==(0|0);
    $$call21 = $tobool26 ? -1 : $call21;
    HEAP32[$buf>>2] = $4;
    HEAP32[$buf_size>>2] = 0;
    HEAP32[$wend>>2] = 0;
    HEAP32[$wbase>>2] = 0;
    HEAP32[$wpos>>2] = 0;
    $ret$1 = $$call21;
   }
  } else {
   $call2130 = (_printf_core($f,$fmt,$ap2,$nl_arg,$nl_type)|0);
   $ret$1 = $call2130;
  }
  $7 = HEAP32[$f>>2]|0;
  $and36 = $7 & 32;
  $tobool37 = ($and36|0)==(0);
  $ret$1$ = $tobool37 ? $ret$1 : -1;
  $or = $7 | $and;
  HEAP32[$f>>2] = $or;
  $tobool41 = ($cond|0)==(0);
  if (!($tobool41)) {
   ___unlockfile($f);
  }
  $retval$0 = $ret$1$;
 }
 STACKTOP = sp;return ($retval$0|0);
}
function _printf_core($f,$fmt,$ap,$nl_arg,$nl_type) {
 $f = $f|0;
 $fmt = $fmt|0;
 $ap = $ap|0;
 $nl_arg = $nl_arg|0;
 $nl_type = $nl_type|0;
 var $$ = 0, $$$ = 0, $$194$ = 0, $$197 = 0, $$add$ptr258 = 0, $$l10n$0 = 0, $$lcssa199 = 0, $$pre = 0, $$pre247 = 0, $$pre248 = 0, $$pre248$pre = 0, $$pre249 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0;
 var $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0;
 var $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0;
 var $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0.0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0;
 var $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0;
 var $97 = 0, $98 = 0, $99 = 0, $a$0 = 0, $a$0$add$ptr206 = 0, $a$1 = 0, $a$2 = 0, $add = 0, $add$ptr = 0, $add$ptr139 = 0, $add$ptr206 = 0, $add$ptr258 = 0, $add$ptr341 = 0, $add$ptr360 = 0, $add$ptr43 = 0, $add$ptr43$arrayidx31 = 0, $add$ptr474 = 0, $add$ptr88 = 0, $add270 = 0, $add323 = 0;
 var $add396 = 0, $add413 = 0, $add442 = 0, $and = 0, $and211 = 0, $and215 = 0, $and217 = 0, $and220 = 0, $and250 = 0, $and255 = 0, $and264 = 0, $and290 = 0, $and295 = 0, $and310 = 0, $and310$fl$4 = 0, $arg = 0, $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0, $arglist_next3 = 0;
 var $argpos$0 = 0, $arrayidx114 = 0, $arrayidx119 = 0, $arrayidx124 = 0, $arrayidx132 = 0, $arrayidx16 = 0, $arrayidx174 = 0, $arrayidx193 = 0, $arrayidx31 = 0, $arrayidx35 = 0, $arrayidx371 = 0, $arrayidx470 = 0, $arrayidx482 = 0, $arrayidx68 = 0, $arrayidx73 = 0, $arrayidx81 = 0, $buf = 0, $call = 0, $call104 = 0, $call160 = 0;
 var $call345 = 0, $call346 = 0, $call357 = 0, $call385 = 0, $call412 = 0, $call430 = 0, $cmp = 0, $cmp1 = 0, $cmp105 = 0, $cmp111 = 0, $cmp116 = 0, $cmp126 = 0, $cmp13 = 0, $cmp166 = 0, $cmp177 = 0, $cmp18 = 0, $cmp182 = 0, $cmp185 = 0, $cmp212 = 0, $cmp241 = 0;
 var $cmp271 = 0, $cmp307 = 0, $cmp324 = 0, $cmp37 = 0, $cmp378 = 0, $cmp378227 = 0, $cmp386 = 0, $cmp391 = 0, $cmp398 = 0, $cmp405 = 0, $cmp405237 = 0, $cmp414 = 0, $cmp422 = 0, $cmp435 = 0, $cmp443 = 0, $cmp467 = 0, $cmp479 = 0, $cmp50 = 0, $cmp50217 = 0, $cmp65 = 0;
 var $cmp75 = 0, $cmp97 = 0, $cnt$0 = 0, $cnt$1 = 0, $cond149 = 0, $cond246 = 0, $cond355 = 0, $cond427 = 0, $conv120 = 0, $conv134 = 0, $conv164 = 0, $conv172 = 0, $conv175 = 0, $conv208 = 0, $conv230 = 0, $conv233 = 0, $conv32 = 0, $conv48 = 0, $conv48215 = 0, $conv69 = 0;
 var $conv83 = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $fl$0$lcssa = 0, $fl$0219 = 0, $fl$1 = 0, $fl$1$and220 = 0, $fl$3 = 0, $fl$4 = 0, $fl$6 = 0, $i$0$lcssa = 0, $i$0$lcssa256 = 0;
 var $i$0229 = 0, $i$1238 = 0, $i$2210 = 0, $i$3207 = 0, $i137 = 0, $i86 = 0, $inc = 0, $inc489 = 0, $incdec$ptr = 0, $incdec$ptr159 = 0, $incdec$ptr171 = 0, $incdec$ptr23 = 0, $incdec$ptr384 = 0, $incdec$ptr411 = 0, $incdec$ptr62 = 0, $isdigit = 0, $isdigit188 = 0, $isdigit190 = 0, $isdigittmp = 0, $isdigittmp$ = 0;
 var $isdigittmp187 = 0, $isdigittmp189 = 0, $l$0 = 0, $l$1228 = 0, $l$2 = 0, $l10n$0 = 0, $l10n$0$phi = 0, $l10n$1 = 0, $l10n$2 = 0, $l10n$3 = 0, $lnot = 0, $lnot$ext = 0, $lnot484 = 0, $mb = 0, $narrow = 0, $or = 0, $or$cond = 0, $or$cond192 = 0, $or$cond193 = 0, $or$cond195 = 0;
 var $or100 = 0, $or100$fl$0 = 0, $or247 = 0, $p$0 = 0, $p$0$p$0$add270 = 0, $p$1 = 0, $p$2 = 0, $p$2$add323 = 0, $p$2$add323$p$2 = 0, $p$3 = 0, $p$4253 = 0, $p$5 = 0, $pl$0 = 0, $pl$1 = 0, $pl$2 = 0, $prefix$0 = 0, $prefix$1 = 0, $prefix$2 = 0, $retval$0 = 0, $s = 0;
 var $shl = 0, $shr = 0, $st$0 = 0, $storemerge = 0, $storemerge186218 = 0, $storemerge191 = 0, $sub = 0, $sub$ptr$lhs$cast = 0, $sub$ptr$lhs$cast318 = 0, $sub$ptr$lhs$cast362 = 0, $sub$ptr$lhs$cast432 = 0, $sub$ptr$rhs$cast = 0, $sub$ptr$rhs$cast268 = 0, $sub$ptr$rhs$cast319 = 0, $sub$ptr$rhs$cast363 = 0, $sub$ptr$rhs$cast433 = 0, $sub$ptr$sub = 0, $sub$ptr$sub269 = 0, $sub$ptr$sub320 = 0, $sub$ptr$sub364 = 0;
 var $sub$ptr$sub434 = 0, $sub$ptr$sub434$p$5 = 0, $sub101 = 0, $sub101$w$0 = 0, $sub135 = 0, $sub165 = 0, $sub173 = 0, $sub176 = 0, $sub390 = 0, $sub49 = 0, $sub49216 = 0, $sub49220 = 0, $sub84 = 0, $t$0 = 0, $t$1 = 0, $tobool = 0, $tobool141 = 0, $tobool179 = 0, $tobool209 = 0, $tobool218 = 0;
 var $tobool25 = 0, $tobool256 = 0, $tobool265 = 0, $tobool28 = 0, $tobool291 = 0, $tobool296 = 0, $tobool315 = 0, $tobool350 = 0, $tobool358 = 0, $tobool381 = 0, $tobool408 = 0, $tobool460 = 0, $tobool463 = 0, $tobool471 = 0, $tobool55 = 0, $tobool90 = 0, $trunc = 0, $w$0 = 0, $w$1 = 0, $w$2 = 0;
 var $wc = 0, $ws$0230 = 0, $ws$1239 = 0, $xor = 0, $xor450 = 0, $xor458 = 0, $z$0$lcssa = 0, $z$0212 = 0, $z$1 = 0, $z$2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $s = sp + 16|0;
 $arg = sp;
 $buf = sp + 24|0;
 $wc = sp + 8|0;
 $mb = sp + 20|0;
 HEAP32[$s>>2] = $fmt;
 $tobool25 = ($f|0)!=(0|0);
 $add$ptr206 = ((($buf)) + 40|0);
 $sub$ptr$lhs$cast318 = $add$ptr206;
 $add$ptr341 = ((($buf)) + 39|0);
 $arrayidx371 = ((($wc)) + 4|0);
 $1 = $fmt;$cnt$0 = 0;$l$0 = 0;$l10n$0 = 0;
 L1: while(1) {
  $cmp = ($cnt$0|0)>(-1);
  do {
   if ($cmp) {
    $sub = (2147483647 - ($cnt$0))|0;
    $cmp1 = ($l$0|0)>($sub|0);
    if ($cmp1) {
     $call = (___errno_location()|0);
     HEAP32[$call>>2] = 75;
     $cnt$1 = -1;
     break;
    } else {
     $add = (($l$0) + ($cnt$0))|0;
     $cnt$1 = $add;
     break;
    }
   } else {
    $cnt$1 = $cnt$0;
   }
  } while(0);
  $0 = HEAP8[$1>>0]|0;
  $tobool = ($0<<24>>24)==(0);
  if ($tobool) {
   label = 87;
   break;
  } else {
   $2 = $0;$3 = $1;
  }
  L9: while(1) {
   switch ($2<<24>>24) {
   case 37:  {
    $4 = $3;$z$0212 = $3;
    label = 9;
    break L9;
    break;
   }
   case 0:  {
    $7 = $3;$z$0$lcssa = $3;
    break L9;
    break;
   }
   default: {
   }
   }
   $incdec$ptr = ((($3)) + 1|0);
   HEAP32[$s>>2] = $incdec$ptr;
   $$pre = HEAP8[$incdec$ptr>>0]|0;
   $2 = $$pre;$3 = $incdec$ptr;
  }
  L12: do {
   if ((label|0) == 9) {
    while(1) {
     label = 0;
     $arrayidx16 = ((($4)) + 1|0);
     $5 = HEAP8[$arrayidx16>>0]|0;
     $cmp18 = ($5<<24>>24)==(37);
     if (!($cmp18)) {
      $7 = $4;$z$0$lcssa = $z$0212;
      break L12;
     }
     $incdec$ptr23 = ((($z$0212)) + 1|0);
     $add$ptr = ((($4)) + 2|0);
     HEAP32[$s>>2] = $add$ptr;
     $6 = HEAP8[$add$ptr>>0]|0;
     $cmp13 = ($6<<24>>24)==(37);
     if ($cmp13) {
      $4 = $add$ptr;$z$0212 = $incdec$ptr23;
      label = 9;
     } else {
      $7 = $add$ptr;$z$0$lcssa = $incdec$ptr23;
      break;
     }
    }
   }
  } while(0);
  $sub$ptr$lhs$cast = $z$0$lcssa;
  $sub$ptr$rhs$cast = $1;
  $sub$ptr$sub = (($sub$ptr$lhs$cast) - ($sub$ptr$rhs$cast))|0;
  if ($tobool25) {
   _out($f,$1,$sub$ptr$sub);
  }
  $tobool28 = ($sub$ptr$sub|0)==(0);
  if (!($tobool28)) {
   $l10n$0$phi = $l10n$0;$1 = $7;$cnt$0 = $cnt$1;$l$0 = $sub$ptr$sub;$l10n$0 = $l10n$0$phi;
   continue;
  }
  $arrayidx31 = ((($7)) + 1|0);
  $8 = HEAP8[$arrayidx31>>0]|0;
  $conv32 = $8 << 24 >> 24;
  $isdigittmp = (($conv32) + -48)|0;
  $isdigit = ($isdigittmp>>>0)<(10);
  if ($isdigit) {
   $arrayidx35 = ((($7)) + 2|0);
   $9 = HEAP8[$arrayidx35>>0]|0;
   $cmp37 = ($9<<24>>24)==(36);
   $add$ptr43 = ((($7)) + 3|0);
   $add$ptr43$arrayidx31 = $cmp37 ? $add$ptr43 : $arrayidx31;
   $$l10n$0 = $cmp37 ? 1 : $l10n$0;
   $isdigittmp$ = $cmp37 ? $isdigittmp : -1;
   $argpos$0 = $isdigittmp$;$l10n$1 = $$l10n$0;$storemerge = $add$ptr43$arrayidx31;
  } else {
   $argpos$0 = -1;$l10n$1 = $l10n$0;$storemerge = $arrayidx31;
  }
  HEAP32[$s>>2] = $storemerge;
  $10 = HEAP8[$storemerge>>0]|0;
  $conv48215 = $10 << 24 >> 24;
  $sub49216 = (($conv48215) + -32)|0;
  $cmp50217 = ($sub49216>>>0)<(32);
  L24: do {
   if ($cmp50217) {
    $149 = $10;$fl$0219 = 0;$storemerge186218 = $storemerge;$sub49220 = $sub49216;
    while(1) {
     $shl = 1 << $sub49220;
     $and = $shl & 75913;
     $tobool55 = ($and|0)==(0);
     if ($tobool55) {
      $$lcssa199 = $149;$12 = $storemerge186218;$fl$0$lcssa = $fl$0219;
      break L24;
     }
     $or = $shl | $fl$0219;
     $incdec$ptr62 = ((($storemerge186218)) + 1|0);
     HEAP32[$s>>2] = $incdec$ptr62;
     $11 = HEAP8[$incdec$ptr62>>0]|0;
     $conv48 = $11 << 24 >> 24;
     $sub49 = (($conv48) + -32)|0;
     $cmp50 = ($sub49>>>0)<(32);
     if ($cmp50) {
      $149 = $11;$fl$0219 = $or;$storemerge186218 = $incdec$ptr62;$sub49220 = $sub49;
     } else {
      $$lcssa199 = $11;$12 = $incdec$ptr62;$fl$0$lcssa = $or;
      break;
     }
    }
   } else {
    $$lcssa199 = $10;$12 = $storemerge;$fl$0$lcssa = 0;
   }
  } while(0);
  $cmp65 = ($$lcssa199<<24>>24)==(42);
  if ($cmp65) {
   $arrayidx68 = ((($12)) + 1|0);
   $13 = HEAP8[$arrayidx68>>0]|0;
   $conv69 = $13 << 24 >> 24;
   $isdigittmp189 = (($conv69) + -48)|0;
   $isdigit190 = ($isdigittmp189>>>0)<(10);
   if ($isdigit190) {
    $arrayidx73 = ((($12)) + 2|0);
    $14 = HEAP8[$arrayidx73>>0]|0;
    $cmp75 = ($14<<24>>24)==(36);
    if ($cmp75) {
     $arrayidx81 = (($nl_type) + ($isdigittmp189<<2)|0);
     HEAP32[$arrayidx81>>2] = 10;
     $15 = HEAP8[$arrayidx68>>0]|0;
     $conv83 = $15 << 24 >> 24;
     $sub84 = (($conv83) + -48)|0;
     $i86 = (($nl_arg) + ($sub84<<3)|0);
     $16 = $i86;
     $17 = $16;
     $18 = HEAP32[$17>>2]|0;
     $19 = (($16) + 4)|0;
     $20 = $19;
     $21 = HEAP32[$20>>2]|0;
     $add$ptr88 = ((($12)) + 3|0);
     $l10n$2 = 1;$storemerge191 = $add$ptr88;$w$0 = $18;
    } else {
     label = 23;
    }
   } else {
    label = 23;
   }
   if ((label|0) == 23) {
    label = 0;
    $tobool90 = ($l10n$1|0)==(0);
    if (!($tobool90)) {
     $retval$0 = -1;
     break;
    }
    if ($tobool25) {
     $arglist_current = HEAP32[$ap>>2]|0;
     $22 = $arglist_current;
     $23 = ((0) + 4|0);
     $expanded4 = $23;
     $expanded = (($expanded4) - 1)|0;
     $24 = (($22) + ($expanded))|0;
     $25 = ((0) + 4|0);
     $expanded8 = $25;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $26 = $24 & $expanded6;
     $27 = $26;
     $28 = HEAP32[$27>>2]|0;
     $arglist_next = ((($27)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next;
     $l10n$2 = 0;$storemerge191 = $arrayidx68;$w$0 = $28;
    } else {
     $l10n$2 = 0;$storemerge191 = $arrayidx68;$w$0 = 0;
    }
   }
   HEAP32[$s>>2] = $storemerge191;
   $cmp97 = ($w$0|0)<(0);
   $or100 = $fl$0$lcssa | 8192;
   $sub101 = (0 - ($w$0))|0;
   $or100$fl$0 = $cmp97 ? $or100 : $fl$0$lcssa;
   $sub101$w$0 = $cmp97 ? $sub101 : $w$0;
   $30 = $storemerge191;$fl$1 = $or100$fl$0;$l10n$3 = $l10n$2;$w$1 = $sub101$w$0;
  } else {
   $call104 = (_getint($s)|0);
   $cmp105 = ($call104|0)<(0);
   if ($cmp105) {
    $retval$0 = -1;
    break;
   }
   $$pre247 = HEAP32[$s>>2]|0;
   $30 = $$pre247;$fl$1 = $fl$0$lcssa;$l10n$3 = $l10n$1;$w$1 = $call104;
  }
  $29 = HEAP8[$30>>0]|0;
  $cmp111 = ($29<<24>>24)==(46);
  do {
   if ($cmp111) {
    $arrayidx114 = ((($30)) + 1|0);
    $31 = HEAP8[$arrayidx114>>0]|0;
    $cmp116 = ($31<<24>>24)==(42);
    if (!($cmp116)) {
     $incdec$ptr159 = ((($30)) + 1|0);
     HEAP32[$s>>2] = $incdec$ptr159;
     $call160 = (_getint($s)|0);
     $$pre248$pre = HEAP32[$s>>2]|0;
     $$pre248 = $$pre248$pre;$p$0 = $call160;
     break;
    }
    $arrayidx119 = ((($30)) + 2|0);
    $32 = HEAP8[$arrayidx119>>0]|0;
    $conv120 = $32 << 24 >> 24;
    $isdigittmp187 = (($conv120) + -48)|0;
    $isdigit188 = ($isdigittmp187>>>0)<(10);
    if ($isdigit188) {
     $arrayidx124 = ((($30)) + 3|0);
     $33 = HEAP8[$arrayidx124>>0]|0;
     $cmp126 = ($33<<24>>24)==(36);
     if ($cmp126) {
      $arrayidx132 = (($nl_type) + ($isdigittmp187<<2)|0);
      HEAP32[$arrayidx132>>2] = 10;
      $34 = HEAP8[$arrayidx119>>0]|0;
      $conv134 = $34 << 24 >> 24;
      $sub135 = (($conv134) + -48)|0;
      $i137 = (($nl_arg) + ($sub135<<3)|0);
      $35 = $i137;
      $36 = $35;
      $37 = HEAP32[$36>>2]|0;
      $38 = (($35) + 4)|0;
      $39 = $38;
      $40 = HEAP32[$39>>2]|0;
      $add$ptr139 = ((($30)) + 4|0);
      HEAP32[$s>>2] = $add$ptr139;
      $$pre248 = $add$ptr139;$p$0 = $37;
      break;
     }
    }
    $tobool141 = ($l10n$3|0)==(0);
    if (!($tobool141)) {
     $retval$0 = -1;
     break L1;
    }
    if ($tobool25) {
     $arglist_current2 = HEAP32[$ap>>2]|0;
     $41 = $arglist_current2;
     $42 = ((0) + 4|0);
     $expanded11 = $42;
     $expanded10 = (($expanded11) - 1)|0;
     $43 = (($41) + ($expanded10))|0;
     $44 = ((0) + 4|0);
     $expanded15 = $44;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $45 = $43 & $expanded13;
     $46 = $45;
     $47 = HEAP32[$46>>2]|0;
     $arglist_next3 = ((($46)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next3;
     $cond149 = $47;
    } else {
     $cond149 = 0;
    }
    HEAP32[$s>>2] = $arrayidx119;
    $$pre248 = $arrayidx119;$p$0 = $cond149;
   } else {
    $$pre248 = $30;$p$0 = -1;
   }
  } while(0);
  $49 = $$pre248;$st$0 = 0;
  while(1) {
   $48 = HEAP8[$49>>0]|0;
   $conv164 = $48 << 24 >> 24;
   $sub165 = (($conv164) + -65)|0;
   $cmp166 = ($sub165>>>0)>(57);
   if ($cmp166) {
    $retval$0 = -1;
    break L1;
   }
   $incdec$ptr171 = ((($49)) + 1|0);
   HEAP32[$s>>2] = $incdec$ptr171;
   $50 = HEAP8[$49>>0]|0;
   $conv172 = $50 << 24 >> 24;
   $sub173 = (($conv172) + -65)|0;
   $arrayidx174 = ((2938 + (($st$0*58)|0)|0) + ($sub173)|0);
   $51 = HEAP8[$arrayidx174>>0]|0;
   $conv175 = $51&255;
   $sub176 = (($conv175) + -1)|0;
   $cmp177 = ($sub176>>>0)<(8);
   if ($cmp177) {
    $49 = $incdec$ptr171;$st$0 = $conv175;
   } else {
    break;
   }
  }
  $tobool179 = ($51<<24>>24)==(0);
  if ($tobool179) {
   $retval$0 = -1;
   break;
  }
  $cmp182 = ($51<<24>>24)==(19);
  $cmp185 = ($argpos$0|0)>(-1);
  do {
   if ($cmp182) {
    if ($cmp185) {
     $retval$0 = -1;
     break L1;
    } else {
     label = 49;
    }
   } else {
    if ($cmp185) {
     $arrayidx193 = (($nl_type) + ($argpos$0<<2)|0);
     HEAP32[$arrayidx193>>2] = $conv175;
     $52 = (($nl_arg) + ($argpos$0<<3)|0);
     $53 = $52;
     $54 = $53;
     $55 = HEAP32[$54>>2]|0;
     $56 = (($53) + 4)|0;
     $57 = $56;
     $58 = HEAP32[$57>>2]|0;
     $59 = $arg;
     $60 = $59;
     HEAP32[$60>>2] = $55;
     $61 = (($59) + 4)|0;
     $62 = $61;
     HEAP32[$62>>2] = $58;
     label = 49;
     break;
    }
    if (!($tobool25)) {
     $retval$0 = 0;
     break L1;
    }
    _pop_arg($arg,$conv175,$ap);
   }
  } while(0);
  if ((label|0) == 49) {
   label = 0;
   if (!($tobool25)) {
    $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
    continue;
   }
  }
  $63 = HEAP8[$49>>0]|0;
  $conv208 = $63 << 24 >> 24;
  $tobool209 = ($st$0|0)!=(0);
  $and211 = $conv208 & 15;
  $cmp212 = ($and211|0)==(3);
  $or$cond192 = $tobool209 & $cmp212;
  $and215 = $conv208 & -33;
  $t$0 = $or$cond192 ? $and215 : $conv208;
  $and217 = $fl$1 & 8192;
  $tobool218 = ($and217|0)==(0);
  $and220 = $fl$1 & -65537;
  $fl$1$and220 = $tobool218 ? $fl$1 : $and220;
  L71: do {
   switch ($t$0|0) {
   case 110:  {
    $trunc = $st$0&255;
    switch ($trunc<<24>>24) {
    case 0:  {
     $70 = HEAP32[$arg>>2]|0;
     HEAP32[$70>>2] = $cnt$1;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    case 1:  {
     $71 = HEAP32[$arg>>2]|0;
     HEAP32[$71>>2] = $cnt$1;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    case 2:  {
     $72 = ($cnt$1|0)<(0);
     $73 = $72 << 31 >> 31;
     $74 = HEAP32[$arg>>2]|0;
     $75 = $74;
     $76 = $75;
     HEAP32[$76>>2] = $cnt$1;
     $77 = (($75) + 4)|0;
     $78 = $77;
     HEAP32[$78>>2] = $73;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    case 3:  {
     $conv230 = $cnt$1&65535;
     $79 = HEAP32[$arg>>2]|0;
     HEAP16[$79>>1] = $conv230;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    case 4:  {
     $conv233 = $cnt$1&255;
     $80 = HEAP32[$arg>>2]|0;
     HEAP8[$80>>0] = $conv233;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    case 6:  {
     $81 = HEAP32[$arg>>2]|0;
     HEAP32[$81>>2] = $cnt$1;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    case 7:  {
     $82 = ($cnt$1|0)<(0);
     $83 = $82 << 31 >> 31;
     $84 = HEAP32[$arg>>2]|0;
     $85 = $84;
     $86 = $85;
     HEAP32[$86>>2] = $cnt$1;
     $87 = (($85) + 4)|0;
     $88 = $87;
     HEAP32[$88>>2] = $83;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    default: {
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $cmp241 = ($p$0>>>0)>(8);
    $cond246 = $cmp241 ? $p$0 : 8;
    $or247 = $fl$1$and220 | 8;
    $fl$3 = $or247;$p$1 = $cond246;$t$1 = 120;
    label = 61;
    break;
   }
   case 88: case 120:  {
    $fl$3 = $fl$1$and220;$p$1 = $p$0;$t$1 = $t$0;
    label = 61;
    break;
   }
   case 111:  {
    $99 = $arg;
    $100 = $99;
    $101 = HEAP32[$100>>2]|0;
    $102 = (($99) + 4)|0;
    $103 = $102;
    $104 = HEAP32[$103>>2]|0;
    $105 = (_fmt_o($101,$104,$add$ptr206)|0);
    $and264 = $fl$1$and220 & 8;
    $tobool265 = ($and264|0)==(0);
    $sub$ptr$rhs$cast268 = $105;
    $sub$ptr$sub269 = (($sub$ptr$lhs$cast318) - ($sub$ptr$rhs$cast268))|0;
    $cmp271 = ($p$0|0)>($sub$ptr$sub269|0);
    $add270 = (($sub$ptr$sub269) + 1)|0;
    $106 = $tobool265 | $cmp271;
    $p$0$p$0$add270 = $106 ? $p$0 : $add270;
    $125 = $101;$127 = $104;$a$0 = $105;$fl$4 = $fl$1$and220;$p$2 = $p$0$p$0$add270;$pl$1 = 0;$prefix$1 = 3402;
    label = 67;
    break;
   }
   case 105: case 100:  {
    $107 = $arg;
    $108 = $107;
    $109 = HEAP32[$108>>2]|0;
    $110 = (($107) + 4)|0;
    $111 = $110;
    $112 = HEAP32[$111>>2]|0;
    $113 = ($112|0)<(0);
    if ($113) {
     $114 = (_i64Subtract(0,0,($109|0),($112|0))|0);
     $115 = tempRet0;
     $116 = $arg;
     $117 = $116;
     HEAP32[$117>>2] = $114;
     $118 = (($116) + 4)|0;
     $119 = $118;
     HEAP32[$119>>2] = $115;
     $121 = $114;$122 = $115;$pl$0 = 1;$prefix$0 = 3402;
     label = 66;
     break L71;
    } else {
     $and290 = $fl$1$and220 & 2048;
     $tobool291 = ($and290|0)==(0);
     $and295 = $fl$1$and220 & 1;
     $tobool296 = ($and295|0)==(0);
     $$ = $tobool296 ? 3402 : (3404);
     $$$ = $tobool291 ? $$ : (3403);
     $120 = $fl$1$and220 & 2049;
     $narrow = ($120|0)!=(0);
     $$194$ = $narrow&1;
     $121 = $109;$122 = $112;$pl$0 = $$194$;$prefix$0 = $$$;
     label = 66;
     break L71;
    }
    break;
   }
   case 117:  {
    $64 = $arg;
    $65 = $64;
    $66 = HEAP32[$65>>2]|0;
    $67 = (($64) + 4)|0;
    $68 = $67;
    $69 = HEAP32[$68>>2]|0;
    $121 = $66;$122 = $69;$pl$0 = 0;$prefix$0 = 3402;
    label = 66;
    break;
   }
   case 99:  {
    $129 = $arg;
    $130 = $129;
    $131 = HEAP32[$130>>2]|0;
    $132 = (($129) + 4)|0;
    $133 = $132;
    $134 = HEAP32[$133>>2]|0;
    $135 = $131&255;
    HEAP8[$add$ptr341>>0] = $135;
    $a$2 = $add$ptr341;$fl$6 = $and220;$p$5 = 1;$pl$2 = 0;$prefix$2 = 3402;$z$2 = $add$ptr206;
    break;
   }
   case 109:  {
    $call345 = (___errno_location()|0);
    $136 = HEAP32[$call345>>2]|0;
    $call346 = (_strerror($136)|0);
    $a$1 = $call346;
    label = 71;
    break;
   }
   case 115:  {
    $137 = HEAP32[$arg>>2]|0;
    $tobool350 = ($137|0)!=(0|0);
    $cond355 = $tobool350 ? $137 : 3412;
    $a$1 = $cond355;
    label = 71;
    break;
   }
   case 67:  {
    $138 = $arg;
    $139 = $138;
    $140 = HEAP32[$139>>2]|0;
    $141 = (($138) + 4)|0;
    $142 = $141;
    $143 = HEAP32[$142>>2]|0;
    HEAP32[$wc>>2] = $140;
    HEAP32[$arrayidx371>>2] = 0;
    HEAP32[$arg>>2] = $wc;
    $150 = $wc;$p$4253 = -1;
    label = 75;
    break;
   }
   case 83:  {
    $$pre249 = HEAP32[$arg>>2]|0;
    $cmp378227 = ($p$0|0)==(0);
    if ($cmp378227) {
     _pad_682($f,32,$w$1,0,$fl$1$and220);
     $i$0$lcssa256 = 0;
     label = 84;
    } else {
     $150 = $$pre249;$p$4253 = $p$0;
     label = 75;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $146 = +HEAPF64[$arg>>3];
    $call430 = (_fmt_fp($f,$146,$w$1,$p$0,$fl$1$and220,$t$0)|0);
    $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = $call430;$l10n$0 = $l10n$3;
    continue L1;
    break;
   }
   default: {
    $a$2 = $1;$fl$6 = $fl$1$and220;$p$5 = $p$0;$pl$2 = 0;$prefix$2 = 3402;$z$2 = $add$ptr206;
   }
   }
  } while(0);
  L95: do {
   if ((label|0) == 61) {
    label = 0;
    $89 = $arg;
    $90 = $89;
    $91 = HEAP32[$90>>2]|0;
    $92 = (($89) + 4)|0;
    $93 = $92;
    $94 = HEAP32[$93>>2]|0;
    $and250 = $t$1 & 32;
    $95 = (_fmt_x($91,$94,$add$ptr206,$and250)|0);
    $96 = ($91|0)==(0);
    $97 = ($94|0)==(0);
    $98 = $96 & $97;
    $and255 = $fl$3 & 8;
    $tobool256 = ($and255|0)==(0);
    $or$cond193 = $tobool256 | $98;
    $shr = $t$1 >> 4;
    $add$ptr258 = (3402 + ($shr)|0);
    $$add$ptr258 = $or$cond193 ? 3402 : $add$ptr258;
    $$197 = $or$cond193 ? 0 : 2;
    $125 = $91;$127 = $94;$a$0 = $95;$fl$4 = $fl$3;$p$2 = $p$1;$pl$1 = $$197;$prefix$1 = $$add$ptr258;
    label = 67;
   }
   else if ((label|0) == 66) {
    label = 0;
    $123 = (_fmt_u($121,$122,$add$ptr206)|0);
    $125 = $121;$127 = $122;$a$0 = $123;$fl$4 = $fl$1$and220;$p$2 = $p$0;$pl$1 = $pl$0;$prefix$1 = $prefix$0;
    label = 67;
   }
   else if ((label|0) == 71) {
    label = 0;
    $call357 = (_memchr($a$1,0,$p$0)|0);
    $tobool358 = ($call357|0)==(0|0);
    $sub$ptr$lhs$cast362 = $call357;
    $sub$ptr$rhs$cast363 = $a$1;
    $sub$ptr$sub364 = (($sub$ptr$lhs$cast362) - ($sub$ptr$rhs$cast363))|0;
    $add$ptr360 = (($a$1) + ($p$0)|0);
    $p$3 = $tobool358 ? $p$0 : $sub$ptr$sub364;
    $z$1 = $tobool358 ? $add$ptr360 : $call357;
    $a$2 = $a$1;$fl$6 = $and220;$p$5 = $p$3;$pl$2 = 0;$prefix$2 = 3402;$z$2 = $z$1;
   }
   else if ((label|0) == 75) {
    label = 0;
    $i$0229 = 0;$l$1228 = 0;$ws$0230 = $150;
    while(1) {
     $144 = HEAP32[$ws$0230>>2]|0;
     $tobool381 = ($144|0)==(0);
     if ($tobool381) {
      $i$0$lcssa = $i$0229;$l$2 = $l$1228;
      break;
     }
     $call385 = (_wctomb($mb,$144)|0);
     $cmp386 = ($call385|0)<(0);
     $sub390 = (($p$4253) - ($i$0229))|0;
     $cmp391 = ($call385>>>0)>($sub390>>>0);
     $or$cond195 = $cmp386 | $cmp391;
     if ($or$cond195) {
      $i$0$lcssa = $i$0229;$l$2 = $call385;
      break;
     }
     $incdec$ptr384 = ((($ws$0230)) + 4|0);
     $add396 = (($call385) + ($i$0229))|0;
     $cmp378 = ($p$4253>>>0)>($add396>>>0);
     if ($cmp378) {
      $i$0229 = $add396;$l$1228 = $call385;$ws$0230 = $incdec$ptr384;
     } else {
      $i$0$lcssa = $add396;$l$2 = $call385;
      break;
     }
    }
    $cmp398 = ($l$2|0)<(0);
    if ($cmp398) {
     $retval$0 = -1;
     break L1;
    }
    _pad_682($f,32,$w$1,$i$0$lcssa,$fl$1$and220);
    $cmp405237 = ($i$0$lcssa|0)==(0);
    if ($cmp405237) {
     $i$0$lcssa256 = 0;
     label = 84;
    } else {
     $i$1238 = 0;$ws$1239 = $150;
     while(1) {
      $145 = HEAP32[$ws$1239>>2]|0;
      $tobool408 = ($145|0)==(0);
      if ($tobool408) {
       $i$0$lcssa256 = $i$0$lcssa;
       label = 84;
       break L95;
      }
      $call412 = (_wctomb($mb,$145)|0);
      $add413 = (($call412) + ($i$1238))|0;
      $cmp414 = ($add413|0)>($i$0$lcssa|0);
      if ($cmp414) {
       $i$0$lcssa256 = $i$0$lcssa;
       label = 84;
       break L95;
      }
      $incdec$ptr411 = ((($ws$1239)) + 4|0);
      _out($f,$mb,$call412);
      $cmp405 = ($add413>>>0)<($i$0$lcssa>>>0);
      if ($cmp405) {
       $i$1238 = $add413;$ws$1239 = $incdec$ptr411;
      } else {
       $i$0$lcssa256 = $i$0$lcssa;
       label = 84;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 67) {
   label = 0;
   $cmp307 = ($p$2|0)>(-1);
   $and310 = $fl$4 & -65537;
   $and310$fl$4 = $cmp307 ? $and310 : $fl$4;
   $124 = ($125|0)!=(0);
   $126 = ($127|0)!=(0);
   $128 = $124 | $126;
   $tobool315 = ($p$2|0)!=(0);
   $or$cond = $tobool315 | $128;
   $sub$ptr$rhs$cast319 = $a$0;
   $sub$ptr$sub320 = (($sub$ptr$lhs$cast318) - ($sub$ptr$rhs$cast319))|0;
   $lnot = $128 ^ 1;
   $lnot$ext = $lnot&1;
   $add323 = (($lnot$ext) + ($sub$ptr$sub320))|0;
   $cmp324 = ($p$2|0)>($add323|0);
   $p$2$add323 = $cmp324 ? $p$2 : $add323;
   $p$2$add323$p$2 = $or$cond ? $p$2$add323 : $p$2;
   $a$0$add$ptr206 = $or$cond ? $a$0 : $add$ptr206;
   $a$2 = $a$0$add$ptr206;$fl$6 = $and310$fl$4;$p$5 = $p$2$add323$p$2;$pl$2 = $pl$1;$prefix$2 = $prefix$1;$z$2 = $add$ptr206;
  }
  else if ((label|0) == 84) {
   label = 0;
   $xor = $fl$1$and220 ^ 8192;
   _pad_682($f,32,$w$1,$i$0$lcssa256,$xor);
   $cmp422 = ($w$1|0)>($i$0$lcssa256|0);
   $cond427 = $cmp422 ? $w$1 : $i$0$lcssa256;
   $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = $cond427;$l10n$0 = $l10n$3;
   continue;
  }
  $sub$ptr$lhs$cast432 = $z$2;
  $sub$ptr$rhs$cast433 = $a$2;
  $sub$ptr$sub434 = (($sub$ptr$lhs$cast432) - ($sub$ptr$rhs$cast433))|0;
  $cmp435 = ($p$5|0)<($sub$ptr$sub434|0);
  $sub$ptr$sub434$p$5 = $cmp435 ? $sub$ptr$sub434 : $p$5;
  $add442 = (($sub$ptr$sub434$p$5) + ($pl$2))|0;
  $cmp443 = ($w$1|0)<($add442|0);
  $w$2 = $cmp443 ? $add442 : $w$1;
  _pad_682($f,32,$w$2,$add442,$fl$6);
  _out($f,$prefix$2,$pl$2);
  $xor450 = $fl$6 ^ 65536;
  _pad_682($f,48,$w$2,$add442,$xor450);
  _pad_682($f,48,$sub$ptr$sub434$p$5,$sub$ptr$sub434,0);
  _out($f,$a$2,$sub$ptr$sub434);
  $xor458 = $fl$6 ^ 8192;
  _pad_682($f,32,$w$2,$add442,$xor458);
  $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = $w$2;$l10n$0 = $l10n$3;
 }
 L114: do {
  if ((label|0) == 87) {
   $tobool460 = ($f|0)==(0|0);
   if ($tobool460) {
    $tobool463 = ($l10n$0|0)==(0);
    if ($tobool463) {
     $retval$0 = 0;
    } else {
     $i$2210 = 1;
     while(1) {
      $arrayidx470 = (($nl_type) + ($i$2210<<2)|0);
      $147 = HEAP32[$arrayidx470>>2]|0;
      $tobool471 = ($147|0)==(0);
      if ($tobool471) {
       $i$3207 = $i$2210;
       break;
      }
      $add$ptr474 = (($nl_arg) + ($i$2210<<3)|0);
      _pop_arg($add$ptr474,$147,$ap);
      $inc = (($i$2210) + 1)|0;
      $cmp467 = ($inc|0)<(10);
      if ($cmp467) {
       $i$2210 = $inc;
      } else {
       $retval$0 = 1;
       break L114;
      }
     }
     while(1) {
      $arrayidx482 = (($nl_type) + ($i$3207<<2)|0);
      $148 = HEAP32[$arrayidx482>>2]|0;
      $lnot484 = ($148|0)==(0);
      $inc489 = (($i$3207) + 1)|0;
      if (!($lnot484)) {
       $retval$0 = -1;
       break L114;
      }
      $cmp479 = ($inc489|0)<(10);
      if ($cmp479) {
       $i$3207 = $inc489;
      } else {
       $retval$0 = 1;
       break;
      }
     }
    }
   } else {
    $retval$0 = $cnt$1;
   }
  }
 } while(0);
 STACKTOP = sp;return ($retval$0|0);
}
function ___lockfile($f) {
 $f = $f|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function ___unlockfile($f) {
 $f = $f|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _out($f,$s,$l) {
 $f = $f|0;
 $s = $s|0;
 $l = $l|0;
 var $0 = 0, $and = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$f>>2]|0;
 $and = $0 & 32;
 $tobool = ($and|0)==(0);
 if ($tobool) {
  (___fwritex($s,$l,$f)|0);
 }
 return;
}
function _getint($s) {
 $s = $s|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $add = 0, $conv = 0, $conv4 = 0, $i$0$lcssa = 0, $i$07 = 0, $incdec$ptr = 0, $isdigit = 0, $isdigit6 = 0, $isdigittmp = 0, $isdigittmp5 = 0, $isdigittmp8 = 0, $mul = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$s>>2]|0;
 $1 = HEAP8[$0>>0]|0;
 $conv4 = $1 << 24 >> 24;
 $isdigittmp5 = (($conv4) + -48)|0;
 $isdigit6 = ($isdigittmp5>>>0)<(10);
 if ($isdigit6) {
  $2 = $0;$i$07 = 0;$isdigittmp8 = $isdigittmp5;
  while(1) {
   $mul = ($i$07*10)|0;
   $add = (($isdigittmp8) + ($mul))|0;
   $incdec$ptr = ((($2)) + 1|0);
   HEAP32[$s>>2] = $incdec$ptr;
   $3 = HEAP8[$incdec$ptr>>0]|0;
   $conv = $3 << 24 >> 24;
   $isdigittmp = (($conv) + -48)|0;
   $isdigit = ($isdigittmp>>>0)<(10);
   if ($isdigit) {
    $2 = $incdec$ptr;$i$07 = $add;$isdigittmp8 = $isdigittmp;
   } else {
    $i$0$lcssa = $add;
    break;
   }
  }
 } else {
  $i$0$lcssa = 0;
 }
 return ($i$0$lcssa|0);
}
function _pop_arg($arg,$type,$ap) {
 $arg = $arg|0;
 $type = $type|0;
 $ap = $ap|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0.0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0;
 var $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0;
 var $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0;
 var $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0;
 var $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0;
 var $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0, $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0;
 var $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $cmp = 0, $conv16 = 0, $conv22$mask = 0, $conv28 = 0, $conv34$mask = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($type>>>0)>(20);
 L1: do {
  if (!($cmp)) {
   do {
    switch ($type|0) {
    case 9:  {
     $arglist_current = HEAP32[$ap>>2]|0;
     $0 = $arglist_current;
     $1 = ((0) + 4|0);
     $expanded28 = $1;
     $expanded = (($expanded28) - 1)|0;
     $2 = (($0) + ($expanded))|0;
     $3 = ((0) + 4|0);
     $expanded32 = $3;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $4 = $2 & $expanded30;
     $5 = $4;
     $6 = HEAP32[$5>>2]|0;
     $arglist_next = ((($5)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next;
     HEAP32[$arg>>2] = $6;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$ap>>2]|0;
     $7 = $arglist_current2;
     $8 = ((0) + 4|0);
     $expanded35 = $8;
     $expanded34 = (($expanded35) - 1)|0;
     $9 = (($7) + ($expanded34))|0;
     $10 = ((0) + 4|0);
     $expanded39 = $10;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $11 = $9 & $expanded37;
     $12 = $11;
     $13 = HEAP32[$12>>2]|0;
     $arglist_next3 = ((($12)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next3;
     $14 = ($13|0)<(0);
     $15 = $14 << 31 >> 31;
     $16 = $arg;
     $17 = $16;
     HEAP32[$17>>2] = $13;
     $18 = (($16) + 4)|0;
     $19 = $18;
     HEAP32[$19>>2] = $15;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$ap>>2]|0;
     $20 = $arglist_current5;
     $21 = ((0) + 4|0);
     $expanded42 = $21;
     $expanded41 = (($expanded42) - 1)|0;
     $22 = (($20) + ($expanded41))|0;
     $23 = ((0) + 4|0);
     $expanded46 = $23;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $24 = $22 & $expanded44;
     $25 = $24;
     $26 = HEAP32[$25>>2]|0;
     $arglist_next6 = ((($25)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next6;
     $27 = $arg;
     $28 = $27;
     HEAP32[$28>>2] = $26;
     $29 = (($27) + 4)|0;
     $30 = $29;
     HEAP32[$30>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$ap>>2]|0;
     $31 = $arglist_current8;
     $32 = ((0) + 8|0);
     $expanded49 = $32;
     $expanded48 = (($expanded49) - 1)|0;
     $33 = (($31) + ($expanded48))|0;
     $34 = ((0) + 8|0);
     $expanded53 = $34;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $35 = $33 & $expanded51;
     $36 = $35;
     $37 = $36;
     $38 = $37;
     $39 = HEAP32[$38>>2]|0;
     $40 = (($37) + 4)|0;
     $41 = $40;
     $42 = HEAP32[$41>>2]|0;
     $arglist_next9 = ((($36)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next9;
     $43 = $arg;
     $44 = $43;
     HEAP32[$44>>2] = $39;
     $45 = (($43) + 4)|0;
     $46 = $45;
     HEAP32[$46>>2] = $42;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$ap>>2]|0;
     $47 = $arglist_current11;
     $48 = ((0) + 4|0);
     $expanded56 = $48;
     $expanded55 = (($expanded56) - 1)|0;
     $49 = (($47) + ($expanded55))|0;
     $50 = ((0) + 4|0);
     $expanded60 = $50;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $51 = $49 & $expanded58;
     $52 = $51;
     $53 = HEAP32[$52>>2]|0;
     $arglist_next12 = ((($52)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next12;
     $conv16 = $53&65535;
     $54 = $conv16 << 16 >> 16;
     $55 = ($54|0)<(0);
     $56 = $55 << 31 >> 31;
     $57 = $arg;
     $58 = $57;
     HEAP32[$58>>2] = $54;
     $59 = (($57) + 4)|0;
     $60 = $59;
     HEAP32[$60>>2] = $56;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$ap>>2]|0;
     $61 = $arglist_current14;
     $62 = ((0) + 4|0);
     $expanded63 = $62;
     $expanded62 = (($expanded63) - 1)|0;
     $63 = (($61) + ($expanded62))|0;
     $64 = ((0) + 4|0);
     $expanded67 = $64;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $65 = $63 & $expanded65;
     $66 = $65;
     $67 = HEAP32[$66>>2]|0;
     $arglist_next15 = ((($66)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next15;
     $conv22$mask = $67 & 65535;
     $68 = $arg;
     $69 = $68;
     HEAP32[$69>>2] = $conv22$mask;
     $70 = (($68) + 4)|0;
     $71 = $70;
     HEAP32[$71>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$ap>>2]|0;
     $72 = $arglist_current17;
     $73 = ((0) + 4|0);
     $expanded70 = $73;
     $expanded69 = (($expanded70) - 1)|0;
     $74 = (($72) + ($expanded69))|0;
     $75 = ((0) + 4|0);
     $expanded74 = $75;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $76 = $74 & $expanded72;
     $77 = $76;
     $78 = HEAP32[$77>>2]|0;
     $arglist_next18 = ((($77)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next18;
     $conv28 = $78&255;
     $79 = $conv28 << 24 >> 24;
     $80 = ($79|0)<(0);
     $81 = $80 << 31 >> 31;
     $82 = $arg;
     $83 = $82;
     HEAP32[$83>>2] = $79;
     $84 = (($82) + 4)|0;
     $85 = $84;
     HEAP32[$85>>2] = $81;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$ap>>2]|0;
     $86 = $arglist_current20;
     $87 = ((0) + 4|0);
     $expanded77 = $87;
     $expanded76 = (($expanded77) - 1)|0;
     $88 = (($86) + ($expanded76))|0;
     $89 = ((0) + 4|0);
     $expanded81 = $89;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $90 = $88 & $expanded79;
     $91 = $90;
     $92 = HEAP32[$91>>2]|0;
     $arglist_next21 = ((($91)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next21;
     $conv34$mask = $92 & 255;
     $93 = $arg;
     $94 = $93;
     HEAP32[$94>>2] = $conv34$mask;
     $95 = (($93) + 4)|0;
     $96 = $95;
     HEAP32[$96>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$ap>>2]|0;
     $97 = $arglist_current23;
     $98 = ((0) + 8|0);
     $expanded84 = $98;
     $expanded83 = (($expanded84) - 1)|0;
     $99 = (($97) + ($expanded83))|0;
     $100 = ((0) + 8|0);
     $expanded88 = $100;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $101 = $99 & $expanded86;
     $102 = $101;
     $103 = +HEAPF64[$102>>3];
     $arglist_next24 = ((($102)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next24;
     HEAPF64[$arg>>3] = $103;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$ap>>2]|0;
     $104 = $arglist_current26;
     $105 = ((0) + 8|0);
     $expanded91 = $105;
     $expanded90 = (($expanded91) - 1)|0;
     $106 = (($104) + ($expanded90))|0;
     $107 = ((0) + 8|0);
     $expanded95 = $107;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $108 = $106 & $expanded93;
     $109 = $108;
     $110 = +HEAPF64[$109>>3];
     $arglist_next27 = ((($109)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next27;
     HEAPF64[$arg>>3] = $110;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_x($0,$1,$s,$lower) {
 $0 = $0|0;
 $1 = $1|0;
 $s = $s|0;
 $lower = $lower|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $arrayidx = 0, $conv1 = 0, $conv4 = 0, $idxprom = 0, $incdec$ptr = 0, $or = 0, $s$addr$0$lcssa = 0, $s$addr$06 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0);
 $3 = ($1|0)==(0);
 $4 = $2 & $3;
 if ($4) {
  $s$addr$0$lcssa = $s;
 } else {
  $5 = $0;$7 = $1;$s$addr$06 = $s;
  while(1) {
   $idxprom = $5 & 15;
   $arrayidx = (3454 + ($idxprom)|0);
   $6 = HEAP8[$arrayidx>>0]|0;
   $conv4 = $6&255;
   $or = $conv4 | $lower;
   $conv1 = $or&255;
   $incdec$ptr = ((($s$addr$06)) + -1|0);
   HEAP8[$incdec$ptr>>0] = $conv1;
   $8 = (_bitshift64Lshr(($5|0),($7|0),4)|0);
   $9 = tempRet0;
   $10 = ($8|0)==(0);
   $11 = ($9|0)==(0);
   $12 = $10 & $11;
   if ($12) {
    $s$addr$0$lcssa = $incdec$ptr;
    break;
   } else {
    $5 = $8;$7 = $9;$s$addr$06 = $incdec$ptr;
   }
  }
 }
 return ($s$addr$0$lcssa|0);
}
function _fmt_o($0,$1,$s) {
 $0 = $0|0;
 $1 = $1|0;
 $s = $s|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $conv = 0, $incdec$ptr = 0, $s$addr$0$lcssa = 0, $s$addr$06 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0);
 $3 = ($1|0)==(0);
 $4 = $2 & $3;
 if ($4) {
  $s$addr$0$lcssa = $s;
 } else {
  $6 = $0;$8 = $1;$s$addr$06 = $s;
  while(1) {
   $5 = $6&255;
   $7 = $5 & 7;
   $conv = $7 | 48;
   $incdec$ptr = ((($s$addr$06)) + -1|0);
   HEAP8[$incdec$ptr>>0] = $conv;
   $9 = (_bitshift64Lshr(($6|0),($8|0),3)|0);
   $10 = tempRet0;
   $11 = ($9|0)==(0);
   $12 = ($10|0)==(0);
   $13 = $11 & $12;
   if ($13) {
    $s$addr$0$lcssa = $incdec$ptr;
    break;
   } else {
    $6 = $9;$8 = $10;$s$addr$06 = $incdec$ptr;
   }
  }
 }
 return ($s$addr$0$lcssa|0);
}
function _fmt_u($0,$1,$s) {
 $0 = $0|0;
 $1 = $1|0;
 $s = $s|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add5 = 0, $conv = 0;
 var $conv6 = 0, $div9 = 0, $incdec$ptr = 0, $incdec$ptr7 = 0, $rem4 = 0, $s$addr$0$lcssa = 0, $s$addr$013 = 0, $s$addr$1$lcssa = 0, $s$addr$19 = 0, $tobool8 = 0, $x$addr$0$lcssa$off0 = 0, $y$010 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1>>>0)>(0);
 $3 = ($0>>>0)>(4294967295);
 $4 = ($1|0)==(0);
 $5 = $4 & $3;
 $6 = $2 | $5;
 if ($6) {
  $7 = $0;$8 = $1;$s$addr$013 = $s;
  while(1) {
   $9 = (___uremdi3(($7|0),($8|0),10,0)|0);
   $10 = tempRet0;
   $11 = $9&255;
   $conv = $11 | 48;
   $incdec$ptr = ((($s$addr$013)) + -1|0);
   HEAP8[$incdec$ptr>>0] = $conv;
   $12 = (___udivdi3(($7|0),($8|0),10,0)|0);
   $13 = tempRet0;
   $14 = ($8>>>0)>(9);
   $15 = ($7>>>0)>(4294967295);
   $16 = ($8|0)==(9);
   $17 = $16 & $15;
   $18 = $14 | $17;
   if ($18) {
    $7 = $12;$8 = $13;$s$addr$013 = $incdec$ptr;
   } else {
    break;
   }
  }
  $s$addr$0$lcssa = $incdec$ptr;$x$addr$0$lcssa$off0 = $12;
 } else {
  $s$addr$0$lcssa = $s;$x$addr$0$lcssa$off0 = $0;
 }
 $tobool8 = ($x$addr$0$lcssa$off0|0)==(0);
 if ($tobool8) {
  $s$addr$1$lcssa = $s$addr$0$lcssa;
 } else {
  $s$addr$19 = $s$addr$0$lcssa;$y$010 = $x$addr$0$lcssa$off0;
  while(1) {
   $rem4 = (($y$010>>>0) % 10)&-1;
   $add5 = $rem4 | 48;
   $conv6 = $add5&255;
   $incdec$ptr7 = ((($s$addr$19)) + -1|0);
   HEAP8[$incdec$ptr7>>0] = $conv6;
   $div9 = (($y$010>>>0) / 10)&-1;
   $19 = ($y$010>>>0)<(10);
   if ($19) {
    $s$addr$1$lcssa = $incdec$ptr7;
    break;
   } else {
    $s$addr$19 = $incdec$ptr7;$y$010 = $div9;
   }
  }
 }
 return ($s$addr$1$lcssa|0);
}
function _strerror($e) {
 $e = $e|0;
 var $0 = 0, $call = 0, $call1 = 0, $locale = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (___pthread_self_104()|0);
 $locale = ((($call)) + 188|0);
 $0 = HEAP32[$locale>>2]|0;
 $call1 = (___strerror_l($e,$0)|0);
 return ($call1|0);
}
function _memchr($src,$c,$n) {
 $src = $src|0;
 $c = $c|0;
 $n = $n|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $and = 0, $and15 = 0, $and16 = 0, $and39 = 0, $cmp = 0, $cmp11 = 0, $cmp1132 = 0, $cmp28 = 0, $cmp8 = 0, $cond = 0, $conv1 = 0, $dec = 0;
 var $dec34 = 0, $incdec$ptr = 0, $incdec$ptr21 = 0, $incdec$ptr33 = 0, $lnot = 0, $mul = 0, $n$addr$0$lcssa = 0, $n$addr$0$lcssa52 = 0, $n$addr$043 = 0, $n$addr$1$lcssa = 0, $n$addr$133 = 0, $n$addr$227 = 0, $n$addr$3 = 0, $neg = 0, $or$cond = 0, $or$cond42 = 0, $s$0$lcssa = 0, $s$0$lcssa53 = 0, $s$044 = 0, $s$128 = 0;
 var $s$2 = 0, $sub = 0, $sub22 = 0, $tobool = 0, $tobool2 = 0, $tobool2$lcssa = 0, $tobool241 = 0, $tobool25 = 0, $tobool2526 = 0, $tobool36 = 0, $tobool40 = 0, $w$0$lcssa = 0, $w$034 = 0, $xor = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $conv1 = $c & 255;
 $0 = $src;
 $and39 = $0 & 3;
 $tobool40 = ($and39|0)!=(0);
 $tobool241 = ($n|0)!=(0);
 $or$cond42 = $tobool241 & $tobool40;
 L1: do {
  if ($or$cond42) {
   $1 = $c&255;
   $n$addr$043 = $n;$s$044 = $src;
   while(1) {
    $2 = HEAP8[$s$044>>0]|0;
    $cmp = ($2<<24>>24)==($1<<24>>24);
    if ($cmp) {
     $n$addr$0$lcssa52 = $n$addr$043;$s$0$lcssa53 = $s$044;
     label = 6;
     break L1;
    }
    $incdec$ptr = ((($s$044)) + 1|0);
    $dec = (($n$addr$043) + -1)|0;
    $3 = $incdec$ptr;
    $and = $3 & 3;
    $tobool = ($and|0)!=(0);
    $tobool2 = ($dec|0)!=(0);
    $or$cond = $tobool2 & $tobool;
    if ($or$cond) {
     $n$addr$043 = $dec;$s$044 = $incdec$ptr;
    } else {
     $n$addr$0$lcssa = $dec;$s$0$lcssa = $incdec$ptr;$tobool2$lcssa = $tobool2;
     label = 5;
     break;
    }
   }
  } else {
   $n$addr$0$lcssa = $n;$s$0$lcssa = $src;$tobool2$lcssa = $tobool241;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($tobool2$lcssa) {
   $n$addr$0$lcssa52 = $n$addr$0$lcssa;$s$0$lcssa53 = $s$0$lcssa;
   label = 6;
  } else {
   $n$addr$3 = 0;$s$2 = $s$0$lcssa;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $4 = HEAP8[$s$0$lcssa53>>0]|0;
   $5 = $c&255;
   $cmp8 = ($4<<24>>24)==($5<<24>>24);
   if ($cmp8) {
    $n$addr$3 = $n$addr$0$lcssa52;$s$2 = $s$0$lcssa53;
   } else {
    $mul = Math_imul($conv1, 16843009)|0;
    $cmp1132 = ($n$addr$0$lcssa52>>>0)>(3);
    L11: do {
     if ($cmp1132) {
      $n$addr$133 = $n$addr$0$lcssa52;$w$034 = $s$0$lcssa53;
      while(1) {
       $6 = HEAP32[$w$034>>2]|0;
       $xor = $6 ^ $mul;
       $sub = (($xor) + -16843009)|0;
       $neg = $xor & -2139062144;
       $and15 = $neg ^ -2139062144;
       $and16 = $and15 & $sub;
       $lnot = ($and16|0)==(0);
       if (!($lnot)) {
        break;
       }
       $incdec$ptr21 = ((($w$034)) + 4|0);
       $sub22 = (($n$addr$133) + -4)|0;
       $cmp11 = ($sub22>>>0)>(3);
       if ($cmp11) {
        $n$addr$133 = $sub22;$w$034 = $incdec$ptr21;
       } else {
        $n$addr$1$lcssa = $sub22;$w$0$lcssa = $incdec$ptr21;
        label = 11;
        break L11;
       }
      }
      $n$addr$227 = $n$addr$133;$s$128 = $w$034;
     } else {
      $n$addr$1$lcssa = $n$addr$0$lcssa52;$w$0$lcssa = $s$0$lcssa53;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $tobool2526 = ($n$addr$1$lcssa|0)==(0);
     if ($tobool2526) {
      $n$addr$3 = 0;$s$2 = $w$0$lcssa;
      break;
     } else {
      $n$addr$227 = $n$addr$1$lcssa;$s$128 = $w$0$lcssa;
     }
    }
    while(1) {
     $7 = HEAP8[$s$128>>0]|0;
     $cmp28 = ($7<<24>>24)==($5<<24>>24);
     if ($cmp28) {
      $n$addr$3 = $n$addr$227;$s$2 = $s$128;
      break L8;
     }
     $incdec$ptr33 = ((($s$128)) + 1|0);
     $dec34 = (($n$addr$227) + -1)|0;
     $tobool25 = ($dec34|0)==(0);
     if ($tobool25) {
      $n$addr$3 = 0;$s$2 = $incdec$ptr33;
      break;
     } else {
      $n$addr$227 = $dec34;$s$128 = $incdec$ptr33;
     }
    }
   }
  }
 } while(0);
 $tobool36 = ($n$addr$3|0)!=(0);
 $cond = $tobool36 ? $s$2 : 0;
 return ($cond|0);
}
function _pad_682($f,$c,$w,$l,$fl) {
 $f = $f|0;
 $c = $c|0;
 $w = $w|0;
 $l = $l|0;
 $fl = $fl|0;
 var $0 = 0, $1 = 0, $2 = 0, $and = 0, $cmp = 0, $cmp3 = 0, $cmp38 = 0, $cond = 0, $l$addr$0$lcssa = 0, $l$addr$09 = 0, $or$cond = 0, $pad = 0, $sub = 0, $sub6 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $pad = sp;
 $and = $fl & 73728;
 $tobool = ($and|0)==(0);
 $cmp = ($w|0)>($l|0);
 $or$cond = $cmp & $tobool;
 if ($or$cond) {
  $sub = (($w) - ($l))|0;
  $0 = ($sub>>>0)<(256);
  $cond = $0 ? $sub : 256;
  _memset(($pad|0),($c|0),($cond|0))|0;
  $cmp38 = ($sub>>>0)>(255);
  if ($cmp38) {
   $1 = (($w) - ($l))|0;
   $l$addr$09 = $sub;
   while(1) {
    _out($f,$pad,256);
    $sub6 = (($l$addr$09) + -256)|0;
    $cmp3 = ($sub6>>>0)>(255);
    if ($cmp3) {
     $l$addr$09 = $sub6;
    } else {
     break;
    }
   }
   $2 = $1 & 255;
   $l$addr$0$lcssa = $2;
  } else {
   $l$addr$0$lcssa = $sub;
  }
  _out($f,$pad,$l$addr$0$lcssa);
 }
 STACKTOP = sp;return;
}
function _wctomb($s,$wc) {
 $s = $s|0;
 $wc = $wc|0;
 var $call = 0, $retval$0 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($s|0)==(0|0);
 if ($tobool) {
  $retval$0 = 0;
 } else {
  $call = (_wcrtomb($s,$wc,0)|0);
  $retval$0 = $call;
 }
 return ($retval$0|0);
}
function _fmt_fp($f,$y,$w,$p,$fl,$t) {
 $f = $f|0;
 $y = +$y;
 $w = $w|0;
 $p = $p|0;
 $fl = $fl|0;
 $t = $t|0;
 var $$ = 0, $$$ = 0, $$$405 = 0.0, $$394$ = 0, $$397 = 0.0, $$405 = 0.0, $$p = 0, $$p$inc468 = 0, $$pr = 0, $$pr407 = 0, $$pre = 0, $$pre487 = 0, $$sub514 = 0, $$sub562 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0;
 var $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0;
 var $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0;
 var $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0;
 var $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $8 = 0, $9 = 0, $a$1$lcssa = 0, $a$1476 = 0, $a$2$ph = 0, $a$3$lcssa = 0, $a$3466 = 0, $a$5$lcssa = 0, $a$5448 = 0, $a$6 = 0, $a$8 = 0;
 var $a$9$ph = 0, $add = 0, $add$ptr213 = 0, $add$ptr311 = 0, $add$ptr311$z$4 = 0, $add$ptr354 = 0, $add$ptr358 = 0, $add$ptr373 = 0, $add$ptr442 = 0, $add$ptr442$z$3 = 0, $add$ptr65 = 0, $add$ptr671 = 0, $add$ptr742 = 0, $add$ptr756 = 0, $add113 = 0, $add150 = 0, $add150$pn = 0, $add165 = 0, $add273 = 0, $add275 = 0;
 var $add284 = 0, $add313 = 0, $add355 = 0, $add410 = 0.0, $add414 = 0, $add477$neg = 0, $add561 = 0, $add608 = 0, $add612 = 0, $add620 = 0, $add653 = 0, $add653$sink406 = 0, $add67 = 0, $add737 = 0, $add810 = 0, $add87 = 0.0, $add90 = 0.0, $and = 0, $and12 = 0, $and134 = 0;
 var $and282 = 0, $and36 = 0, $and379 = 0, $and45 = 0, $and483 = 0, $and610$pre$phiZ2D = 0, $and62 = 0, $arraydecay208$add$ptr213 = 0, $arrayidx = 0, $arrayidx117 = 0, $arrayidx251 = 0, $arrayidx453 = 0, $arrayidx489 = 0, $big = 0, $buf = 0, $call55 = 0.0, $carry$0471 = 0, $carry262$0462 = 0, $cmp103 = 0, $cmp127 = 0;
 var $cmp147 = 0, $cmp205 = 0, $cmp225 = 0, $cmp225474 = 0, $cmp235 = 0, $cmp235470 = 0, $cmp249 = 0, $cmp259 = 0, $cmp259464 = 0, $cmp277 = 0, $cmp277460 = 0, $cmp299 = 0, $cmp308 = 0, $cmp315 = 0, $cmp324 = 0, $cmp324456 = 0, $cmp333 = 0, $cmp338 = 0, $cmp350 = 0, $cmp363452 = 0;
 var $cmp374 = 0, $cmp38 = 0, $cmp385 = 0, $cmp390 = 0, $cmp403 = 0, $cmp411 = 0, $cmp416 = 0, $cmp416446 = 0, $cmp420 = 0, $cmp433 = 0, $cmp433442 = 0, $cmp443 = 0, $cmp450 = 0, $cmp450$lcssa = 0, $cmp470 = 0, $cmp473 = 0, $cmp495 = 0, $cmp495438 = 0, $cmp505 = 0, $cmp528 = 0;
 var $cmp577 = 0, $cmp59 = 0, $cmp614 = 0, $cmp617 = 0, $cmp623 = 0, $cmp636 = 0, $cmp636433 = 0, $cmp660 = 0, $cmp665 = 0, $cmp673 = 0, $cmp678 = 0, $cmp678419 = 0, $cmp68 = 0, $cmp686 = 0, $cmp707 = 0, $cmp707414 = 0, $cmp710 = 0, $cmp710415 = 0, $cmp722 = 0, $cmp722411 = 0;
 var $cmp745 = 0, $cmp748 = 0, $cmp748427 = 0, $cmp760 = 0, $cmp765 = 0, $cmp770 = 0, $cmp770423 = 0, $cmp777 = 0, $cmp790 = 0, $cmp818 = 0, $cmp82 = 0, $cmp94 = 0, $cond = 0, $cond100 = 0, $cond233 = 0, $cond271 = 0, $cond304 = 0, $cond43 = 0, $cond629 = 0, $cond732 = 0;
 var $cond800 = 0, $conv111 = 0, $conv114 = 0, $conv116 = 0, $conv118393 = 0, $conv121 = 0, $conv123 = 0.0, $conv216 = 0, $conv218 = 0.0, $conv644 = 0, $conv646 = 0, $d$0 = 0, $d$0469 = 0, $d$0472 = 0, $d$1461 = 0, $d$4 = 0, $d$5422 = 0, $d$6416 = 0, $d$7428 = 0, $dec = 0;
 var $dec476 = 0, $dec481 = 0, $dec78 = 0, $div274 = 0, $div356 = 0, $div378 = 0, $div384 = 0, $e$0458 = 0, $e$1 = 0, $e$2444 = 0, $e$4 = 0, $e$5$ph = 0, $e2 = 0, $ebuf0 = 0, $estr$0 = 0, $estr$1$lcssa = 0, $estr$1434 = 0, $estr$2 = 0, $exitcond = 0, $i$0457 = 0;
 var $i$1$lcssa = 0, $i$1453 = 0, $i$2443 = 0, $i$3439 = 0, $inc = 0, $inc425 = 0, $inc438 = 0, $inc468 = 0, $inc500 = 0, $incdec$ptr106 = 0, $incdec$ptr112 = 0, $incdec$ptr115 = 0, $incdec$ptr122 = 0, $incdec$ptr137 = 0, $incdec$ptr217 = 0, $incdec$ptr246 = 0, $incdec$ptr288 = 0, $incdec$ptr292 = 0, $incdec$ptr292$a$3 = 0, $incdec$ptr292$a$3492 = 0;
 var $incdec$ptr292$a$3494 = 0, $incdec$ptr292491 = 0, $incdec$ptr296 = 0, $incdec$ptr419 = 0, $incdec$ptr419$sink$lcssa = 0, $incdec$ptr419$sink447 = 0, $incdec$ptr423 = 0, $incdec$ptr639 = 0, $incdec$ptr645 = 0, $incdec$ptr647 = 0, $incdec$ptr681 = 0, $incdec$ptr689 = 0, $incdec$ptr698 = 0, $incdec$ptr725 = 0, $incdec$ptr734 = 0, $incdec$ptr763 = 0, $incdec$ptr773 = 0, $incdec$ptr776 = 0, $incdec$ptr808 = 0, $j$0 = 0;
 var $j$0451 = 0, $j$0454 = 0, $j$1440 = 0, $j$2 = 0, $l$0 = 0, $l$1 = 0, $land$ext$neg = 0, $lnot = 0, $lnot455 = 0, $lor$ext = 0, $mul = 0.0, $mul125 = 0.0, $mul202 = 0.0, $mul220 = 0.0, $mul286 = 0, $mul322 = 0, $mul328 = 0, $mul335 = 0, $mul349 = 0, $mul367 = 0;
 var $mul406 = 0.0, $mul406$$397 = 0.0, $mul407 = 0.0, $mul407$$$405 = 0.0, $mul431 = 0, $mul437 = 0, $mul499 = 0, $mul513 = 0, $mul80 = 0.0, $narrow = 0, $not$tobool341 = 0, $notlhs = 0, $notrhs = 0, $or = 0, $or$cond = 0, $or$cond1$not = 0, $or$cond2 = 0, $or$cond395 = 0, $or$cond396 = 0, $or$cond398 = 0;
 var $or$cond402 = 0, $or120 = 0, $or504 = 0, $or613 = 0, $p$addr$2 = 0, $p$addr$2$$sub514399 = 0, $p$addr$2$$sub562400 = 0, $p$addr$3 = 0, $p$addr$4$lcssa = 0, $p$addr$4417 = 0, $p$addr$5$lcssa = 0, $p$addr$5429 = 0, $pl$0 = 0, $prefix$0 = 0, $prefix$0$add$ptr65 = 0, $r$0$a$9 = 0, $re$1410 = 0, $rem360 = 0, $rem370 = 0, $rem494 = 0;
 var $rem494437 = 0, $round$0409 = 0.0, $round377$1 = 0.0, $s$0 = 0, $s$1 = 0, $s35$0 = 0, $s668$0420 = 0, $s668$1 = 0, $s715$0$lcssa = 0, $s715$0412 = 0, $s753$0 = 0, $s753$1424 = 0, $s753$2 = 0, $scevgep483 = 0, $scevgep483484 = 0, $shl280 = 0, $shr283 = 0, $shr285 = 0, $small$1 = 0.0, $sub = 0.0;
 var $sub$ptr$div = 0, $sub$ptr$div321 = 0, $sub$ptr$div347 = 0, $sub$ptr$div430 = 0, $sub$ptr$div511 = 0, $sub$ptr$lhs$cast = 0, $sub$ptr$lhs$cast143 = 0, $sub$ptr$lhs$cast151 = 0, $sub$ptr$lhs$cast305 = 0, $sub$ptr$lhs$cast318 = 0, $sub$ptr$lhs$cast344 = 0, $sub$ptr$lhs$cast508 = 0, $sub$ptr$lhs$cast633 = 0, $sub$ptr$lhs$cast694 = 0, $sub$ptr$lhs$cast787 = 0, $sub$ptr$lhs$cast811 = 0, $sub$ptr$rhs$cast = 0, $sub$ptr$rhs$cast152 = 0, $sub$ptr$rhs$cast306 = 0, $sub$ptr$rhs$cast319 = 0;
 var $sub$ptr$rhs$cast428 = 0, $sub$ptr$rhs$cast634 = 0, $sub$ptr$rhs$cast634431 = 0, $sub$ptr$rhs$cast649 = 0, $sub$ptr$rhs$cast695 = 0, $sub$ptr$rhs$cast788 = 0, $sub$ptr$rhs$cast812 = 0, $sub$ptr$sub = 0, $sub$ptr$sub145 = 0, $sub$ptr$sub153 = 0, $sub$ptr$sub307 = 0, $sub$ptr$sub320 = 0, $sub$ptr$sub346 = 0, $sub$ptr$sub429 = 0, $sub$ptr$sub510 = 0, $sub$ptr$sub635 = 0, $sub$ptr$sub635432 = 0, $sub$ptr$sub650 = 0, $sub$ptr$sub650$pn = 0, $sub$ptr$sub696 = 0;
 var $sub$ptr$sub789 = 0, $sub$ptr$sub813 = 0, $sub124 = 0.0, $sub146 = 0, $sub181 = 0, $sub203 = 0, $sub219 = 0.0, $sub256 = 0, $sub264 = 0, $sub281 = 0, $sub336 = 0, $sub343 = 0, $sub357 = 0, $sub409 = 0, $sub478 = 0, $sub480 = 0, $sub514 = 0, $sub562 = 0, $sub626$le = 0, $sub735 = 0;
 var $sub74 = 0, $sub806 = 0, $sub85 = 0.0, $sub86 = 0.0, $sub88 = 0.0, $sub91 = 0.0, $sub97 = 0, $t$addr$0 = 0, $t$addr$1 = 0, $tobool13 = 0, $tobool135 = 0, $tobool139 = 0, $tobool140 = 0, $tobool222 = 0, $tobool244 = 0, $tobool290 = 0, $tobool290490 = 0, $tobool294 = 0, $tobool341 = 0, $tobool37 = 0;
 var $tobool371 = 0, $tobool380 = 0, $tobool400 = 0, $tobool484 = 0, $tobool490 = 0, $tobool56 = 0, $tobool63 = 0, $tobool76 = 0, $tobool76488 = 0, $tobool781 = 0, $tobool79 = 0, $tobool9 = 0, $w$add653 = 0, $xor = 0, $xor167 = 0, $xor186 = 0, $xor655 = 0, $xor816 = 0, $y$addr$0 = 0.0, $y$addr$1 = 0.0;
 var $y$addr$2 = 0.0, $y$addr$3 = 0.0, $y$addr$4 = 0.0, $z$0 = 0, $z$1$lcssa = 0, $z$1475 = 0, $z$2 = 0, $z$3$lcssa = 0, $z$3465 = 0, $z$4 = 0, $z$7 = 0, $z$7$add$ptr742 = 0, $z$7$ph = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 560|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(560|0);
 $big = sp + 8|0;
 $e2 = sp;
 $buf = sp + 524|0;
 $sub$ptr$rhs$cast = $buf;
 $ebuf0 = sp + 512|0;
 HEAP32[$e2>>2] = 0;
 $arrayidx = ((($ebuf0)) + 12|0);
 (___DOUBLE_BITS_683($y)|0);
 $0 = tempRet0;
 $1 = ($0|0)<(0);
 if ($1) {
  $sub = -$y;
  $pl$0 = 1;$prefix$0 = 3419;$y$addr$0 = $sub;
 } else {
  $and = $fl & 2048;
  $tobool9 = ($and|0)==(0);
  $and12 = $fl & 1;
  $tobool13 = ($and12|0)==(0);
  $$ = $tobool13 ? (3420) : (3425);
  $$$ = $tobool9 ? $$ : (3422);
  $2 = $fl & 2049;
  $narrow = ($2|0)!=(0);
  $$394$ = $narrow&1;
  $pl$0 = $$394$;$prefix$0 = $$$;$y$addr$0 = $y;
 }
 (___DOUBLE_BITS_683($y$addr$0)|0);
 $3 = tempRet0;
 $4 = $3 & 2146435072;
 $5 = ($4>>>0)<(2146435072);
 $6 = (0)<(0);
 $7 = ($4|0)==(2146435072);
 $8 = $7 & $6;
 $9 = $5 | $8;
 do {
  if ($9) {
   $call55 = (+_frexpl($y$addr$0,$e2));
   $mul = $call55 * 2.0;
   $tobool56 = $mul != 0.0;
   if ($tobool56) {
    $10 = HEAP32[$e2>>2]|0;
    $dec = (($10) + -1)|0;
    HEAP32[$e2>>2] = $dec;
   }
   $or = $t | 32;
   $cmp59 = ($or|0)==(97);
   if ($cmp59) {
    $and62 = $t & 32;
    $tobool63 = ($and62|0)==(0);
    $add$ptr65 = ((($prefix$0)) + 9|0);
    $prefix$0$add$ptr65 = $tobool63 ? $prefix$0 : $add$ptr65;
    $add67 = $pl$0 | 2;
    $11 = ($p>>>0)>(11);
    $sub74 = (12 - ($p))|0;
    $tobool76488 = ($sub74|0)==(0);
    $tobool76 = $11 | $tobool76488;
    do {
     if ($tobool76) {
      $y$addr$1 = $mul;
     } else {
      $re$1410 = $sub74;$round$0409 = 8.0;
      while(1) {
       $dec78 = (($re$1410) + -1)|0;
       $mul80 = $round$0409 * 16.0;
       $tobool79 = ($dec78|0)==(0);
       if ($tobool79) {
        break;
       } else {
        $re$1410 = $dec78;$round$0409 = $mul80;
       }
      }
      $12 = HEAP8[$prefix$0$add$ptr65>>0]|0;
      $cmp82 = ($12<<24>>24)==(45);
      if ($cmp82) {
       $sub85 = -$mul;
       $sub86 = $sub85 - $mul80;
       $add87 = $mul80 + $sub86;
       $sub88 = -$add87;
       $y$addr$1 = $sub88;
       break;
      } else {
       $add90 = $mul + $mul80;
       $sub91 = $add90 - $mul80;
       $y$addr$1 = $sub91;
       break;
      }
     }
    } while(0);
    $13 = HEAP32[$e2>>2]|0;
    $cmp94 = ($13|0)<(0);
    $sub97 = (0 - ($13))|0;
    $cond100 = $cmp94 ? $sub97 : $13;
    $14 = ($cond100|0)<(0);
    $15 = $14 << 31 >> 31;
    $16 = (_fmt_u($cond100,$15,$arrayidx)|0);
    $cmp103 = ($16|0)==($arrayidx|0);
    if ($cmp103) {
     $incdec$ptr106 = ((($ebuf0)) + 11|0);
     HEAP8[$incdec$ptr106>>0] = 48;
     $estr$0 = $incdec$ptr106;
    } else {
     $estr$0 = $16;
    }
    $17 = $13 >> 31;
    $18 = $17 & 2;
    $19 = (($18) + 43)|0;
    $conv111 = $19&255;
    $incdec$ptr112 = ((($estr$0)) + -1|0);
    HEAP8[$incdec$ptr112>>0] = $conv111;
    $add113 = (($t) + 15)|0;
    $conv114 = $add113&255;
    $incdec$ptr115 = ((($estr$0)) + -2|0);
    HEAP8[$incdec$ptr115>>0] = $conv114;
    $notrhs = ($p|0)<(1);
    $and134 = $fl & 8;
    $tobool135 = ($and134|0)==(0);
    $s$0 = $buf;$y$addr$2 = $y$addr$1;
    while(1) {
     $conv116 = (~~(($y$addr$2)));
     $arrayidx117 = (3454 + ($conv116)|0);
     $20 = HEAP8[$arrayidx117>>0]|0;
     $conv118393 = $20&255;
     $or120 = $conv118393 | $and62;
     $conv121 = $or120&255;
     $incdec$ptr122 = ((($s$0)) + 1|0);
     HEAP8[$s$0>>0] = $conv121;
     $conv123 = (+($conv116|0));
     $sub124 = $y$addr$2 - $conv123;
     $mul125 = $sub124 * 16.0;
     $sub$ptr$lhs$cast = $incdec$ptr122;
     $sub$ptr$sub = (($sub$ptr$lhs$cast) - ($sub$ptr$rhs$cast))|0;
     $cmp127 = ($sub$ptr$sub|0)==(1);
     if ($cmp127) {
      $notlhs = $mul125 == 0.0;
      $or$cond1$not = $notrhs & $notlhs;
      $or$cond = $tobool135 & $or$cond1$not;
      if ($or$cond) {
       $s$1 = $incdec$ptr122;
      } else {
       $incdec$ptr137 = ((($s$0)) + 2|0);
       HEAP8[$incdec$ptr122>>0] = 46;
       $s$1 = $incdec$ptr137;
      }
     } else {
      $s$1 = $incdec$ptr122;
     }
     $tobool139 = $mul125 != 0.0;
     if ($tobool139) {
      $s$0 = $s$1;$y$addr$2 = $mul125;
     } else {
      break;
     }
    }
    $tobool140 = ($p|0)!=(0);
    $sub$ptr$rhs$cast152 = $incdec$ptr115;
    $sub$ptr$lhs$cast151 = $arrayidx;
    $sub$ptr$lhs$cast143 = $s$1;
    $sub$ptr$sub145 = (($sub$ptr$lhs$cast143) - ($sub$ptr$rhs$cast))|0;
    $sub$ptr$sub153 = (($sub$ptr$lhs$cast151) - ($sub$ptr$rhs$cast152))|0;
    $sub146 = (($sub$ptr$sub145) + -2)|0;
    $cmp147 = ($sub146|0)<($p|0);
    $or$cond395 = $tobool140 & $cmp147;
    $add150 = (($p) + 2)|0;
    $add150$pn = $or$cond395 ? $add150 : $sub$ptr$sub145;
    $l$0 = (($sub$ptr$sub153) + ($add67))|0;
    $add165 = (($l$0) + ($add150$pn))|0;
    _pad_682($f,32,$w,$add165,$fl);
    _out($f,$prefix$0$add$ptr65,$add67);
    $xor167 = $fl ^ 65536;
    _pad_682($f,48,$w,$add165,$xor167);
    _out($f,$buf,$sub$ptr$sub145);
    $sub181 = (($add150$pn) - ($sub$ptr$sub145))|0;
    _pad_682($f,48,$sub181,0,0);
    _out($f,$incdec$ptr115,$sub$ptr$sub153);
    $xor186 = $fl ^ 8192;
    _pad_682($f,32,$w,$add165,$xor186);
    $add653$sink406 = $add165;
    break;
   }
   $cmp68 = ($p|0)<(0);
   $$p = $cmp68 ? 6 : $p;
   if ($tobool56) {
    $mul202 = $mul * 268435456.0;
    $21 = HEAP32[$e2>>2]|0;
    $sub203 = (($21) + -28)|0;
    HEAP32[$e2>>2] = $sub203;
    $$pr = $sub203;$y$addr$3 = $mul202;
   } else {
    $$pre = HEAP32[$e2>>2]|0;
    $$pr = $$pre;$y$addr$3 = $mul;
   }
   $cmp205 = ($$pr|0)<(0);
   $add$ptr213 = ((($big)) + 288|0);
   $arraydecay208$add$ptr213 = $cmp205 ? $big : $add$ptr213;
   $y$addr$4 = $y$addr$3;$z$0 = $arraydecay208$add$ptr213;
   while(1) {
    $conv216 = (~~(($y$addr$4))>>>0);
    HEAP32[$z$0>>2] = $conv216;
    $incdec$ptr217 = ((($z$0)) + 4|0);
    $conv218 = (+($conv216>>>0));
    $sub219 = $y$addr$4 - $conv218;
    $mul220 = $sub219 * 1.0E+9;
    $tobool222 = $mul220 != 0.0;
    if ($tobool222) {
     $y$addr$4 = $mul220;$z$0 = $incdec$ptr217;
    } else {
     break;
    }
   }
   $cmp225474 = ($$pr|0)>(0);
   if ($cmp225474) {
    $23 = $$pr;$a$1476 = $arraydecay208$add$ptr213;$z$1475 = $incdec$ptr217;
    while(1) {
     $22 = ($23|0)<(29);
     $cond233 = $22 ? $23 : 29;
     $d$0469 = ((($z$1475)) + -4|0);
     $cmp235470 = ($d$0469>>>0)<($a$1476>>>0);
     if ($cmp235470) {
      $a$2$ph = $a$1476;
     } else {
      $carry$0471 = 0;$d$0472 = $d$0469;
      while(1) {
       $24 = HEAP32[$d$0472>>2]|0;
       $25 = (_bitshift64Shl(($24|0),0,($cond233|0))|0);
       $26 = tempRet0;
       $27 = (_i64Add(($25|0),($26|0),($carry$0471|0),0)|0);
       $28 = tempRet0;
       $29 = (___uremdi3(($27|0),($28|0),1000000000,0)|0);
       $30 = tempRet0;
       HEAP32[$d$0472>>2] = $29;
       $31 = (___udivdi3(($27|0),($28|0),1000000000,0)|0);
       $32 = tempRet0;
       $d$0 = ((($d$0472)) + -4|0);
       $cmp235 = ($d$0>>>0)<($a$1476>>>0);
       if ($cmp235) {
        break;
       } else {
        $carry$0471 = $31;$d$0472 = $d$0;
       }
      }
      $tobool244 = ($31|0)==(0);
      if ($tobool244) {
       $a$2$ph = $a$1476;
      } else {
       $incdec$ptr246 = ((($a$1476)) + -4|0);
       HEAP32[$incdec$ptr246>>2] = $31;
       $a$2$ph = $incdec$ptr246;
      }
     }
     $z$2 = $z$1475;
     while(1) {
      $cmp249 = ($z$2>>>0)>($a$2$ph>>>0);
      if (!($cmp249)) {
       break;
      }
      $arrayidx251 = ((($z$2)) + -4|0);
      $33 = HEAP32[$arrayidx251>>2]|0;
      $lnot = ($33|0)==(0);
      if ($lnot) {
       $z$2 = $arrayidx251;
      } else {
       break;
      }
     }
     $34 = HEAP32[$e2>>2]|0;
     $sub256 = (($34) - ($cond233))|0;
     HEAP32[$e2>>2] = $sub256;
     $cmp225 = ($sub256|0)>(0);
     if ($cmp225) {
      $23 = $sub256;$a$1476 = $a$2$ph;$z$1475 = $z$2;
     } else {
      $$pr407 = $sub256;$a$1$lcssa = $a$2$ph;$z$1$lcssa = $z$2;
      break;
     }
    }
   } else {
    $$pr407 = $$pr;$a$1$lcssa = $arraydecay208$add$ptr213;$z$1$lcssa = $incdec$ptr217;
   }
   $cmp259464 = ($$pr407|0)<(0);
   if ($cmp259464) {
    $add273 = (($$p) + 25)|0;
    $div274 = (($add273|0) / 9)&-1;
    $add275 = (($div274) + 1)|0;
    $cmp299 = ($or|0)==(102);
    $35 = $$pr407;$a$3466 = $a$1$lcssa;$z$3465 = $z$1$lcssa;
    while(1) {
     $sub264 = (0 - ($35))|0;
     $36 = ($sub264|0)<(9);
     $cond271 = $36 ? $sub264 : 9;
     $cmp277460 = ($a$3466>>>0)<($z$3465>>>0);
     if ($cmp277460) {
      $shl280 = 1 << $cond271;
      $sub281 = (($shl280) + -1)|0;
      $shr285 = 1000000000 >>> $cond271;
      $carry262$0462 = 0;$d$1461 = $a$3466;
      while(1) {
       $38 = HEAP32[$d$1461>>2]|0;
       $and282 = $38 & $sub281;
       $shr283 = $38 >>> $cond271;
       $add284 = (($shr283) + ($carry262$0462))|0;
       HEAP32[$d$1461>>2] = $add284;
       $mul286 = Math_imul($and282, $shr285)|0;
       $incdec$ptr288 = ((($d$1461)) + 4|0);
       $cmp277 = ($incdec$ptr288>>>0)<($z$3465>>>0);
       if ($cmp277) {
        $carry262$0462 = $mul286;$d$1461 = $incdec$ptr288;
       } else {
        break;
       }
      }
      $39 = HEAP32[$a$3466>>2]|0;
      $tobool290 = ($39|0)==(0);
      $incdec$ptr292 = ((($a$3466)) + 4|0);
      $incdec$ptr292$a$3 = $tobool290 ? $incdec$ptr292 : $a$3466;
      $tobool294 = ($mul286|0)==(0);
      if ($tobool294) {
       $incdec$ptr292$a$3494 = $incdec$ptr292$a$3;$z$4 = $z$3465;
      } else {
       $incdec$ptr296 = ((($z$3465)) + 4|0);
       HEAP32[$z$3465>>2] = $mul286;
       $incdec$ptr292$a$3494 = $incdec$ptr292$a$3;$z$4 = $incdec$ptr296;
      }
     } else {
      $37 = HEAP32[$a$3466>>2]|0;
      $tobool290490 = ($37|0)==(0);
      $incdec$ptr292491 = ((($a$3466)) + 4|0);
      $incdec$ptr292$a$3492 = $tobool290490 ? $incdec$ptr292491 : $a$3466;
      $incdec$ptr292$a$3494 = $incdec$ptr292$a$3492;$z$4 = $z$3465;
     }
     $cond304 = $cmp299 ? $arraydecay208$add$ptr213 : $incdec$ptr292$a$3494;
     $sub$ptr$lhs$cast305 = $z$4;
     $sub$ptr$rhs$cast306 = $cond304;
     $sub$ptr$sub307 = (($sub$ptr$lhs$cast305) - ($sub$ptr$rhs$cast306))|0;
     $sub$ptr$div = $sub$ptr$sub307 >> 2;
     $cmp308 = ($sub$ptr$div|0)>($add275|0);
     $add$ptr311 = (($cond304) + ($add275<<2)|0);
     $add$ptr311$z$4 = $cmp308 ? $add$ptr311 : $z$4;
     $40 = HEAP32[$e2>>2]|0;
     $add313 = (($40) + ($cond271))|0;
     HEAP32[$e2>>2] = $add313;
     $cmp259 = ($add313|0)<(0);
     if ($cmp259) {
      $35 = $add313;$a$3466 = $incdec$ptr292$a$3494;$z$3465 = $add$ptr311$z$4;
     } else {
      $a$3$lcssa = $incdec$ptr292$a$3494;$z$3$lcssa = $add$ptr311$z$4;
      break;
     }
    }
   } else {
    $a$3$lcssa = $a$1$lcssa;$z$3$lcssa = $z$1$lcssa;
   }
   $cmp315 = ($a$3$lcssa>>>0)<($z$3$lcssa>>>0);
   $sub$ptr$lhs$cast318 = $arraydecay208$add$ptr213;
   if ($cmp315) {
    $sub$ptr$rhs$cast319 = $a$3$lcssa;
    $sub$ptr$sub320 = (($sub$ptr$lhs$cast318) - ($sub$ptr$rhs$cast319))|0;
    $sub$ptr$div321 = $sub$ptr$sub320 >> 2;
    $mul322 = ($sub$ptr$div321*9)|0;
    $41 = HEAP32[$a$3$lcssa>>2]|0;
    $cmp324456 = ($41>>>0)<(10);
    if ($cmp324456) {
     $e$1 = $mul322;
    } else {
     $e$0458 = $mul322;$i$0457 = 10;
     while(1) {
      $mul328 = ($i$0457*10)|0;
      $inc = (($e$0458) + 1)|0;
      $cmp324 = ($41>>>0)<($mul328>>>0);
      if ($cmp324) {
       $e$1 = $inc;
       break;
      } else {
       $e$0458 = $inc;$i$0457 = $mul328;
      }
     }
    }
   } else {
    $e$1 = 0;
   }
   $cmp333 = ($or|0)!=(102);
   $mul335 = $cmp333 ? $e$1 : 0;
   $sub336 = (($$p) - ($mul335))|0;
   $cmp338 = ($or|0)==(103);
   $tobool341 = ($$p|0)!=(0);
   $42 = $tobool341 & $cmp338;
   $land$ext$neg = $42 << 31 >> 31;
   $sub343 = (($sub336) + ($land$ext$neg))|0;
   $sub$ptr$lhs$cast344 = $z$3$lcssa;
   $sub$ptr$sub346 = (($sub$ptr$lhs$cast344) - ($sub$ptr$lhs$cast318))|0;
   $sub$ptr$div347 = $sub$ptr$sub346 >> 2;
   $43 = ($sub$ptr$div347*9)|0;
   $mul349 = (($43) + -9)|0;
   $cmp350 = ($sub343|0)<($mul349|0);
   if ($cmp350) {
    $add$ptr354 = ((($arraydecay208$add$ptr213)) + 4|0);
    $add355 = (($sub343) + 9216)|0;
    $div356 = (($add355|0) / 9)&-1;
    $sub357 = (($div356) + -1024)|0;
    $add$ptr358 = (($add$ptr354) + ($sub357<<2)|0);
    $rem360 = (($add355|0) % 9)&-1;
    $j$0451 = (($rem360) + 1)|0;
    $cmp363452 = ($j$0451|0)<(9);
    if ($cmp363452) {
     $i$1453 = 10;$j$0454 = $j$0451;
     while(1) {
      $mul367 = ($i$1453*10)|0;
      $j$0 = (($j$0454) + 1)|0;
      $exitcond = ($j$0|0)==(9);
      if ($exitcond) {
       $i$1$lcssa = $mul367;
       break;
      } else {
       $i$1453 = $mul367;$j$0454 = $j$0;
      }
     }
    } else {
     $i$1$lcssa = 10;
    }
    $44 = HEAP32[$add$ptr358>>2]|0;
    $rem370 = (($44>>>0) % ($i$1$lcssa>>>0))&-1;
    $tobool371 = ($rem370|0)==(0);
    $add$ptr373 = ((($add$ptr358)) + 4|0);
    $cmp374 = ($add$ptr373|0)==($z$3$lcssa|0);
    $or$cond396 = $cmp374 & $tobool371;
    if ($or$cond396) {
     $a$8 = $a$3$lcssa;$d$4 = $add$ptr358;$e$4 = $e$1;
    } else {
     $div378 = (($44>>>0) / ($i$1$lcssa>>>0))&-1;
     $and379 = $div378 & 1;
     $tobool380 = ($and379|0)==(0);
     $$397 = $tobool380 ? 9007199254740992.0 : 9007199254740994.0;
     $div384 = (($i$1$lcssa|0) / 2)&-1;
     $cmp385 = ($rem370>>>0)<($div384>>>0);
     $cmp390 = ($rem370|0)==($div384|0);
     $or$cond398 = $cmp374 & $cmp390;
     $$405 = $or$cond398 ? 1.0 : 1.5;
     $$$405 = $cmp385 ? 0.5 : $$405;
     $tobool400 = ($pl$0|0)==(0);
     if ($tobool400) {
      $round377$1 = $$397;$small$1 = $$$405;
     } else {
      $45 = HEAP8[$prefix$0>>0]|0;
      $cmp403 = ($45<<24>>24)==(45);
      $mul406 = -$$397;
      $mul407 = -$$$405;
      $mul406$$397 = $cmp403 ? $mul406 : $$397;
      $mul407$$$405 = $cmp403 ? $mul407 : $$$405;
      $round377$1 = $mul406$$397;$small$1 = $mul407$$$405;
     }
     $sub409 = (($44) - ($rem370))|0;
     HEAP32[$add$ptr358>>2] = $sub409;
     $add410 = $round377$1 + $small$1;
     $cmp411 = $add410 != $round377$1;
     if ($cmp411) {
      $add414 = (($sub409) + ($i$1$lcssa))|0;
      HEAP32[$add$ptr358>>2] = $add414;
      $cmp416446 = ($add414>>>0)>(999999999);
      if ($cmp416446) {
       $a$5448 = $a$3$lcssa;$incdec$ptr419$sink447 = $add$ptr358;
       while(1) {
        $incdec$ptr419 = ((($incdec$ptr419$sink447)) + -4|0);
        HEAP32[$incdec$ptr419$sink447>>2] = 0;
        $cmp420 = ($incdec$ptr419>>>0)<($a$5448>>>0);
        if ($cmp420) {
         $incdec$ptr423 = ((($a$5448)) + -4|0);
         HEAP32[$incdec$ptr423>>2] = 0;
         $a$6 = $incdec$ptr423;
        } else {
         $a$6 = $a$5448;
        }
        $46 = HEAP32[$incdec$ptr419>>2]|0;
        $inc425 = (($46) + 1)|0;
        HEAP32[$incdec$ptr419>>2] = $inc425;
        $cmp416 = ($inc425>>>0)>(999999999);
        if ($cmp416) {
         $a$5448 = $a$6;$incdec$ptr419$sink447 = $incdec$ptr419;
        } else {
         $a$5$lcssa = $a$6;$incdec$ptr419$sink$lcssa = $incdec$ptr419;
         break;
        }
       }
      } else {
       $a$5$lcssa = $a$3$lcssa;$incdec$ptr419$sink$lcssa = $add$ptr358;
      }
      $sub$ptr$rhs$cast428 = $a$5$lcssa;
      $sub$ptr$sub429 = (($sub$ptr$lhs$cast318) - ($sub$ptr$rhs$cast428))|0;
      $sub$ptr$div430 = $sub$ptr$sub429 >> 2;
      $mul431 = ($sub$ptr$div430*9)|0;
      $47 = HEAP32[$a$5$lcssa>>2]|0;
      $cmp433442 = ($47>>>0)<(10);
      if ($cmp433442) {
       $a$8 = $a$5$lcssa;$d$4 = $incdec$ptr419$sink$lcssa;$e$4 = $mul431;
      } else {
       $e$2444 = $mul431;$i$2443 = 10;
       while(1) {
        $mul437 = ($i$2443*10)|0;
        $inc438 = (($e$2444) + 1)|0;
        $cmp433 = ($47>>>0)<($mul437>>>0);
        if ($cmp433) {
         $a$8 = $a$5$lcssa;$d$4 = $incdec$ptr419$sink$lcssa;$e$4 = $inc438;
         break;
        } else {
         $e$2444 = $inc438;$i$2443 = $mul437;
        }
       }
      }
     } else {
      $a$8 = $a$3$lcssa;$d$4 = $add$ptr358;$e$4 = $e$1;
     }
    }
    $add$ptr442 = ((($d$4)) + 4|0);
    $cmp443 = ($z$3$lcssa>>>0)>($add$ptr442>>>0);
    $add$ptr442$z$3 = $cmp443 ? $add$ptr442 : $z$3$lcssa;
    $a$9$ph = $a$8;$e$5$ph = $e$4;$z$7$ph = $add$ptr442$z$3;
   } else {
    $a$9$ph = $a$3$lcssa;$e$5$ph = $e$1;$z$7$ph = $z$3$lcssa;
   }
   $z$7 = $z$7$ph;
   while(1) {
    $cmp450 = ($z$7>>>0)>($a$9$ph>>>0);
    if (!($cmp450)) {
     $cmp450$lcssa = 0;
     break;
    }
    $arrayidx453 = ((($z$7)) + -4|0);
    $48 = HEAP32[$arrayidx453>>2]|0;
    $lnot455 = ($48|0)==(0);
    if ($lnot455) {
     $z$7 = $arrayidx453;
    } else {
     $cmp450$lcssa = 1;
     break;
    }
   }
   $sub626$le = (0 - ($e$5$ph))|0;
   do {
    if ($cmp338) {
     $not$tobool341 = $tobool341 ^ 1;
     $inc468 = $not$tobool341&1;
     $$p$inc468 = (($inc468) + ($$p))|0;
     $cmp470 = ($$p$inc468|0)>($e$5$ph|0);
     $cmp473 = ($e$5$ph|0)>(-5);
     $or$cond2 = $cmp470 & $cmp473;
     if ($or$cond2) {
      $dec476 = (($t) + -1)|0;
      $add477$neg = (($$p$inc468) + -1)|0;
      $sub478 = (($add477$neg) - ($e$5$ph))|0;
      $p$addr$2 = $sub478;$t$addr$0 = $dec476;
     } else {
      $sub480 = (($t) + -2)|0;
      $dec481 = (($$p$inc468) + -1)|0;
      $p$addr$2 = $dec481;$t$addr$0 = $sub480;
     }
     $and483 = $fl & 8;
     $tobool484 = ($and483|0)==(0);
     if ($tobool484) {
      if ($cmp450$lcssa) {
       $arrayidx489 = ((($z$7)) + -4|0);
       $49 = HEAP32[$arrayidx489>>2]|0;
       $tobool490 = ($49|0)==(0);
       if ($tobool490) {
        $j$2 = 9;
       } else {
        $rem494437 = (($49>>>0) % 10)&-1;
        $cmp495438 = ($rem494437|0)==(0);
        if ($cmp495438) {
         $i$3439 = 10;$j$1440 = 0;
         while(1) {
          $mul499 = ($i$3439*10)|0;
          $inc500 = (($j$1440) + 1)|0;
          $rem494 = (($49>>>0) % ($mul499>>>0))&-1;
          $cmp495 = ($rem494|0)==(0);
          if ($cmp495) {
           $i$3439 = $mul499;$j$1440 = $inc500;
          } else {
           $j$2 = $inc500;
           break;
          }
         }
        } else {
         $j$2 = 0;
        }
       }
      } else {
       $j$2 = 9;
      }
      $or504 = $t$addr$0 | 32;
      $cmp505 = ($or504|0)==(102);
      $sub$ptr$lhs$cast508 = $z$7;
      $sub$ptr$sub510 = (($sub$ptr$lhs$cast508) - ($sub$ptr$lhs$cast318))|0;
      $sub$ptr$div511 = $sub$ptr$sub510 >> 2;
      $50 = ($sub$ptr$div511*9)|0;
      $mul513 = (($50) + -9)|0;
      if ($cmp505) {
       $sub514 = (($mul513) - ($j$2))|0;
       $51 = ($sub514|0)>(0);
       $$sub514 = $51 ? $sub514 : 0;
       $cmp528 = ($p$addr$2|0)<($$sub514|0);
       $p$addr$2$$sub514399 = $cmp528 ? $p$addr$2 : $$sub514;
       $and610$pre$phiZ2D = 0;$p$addr$3 = $p$addr$2$$sub514399;$t$addr$1 = $t$addr$0;
       break;
      } else {
       $add561 = (($mul513) + ($e$5$ph))|0;
       $sub562 = (($add561) - ($j$2))|0;
       $52 = ($sub562|0)>(0);
       $$sub562 = $52 ? $sub562 : 0;
       $cmp577 = ($p$addr$2|0)<($$sub562|0);
       $p$addr$2$$sub562400 = $cmp577 ? $p$addr$2 : $$sub562;
       $and610$pre$phiZ2D = 0;$p$addr$3 = $p$addr$2$$sub562400;$t$addr$1 = $t$addr$0;
       break;
      }
     } else {
      $and610$pre$phiZ2D = $and483;$p$addr$3 = $p$addr$2;$t$addr$1 = $t$addr$0;
     }
    } else {
     $$pre487 = $fl & 8;
     $and610$pre$phiZ2D = $$pre487;$p$addr$3 = $$p;$t$addr$1 = $t;
    }
   } while(0);
   $53 = $p$addr$3 | $and610$pre$phiZ2D;
   $54 = ($53|0)!=(0);
   $lor$ext = $54&1;
   $or613 = $t$addr$1 | 32;
   $cmp614 = ($or613|0)==(102);
   if ($cmp614) {
    $cmp617 = ($e$5$ph|0)>(0);
    $add620 = $cmp617 ? $e$5$ph : 0;
    $estr$2 = 0;$sub$ptr$sub650$pn = $add620;
   } else {
    $cmp623 = ($e$5$ph|0)<(0);
    $cond629 = $cmp623 ? $sub626$le : $e$5$ph;
    $55 = ($cond629|0)<(0);
    $56 = $55 << 31 >> 31;
    $57 = (_fmt_u($cond629,$56,$arrayidx)|0);
    $sub$ptr$lhs$cast633 = $arrayidx;
    $sub$ptr$rhs$cast634431 = $57;
    $sub$ptr$sub635432 = (($sub$ptr$lhs$cast633) - ($sub$ptr$rhs$cast634431))|0;
    $cmp636433 = ($sub$ptr$sub635432|0)<(2);
    if ($cmp636433) {
     $estr$1434 = $57;
     while(1) {
      $incdec$ptr639 = ((($estr$1434)) + -1|0);
      HEAP8[$incdec$ptr639>>0] = 48;
      $sub$ptr$rhs$cast634 = $incdec$ptr639;
      $sub$ptr$sub635 = (($sub$ptr$lhs$cast633) - ($sub$ptr$rhs$cast634))|0;
      $cmp636 = ($sub$ptr$sub635|0)<(2);
      if ($cmp636) {
       $estr$1434 = $incdec$ptr639;
      } else {
       $estr$1$lcssa = $incdec$ptr639;
       break;
      }
     }
    } else {
     $estr$1$lcssa = $57;
    }
    $58 = $e$5$ph >> 31;
    $59 = $58 & 2;
    $60 = (($59) + 43)|0;
    $conv644 = $60&255;
    $incdec$ptr645 = ((($estr$1$lcssa)) + -1|0);
    HEAP8[$incdec$ptr645>>0] = $conv644;
    $conv646 = $t$addr$1&255;
    $incdec$ptr647 = ((($estr$1$lcssa)) + -2|0);
    HEAP8[$incdec$ptr647>>0] = $conv646;
    $sub$ptr$rhs$cast649 = $incdec$ptr647;
    $sub$ptr$sub650 = (($sub$ptr$lhs$cast633) - ($sub$ptr$rhs$cast649))|0;
    $estr$2 = $incdec$ptr647;$sub$ptr$sub650$pn = $sub$ptr$sub650;
   }
   $add608 = (($pl$0) + 1)|0;
   $add612 = (($add608) + ($p$addr$3))|0;
   $l$1 = (($add612) + ($lor$ext))|0;
   $add653 = (($l$1) + ($sub$ptr$sub650$pn))|0;
   _pad_682($f,32,$w,$add653,$fl);
   _out($f,$prefix$0,$pl$0);
   $xor655 = $fl ^ 65536;
   _pad_682($f,48,$w,$add653,$xor655);
   if ($cmp614) {
    $cmp660 = ($a$9$ph>>>0)>($arraydecay208$add$ptr213>>>0);
    $r$0$a$9 = $cmp660 ? $arraydecay208$add$ptr213 : $a$9$ph;
    $add$ptr671 = ((($buf)) + 9|0);
    $sub$ptr$lhs$cast694 = $add$ptr671;
    $incdec$ptr689 = ((($buf)) + 8|0);
    $d$5422 = $r$0$a$9;
    while(1) {
     $61 = HEAP32[$d$5422>>2]|0;
     $62 = (_fmt_u($61,0,$add$ptr671)|0);
     $cmp673 = ($d$5422|0)==($r$0$a$9|0);
     if ($cmp673) {
      $cmp686 = ($62|0)==($add$ptr671|0);
      if ($cmp686) {
       HEAP8[$incdec$ptr689>>0] = 48;
       $s668$1 = $incdec$ptr689;
      } else {
       $s668$1 = $62;
      }
     } else {
      $cmp678419 = ($62>>>0)>($buf>>>0);
      if ($cmp678419) {
       $63 = $62;
       $64 = (($63) - ($sub$ptr$rhs$cast))|0;
       _memset(($buf|0),48,($64|0))|0;
       $s668$0420 = $62;
       while(1) {
        $incdec$ptr681 = ((($s668$0420)) + -1|0);
        $cmp678 = ($incdec$ptr681>>>0)>($buf>>>0);
        if ($cmp678) {
         $s668$0420 = $incdec$ptr681;
        } else {
         $s668$1 = $incdec$ptr681;
         break;
        }
       }
      } else {
       $s668$1 = $62;
      }
     }
     $sub$ptr$rhs$cast695 = $s668$1;
     $sub$ptr$sub696 = (($sub$ptr$lhs$cast694) - ($sub$ptr$rhs$cast695))|0;
     _out($f,$s668$1,$sub$ptr$sub696);
     $incdec$ptr698 = ((($d$5422)) + 4|0);
     $cmp665 = ($incdec$ptr698>>>0)>($arraydecay208$add$ptr213>>>0);
     if ($cmp665) {
      break;
     } else {
      $d$5422 = $incdec$ptr698;
     }
    }
    $65 = ($53|0)==(0);
    if (!($65)) {
     _out($f,3470,1);
    }
    $cmp707414 = ($incdec$ptr698>>>0)<($z$7>>>0);
    $cmp710415 = ($p$addr$3|0)>(0);
    $66 = $cmp707414 & $cmp710415;
    if ($66) {
     $d$6416 = $incdec$ptr698;$p$addr$4417 = $p$addr$3;
     while(1) {
      $67 = HEAP32[$d$6416>>2]|0;
      $68 = (_fmt_u($67,0,$add$ptr671)|0);
      $cmp722411 = ($68>>>0)>($buf>>>0);
      if ($cmp722411) {
       $69 = $68;
       $70 = (($69) - ($sub$ptr$rhs$cast))|0;
       _memset(($buf|0),48,($70|0))|0;
       $s715$0412 = $68;
       while(1) {
        $incdec$ptr725 = ((($s715$0412)) + -1|0);
        $cmp722 = ($incdec$ptr725>>>0)>($buf>>>0);
        if ($cmp722) {
         $s715$0412 = $incdec$ptr725;
        } else {
         $s715$0$lcssa = $incdec$ptr725;
         break;
        }
       }
      } else {
       $s715$0$lcssa = $68;
      }
      $71 = ($p$addr$4417|0)<(9);
      $cond732 = $71 ? $p$addr$4417 : 9;
      _out($f,$s715$0$lcssa,$cond732);
      $incdec$ptr734 = ((($d$6416)) + 4|0);
      $sub735 = (($p$addr$4417) + -9)|0;
      $cmp707 = ($incdec$ptr734>>>0)<($z$7>>>0);
      $cmp710 = ($p$addr$4417|0)>(9);
      $72 = $cmp707 & $cmp710;
      if ($72) {
       $d$6416 = $incdec$ptr734;$p$addr$4417 = $sub735;
      } else {
       $p$addr$4$lcssa = $sub735;
       break;
      }
     }
    } else {
     $p$addr$4$lcssa = $p$addr$3;
    }
    $add737 = (($p$addr$4$lcssa) + 9)|0;
    _pad_682($f,48,$add737,9,0);
   } else {
    $add$ptr742 = ((($a$9$ph)) + 4|0);
    $z$7$add$ptr742 = $cmp450$lcssa ? $z$7 : $add$ptr742;
    $cmp748427 = ($p$addr$3|0)>(-1);
    if ($cmp748427) {
     $add$ptr756 = ((($buf)) + 9|0);
     $tobool781 = ($and610$pre$phiZ2D|0)==(0);
     $sub$ptr$lhs$cast787 = $add$ptr756;
     $73 = (0 - ($sub$ptr$rhs$cast))|0;
     $incdec$ptr763 = ((($buf)) + 8|0);
     $d$7428 = $a$9$ph;$p$addr$5429 = $p$addr$3;
     while(1) {
      $74 = HEAP32[$d$7428>>2]|0;
      $75 = (_fmt_u($74,0,$add$ptr756)|0);
      $cmp760 = ($75|0)==($add$ptr756|0);
      if ($cmp760) {
       HEAP8[$incdec$ptr763>>0] = 48;
       $s753$0 = $incdec$ptr763;
      } else {
       $s753$0 = $75;
      }
      $cmp765 = ($d$7428|0)==($a$9$ph|0);
      do {
       if ($cmp765) {
        $incdec$ptr776 = ((($s753$0)) + 1|0);
        _out($f,$s753$0,1);
        $cmp777 = ($p$addr$5429|0)<(1);
        $or$cond402 = $tobool781 & $cmp777;
        if ($or$cond402) {
         $s753$2 = $incdec$ptr776;
         break;
        }
        _out($f,3470,1);
        $s753$2 = $incdec$ptr776;
       } else {
        $cmp770423 = ($s753$0>>>0)>($buf>>>0);
        if (!($cmp770423)) {
         $s753$2 = $s753$0;
         break;
        }
        $scevgep483 = (($s753$0) + ($73)|0);
        $scevgep483484 = $scevgep483;
        _memset(($buf|0),48,($scevgep483484|0))|0;
        $s753$1424 = $s753$0;
        while(1) {
         $incdec$ptr773 = ((($s753$1424)) + -1|0);
         $cmp770 = ($incdec$ptr773>>>0)>($buf>>>0);
         if ($cmp770) {
          $s753$1424 = $incdec$ptr773;
         } else {
          $s753$2 = $incdec$ptr773;
          break;
         }
        }
       }
      } while(0);
      $sub$ptr$rhs$cast788 = $s753$2;
      $sub$ptr$sub789 = (($sub$ptr$lhs$cast787) - ($sub$ptr$rhs$cast788))|0;
      $cmp790 = ($p$addr$5429|0)>($sub$ptr$sub789|0);
      $cond800 = $cmp790 ? $sub$ptr$sub789 : $p$addr$5429;
      _out($f,$s753$2,$cond800);
      $sub806 = (($p$addr$5429) - ($sub$ptr$sub789))|0;
      $incdec$ptr808 = ((($d$7428)) + 4|0);
      $cmp745 = ($incdec$ptr808>>>0)<($z$7$add$ptr742>>>0);
      $cmp748 = ($sub806|0)>(-1);
      $76 = $cmp745 & $cmp748;
      if ($76) {
       $d$7428 = $incdec$ptr808;$p$addr$5429 = $sub806;
      } else {
       $p$addr$5$lcssa = $sub806;
       break;
      }
     }
    } else {
     $p$addr$5$lcssa = $p$addr$3;
    }
    $add810 = (($p$addr$5$lcssa) + 18)|0;
    _pad_682($f,48,$add810,18,0);
    $sub$ptr$lhs$cast811 = $arrayidx;
    $sub$ptr$rhs$cast812 = $estr$2;
    $sub$ptr$sub813 = (($sub$ptr$lhs$cast811) - ($sub$ptr$rhs$cast812))|0;
    _out($f,$estr$2,$sub$ptr$sub813);
   }
   $xor816 = $fl ^ 8192;
   _pad_682($f,32,$w,$add653,$xor816);
   $add653$sink406 = $add653;
  } else {
   $and36 = $t & 32;
   $tobool37 = ($and36|0)!=(0);
   $cond = $tobool37 ? 3438 : 3442;
   $cmp38 = ($y$addr$0 != $y$addr$0) | (0.0 != 0.0);
   $cond43 = $tobool37 ? 3446 : 3450;
   $s35$0 = $cmp38 ? $cond43 : $cond;
   $add = (($pl$0) + 3)|0;
   $and45 = $fl & -65537;
   _pad_682($f,32,$w,$add,$and45);
   _out($f,$prefix$0,$pl$0);
   _out($f,$s35$0,3);
   $xor = $fl ^ 8192;
   _pad_682($f,32,$w,$add,$xor);
   $add653$sink406 = $add;
  }
 } while(0);
 $cmp818 = ($add653$sink406|0)<($w|0);
 $w$add653 = $cmp818 ? $w : $add653$sink406;
 STACKTOP = sp;return ($w$add653|0);
}
function ___DOUBLE_BITS_683($__f) {
 $__f = +$__f;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $__f;$0 = HEAP32[tempDoublePtr>>2]|0;
 $1 = HEAP32[tempDoublePtr+4>>2]|0;
 tempRet0 = ($1);
 return ($0|0);
}
function _frexpl($x,$e) {
 $x = +$x;
 $e = $e|0;
 var $call = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (+_frexp($x,$e));
 return (+$call);
}
function _frexp($x,$e) {
 $x = +$x;
 $e = $e|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $call = 0.0, $conv = 0, $mul = 0.0, $retval$0 = 0.0, $storemerge = 0, $sub = 0, $sub8 = 0, $tobool1 = 0, $trunc$clear = 0, $x$addr$0 = 0.0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $x;$0 = HEAP32[tempDoublePtr>>2]|0;
 $1 = HEAP32[tempDoublePtr+4>>2]|0;
 $2 = (_bitshift64Lshr(($0|0),($1|0),52)|0);
 $3 = tempRet0;
 $4 = $2&65535;
 $trunc$clear = $4 & 2047;
 switch ($trunc$clear<<16>>16) {
 case 0:  {
  $tobool1 = $x != 0.0;
  if ($tobool1) {
   $mul = $x * 1.8446744073709552E+19;
   $call = (+_frexp($mul,$e));
   $5 = HEAP32[$e>>2]|0;
   $sub = (($5) + -64)|0;
   $storemerge = $sub;$x$addr$0 = $call;
  } else {
   $storemerge = 0;$x$addr$0 = $x;
  }
  HEAP32[$e>>2] = $storemerge;
  $retval$0 = $x$addr$0;
  break;
 }
 case 2047:  {
  $retval$0 = $x;
  break;
 }
 default: {
  $conv = $2 & 2047;
  $sub8 = (($conv) + -1022)|0;
  HEAP32[$e>>2] = $sub8;
  $6 = $1 & -2146435073;
  $7 = $6 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $0;HEAP32[tempDoublePtr+4>>2] = $7;$8 = +HEAPF64[tempDoublePtr>>3];
  $retval$0 = $8;
 }
 }
 return (+$retval$0);
}
function _wcrtomb($s,$wc,$st) {
 $s = $s|0;
 $wc = $wc|0;
 $st = $st|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $and = 0, $and32 = 0, $and36 = 0, $and49 = 0, $and54 = 0, $and58 = 0, $call = 0, $call10 = 0, $call66 = 0, $cmp = 0, $cmp14 = 0, $cmp21 = 0, $cmp24 = 0, $cmp41 = 0, $cmp7 = 0, $conv = 0;
 var $conv12 = 0, $conv17 = 0, $conv19 = 0, $conv29 = 0, $conv34 = 0, $conv38 = 0, $conv46 = 0, $conv51 = 0, $conv56 = 0, $conv60 = 0, $incdec$ptr = 0, $incdec$ptr30 = 0, $incdec$ptr35 = 0, $incdec$ptr47 = 0, $incdec$ptr52 = 0, $incdec$ptr57 = 0, $locale = 0, $not$tobool2 = 0, $or = 0, $or$cond = 0;
 var $or18 = 0, $or28 = 0, $or33 = 0, $or37 = 0, $or45 = 0, $or50 = 0, $or55 = 0, $or59 = 0, $retval$0 = 0, $shr2729 = 0, $shr3130 = 0, $shr32 = 0, $shr4426 = 0, $shr4827 = 0, $shr5328 = 0, $sub40 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($s|0)==(0|0);
 do {
  if ($tobool) {
   $retval$0 = 1;
  } else {
   $cmp = ($wc>>>0)<(128);
   if ($cmp) {
    $conv = $wc&255;
    HEAP8[$s>>0] = $conv;
    $retval$0 = 1;
    break;
   }
   $call = (___pthread_self_429()|0);
   $locale = ((($call)) + 188|0);
   $0 = HEAP32[$locale>>2]|0;
   $1 = (Atomics_load(HEAP32,$0>>2)|0);
   $not$tobool2 = ($1|0)==(0|0);
   if ($not$tobool2) {
    $2 = $wc & -128;
    $cmp7 = ($2|0)==(57216);
    if ($cmp7) {
     $conv12 = $wc&255;
     HEAP8[$s>>0] = $conv12;
     $retval$0 = 1;
     break;
    } else {
     $call10 = (___errno_location()|0);
     HEAP32[$call10>>2] = 84;
     $retval$0 = -1;
     break;
    }
   }
   $cmp14 = ($wc>>>0)<(2048);
   if ($cmp14) {
    $shr32 = $wc >>> 6;
    $or = $shr32 | 192;
    $conv17 = $or&255;
    $incdec$ptr = ((($s)) + 1|0);
    HEAP8[$s>>0] = $conv17;
    $and = $wc & 63;
    $or18 = $and | 128;
    $conv19 = $or18&255;
    HEAP8[$incdec$ptr>>0] = $conv19;
    $retval$0 = 2;
    break;
   }
   $cmp21 = ($wc>>>0)<(55296);
   $3 = $wc & -8192;
   $cmp24 = ($3|0)==(57344);
   $or$cond = $cmp21 | $cmp24;
   if ($or$cond) {
    $shr2729 = $wc >>> 12;
    $or28 = $shr2729 | 224;
    $conv29 = $or28&255;
    $incdec$ptr30 = ((($s)) + 1|0);
    HEAP8[$s>>0] = $conv29;
    $shr3130 = $wc >>> 6;
    $and32 = $shr3130 & 63;
    $or33 = $and32 | 128;
    $conv34 = $or33&255;
    $incdec$ptr35 = ((($s)) + 2|0);
    HEAP8[$incdec$ptr30>>0] = $conv34;
    $and36 = $wc & 63;
    $or37 = $and36 | 128;
    $conv38 = $or37&255;
    HEAP8[$incdec$ptr35>>0] = $conv38;
    $retval$0 = 3;
    break;
   }
   $sub40 = (($wc) + -65536)|0;
   $cmp41 = ($sub40>>>0)<(1048576);
   if ($cmp41) {
    $shr4426 = $wc >>> 18;
    $or45 = $shr4426 | 240;
    $conv46 = $or45&255;
    $incdec$ptr47 = ((($s)) + 1|0);
    HEAP8[$s>>0] = $conv46;
    $shr4827 = $wc >>> 12;
    $and49 = $shr4827 & 63;
    $or50 = $and49 | 128;
    $conv51 = $or50&255;
    $incdec$ptr52 = ((($s)) + 2|0);
    HEAP8[$incdec$ptr47>>0] = $conv51;
    $shr5328 = $wc >>> 6;
    $and54 = $shr5328 & 63;
    $or55 = $and54 | 128;
    $conv56 = $or55&255;
    $incdec$ptr57 = ((($s)) + 3|0);
    HEAP8[$incdec$ptr52>>0] = $conv56;
    $and58 = $wc & 63;
    $or59 = $and58 | 128;
    $conv60 = $or59&255;
    HEAP8[$incdec$ptr57>>0] = $conv60;
    $retval$0 = 4;
    break;
   } else {
    $call66 = (___errno_location()|0);
    HEAP32[$call66>>2] = 84;
    $retval$0 = -1;
    break;
   }
  }
 } while(0);
 return ($retval$0|0);
}
function ___pthread_self_429() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (_pthread_self()|0);
 return ($call|0);
}
function ___pthread_self_104() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (_pthread_self()|0);
 return ($call|0);
}
function ___strerror_l($e,$loc) {
 $e = $e|0;
 $loc = $loc|0;
 var $0 = 0, $1 = 0, $2 = 0, $arrayidx = 0, $arrayidx15 = 0, $call = 0, $cmp = 0, $conv = 0, $dec = 0, $i$012 = 0, $i$111 = 0, $inc = 0, $incdec$ptr = 0, $s$0$lcssa = 0, $s$010 = 0, $s$1 = 0, $tobool = 0, $tobool5 = 0, $tobool59 = 0, $tobool8 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $i$012 = 0;
 while(1) {
  $arrayidx = (3472 + ($i$012)|0);
  $0 = HEAP8[$arrayidx>>0]|0;
  $conv = $0&255;
  $cmp = ($conv|0)==($e|0);
  if ($cmp) {
   label = 2;
   break;
  }
  $inc = (($i$012) + 1)|0;
  $tobool = ($inc|0)==(87);
  if ($tobool) {
   $i$111 = 87;$s$010 = 3560;
   label = 5;
   break;
  } else {
   $i$012 = $inc;
  }
 }
 if ((label|0) == 2) {
  $tobool59 = ($i$012|0)==(0);
  if ($tobool59) {
   $s$0$lcssa = 3560;
  } else {
   $i$111 = $i$012;$s$010 = 3560;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  while(1) {
   label = 0;
   $s$1 = $s$010;
   while(1) {
    $1 = HEAP8[$s$1>>0]|0;
    $tobool8 = ($1<<24>>24)==(0);
    $incdec$ptr = ((($s$1)) + 1|0);
    if ($tobool8) {
     break;
    } else {
     $s$1 = $incdec$ptr;
    }
   }
   $dec = (($i$111) + -1)|0;
   $tobool5 = ($dec|0)==(0);
   if ($tobool5) {
    $s$0$lcssa = $incdec$ptr;
    break;
   } else {
    $i$111 = $dec;$s$010 = $incdec$ptr;
    label = 5;
   }
  }
 }
 $arrayidx15 = ((($loc)) + 20|0);
 $2 = (Atomics_load(HEAP32,$arrayidx15>>2)|0);
 $call = (___lctrans($s$0$lcssa,$2)|0);
 return ($call|0);
}
function ___lctrans($msg,$lm) {
 $msg = $msg|0;
 $lm = $lm|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (___lctrans_impl($msg,$lm)|0);
 return ($call|0);
}
function ___lctrans_impl($msg,$lm) {
 $msg = $msg|0;
 $lm = $lm|0;
 var $0 = 0, $1 = 0, $call = 0, $cond = 0, $map_size = 0, $tobool = 0, $tobool1 = 0, $trans$0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($lm|0)==(0|0);
 if ($tobool) {
  $trans$0 = 0;
 } else {
  $0 = HEAP32[$lm>>2]|0;
  $map_size = ((($lm)) + 4|0);
  $1 = HEAP32[$map_size>>2]|0;
  $call = (___mo_lookup($0,$1,$msg)|0);
  $trans$0 = $call;
 }
 $tobool1 = ($trans$0|0)!=(0|0);
 $cond = $tobool1 ? $trans$0 : $msg;
 return ($cond|0);
}
function ___mo_lookup($p,$size,$s) {
 $p = $p|0;
 $size = $size|0;
 $s = $s|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add$ptr = 0, $add$ptr65 = 0, $add$ptr65$ = 0, $add16 = 0, $add23 = 0, $add31 = 0, $add42 = 0, $add49 = 0, $add59 = 0;
 var $arrayidx = 0, $arrayidx1 = 0, $arrayidx17 = 0, $arrayidx24 = 0, $arrayidx3 = 0, $arrayidx32 = 0, $arrayidx43 = 0, $arrayidx50 = 0, $arrayidx60 = 0, $b$0 = 0, $b$1 = 0, $call = 0, $call18 = 0, $call2 = 0, $call25 = 0, $call36 = 0, $call4 = 0, $call44 = 0, $call51 = 0, $cmp = 0;
 var $cmp10 = 0, $cmp26 = 0, $cmp29 = 0, $cmp52 = 0, $cmp56 = 0, $cmp6 = 0, $cmp67 = 0, $cmp71 = 0, $div = 0, $div12 = 0, $div13 = 0, $div14 = 0, $mul = 0, $mul15 = 0, $n$0 = 0, $n$1 = 0, $or = 0, $or$cond = 0, $or$cond66 = 0, $or$cond67 = 0;
 var $rem = 0, $retval$4 = 0, $sub = 0, $sub28 = 0, $sub5 = 0, $sub55 = 0, $sub79 = 0, $tobool = 0, $tobool33 = 0, $tobool37 = 0, $tobool62 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$p>>2]|0;
 $sub = (($0) + 1794895138)|0;
 $arrayidx = ((($p)) + 8|0);
 $1 = HEAP32[$arrayidx>>2]|0;
 $call = (_swapc($1,$sub)|0);
 $arrayidx1 = ((($p)) + 12|0);
 $2 = HEAP32[$arrayidx1>>2]|0;
 $call2 = (_swapc($2,$sub)|0);
 $arrayidx3 = ((($p)) + 16|0);
 $3 = HEAP32[$arrayidx3>>2]|0;
 $call4 = (_swapc($3,$sub)|0);
 $div = $size >>> 2;
 $cmp = ($call>>>0)<($div>>>0);
 L1: do {
  if ($cmp) {
   $mul = $call << 2;
   $sub5 = (($size) - ($mul))|0;
   $cmp6 = ($call2>>>0)<($sub5>>>0);
   $cmp10 = ($call4>>>0)<($sub5>>>0);
   $or$cond = $cmp6 & $cmp10;
   if ($or$cond) {
    $or = $call4 | $call2;
    $rem = $or & 3;
    $tobool = ($rem|0)==(0);
    if ($tobool) {
     $div12 = $call2 >>> 2;
     $div13 = $call4 >>> 2;
     $b$0 = 0;$n$0 = $call;
     while(1) {
      $div14 = $n$0 >>> 1;
      $add = (($b$0) + ($div14))|0;
      $mul15 = $add << 1;
      $add16 = (($mul15) + ($div12))|0;
      $arrayidx17 = (($p) + ($add16<<2)|0);
      $4 = HEAP32[$arrayidx17>>2]|0;
      $call18 = (_swapc($4,$sub)|0);
      $add23 = (($add16) + 1)|0;
      $arrayidx24 = (($p) + ($add23<<2)|0);
      $5 = HEAP32[$arrayidx24>>2]|0;
      $call25 = (_swapc($5,$sub)|0);
      $cmp26 = ($call25>>>0)<($size>>>0);
      $sub28 = (($size) - ($call25))|0;
      $cmp29 = ($call18>>>0)<($sub28>>>0);
      $or$cond66 = $cmp26 & $cmp29;
      if (!($or$cond66)) {
       $retval$4 = 0;
       break L1;
      }
      $add31 = (($call25) + ($call18))|0;
      $arrayidx32 = (($p) + ($add31)|0);
      $6 = HEAP8[$arrayidx32>>0]|0;
      $tobool33 = ($6<<24>>24)==(0);
      if (!($tobool33)) {
       $retval$4 = 0;
       break L1;
      }
      $add$ptr = (($p) + ($call25)|0);
      $call36 = (_strcmp($s,$add$ptr)|0);
      $tobool37 = ($call36|0)==(0);
      if ($tobool37) {
       break;
      }
      $cmp67 = ($n$0|0)==(1);
      $cmp71 = ($call36|0)<(0);
      $sub79 = (($n$0) - ($div14))|0;
      $n$1 = $cmp71 ? $div14 : $sub79;
      $b$1 = $cmp71 ? $b$0 : $add;
      if ($cmp67) {
       $retval$4 = 0;
       break L1;
      } else {
       $b$0 = $b$1;$n$0 = $n$1;
      }
     }
     $add42 = (($mul15) + ($div13))|0;
     $arrayidx43 = (($p) + ($add42<<2)|0);
     $7 = HEAP32[$arrayidx43>>2]|0;
     $call44 = (_swapc($7,$sub)|0);
     $add49 = (($add42) + 1)|0;
     $arrayidx50 = (($p) + ($add49<<2)|0);
     $8 = HEAP32[$arrayidx50>>2]|0;
     $call51 = (_swapc($8,$sub)|0);
     $cmp52 = ($call51>>>0)<($size>>>0);
     $sub55 = (($size) - ($call51))|0;
     $cmp56 = ($call44>>>0)<($sub55>>>0);
     $or$cond67 = $cmp52 & $cmp56;
     if ($or$cond67) {
      $add$ptr65 = (($p) + ($call51)|0);
      $add59 = (($call51) + ($call44))|0;
      $arrayidx60 = (($p) + ($add59)|0);
      $9 = HEAP8[$arrayidx60>>0]|0;
      $tobool62 = ($9<<24>>24)==(0);
      $add$ptr65$ = $tobool62 ? $add$ptr65 : 0;
      $retval$4 = $add$ptr65$;
     } else {
      $retval$4 = 0;
     }
    } else {
     $retval$4 = 0;
    }
   } else {
    $retval$4 = 0;
   }
  } else {
   $retval$4 = 0;
  }
 } while(0);
 return ($retval$4|0);
}
function _swapc($x,$c) {
 $x = $x|0;
 $c = $c|0;
 var $or5 = 0, $tobool = 0, $x$or5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($c|0)==(0);
 $or5 = (_llvm_bswap_i32(($x|0))|0);
 $x$or5 = $tobool ? $x : $or5;
 return ($x$or5|0);
}
function ___fwritex($s,$l,$f) {
 $s = $s|0;
 $l = $l|0;
 $f = $f|0;
 var $$pre = 0, $$pre33 = 0, $0 = 0, $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add$ptr = 0, $add$ptr26 = 0, $arrayidx = 0, $call = 0, $call16 = 0, $call4 = 0;
 var $cmp = 0, $cmp11 = 0, $cmp17 = 0, $cmp6 = 0, $i$0 = 0, $i$1 = 0, $l$addr$0 = 0, $l$addr$1 = 0, $lbf = 0, $retval$1 = 0, $s$addr$1 = 0, $sub = 0, $sub$ptr$sub = 0, $tobool = 0, $tobool1 = 0, $tobool9 = 0, $wend = 0, $wpos = 0, $write = 0, $write15 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $wend = ((($f)) + 16|0);
 $0 = HEAP32[$wend>>2]|0;
 $tobool = ($0|0)==(0|0);
 if ($tobool) {
  $call = (___towrite($f)|0);
  $tobool1 = ($call|0)==(0);
  if ($tobool1) {
   $$pre = HEAP32[$wend>>2]|0;
   $3 = $$pre;
   label = 5;
  } else {
   $retval$1 = 0;
  }
 } else {
  $1 = $0;
  $3 = $1;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $wpos = ((($f)) + 20|0);
   $2 = HEAP32[$wpos>>2]|0;
   $sub$ptr$sub = (($3) - ($2))|0;
   $cmp = ($sub$ptr$sub>>>0)<($l>>>0);
   $4 = $2;
   if ($cmp) {
    $write = ((($f)) + 36|0);
    $5 = HEAP32[$write>>2]|0;
    $call4 = (FUNCTION_TABLE_iiii[$5 & 31]($f,$s,$l)|0);
    $retval$1 = $call4;
    break;
   }
   $lbf = ((($f)) + 75|0);
   $6 = HEAP8[$lbf>>0]|0;
   $cmp6 = ($6<<24>>24)>(-1);
   L10: do {
    if ($cmp6) {
     $i$0 = $l;
     while(1) {
      $tobool9 = ($i$0|0)==(0);
      if ($tobool9) {
       $9 = $4;$i$1 = 0;$l$addr$1 = $l;$s$addr$1 = $s;
       break L10;
      }
      $sub = (($i$0) + -1)|0;
      $arrayidx = (($s) + ($sub)|0);
      $7 = HEAP8[$arrayidx>>0]|0;
      $cmp11 = ($7<<24>>24)==(10);
      if ($cmp11) {
       break;
      } else {
       $i$0 = $sub;
      }
     }
     $write15 = ((($f)) + 36|0);
     $8 = HEAP32[$write15>>2]|0;
     $call16 = (FUNCTION_TABLE_iiii[$8 & 31]($f,$s,$i$0)|0);
     $cmp17 = ($call16>>>0)<($i$0>>>0);
     if ($cmp17) {
      $retval$1 = $call16;
      break L5;
     }
     $add$ptr = (($s) + ($i$0)|0);
     $l$addr$0 = (($l) - ($i$0))|0;
     $$pre33 = HEAP32[$wpos>>2]|0;
     $9 = $$pre33;$i$1 = $i$0;$l$addr$1 = $l$addr$0;$s$addr$1 = $add$ptr;
    } else {
     $9 = $4;$i$1 = 0;$l$addr$1 = $l;$s$addr$1 = $s;
    }
   } while(0);
   _memcpy(($9|0),($s$addr$1|0),($l$addr$1|0))|0;
   $10 = HEAP32[$wpos>>2]|0;
   $add$ptr26 = (($10) + ($l$addr$1)|0);
   HEAP32[$wpos>>2] = $add$ptr26;
   $add = (($i$1) + ($l$addr$1))|0;
   $retval$1 = $add;
  }
 } while(0);
 return ($retval$1|0);
}
function ___towrite($f) {
 $f = $f|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $add$ptr = 0, $and = 0, $buf = 0, $buf_size = 0, $conv = 0, $conv3 = 0, $mode = 0, $or = 0, $or5 = 0, $rend = 0, $retval$0 = 0, $rpos = 0, $sub = 0, $tobool = 0, $wbase = 0, $wend = 0;
 var $wpos = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $mode = ((($f)) + 74|0);
 $0 = HEAP8[$mode>>0]|0;
 $conv = $0 << 24 >> 24;
 $sub = (($conv) + 255)|0;
 $or = $sub | $conv;
 $conv3 = $or&255;
 HEAP8[$mode>>0] = $conv3;
 $1 = HEAP32[$f>>2]|0;
 $and = $1 & 8;
 $tobool = ($and|0)==(0);
 if ($tobool) {
  $rend = ((($f)) + 8|0);
  HEAP32[$rend>>2] = 0;
  $rpos = ((($f)) + 4|0);
  HEAP32[$rpos>>2] = 0;
  $buf = ((($f)) + 44|0);
  $2 = HEAP32[$buf>>2]|0;
  $wbase = ((($f)) + 28|0);
  HEAP32[$wbase>>2] = $2;
  $wpos = ((($f)) + 20|0);
  HEAP32[$wpos>>2] = $2;
  $buf_size = ((($f)) + 48|0);
  $3 = HEAP32[$buf_size>>2]|0;
  $add$ptr = (($2) + ($3)|0);
  $wend = ((($f)) + 16|0);
  HEAP32[$wend>>2] = $add$ptr;
  $retval$0 = 0;
 } else {
  $or5 = $1 | 32;
  HEAP32[$f>>2] = $or5;
  $retval$0 = -1;
 }
 return ($retval$0|0);
}
function _sn_write($f,$s,$l) {
 $f = $f|0;
 $s = $s|0;
 $l = $l|0;
 var $0 = 0, $1 = 0, $2 = 0, $add$ptr = 0, $cmp = 0, $l$sub$ptr$sub = 0, $sub$ptr$rhs$cast = 0, $sub$ptr$sub = 0, $wend = 0, $wpos = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $wend = ((($f)) + 16|0);
 $0 = HEAP32[$wend>>2]|0;
 $wpos = ((($f)) + 20|0);
 $1 = HEAP32[$wpos>>2]|0;
 $sub$ptr$rhs$cast = $1;
 $sub$ptr$sub = (($0) - ($sub$ptr$rhs$cast))|0;
 $cmp = ($sub$ptr$sub>>>0)>($l>>>0);
 $l$sub$ptr$sub = $cmp ? $l : $sub$ptr$sub;
 _memcpy(($1|0),($s|0),($l$sub$ptr$sub|0))|0;
 $2 = HEAP32[$wpos>>2]|0;
 $add$ptr = (($2) + ($l$sub$ptr$sub)|0);
 HEAP32[$wpos>>2] = $add$ptr;
 return ($l|0);
}
function _strlen($s) {
 $s = $s|0;
 var $$pn = 0, $$pre = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $and = 0, $and3 = 0, $incdec$ptr = 0, $incdec$ptr1323 = 0, $incdec$ptr7 = 0, $lnot = 0, $neg = 0, $rem = 0, $rem13 = 0, $s$addr$0$lcssa = 0, $s$addr$015 = 0, $s$addr$1$lcssa = 0;
 var $sub = 0, $sub$ptr$lhs$cast15 = 0, $sub$ptr$lhs$cast15$sink = 0, $sub$ptr$sub17 = 0, $tobool = 0, $tobool1 = 0, $tobool10 = 0, $tobool1021 = 0, $tobool14 = 0, $w$0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $s;
 $rem13 = $0 & 3;
 $tobool14 = ($rem13|0)==(0);
 L1: do {
  if ($tobool14) {
   $s$addr$0$lcssa = $s;
   label = 4;
  } else {
   $5 = $0;$s$addr$015 = $s;
   while(1) {
    $1 = HEAP8[$s$addr$015>>0]|0;
    $tobool1 = ($1<<24>>24)==(0);
    if ($tobool1) {
     $sub$ptr$lhs$cast15$sink = $5;
     break L1;
    }
    $incdec$ptr = ((($s$addr$015)) + 1|0);
    $2 = $incdec$ptr;
    $rem = $2 & 3;
    $tobool = ($rem|0)==(0);
    if ($tobool) {
     $s$addr$0$lcssa = $incdec$ptr;
     label = 4;
     break;
    } else {
     $5 = $2;$s$addr$015 = $incdec$ptr;
    }
   }
  }
 } while(0);
 if ((label|0) == 4) {
  $w$0 = $s$addr$0$lcssa;
  while(1) {
   $3 = HEAP32[$w$0>>2]|0;
   $sub = (($3) + -16843009)|0;
   $neg = $3 & -2139062144;
   $and = $neg ^ -2139062144;
   $and3 = $and & $sub;
   $lnot = ($and3|0)==(0);
   $incdec$ptr7 = ((($w$0)) + 4|0);
   if ($lnot) {
    $w$0 = $incdec$ptr7;
   } else {
    break;
   }
  }
  $4 = $3&255;
  $tobool1021 = ($4<<24>>24)==(0);
  if ($tobool1021) {
   $s$addr$1$lcssa = $w$0;
  } else {
   $$pn = $w$0;
   while(1) {
    $incdec$ptr1323 = ((($$pn)) + 1|0);
    $$pre = HEAP8[$incdec$ptr1323>>0]|0;
    $tobool10 = ($$pre<<24>>24)==(0);
    if ($tobool10) {
     $s$addr$1$lcssa = $incdec$ptr1323;
     break;
    } else {
     $$pn = $incdec$ptr1323;
    }
   }
  }
  $sub$ptr$lhs$cast15 = $s$addr$1$lcssa;
  $sub$ptr$lhs$cast15$sink = $sub$ptr$lhs$cast15;
 }
 $sub$ptr$sub17 = (($sub$ptr$lhs$cast15$sink) - ($0))|0;
 return ($sub$ptr$sub17|0);
}
function _strcpy($dest,$src) {
 $dest = $dest|0;
 $src = $src|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 (___stpcpy($dest,$src)|0);
 return ($dest|0);
}
function ___stpcpy($d,$s) {
 $d = $d|0;
 $s = $s|0;
 var $0 = 0, $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and = 0, $and28 = 0, $and7 = 0, $and729 = 0, $cmp = 0, $d$addr$0$lcssa = 0, $d$addr$037 = 0, $d$addr$1$ph = 0, $d$addr$124 = 0;
 var $incdec$ptr = 0, $incdec$ptr11 = 0, $incdec$ptr12 = 0, $incdec$ptr19 = 0, $incdec$ptr20 = 0, $incdec$ptr5 = 0, $lnot = 0, $lnot30 = 0, $neg = 0, $neg27 = 0, $rem2 = 0, $rem235 = 0, $retval$0 = 0, $s$addr$0$lcssa = 0, $s$addr$038 = 0, $s$addr$1$ph = 0, $s$addr$125 = 0, $sub = 0, $sub26 = 0, $tobool = 0;
 var $tobool16 = 0, $tobool1623 = 0, $tobool3 = 0, $tobool36 = 0, $wd$0$lcssa = 0, $wd$031 = 0, $ws$0$lcssa = 0, $ws$032 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $s;
 $1 = $d;
 $2 = $0 ^ $1;
 $3 = $2 & 3;
 $cmp = ($3|0)==(0);
 L1: do {
  if ($cmp) {
   $rem235 = $0 & 3;
   $tobool36 = ($rem235|0)==(0);
   if ($tobool36) {
    $d$addr$0$lcssa = $d;$s$addr$0$lcssa = $s;
   } else {
    $d$addr$037 = $d;$s$addr$038 = $s;
    while(1) {
     $4 = HEAP8[$s$addr$038>>0]|0;
     HEAP8[$d$addr$037>>0] = $4;
     $tobool3 = ($4<<24>>24)==(0);
     if ($tobool3) {
      $retval$0 = $d$addr$037;
      break L1;
     }
     $incdec$ptr = ((($s$addr$038)) + 1|0);
     $incdec$ptr5 = ((($d$addr$037)) + 1|0);
     $5 = $incdec$ptr;
     $rem2 = $5 & 3;
     $tobool = ($rem2|0)==(0);
     if ($tobool) {
      $d$addr$0$lcssa = $incdec$ptr5;$s$addr$0$lcssa = $incdec$ptr;
      break;
     } else {
      $d$addr$037 = $incdec$ptr5;$s$addr$038 = $incdec$ptr;
     }
    }
   }
   $6 = HEAP32[$s$addr$0$lcssa>>2]|0;
   $sub26 = (($6) + -16843009)|0;
   $neg27 = $6 & -2139062144;
   $and28 = $neg27 ^ -2139062144;
   $and729 = $and28 & $sub26;
   $lnot30 = ($and729|0)==(0);
   if ($lnot30) {
    $7 = $6;$wd$031 = $d$addr$0$lcssa;$ws$032 = $s$addr$0$lcssa;
    while(1) {
     $incdec$ptr11 = ((($ws$032)) + 4|0);
     $incdec$ptr12 = ((($wd$031)) + 4|0);
     HEAP32[$wd$031>>2] = $7;
     $8 = HEAP32[$incdec$ptr11>>2]|0;
     $sub = (($8) + -16843009)|0;
     $neg = $8 & -2139062144;
     $and = $neg ^ -2139062144;
     $and7 = $and & $sub;
     $lnot = ($and7|0)==(0);
     if ($lnot) {
      $7 = $8;$wd$031 = $incdec$ptr12;$ws$032 = $incdec$ptr11;
     } else {
      $wd$0$lcssa = $incdec$ptr12;$ws$0$lcssa = $incdec$ptr11;
      break;
     }
    }
   } else {
    $wd$0$lcssa = $d$addr$0$lcssa;$ws$0$lcssa = $s$addr$0$lcssa;
   }
   $d$addr$1$ph = $wd$0$lcssa;$s$addr$1$ph = $ws$0$lcssa;
   label = 8;
  } else {
   $d$addr$1$ph = $d;$s$addr$1$ph = $s;
   label = 8;
  }
 } while(0);
 if ((label|0) == 8) {
  $9 = HEAP8[$s$addr$1$ph>>0]|0;
  HEAP8[$d$addr$1$ph>>0] = $9;
  $tobool1623 = ($9<<24>>24)==(0);
  if ($tobool1623) {
   $retval$0 = $d$addr$1$ph;
  } else {
   $d$addr$124 = $d$addr$1$ph;$s$addr$125 = $s$addr$1$ph;
   while(1) {
    $incdec$ptr19 = ((($s$addr$125)) + 1|0);
    $incdec$ptr20 = ((($d$addr$124)) + 1|0);
    $10 = HEAP8[$incdec$ptr19>>0]|0;
    HEAP8[$incdec$ptr20>>0] = $10;
    $tobool16 = ($10<<24>>24)==(0);
    if ($tobool16) {
     $retval$0 = $incdec$ptr20;
     break;
    } else {
     $d$addr$124 = $incdec$ptr20;$s$addr$125 = $incdec$ptr19;
    }
   }
  }
 }
 return ($retval$0|0);
}
function ___strdup($s) {
 $s = $s|0;
 var $add = 0, $call = 0, $call1 = 0, $retval$0 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (_strlen($s)|0);
 $add = (($call) + 1)|0;
 $call1 = (_malloc($add)|0);
 $tobool = ($call1|0)==(0|0);
 if ($tobool) {
  $retval$0 = 0;
 } else {
  _memcpy(($call1|0),($s|0),($add|0))|0;
  $retval$0 = $call1;
 }
 return ($retval$0|0);
}
function ___ofl_lock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___lock((6064|0));
 return (6072|0);
}
function ___ofl_unlock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___unlock((6064|0));
 return;
}
function _fflush($f) {
 $f = $f|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $call = 0, $call1 = 0, $call11 = 0, $call118 = 0, $call17 = 0, $call23 = 0, $call7 = 0, $cmp = 0, $cmp15 = 0, $cmp21 = 0, $cond10 = 0, $cond20 = 0, $f$addr$0 = 0, $f$addr$019 = 0;
 var $f$addr$022 = 0, $lock = 0, $lock14 = 0, $next = 0, $or = 0, $phitmp = 0, $r$0$lcssa = 0, $r$021 = 0, $r$1 = 0, $retval$0 = 0, $tobool = 0, $tobool12 = 0, $tobool1220 = 0, $tobool25 = 0, $tobool5 = 0, $wbase = 0, $wpos = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($f|0)==(0|0);
 do {
  if ($tobool) {
   $1 = (Atomics_load(HEAP32,129)|0);
   $tobool5 = ($1|0)==(0|0);
   if ($tobool5) {
    $cond10 = 0;
   } else {
    $2 = (Atomics_load(HEAP32,129)|0);
    $call7 = (_fflush($2)|0);
    $cond10 = $call7;
   }
   $call11 = (___ofl_lock()|0);
   $f$addr$019 = HEAP32[$call11>>2]|0;
   $tobool1220 = ($f$addr$019|0)==(0|0);
   if ($tobool1220) {
    $r$0$lcssa = $cond10;
   } else {
    $f$addr$022 = $f$addr$019;$r$021 = $cond10;
    while(1) {
     $lock14 = ((($f$addr$022)) + 76|0);
     $3 = (Atomics_load(HEAP32,$lock14>>2)|0);
     $cmp15 = ($3|0)>(-1);
     if ($cmp15) {
      $call17 = (___lockfile($f$addr$022)|0);
      $cond20 = $call17;
     } else {
      $cond20 = 0;
     }
     $wpos = ((($f$addr$022)) + 20|0);
     $4 = HEAP32[$wpos>>2]|0;
     $wbase = ((($f$addr$022)) + 28|0);
     $5 = HEAP32[$wbase>>2]|0;
     $cmp21 = ($4>>>0)>($5>>>0);
     if ($cmp21) {
      $call23 = (___fflush_unlocked($f$addr$022)|0);
      $or = $call23 | $r$021;
      $r$1 = $or;
     } else {
      $r$1 = $r$021;
     }
     $tobool25 = ($cond20|0)==(0);
     if (!($tobool25)) {
      ___unlockfile($f$addr$022);
     }
     $next = ((($f$addr$022)) + 56|0);
     $f$addr$0 = HEAP32[$next>>2]|0;
     $tobool12 = ($f$addr$0|0)==(0|0);
     if ($tobool12) {
      $r$0$lcssa = $r$1;
      break;
     } else {
      $f$addr$022 = $f$addr$0;$r$021 = $r$1;
     }
    }
   }
   ___ofl_unlock();
   $retval$0 = $r$0$lcssa;
  } else {
   $lock = ((($f)) + 76|0);
   $0 = (Atomics_load(HEAP32,$lock>>2)|0);
   $cmp = ($0|0)>(-1);
   if (!($cmp)) {
    $call118 = (___fflush_unlocked($f)|0);
    $retval$0 = $call118;
    break;
   }
   $call = (___lockfile($f)|0);
   $phitmp = ($call|0)==(0);
   $call1 = (___fflush_unlocked($f)|0);
   if ($phitmp) {
    $retval$0 = $call1;
   } else {
    ___unlockfile($f);
    $retval$0 = $call1;
   }
  }
 } while(0);
 return ($retval$0|0);
}
function ___fflush_unlocked($f) {
 $f = $f|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $cmp = 0, $cmp4 = 0, $rend = 0, $retval$0 = 0, $rpos = 0, $seek = 0, $sub$ptr$lhs$cast = 0, $sub$ptr$rhs$cast = 0, $sub$ptr$sub = 0, $tobool = 0, $wbase = 0, $wend = 0, $wpos = 0;
 var $write = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $wpos = ((($f)) + 20|0);
 $0 = HEAP32[$wpos>>2]|0;
 $wbase = ((($f)) + 28|0);
 $1 = HEAP32[$wbase>>2]|0;
 $cmp = ($0>>>0)>($1>>>0);
 if ($cmp) {
  $write = ((($f)) + 36|0);
  $2 = HEAP32[$write>>2]|0;
  (FUNCTION_TABLE_iiii[$2 & 31]($f,0,0)|0);
  $3 = HEAP32[$wpos>>2]|0;
  $tobool = ($3|0)==(0|0);
  if ($tobool) {
   $retval$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $rpos = ((($f)) + 4|0);
  $4 = HEAP32[$rpos>>2]|0;
  $rend = ((($f)) + 8|0);
  $5 = HEAP32[$rend>>2]|0;
  $cmp4 = ($4>>>0)<($5>>>0);
  if ($cmp4) {
   $sub$ptr$lhs$cast = $4;
   $sub$ptr$rhs$cast = $5;
   $sub$ptr$sub = (($sub$ptr$lhs$cast) - ($sub$ptr$rhs$cast))|0;
   $seek = ((($f)) + 40|0);
   $6 = HEAP32[$seek>>2]|0;
   (FUNCTION_TABLE_iiii[$6 & 31]($f,$sub$ptr$sub,1)|0);
  }
  $wend = ((($f)) + 16|0);
  HEAP32[$wend>>2] = 0;
  HEAP32[$wbase>>2] = 0;
  HEAP32[$wpos>>2] = 0;
  HEAP32[$rend>>2] = 0;
  HEAP32[$rpos>>2] = 0;
  $retval$0 = 0;
 }
 return ($retval$0|0);
}
function _printf($fmt,$varargs) {
 $fmt = $fmt|0;
 $varargs = $varargs|0;
 var $0 = 0, $ap = 0, $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $ap = sp;
 HEAP32[$ap>>2] = $varargs;
 $0 = HEAP32[97]|0;
 $call = (_vfprintf($0,$fmt,$ap)|0);
 STACKTOP = sp;return ($call|0);
}
function __emscripten_atomic_fetch_and_add_u64($addr,$0,$1) {
 $addr = $addr|0;
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0, $shr = 0;
 var $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $addr;
 $shr = $2 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $3 = $addr;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = (_i64Add(($5|0),($8|0),($0|0),($1|0))|0);
 $10 = tempRet0;
 $11 = $addr;
 $12 = $11;
 HEAP32[$12>>2] = $9;
 $13 = (($11) + 4)|0;
 $14 = $13;
 HEAP32[$14>>2] = $10;
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($8);
 return ($5|0);
}
function __emscripten_atomic_fetch_and_and_u64($addr,$0,$1) {
 $addr = $addr|0;
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call4 = 0, $cmp$i = 0, $shr = 0;
 var $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $addr;
 $shr = $2 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $3 = $addr;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = $5 & $0;
 $10 = $8 & $1;
 $11 = $addr;
 $12 = $11;
 HEAP32[$12>>2] = $9;
 $13 = (($11) + 4)|0;
 $14 = $13;
 HEAP32[$14>>2] = $10;
 $call4 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($8);
 return ($5|0);
}
function __emscripten_atomic_fetch_and_or_u64($addr,$0,$1) {
 $addr = $addr|0;
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0, $shr = 0;
 var $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $addr;
 $shr = $2 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $3 = $addr;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = $5 | $0;
 $10 = $8 | $1;
 $11 = $addr;
 $12 = $11;
 HEAP32[$12>>2] = $9;
 $13 = (($11) + 4)|0;
 $14 = $13;
 HEAP32[$14>>2] = $10;
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($8);
 return ($5|0);
}
function __emscripten_atomic_fetch_and_sub_u64($addr,$0,$1) {
 $addr = $addr|0;
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0, $shr = 0;
 var $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $addr;
 $shr = $2 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $3 = $addr;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = (_i64Subtract(($5|0),($8|0),($0|0),($1|0))|0);
 $10 = tempRet0;
 $11 = $addr;
 $12 = $11;
 HEAP32[$12>>2] = $9;
 $13 = (($11) + 4)|0;
 $14 = $13;
 HEAP32[$14>>2] = $10;
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($8);
 return ($5|0);
}
function __emscripten_atomic_fetch_and_xor_u64($addr,$0,$1) {
 $addr = $addr|0;
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0, $shr = 0;
 var $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $addr;
 $shr = $2 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $3 = $addr;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = $5 ^ $0;
 $10 = $8 ^ $1;
 $11 = $addr;
 $12 = $11;
 HEAP32[$12>>2] = $9;
 $13 = (($11) + 4)|0;
 $14 = $13;
 HEAP32[$14>>2] = $10;
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($8);
 return ($5|0);
}
function _emscripten_async_run_in_main_thread($call) {
 $call = $call|0;
 var $$expand_i1_val = 0, $arrayidx = 0, $call1 = 0, $call13 = 0, $call13$lcssa = 0, $call1312 = 0, $call1317 = 0, $call14 = 0, $call14$lcssa = 0, $call1413 = 0, $call20 = 0, $call_queue$init$val = 0, $call_queue$init$val$pre_trunc = 0, $cmp = 0, $cmp16 = 0, $cmp17 = 0, $new_tail$0 = 0, $new_tail$0$in = 0, $new_tail$0$in14 = 0, $new_tail$0$lcssa = 0;
 var $new_tail$015 = 0, $tobool = 0, $tobool2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($call|0)==(0|0);
 if ($tobool) {
  ___assert_fail((5683|0),(5486|0),260,(5688|0));
  // unreachable;
 }
 $call1 = (_emscripten_is_main_runtime_thread()|0);
 $tobool2 = ($call1|0)==(0);
 if (!($tobool2)) {
  __do_call($call);
  return;
 }
 (___pthread_mutex_lock(6592)|0);
 $call_queue$init$val$pre_trunc = HEAP8[9758]|0;
 $call_queue$init$val = $call_queue$init$val$pre_trunc&1;
 if (!($call_queue$init$val)) {
  $$expand_i1_val = 1;
  HEAP8[9758] = $$expand_i1_val;
 }
 $call1312 = (Atomics_load(HEAP32, 1655)|0);
 $call1413 = (Atomics_load(HEAP32, 1656)|0);
 $new_tail$0$in14 = (($call1413) + 1)|0;
 $new_tail$015 = (($new_tail$0$in14|0) % 128)&-1;
 $cmp16 = ($new_tail$015|0)==($call1312|0);
 if ($cmp16) {
  $call1317 = $call1312;
  while(1) {
   (___pthread_mutex_unlock(6592)|0);
   (_emscripten_futex_wait((6620|0),($call1317|0),inf)|0);
   (___pthread_mutex_lock(6592)|0);
   $call13 = (Atomics_load(HEAP32, 1655)|0);
   $call14 = (Atomics_load(HEAP32, 1656)|0);
   $new_tail$0$in = (($call14) + 1)|0;
   $new_tail$0 = (($new_tail$0$in|0) % 128)&-1;
   $cmp = ($new_tail$0|0)==($call13|0);
   if ($cmp) {
    $call1317 = $call13;
   } else {
    $call13$lcssa = $call13;$call14$lcssa = $call14;$new_tail$0$lcssa = $new_tail$0;
    break;
   }
  }
 } else {
  $call13$lcssa = $call1312;$call14$lcssa = $call1413;$new_tail$0$lcssa = $new_tail$015;
 }
 $arrayidx = (6628 + ($call14$lcssa<<2)|0);
 HEAP32[$arrayidx>>2] = $call;
 $cmp17 = ($call13$lcssa|0)==($call14$lcssa|0);
 if ($cmp17) {
  _emscripten_asm_const_v(4);
 }
 $call20 = (Atomics_store(HEAP32, 1656, $new_tail$0$lcssa)|0);
 (___pthread_mutex_unlock(6592)|0);
 return;
}
function _emscripten_atomic_add_u64($addr,$0,$1) {
 $addr = $addr|0;
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0, $shr = 0;
 var $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $addr;
 $shr = $2 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $3 = $addr;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = (_i64Add(($5|0),($8|0),($0|0),($1|0))|0);
 $10 = tempRet0;
 $11 = $addr;
 $12 = $11;
 HEAP32[$12>>2] = $9;
 $13 = (($11) + 4)|0;
 $14 = $13;
 HEAP32[$14>>2] = $10;
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($10);
 return ($9|0);
}
function _emscripten_atomic_and_u64($addr,$0,$1) {
 $addr = $addr|0;
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call4 = 0, $cmp$i = 0, $shr = 0;
 var $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $addr;
 $shr = $2 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $3 = $addr;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = $5 & $0;
 $10 = $8 & $1;
 $11 = $addr;
 $12 = $11;
 HEAP32[$12>>2] = $9;
 $13 = (($11) + 4)|0;
 $14 = $13;
 HEAP32[$14>>2] = $10;
 $call4 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($10);
 return ($9|0);
}
function _emscripten_atomic_cas_u64($addr,$0,$1,$2,$3) {
 $addr = $addr|0;
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0;
 var $shr = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = $addr;
 $shr = $4 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $5 = $addr;
 $6 = $5;
 $7 = HEAP32[$6>>2]|0;
 $8 = (($5) + 4)|0;
 $9 = $8;
 $10 = HEAP32[$9>>2]|0;
 $11 = ($7|0)==($0|0);
 $12 = ($10|0)==($1|0);
 $13 = $11 & $12;
 if (!($13)) {
  $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
  tempRet0 = ($10);
  return ($7|0);
 }
 $14 = $addr;
 $15 = $14;
 HEAP32[$15>>2] = $2;
 $16 = (($14) + 4)|0;
 $17 = $16;
 HEAP32[$17>>2] = $3;
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($10);
 return ($7|0);
}
function _emscripten_atomic_exchange_u32($addr,$newVal) {
 $addr = $addr|0;
 $newVal = $newVal|0;
 var $call = 0, $call1 = 0, $cmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 while(1) {
  $call = (Atomics_load(HEAP32, $addr>>2)|0);
  $call1 = (Atomics_compareExchange(HEAP32, $addr>>2, $call, $newVal)|0);
  $cmp = ($call|0)==($call1|0);
  if ($cmp) {
   break;
  }
 }
 return ($call|0);
}
function _emscripten_atomic_exchange_u64($addr,$0,$1) {
 $addr = $addr|0;
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0, $shr = 0, $tobool = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = $addr;
 $shr = $2 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $3 = $addr;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = $addr;
 $10 = $9;
 HEAP32[$10>>2] = $0;
 $11 = (($9) + 4)|0;
 $12 = $11;
 HEAP32[$12>>2] = $1;
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($8);
 return ($5|0);
}
function _emscripten_atomic_load_f32($addr) {
 $addr = $addr|0;
 var $0 = 0.0, $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (Atomics_load(HEAP32, $addr>>2)|0);
 $0 = (HEAP32[tempDoublePtr>>2]=$call,+HEAPF32[tempDoublePtr>>2]);
 return (+$0);
}
function _emscripten_atomic_load_f64($addr) {
 $addr = $addr|0;
 var $0 = 0, $1 = 0.0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0, $shr = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $addr;
 $shr = $0 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $1 = +HEAPF64[$addr>>3];
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 return (+$1);
}
function _emscripten_atomic_load_u64($addr) {
 $addr = $addr|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0, $shr = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $addr;
 $shr = $0 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $1 = $addr;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = (($1) + 4)|0;
 $5 = $4;
 $6 = HEAP32[$5>>2]|0;
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($6);
 return ($3|0);
}
function _emscripten_atomic_or_u64($addr,$0,$1) {
 $addr = $addr|0;
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0, $shr = 0;
 var $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $addr;
 $shr = $2 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $3 = $addr;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = $5 | $0;
 $10 = $8 | $1;
 $11 = $addr;
 $12 = $11;
 HEAP32[$12>>2] = $9;
 $13 = (($11) + 4)|0;
 $14 = $13;
 HEAP32[$14>>2] = $10;
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($10);
 return ($9|0);
}
function _emscripten_atomic_store_f32($addr,$val) {
 $addr = $addr|0;
 $val = +$val;
 var $0 = 0, $call = 0, $conv = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (HEAPF32[tempDoublePtr>>2]=$val,HEAP32[tempDoublePtr>>2]|0);
 $call = (Atomics_store(HEAP32, $addr>>2, $0)|0);
 $conv = (+($call>>>0));
 return (+$conv);
}
function _emscripten_atomic_store_f64($addr,$val) {
 $addr = $addr|0;
 $val = +$val;
 var $0 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0, $shr = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $addr;
 $shr = $0 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 HEAPF64[$addr>>3] = $val;
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 return (+$val);
}
function _emscripten_atomic_store_u64($addr,$0,$1) {
 $addr = $addr|0;
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0, $shr = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $addr;
 $shr = $2 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $3 = $addr;
 $4 = $3;
 HEAP32[$4>>2] = $0;
 $5 = (($3) + 4)|0;
 $6 = $5;
 HEAP32[$6>>2] = $1;
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($1);
 return ($0|0);
}
function _emscripten_atomic_sub_u64($addr,$0,$1) {
 $addr = $addr|0;
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0, $shr = 0;
 var $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $addr;
 $shr = $2 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $3 = $addr;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = (_i64Subtract(($5|0),($8|0),($0|0),($1|0))|0);
 $10 = tempRet0;
 $11 = $addr;
 $12 = $11;
 HEAP32[$12>>2] = $9;
 $13 = (($11) + 4)|0;
 $14 = $13;
 HEAP32[$14>>2] = $10;
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($10);
 return ($9|0);
}
function _emscripten_atomic_xor_u64($addr,$0,$1) {
 $addr = $addr|0;
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and = 0, $arrayidx = 0, $call$i = 0, $call1$i = 0, $call3 = 0, $cmp$i = 0, $shr = 0;
 var $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $addr;
 $shr = $2 >>> 3;
 $and = $shr & 255;
 $arrayidx = (7148 + ($and<<2)|0);
 while(1) {
  while(1) {
   $call$i = (Atomics_load(HEAP32, $arrayidx>>2)|0);
   $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx>>2, $call$i, 1)|0);
   $cmp$i = ($call$i|0)==($call1$i|0);
   if ($cmp$i) {
    break;
   }
  }
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   break;
  }
 }
 $3 = $addr;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = $5 ^ $0;
 $10 = $8 ^ $1;
 $11 = $addr;
 $12 = $11;
 HEAP32[$12>>2] = $9;
 $13 = (($11) + 4)|0;
 $14 = $13;
 HEAP32[$14>>2] = $10;
 $call3 = (Atomics_store(HEAP32, $arrayidx>>2, 0)|0);
 tempRet0 = ($10);
 return ($9|0);
}
function _emscripten_main_thread_process_queued_calls() {
 var $0 = 0, $1 = 0, $add = 0, $arrayidx = 0, $call = 0, $call1 = 0, $call11 = 0, $call12 = 0, $call126 = 0, $call7 = 0, $cmp = 0, $cmp7 = 0, $head$09 = 0, $or$cond = 0, $rem = 0, $tobool = 0, $tobool2 = 0, $tobool3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (_emscripten_is_main_runtime_thread()|0);
 $tobool = ($call|0)==(0);
 if ($tobool) {
  ___assert_fail((5364|0),(5486|0),424,(5579|0));
  // unreachable;
 }
 $call1 = (_emscripten_is_main_runtime_thread()|0);
 $tobool2 = ($call1|0)==(0);
 $0 = HEAP32[1647]|0;
 $tobool3 = ($0|0)!=(0);
 $or$cond = $tobool2 | $tobool3;
 if ($or$cond) {
  return;
 }
 HEAP32[1647] = 1;
 (___pthread_mutex_lock(6592)|0);
 $call7 = (Atomics_load(HEAP32, 1655)|0);
 $call126 = (Atomics_load(HEAP32, 1656)|0);
 $cmp7 = ($call7|0)==($call126|0);
 (___pthread_mutex_unlock(6592)|0);
 if (!($cmp7)) {
  $head$09 = $call7;
  while(1) {
   $arrayidx = (6628 + ($head$09<<2)|0);
   $1 = HEAP32[$arrayidx>>2]|0;
   __do_call($1);
   (___pthread_mutex_lock(6592)|0);
   $add = (($head$09) + 1)|0;
   $rem = (($add|0) % 128)&-1;
   $call11 = (Atomics_store(HEAP32, 1655, $rem)|0);
   $call12 = (Atomics_load(HEAP32, 1656)|0);
   $cmp = ($rem|0)==($call12|0);
   (___pthread_mutex_unlock(6592)|0);
   if ($cmp) {
    break;
   } else {
    $head$09 = $rem;
   }
  }
 }
 (_emscripten_futex_wake((6620|0),2147483647)|0);
 HEAP32[1647] = 0;
 return;
}
function _emscripten_sync_run_in_main_thread($call) {
 $call = $call|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _emscripten_async_run_in_main_thread($call);
 (_emscripten_wait_for_call_v($call,inf)|0);
 return;
}
function _emscripten_sync_run_in_main_thread_0($function) {
 $function = $function|0;
 var $0 = 0, $q = 0, $returnValue = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $q = sp;
 dest=$q; stop=dest+96|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 HEAP32[$q>>2] = $function;
 $returnValue = ((($q)) + 80|0);
 HEAP32[$returnValue>>2] = 0;
 _emscripten_async_run_in_main_thread($q);
 (_emscripten_wait_for_call_v($q,inf)|0);
 $0 = HEAP32[$returnValue>>2]|0;
 STACKTOP = sp;return ($0|0);
}
function _emscripten_sync_run_in_main_thread_1($function,$arg1) {
 $function = $function|0;
 $arg1 = $arg1|0;
 var $0 = 0, $arrayidx = 0, $q = 0, $returnValue = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $q = sp;
 dest=$q; stop=dest+96|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 HEAP32[$q>>2] = $function;
 $arrayidx = ((($q)) + 16|0);
 HEAP32[$arrayidx>>2] = $arg1;
 $returnValue = ((($q)) + 80|0);
 HEAP32[$returnValue>>2] = 0;
 _emscripten_async_run_in_main_thread($q);
 (_emscripten_wait_for_call_v($q,inf)|0);
 $0 = HEAP32[$returnValue>>2]|0;
 STACKTOP = sp;return ($0|0);
}
function _emscripten_sync_run_in_main_thread_2($function,$arg1,$arg2) {
 $function = $function|0;
 $arg1 = $arg1|0;
 $arg2 = $arg2|0;
 var $0 = 0, $args = 0, $arrayidx2 = 0, $q = 0, $returnValue = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $q = sp;
 dest=$q; stop=dest+96|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 HEAP32[$q>>2] = $function;
 $args = ((($q)) + 16|0);
 HEAP32[$args>>2] = $arg1;
 $arrayidx2 = ((($q)) + 24|0);
 HEAP32[$arrayidx2>>2] = $arg2;
 $returnValue = ((($q)) + 80|0);
 HEAP32[$returnValue>>2] = 0;
 _emscripten_async_run_in_main_thread($q);
 (_emscripten_wait_for_call_v($q,inf)|0);
 $0 = HEAP32[$returnValue>>2]|0;
 STACKTOP = sp;return ($0|0);
}
function _emscripten_sync_run_in_main_thread_3($function,$arg1,$arg2,$arg3) {
 $function = $function|0;
 $arg1 = $arg1|0;
 $arg2 = $arg2|0;
 $arg3 = $arg3|0;
 var $0 = 0, $args = 0, $arrayidx2 = 0, $arrayidx5 = 0, $q = 0, $returnValue = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $q = sp;
 dest=$q; stop=dest+96|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 HEAP32[$q>>2] = $function;
 $args = ((($q)) + 16|0);
 HEAP32[$args>>2] = $arg1;
 $arrayidx2 = ((($q)) + 24|0);
 HEAP32[$arrayidx2>>2] = $arg2;
 $arrayidx5 = ((($q)) + 32|0);
 HEAP32[$arrayidx5>>2] = $arg3;
 $returnValue = ((($q)) + 80|0);
 HEAP32[$returnValue>>2] = 0;
 _emscripten_async_run_in_main_thread($q);
 (_emscripten_wait_for_call_v($q,inf)|0);
 $0 = HEAP32[$returnValue>>2]|0;
 STACKTOP = sp;return ($0|0);
}
function _emscripten_sync_run_in_main_thread_4($function,$arg1,$arg2,$arg3,$arg4) {
 $function = $function|0;
 $arg1 = $arg1|0;
 $arg2 = $arg2|0;
 $arg3 = $arg3|0;
 $arg4 = $arg4|0;
 var $0 = 0, $args = 0, $arrayidx2 = 0, $arrayidx5 = 0, $arrayidx8 = 0, $q = 0, $returnValue = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $q = sp;
 dest=$q; stop=dest+96|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 HEAP32[$q>>2] = $function;
 $args = ((($q)) + 16|0);
 HEAP32[$args>>2] = $arg1;
 $arrayidx2 = ((($q)) + 24|0);
 HEAP32[$arrayidx2>>2] = $arg2;
 $arrayidx5 = ((($q)) + 32|0);
 HEAP32[$arrayidx5>>2] = $arg3;
 $arrayidx8 = ((($q)) + 40|0);
 HEAP32[$arrayidx8>>2] = $arg4;
 $returnValue = ((($q)) + 80|0);
 HEAP32[$returnValue>>2] = 0;
 _emscripten_async_run_in_main_thread($q);
 (_emscripten_wait_for_call_v($q,inf)|0);
 $0 = HEAP32[$returnValue>>2]|0;
 STACKTOP = sp;return ($0|0);
}
function _emscripten_sync_run_in_main_thread_5($function,$arg1,$arg2,$arg3,$arg4,$arg5) {
 $function = $function|0;
 $arg1 = $arg1|0;
 $arg2 = $arg2|0;
 $arg3 = $arg3|0;
 $arg4 = $arg4|0;
 $arg5 = $arg5|0;
 var $0 = 0, $args = 0, $arrayidx11 = 0, $arrayidx2 = 0, $arrayidx5 = 0, $arrayidx8 = 0, $q = 0, $returnValue = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $q = sp;
 dest=$q; stop=dest+96|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 HEAP32[$q>>2] = $function;
 $args = ((($q)) + 16|0);
 HEAP32[$args>>2] = $arg1;
 $arrayidx2 = ((($q)) + 24|0);
 HEAP32[$arrayidx2>>2] = $arg2;
 $arrayidx5 = ((($q)) + 32|0);
 HEAP32[$arrayidx5>>2] = $arg3;
 $arrayidx8 = ((($q)) + 40|0);
 HEAP32[$arrayidx8>>2] = $arg4;
 $arrayidx11 = ((($q)) + 48|0);
 HEAP32[$arrayidx11>>2] = $arg5;
 $returnValue = ((($q)) + 80|0);
 HEAP32[$returnValue>>2] = 0;
 _emscripten_async_run_in_main_thread($q);
 (_emscripten_wait_for_call_v($q,inf)|0);
 $0 = HEAP32[$returnValue>>2]|0;
 STACKTOP = sp;return ($0|0);
}
function _emscripten_sync_run_in_main_thread_6($function,$arg1,$arg2,$arg3,$arg4,$arg5,$arg6) {
 $function = $function|0;
 $arg1 = $arg1|0;
 $arg2 = $arg2|0;
 $arg3 = $arg3|0;
 $arg4 = $arg4|0;
 $arg5 = $arg5|0;
 $arg6 = $arg6|0;
 var $0 = 0, $args = 0, $arrayidx11 = 0, $arrayidx14 = 0, $arrayidx2 = 0, $arrayidx5 = 0, $arrayidx8 = 0, $q = 0, $returnValue = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $q = sp;
 dest=$q; stop=dest+96|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 HEAP32[$q>>2] = $function;
 $args = ((($q)) + 16|0);
 HEAP32[$args>>2] = $arg1;
 $arrayidx2 = ((($q)) + 24|0);
 HEAP32[$arrayidx2>>2] = $arg2;
 $arrayidx5 = ((($q)) + 32|0);
 HEAP32[$arrayidx5>>2] = $arg3;
 $arrayidx8 = ((($q)) + 40|0);
 HEAP32[$arrayidx8>>2] = $arg4;
 $arrayidx11 = ((($q)) + 48|0);
 HEAP32[$arrayidx11>>2] = $arg5;
 $arrayidx14 = ((($q)) + 56|0);
 HEAP32[$arrayidx14>>2] = $arg6;
 $returnValue = ((($q)) + 80|0);
 HEAP32[$returnValue>>2] = 0;
 _emscripten_async_run_in_main_thread($q);
 (_emscripten_wait_for_call_v($q,inf)|0);
 $0 = HEAP32[$returnValue>>2]|0;
 STACKTOP = sp;return ($0|0);
}
function _emscripten_sync_run_in_main_thread_7($function,$arg1,$arg2,$arg3,$arg4,$arg5,$arg6,$arg7) {
 $function = $function|0;
 $arg1 = $arg1|0;
 $arg2 = $arg2|0;
 $arg3 = $arg3|0;
 $arg4 = $arg4|0;
 $arg5 = $arg5|0;
 $arg6 = $arg6|0;
 $arg7 = $arg7|0;
 var $0 = 0, $args = 0, $arrayidx11 = 0, $arrayidx14 = 0, $arrayidx17 = 0, $arrayidx2 = 0, $arrayidx5 = 0, $arrayidx8 = 0, $q = 0, $returnValue = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $q = sp;
 dest=$q; stop=dest+96|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 HEAP32[$q>>2] = $function;
 $args = ((($q)) + 16|0);
 HEAP32[$args>>2] = $arg1;
 $arrayidx2 = ((($q)) + 24|0);
 HEAP32[$arrayidx2>>2] = $arg2;
 $arrayidx5 = ((($q)) + 32|0);
 HEAP32[$arrayidx5>>2] = $arg3;
 $arrayidx8 = ((($q)) + 40|0);
 HEAP32[$arrayidx8>>2] = $arg4;
 $arrayidx11 = ((($q)) + 48|0);
 HEAP32[$arrayidx11>>2] = $arg5;
 $arrayidx14 = ((($q)) + 56|0);
 HEAP32[$arrayidx14>>2] = $arg6;
 $arrayidx17 = ((($q)) + 64|0);
 HEAP32[$arrayidx17>>2] = $arg7;
 $returnValue = ((($q)) + 80|0);
 HEAP32[$returnValue>>2] = 0;
 _emscripten_async_run_in_main_thread($q);
 (_emscripten_wait_for_call_v($q,inf)|0);
 $0 = HEAP32[$returnValue>>2]|0;
 STACKTOP = sp;return ($0|0);
}
function _emscripten_sync_run_in_main_thread_xprintf_varargs($function,$param0,$format,$varargs) {
 $function = $function|0;
 $param0 = $param0|0;
 $format = $format|0;
 $varargs = $varargs|0;
 var $0 = 0, $1 = 0, $add = 0, $args = 0, $args11 = 0, $arrayidx13 = 0, $call = 0, $call4 = 0, $cmp = 0, $cmp17 = 0, $q = 0, $returnValue = 0, $s$0 = 0, $str = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 240|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(240|0);
 $args = sp + 96|0;
 $str = sp + 112|0;
 $q = sp;
 HEAP32[$args>>2] = $varargs;
 $call = (_vsnprintf($str,128,$format,$args)|0);
 $cmp = ($call|0)>(127);
 $add = (($call) + 1)|0;
 if ($cmp) {
  $call4 = (_malloc($add)|0);
  HEAP32[$args>>2] = $varargs;
  (_vsnprintf($call4,$add,$format,$args)|0);
  $s$0 = $call4;
 } else {
  $s$0 = $str;
 }
 dest=$q; stop=dest+96|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 HEAP32[$q>>2] = $function;
 $0 = $param0;
 $args11 = ((($q)) + 16|0);
 HEAP32[$args11>>2] = $0;
 $arrayidx13 = ((($q)) + 24|0);
 HEAP32[$arrayidx13>>2] = $s$0;
 $returnValue = ((($q)) + 80|0);
 HEAP32[$returnValue>>2] = 0;
 _emscripten_async_run_in_main_thread($q);
 (_emscripten_wait_for_call_v($q,inf)|0);
 $cmp17 = ($s$0|0)==($str|0);
 if ($cmp17) {
  $1 = HEAP32[$returnValue>>2]|0;
  STACKTOP = sp;return ($1|0);
 }
 _free($s$0);
 $1 = HEAP32[$returnValue>>2]|0;
 STACKTOP = sp;return ($1|0);
}
function ___pthread_tsd_run_dtors() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $arrayidx = 0, $arrayidx5 = 0, $call$i = 0, $cmp = 0, $exitcond = 0, $i$017 = 0, $inc = 0, $inc13 = 0, $j$019 = 0, $not_finished$116 = 0, $not_finished$2 = 0, $tobool = 0, $tobool18 = 0, $tobool4 = 0;
 var $tobool6 = 0, $tsd = 0, $tsd_used = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call$i = (_pthread_self()|0);
 $tsd_used = ((($call$i)) + 60|0);
 $0 = HEAP32[$tsd_used>>2]|0;
 $tobool18 = ($0|0)==(0);
 if ($tobool18) {
  return;
 }
 $tsd = ((($call$i)) + 116|0);
 $j$019 = 0;
 while(1) {
  $i$017 = 0;$not_finished$116 = 0;
  while(1) {
   $1 = HEAP32[$tsd>>2]|0;
   $arrayidx = (($1) + ($i$017<<2)|0);
   $2 = HEAP32[$arrayidx>>2]|0;
   $tobool4 = ($2|0)==(0|0);
   if ($tobool4) {
    $not_finished$2 = $not_finished$116;
   } else {
    $arrayidx5 = (6076 + ($i$017<<2)|0);
    $3 = (Atomics_load(HEAP32,$arrayidx5>>2)|0);
    $tobool6 = ($3|0)==(0|0);
    if ($tobool6) {
     $not_finished$2 = $not_finished$116;
    } else {
     HEAP32[$arrayidx>>2] = 0;
     $4 = (Atomics_load(HEAP32,$arrayidx5>>2)|0);
     FUNCTION_TABLE_vi[$4 & 31]($2);
     $not_finished$2 = 1;
    }
   }
   $inc = (($i$017) + 1)|0;
   $exitcond = ($inc|0)==(128);
   if ($exitcond) {
    break;
   } else {
    $i$017 = $inc;$not_finished$116 = $not_finished$2;
   }
  }
  $inc13 = (($j$019) + 1)|0;
  $tobool = ($not_finished$2|0)!=(0);
  $cmp = ($inc13|0)<(4);
  $5 = $cmp & $tobool;
  if ($5) {
   $j$019 = $inc13;
  } else {
   break;
  }
 }
 return;
}
function _emscripten_wait_for_call_v($call,$timeoutMSecs) {
 $call = $call|0;
 $timeoutMSecs = +$timeoutMSecs;
 var $$ = 0, $add = 0.0, $call1 = 0, $call2 = 0.0, $call7 = 0, $call8 = 0.0, $cmp = 0, $cmp12 = 0, $done$0$lcssa = 0, $done$1 = 0, $now$013 = 0.0, $operationDone = 0, $or$cond = 0, $sub = 0.0, $tobool = 0, $tobool3 = 0, $tobool9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $operationDone = ((($call)) + 8|0);
 $call1 = (Atomics_load(HEAP32, $operationDone>>2)|0);
 $tobool = ($call1|0)==(0);
 if (!($tobool)) {
  $done$1 = $call1;
  $tobool9 = ($done$1|0)==(0);
  $$ = $tobool9 ? -8 : 0;
  return ($$|0);
 }
 $call2 = (+_emscripten_get_now());
 $add = $call2 + $timeoutMSecs;
 _emscripten_set_current_thread_status(5);
 $cmp12 = $call2 < $add;
 if ($cmp12) {
  $now$013 = $call2;
  while(1) {
   $sub = $add - $now$013;
   (_emscripten_futex_wait(($operationDone|0),0,(+$sub))|0);
   $call7 = (Atomics_load(HEAP32, $operationDone>>2)|0);
   $call8 = (+_emscripten_get_now());
   $tobool3 = ($call7|0)==(0);
   $cmp = $call8 < $add;
   $or$cond = $tobool3 & $cmp;
   if ($or$cond) {
    $now$013 = $call8;
   } else {
    $done$0$lcssa = $call7;
    break;
   }
  }
 } else {
  $done$0$lcssa = 0;
 }
 _emscripten_set_current_thread_status(1);
 $done$1 = $done$0$lcssa;
 $tobool9 = ($done$1|0)==(0);
 $$ = $tobool9 ? -8 : 0;
 return ($$|0);
}
function __do_call($q) {
 $q = $q|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $args = 0, $args113 = 0, $args130 = 0, $args138 = 0, $args162 = 0, $args173 = 0, $args21 = 0, $args31 = 0, $args4 = 0, $args69 = 0, $args97 = 0, $arrayidx101 = 0, $arrayidx104 = 0, $arrayidx107 = 0;
 var $arrayidx117 = 0, $arrayidx126 = 0, $arrayidx134 = 0, $arrayidx142 = 0, $arrayidx145 = 0, $arrayidx15 = 0, $arrayidx155 = 0, $arrayidx166 = 0, $arrayidx177 = 0, $arrayidx180 = 0, $arrayidx2 = 0, $arrayidx25 = 0, $arrayidx35 = 0, $arrayidx38 = 0, $arrayidx45 = 0, $arrayidx52 = 0, $arrayidx59 = 0, $arrayidx73 = 0, $arrayidx76 = 0, $arrayidx8 = 0;
 var $arrayidx83 = 0, $arrayidx90 = 0, $call = 0, $call10 = 0, $call109 = 0, $call119 = 0, $call149 = 0, $call157 = 0, $call168 = 0, $call17 = 0, $call182 = 0, $call27 = 0, $call40 = 0, $call47 = 0, $call54 = 0, $call61 = 0, $call65 = 0, $call78 = 0, $call85 = 0, $call92 = 0;
 var $calleeDelete = 0, $functionPtr = 0, $functionPtr124 = 0, $functionPtr129 = 0, $functionPtr137 = 0, $functionPtr148 = 0, $functionPtr153 = 0, $functionPtr161 = 0, $functionPtr172 = 0, $operationDone = 0, $returnValue = 0, $returnValue11 = 0, $returnValue110 = 0, $returnValue120 = 0, $returnValue150 = 0, $returnValue158 = 0, $returnValue169 = 0, $returnValue18 = 0, $returnValue183 = 0, $returnValue28 = 0;
 var $returnValue41 = 0, $returnValue48 = 0, $returnValue55 = 0, $returnValue62 = 0, $returnValue66 = 0, $returnValue79 = 0, $returnValue86 = 0, $returnValue93 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$q>>2]|0;
 do {
  switch ($0|0) {
  case 12:  {
   $args = ((($q)) + 16|0);
   $1 = HEAP32[$args>>2]|0;
   $arrayidx2 = ((($q)) + 24|0);
   $2 = HEAP32[$arrayidx2>>2]|0;
   $call = (_utime(($1|0),($2|0))|0);
   $returnValue = ((($q)) + 80|0);
   HEAP32[$returnValue>>2] = $call;
   break;
  }
  case 13:  {
   $args4 = ((($q)) + 16|0);
   $3 = HEAP32[$args4>>2]|0;
   $arrayidx8 = ((($q)) + 24|0);
   $4 = HEAP32[$arrayidx8>>2]|0;
   $call10 = (_utimes(($3|0),($4|0))|0);
   $returnValue11 = ((($q)) + 80|0);
   HEAP32[$returnValue11>>2] = $call10;
   break;
  }
  case 37:  {
   $arrayidx15 = ((($q)) + 16|0);
   $5 = HEAP32[$arrayidx15>>2]|0;
   $call17 = (_chroot(($5|0))|0);
   $returnValue18 = ((($q)) + 80|0);
   HEAP32[$returnValue18>>2] = $call17;
   break;
  }
  case 46:  {
   $args21 = ((($q)) + 16|0);
   $6 = HEAP32[$args21>>2]|0;
   $arrayidx25 = ((($q)) + 24|0);
   $7 = HEAP32[$arrayidx25>>2]|0;
   $call27 = (_fpathconf(($6|0),($7|0))|0);
   $returnValue28 = ((($q)) + 80|0);
   HEAP32[$returnValue28>>2] = $call27;
   break;
  }
  case 68:  {
   $args31 = ((($q)) + 16|0);
   $8 = HEAP32[$args31>>2]|0;
   $arrayidx35 = ((($q)) + 24|0);
   $9 = HEAP32[$arrayidx35>>2]|0;
   $arrayidx38 = ((($q)) + 32|0);
   $10 = HEAP32[$arrayidx38>>2]|0;
   $call40 = (_confstr(($8|0),($9|0),($10|0))|0);
   $returnValue41 = ((($q)) + 80|0);
   HEAP32[$returnValue41>>2] = $call40;
   break;
  }
  case 72:  {
   $arrayidx45 = ((($q)) + 16|0);
   $11 = HEAP32[$arrayidx45>>2]|0;
   $call47 = (_sysconf(($11|0))|0);
   $returnValue48 = ((($q)) + 80|0);
   HEAP32[$returnValue48>>2] = $call47;
   break;
  }
  case 110:  {
   $arrayidx52 = ((($q)) + 16|0);
   $12 = HEAP32[$arrayidx52>>2]|0;
   $call54 = (_atexit(($12|0))|0);
   $returnValue55 = ((($q)) + 80|0);
   HEAP32[$returnValue55>>2] = $call54;
   break;
  }
  case 111:  {
   $arrayidx59 = ((($q)) + 16|0);
   $13 = HEAP32[$arrayidx59>>2]|0;
   $call61 = (_getenv(($13|0))|0);
   $returnValue62 = ((($q)) + 80|0);
   HEAP32[$returnValue62>>2] = $call61;
   break;
  }
  case 112:  {
   $call65 = (_clearenv()|0);
   $returnValue66 = ((($q)) + 80|0);
   HEAP32[$returnValue66>>2] = $call65;
   break;
  }
  case 113:  {
   $args69 = ((($q)) + 16|0);
   $14 = HEAP32[$args69>>2]|0;
   $arrayidx73 = ((($q)) + 24|0);
   $15 = HEAP32[$arrayidx73>>2]|0;
   $arrayidx76 = ((($q)) + 32|0);
   $16 = HEAP32[$arrayidx76>>2]|0;
   $call78 = (_setenv(($14|0),($15|0),($16|0))|0);
   $returnValue79 = ((($q)) + 80|0);
   HEAP32[$returnValue79>>2] = $call78;
   break;
  }
  case 114:  {
   $arrayidx83 = ((($q)) + 16|0);
   $17 = HEAP32[$arrayidx83>>2]|0;
   $call85 = (_unsetenv(($17|0))|0);
   $returnValue86 = ((($q)) + 80|0);
   HEAP32[$returnValue86>>2] = $call85;
   break;
  }
  case 115:  {
   $arrayidx90 = ((($q)) + 16|0);
   $18 = HEAP32[$arrayidx90>>2]|0;
   $call92 = (_putenv(($18|0))|0);
   $returnValue93 = ((($q)) + 80|0);
   HEAP32[$returnValue93>>2] = $call92;
   break;
  }
  case 119:  {
   _tzset();
   break;
  }
  case 137:  {
   $args97 = ((($q)) + 16|0);
   $19 = HEAP32[$args97>>2]|0;
   $arrayidx101 = ((($q)) + 24|0);
   $20 = HEAP32[$arrayidx101>>2]|0;
   $arrayidx104 = ((($q)) + 32|0);
   $21 = HEAP32[$arrayidx104>>2]|0;
   $arrayidx107 = ((($q)) + 40|0);
   $22 = HEAP32[$arrayidx107>>2]|0;
   $call109 = (_pthread_create(($19|0),($20|0),($21|0),($22|0))|0);
   $returnValue110 = ((($q)) + 80|0);
   HEAP32[$returnValue110>>2] = $call109;
   break;
  }
  case 138:  {
   $args113 = ((($q)) + 16|0);
   $23 = HEAP32[$args113>>2]|0;
   $arrayidx117 = ((($q)) + 24|0);
   $24 = HEAP32[$arrayidx117>>2]|0;
   $call119 = (_emscripten_syscall(($23|0),($24|0))|0);
   $returnValue120 = ((($q)) + 80|0);
   HEAP32[$returnValue120>>2] = $call119;
   break;
  }
  case 1024:  {
   $functionPtr = ((($q)) + 4|0);
   $25 = HEAP32[$functionPtr>>2]|0;
   FUNCTION_TABLE_v[$25 & 0]();
   break;
  }
  case 1025:  {
   $functionPtr124 = ((($q)) + 4|0);
   $26 = HEAP32[$functionPtr124>>2]|0;
   $arrayidx126 = ((($q)) + 16|0);
   $27 = HEAP32[$arrayidx126>>2]|0;
   FUNCTION_TABLE_vi[$26 & 31]($27);
   break;
  }
  case 1026:  {
   $functionPtr129 = ((($q)) + 4|0);
   $28 = HEAP32[$functionPtr129>>2]|0;
   $args130 = ((($q)) + 16|0);
   $29 = HEAP32[$args130>>2]|0;
   $arrayidx134 = ((($q)) + 24|0);
   $30 = HEAP32[$arrayidx134>>2]|0;
   FUNCTION_TABLE_vii[$28 & 0]($29,$30);
   break;
  }
  case 1027:  {
   $functionPtr137 = ((($q)) + 4|0);
   $31 = HEAP32[$functionPtr137>>2]|0;
   $args138 = ((($q)) + 16|0);
   $32 = HEAP32[$args138>>2]|0;
   $arrayidx142 = ((($q)) + 24|0);
   $33 = HEAP32[$arrayidx142>>2]|0;
   $arrayidx145 = ((($q)) + 32|0);
   $34 = HEAP32[$arrayidx145>>2]|0;
   FUNCTION_TABLE_viii[$31 & 0]($32,$33,$34);
   break;
  }
  case 2048:  {
   $functionPtr148 = ((($q)) + 4|0);
   $35 = HEAP32[$functionPtr148>>2]|0;
   $call149 = (FUNCTION_TABLE_i[$35 & 0]()|0);
   $returnValue150 = ((($q)) + 80|0);
   HEAP32[$returnValue150>>2] = $call149;
   break;
  }
  case 2049:  {
   $functionPtr153 = ((($q)) + 4|0);
   $36 = HEAP32[$functionPtr153>>2]|0;
   $arrayidx155 = ((($q)) + 16|0);
   $37 = HEAP32[$arrayidx155>>2]|0;
   $call157 = (FUNCTION_TABLE_ii[$36 & 1]($37)|0);
   $returnValue158 = ((($q)) + 80|0);
   HEAP32[$returnValue158>>2] = $call157;
   break;
  }
  case 2050:  {
   $functionPtr161 = ((($q)) + 4|0);
   $38 = HEAP32[$functionPtr161>>2]|0;
   $args162 = ((($q)) + 16|0);
   $39 = HEAP32[$args162>>2]|0;
   $arrayidx166 = ((($q)) + 24|0);
   $40 = HEAP32[$arrayidx166>>2]|0;
   $call168 = (FUNCTION_TABLE_iii[$38 & 0]($39,$40)|0);
   $returnValue169 = ((($q)) + 80|0);
   HEAP32[$returnValue169>>2] = $call168;
   break;
  }
  case 2051:  {
   $functionPtr172 = ((($q)) + 4|0);
   $41 = HEAP32[$functionPtr172>>2]|0;
   $args173 = ((($q)) + 16|0);
   $42 = HEAP32[$args173>>2]|0;
   $arrayidx177 = ((($q)) + 24|0);
   $43 = HEAP32[$arrayidx177>>2]|0;
   $arrayidx180 = ((($q)) + 32|0);
   $44 = HEAP32[$arrayidx180>>2]|0;
   $call182 = (FUNCTION_TABLE_iiii[$41 & 31]($42,$43,$44)|0);
   $returnValue183 = ((($q)) + 80|0);
   HEAP32[$returnValue183>>2] = $call182;
   break;
  }
  default: {
   ___assert_fail((5623|0),(5486|0),211,(5674|0));
   // unreachable;
  }
  }
 } while(0);
 $calleeDelete = ((($q)) + 88|0);
 $45 = HEAP32[$calleeDelete>>2]|0;
 $tobool = ($45|0)==(0);
 if ($tobool) {
  $operationDone = ((($q)) + 8|0);
  HEAP32[$operationDone>>2] = 1;
  (_emscripten_futex_wake(($operationDone|0),2147483647)|0);
  return;
 } else {
  _free($q);
  return;
 }
}
function ___pthread_mutex_unlock($m) {
 $m = $m|0;
 var $$pre = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $add$ptr = 0, $and = 0, $and10 = 0, $and13 = 0, $and42 = 0, $and6 = 0, $arrayidx = 0, $arrayidx17 = 0, $arrayidx26 = 0, $arrayidx30 = 0, $arrayidx41$pre$phiZ2D = 0, $arrayidx9 = 0;
 var $call$i = 0, $call$i30 = 0, $call1$i = 0, $cmp = 0, $cmp$i = 0, $cmp11 = 0, $cmp14 = 0, $cmp35 = 0, $cmp53 = 0, $cond = 0, $dec = 0, $head = 0, $or$cond = 0, $or$cond1 = 0, $pending = 0, $pending50 = 0, $retval$0 = 0, $self$0 = 0, $tid = 0, $tobool = 0;
 var $tobool23 = 0, $tobool43 = 0, $tobool47 = 0, $tobool52 = 0, $xor = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $arrayidx = ((($m)) + 8|0);
 $0 = (Atomics_load(HEAP32,$arrayidx>>2)|0);
 $1 = HEAP32[$m>>2]|0;
 $and = $1 & 15;
 $and6 = $1 & 128;
 $xor = $and6 ^ 128;
 $cmp = ($and|0)==(0);
 if ($cmp) {
  $$pre = ((($m)) + 4|0);
  $arrayidx41$pre$phiZ2D = $$pre;$self$0 = 0;
 } else {
  $call$i = (_pthread_self()|0);
  $arrayidx9 = ((($m)) + 4|0);
  $2 = (Atomics_load(HEAP32,$arrayidx9>>2)|0);
  $and10 = $2 & 2147483647;
  $tid = ((($call$i)) + 52|0);
  $3 = HEAP32[$tid>>2]|0;
  $cmp11 = ($and10|0)==($3|0);
  if (!($cmp11)) {
   $retval$0 = 1;
   return ($retval$0|0);
  }
  $and13 = $1 & 3;
  $cmp14 = ($and13|0)==(1);
  if ($cmp14) {
   $arrayidx17 = ((($m)) + 20|0);
   $4 = HEAP32[$arrayidx17>>2]|0;
   $tobool = ($4|0)==(0);
   if (!($tobool)) {
    $dec = (($4) + -1)|0;
    HEAP32[$arrayidx17>>2] = $dec;
    $retval$0 = 0;
    return ($retval$0|0);
   }
  }
  $tobool23 = ($xor|0)==(0);
  $arrayidx26 = ((($m)) + 16|0);
  if ($tobool23) {
   $pending = ((($call$i)) + 176|0);
   Atomics_store(HEAP32,$pending>>2,$arrayidx26)|0;
   ___vm_lock();
  }
  $arrayidx30 = ((($m)) + 12|0);
  $5 = HEAP32[$arrayidx30>>2]|0;
  $6 = HEAP32[$arrayidx26>>2]|0;
  Atomics_store(HEAP32,$5>>2,$6)|0;
  $head = ((($call$i)) + 168|0);
  $cmp35 = ($6|0)==($head|0);
  if ($cmp35) {
   $arrayidx41$pre$phiZ2D = $arrayidx9;$self$0 = $call$i;
  } else {
   $add$ptr = ((($6)) + -4|0);
   Atomics_store(HEAP32,$add$ptr>>2,$5)|0;
   $arrayidx41$pre$phiZ2D = $arrayidx9;$self$0 = $call$i;
  }
 }
 $and42 = $1 & 8;
 $tobool43 = ($and42|0)!=(0);
 $cond = $tobool43 ? 2147483647 : 0;
 while(1) {
  $call$i30 = (Atomics_load(HEAP32, $arrayidx41$pre$phiZ2D>>2)|0);
  $call1$i = (Atomics_compareExchange(HEAP32, $arrayidx41$pre$phiZ2D>>2, $call$i30, $cond)|0);
  $cmp$i = ($call1$i|0)==($call$i30|0);
  if ($cmp$i) {
   break;
  }
 }
 $tobool47 = ($xor|0)!=(0);
 $or$cond = $cmp | $tobool47;
 if (!($or$cond)) {
  $pending50 = ((($self$0)) + 176|0);
  Atomics_store(HEAP32,$pending50>>2,0)|0;
  ___vm_unlock();
 }
 $tobool52 = ($0|0)!=(0);
 $cmp53 = ($call$i30|0)<(0);
 $or$cond1 = $tobool52 | $cmp53;
 if (!($or$cond1)) {
  $retval$0 = 0;
  return ($retval$0|0);
 }
 (_emscripten_futex_wake(($arrayidx41$pre$phiZ2D|0),1)|0);
 $retval$0 = 0;
 return ($retval$0|0);
}
function ___vm_lock() {
 var $call$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call$i = (Atomics_add(HEAP32, 1785, 1)|0);
 return;
}
function ___vm_unlock() {
 var $0 = 0, $call$i = 0, $cmp = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call$i = (Atomics_add(HEAP32, 1785, -1)|0);
 $cmp = ($call$i|0)==(1);
 if (!($cmp)) {
  return;
 }
 $0 = (Atomics_load(HEAP32,(7144)>>2)|0);
 $tobool = ($0|0)==(0);
 if ($tobool) {
  return;
 }
 (_emscripten_futex_wake((7140|0),2147483647)|0);
 return;
}
function ___pthread_mutex_lock($m) {
 $m = $m|0;
 var $0 = 0, $and = 0, $arrayidx2 = 0, $call$i = 0, $call3 = 0, $cmp = 0, $retval$0 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$m>>2]|0;
 $and = $0 & 15;
 $cmp = ($and|0)==(0);
 if ($cmp) {
  $arrayidx2 = ((($m)) + 4|0);
  $call$i = (Atomics_compareExchange(HEAP32, $arrayidx2>>2, 0, 16)|0);
  $tobool = ($call$i|0)==(0);
  if ($tobool) {
   $retval$0 = 0;
   return ($retval$0|0);
  }
 }
 $call3 = (___pthread_mutex_timedlock($m,0)|0);
 $retval$0 = $call3;
 return ($retval$0|0);
}
function ___pthread_mutex_timedlock($m,$at) {
 $m = $m|0;
 $at = $at|0;
 var $$pre = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $and = 0, $and29 = 0, $and35 = 0, $and42 = 0, $and45 = 0, $and6 = 0, $arrayidx15 = 0, $arrayidx19 = 0, $arrayidx2 = 0, $call$i = 0, $call$i29 = 0, $call$i30 = 0;
 var $call$i31 = 0, $call$i32 = 0, $call22 = 0, $call2233 = 0, $call60 = 0, $call7 = 0, $cmp = 0, $cmp23 = 0, $cmp2334 = 0, $cmp43 = 0, $cmp47 = 0, $cmp8 = 0, $dec = 0, $lnot = 0, $or = 0, $or$cond28 = 0, $retval$2 = 0, $spins$0 = 0, $tid = 0, $tobool = 0;
 var $tobool11 = 0, $tobool16 = 0, $tobool28 = 0, $tobool30 = 0, $tobool36 = 0, $xor = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$m>>2]|0;
 $and = $0 & 15;
 $cmp = ($and|0)==(0);
 do {
  if ($cmp) {
   $arrayidx2 = ((($m)) + 4|0);
   $call$i = (Atomics_compareExchange(HEAP32, $arrayidx2>>2, 0, 16)|0);
   $tobool = ($call$i|0)==(0);
   if ($tobool) {
    $retval$2 = 0;
    return ($retval$2|0);
   } else {
    $$pre = HEAP32[$m>>2]|0;
    $1 = $$pre;
    break;
   }
  } else {
   $1 = $0;
  }
 } while(0);
 $and6 = $1 & 128;
 $xor = $and6 ^ 128;
 $call7 = (___pthread_mutex_trylock($m)|0);
 $cmp8 = ($call7|0)==(16);
 if (!($cmp8)) {
  $retval$2 = $call7;
  return ($retval$2|0);
 }
 $arrayidx15 = ((($m)) + 4|0);
 $arrayidx19 = ((($m)) + 8|0);
 $spins$0 = 100;
 while(1) {
  $dec = (($spins$0) + -1)|0;
  $tobool11 = ($spins$0|0)==(0);
  if ($tobool11) {
   break;
  }
  $2 = (Atomics_load(HEAP32,$arrayidx15>>2)|0);
  $tobool16 = ($2|0)==(0);
  if ($tobool16) {
   break;
  }
  $3 = (Atomics_load(HEAP32,$arrayidx19>>2)|0);
  $lnot = ($3|0)==(0);
  if ($lnot) {
   $spins$0 = $dec;
  } else {
   break;
  }
 }
 $call2233 = (___pthread_mutex_trylock($m)|0);
 $cmp2334 = ($call2233|0)==(16);
 if (!($cmp2334)) {
  $retval$2 = $call2233;
  return ($retval$2|0);
 }
 L18: while(1) {
  $4 = (Atomics_load(HEAP32,$arrayidx15>>2)|0);
  $tobool28 = ($4|0)==(0);
  if (!($tobool28)) {
   $and29 = $4 & 1073741824;
   $tobool30 = ($and29|0)==(0);
   $5 = HEAP32[$m>>2]|0;
   $and35 = $5 & 4;
   $tobool36 = ($and35|0)==(0);
   $or$cond28 = $tobool30 | $tobool36;
   if ($or$cond28) {
    $and42 = $5 & 3;
    $cmp43 = ($and42|0)==(2);
    if ($cmp43) {
     $and45 = $4 & 2147483647;
     $call$i30 = (_pthread_self()|0);
     $tid = ((($call$i30)) + 52|0);
     $6 = HEAP32[$tid>>2]|0;
     $cmp47 = ($and45|0)==($6|0);
     if ($cmp47) {
      $retval$2 = 35;
      label = 17;
      break;
     }
    }
    $call$i31 = (Atomics_add(HEAP32, $arrayidx19>>2, 1)|0);
    $or = $4 | -2147483648;
    $call$i32 = (Atomics_compareExchange(HEAP32, $arrayidx15>>2, $4, $or)|0);
    $call60 = (___timedwait($arrayidx15,$or,0,$at,$xor)|0);
    $call$i29 = (Atomics_sub(HEAP32, $arrayidx19>>2, 1)|0);
    switch ($call60|0) {
    case 0: case 4:  {
     break;
    }
    default: {
     $retval$2 = $call60;
     label = 17;
     break L18;
    }
    }
   }
  }
  $call22 = (___pthread_mutex_trylock($m)|0);
  $cmp23 = ($call22|0)==(16);
  if (!($cmp23)) {
   $retval$2 = $call22;
   label = 17;
   break;
  }
 }
 if ((label|0) == 17) {
  return ($retval$2|0);
 }
 return (0)|0;
}
function ___timedwait($addr,$val,$clk,$at,$priv) {
 $addr = $addr|0;
 $val = $val|0;
 $clk = $clk|0;
 $at = $at|0;
 $priv = $priv|0;
 var $0 = 0, $call1 = 0, $cs = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $cs = sp;
 (___pthread_setcancelstate(1,($cs|0))|0);
 _emscripten_conditional_set_current_thread_status(1,4);
 $call1 = (___timedwait_cp($addr,$val,$clk,$at,$priv)|0);
 _emscripten_conditional_set_current_thread_status(4,1);
 $0 = HEAP32[$cs>>2]|0;
 (___pthread_setcancelstate(($0|0),(0|0))|0);
 STACKTOP = sp;return ($call1|0);
}
function ___timedwait_cp($addr,$val,$clk,$at,$priv) {
 $addr = $addr|0;
 $val = $val|0;
 $clk = $clk|0;
 $at = $at|0;
 $priv = $priv|0;
 var $$waitMsecs$0$us = 0.0, $$waitMsecs$028 = 0.0, $$waitMsecs$029$us = 0.0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $add = 0, $call = 0, $call24 = 0, $call25 = 0, $call25$us = 0, $call25$us34 = 0, $call26 = 0, $call26$us = 0, $call26$us35 = 0, $call34$us = 0.0, $call34$us42 = 0.0;
 var $call45 = 0, $call45$us = 0, $call45$us48 = 0, $cmp = 0, $cmp14 = 0, $cmp20 = 0, $cmp35$us = 0, $cmp35$us43 = 0, $cmp38$us = 0, $cmp38$us44 = 0, $cmp42$us = 0, $dec = 0, $retval$1 = 0, $retval$1$ph = 0, $retval$1$ph65 = 0, $retval$1$ph67 = 0, $sub = 0, $sub12 = 0, $sub46 = 0, $sub46$us = 0;
 var $sub46$us49 = 0, $to = 0, $tobool1 = 0, $tobool27 = 0, $tobool27$us = 0, $tobool27$us36 = 0, $tobool30 = 0, $tobool5 = 0, $tv_nsec = 0, $tv_nsec11 = 0, $waitMsecs$0$us = 0.0, $waitMsecs$0$us45 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $to = sp;
 $tobool1 = ($at|0)!=(0|0);
 if ($tobool1) {
  $tv_nsec = ((($at)) + 4|0);
  $0 = HEAP32[$tv_nsec>>2]|0;
  $cmp = ($0>>>0)>(999999999);
  if ($cmp) {
   $retval$1 = 22;
   STACKTOP = sp;return ($retval$1|0);
  }
  $call = (___clock_gettime(($clk|0),($to|0))|0);
  $tobool5 = ($call|0)==(0);
  if (!($tobool5)) {
   $retval$1 = 22;
   STACKTOP = sp;return ($retval$1|0);
  }
  $1 = HEAP32[$at>>2]|0;
  $2 = HEAP32[$to>>2]|0;
  $sub = (($1) - ($2))|0;
  HEAP32[$to>>2] = $sub;
  $3 = HEAP32[$tv_nsec>>2]|0;
  $tv_nsec11 = ((($to)) + 4|0);
  $4 = HEAP32[$tv_nsec11>>2]|0;
  $sub12 = (($3) - ($4))|0;
  HEAP32[$tv_nsec11>>2] = $sub12;
  $cmp14 = ($sub12|0)<(0);
  if ($cmp14) {
   $dec = (($sub) + -1)|0;
   HEAP32[$to>>2] = $dec;
   $add = (($sub12) + 1000000000)|0;
   HEAP32[$tv_nsec11>>2] = $add;
   $5 = $dec;
  } else {
   $5 = $sub;
  }
  $cmp20 = ($5|0)<(0);
  if ($cmp20) {
   $retval$1 = 110;
   STACKTOP = sp;return ($retval$1|0);
  }
 }
 $call24 = (_emscripten_is_main_runtime_thread()|0);
 $tobool30 = ($call24|0)!=(0);
 $$waitMsecs$028 = $tobool30 ? 1.0 : 100.0;
 if ($tobool30) {
  L15: while(1) {
   $call25$us = (_pthread_self()|0);
   $call26$us = (__pthread_isduecanceled($call25$us)|0);
   $tobool27$us = ($call26$us|0)==(0);
   if (!($tobool27$us)) {
    $retval$1$ph = 125;
    break;
   }
   _emscripten_main_thread_process_queued_calls();
   if ($tobool1) {
    $call34$us = (+__pthread_msecs_until($at));
    $cmp35$us = !($call34$us <= 0.0);
    $cmp38$us = $call34$us > 100.0;
    $waitMsecs$0$us = $cmp38$us ? 100.0 : $call34$us;
    $cmp42$us = $waitMsecs$0$us > 1.0;
    $$waitMsecs$0$us = $cmp42$us ? 1.0 : $waitMsecs$0$us;
    if ($cmp35$us) {
     $$waitMsecs$029$us = $$waitMsecs$0$us;
    } else {
     $retval$1$ph = 110;
     break;
    }
   } else {
    $$waitMsecs$029$us = $$waitMsecs$028;
   }
   $call45$us = (_emscripten_futex_wait(($addr|0),($val|0),(+$$waitMsecs$029$us))|0);
   $sub46$us = (0 - ($call45$us))|0;
   switch ($sub46$us|0) {
   case 110:  {
    break;
   }
   case 4: case 125:  {
    $retval$1$ph = $sub46$us;
    break L15;
    break;
   }
   default: {
    $retval$1 = 0;
    label = 21;
    break L15;
   }
   }
  }
  if ((label|0) == 21) {
   STACKTOP = sp;return ($retval$1|0);
  }
  $retval$1 = $retval$1$ph;
  STACKTOP = sp;return ($retval$1|0);
 }
 if (!($tobool1)) {
  L27: while(1) {
   $call25 = (_pthread_self()|0);
   $call26 = (__pthread_isduecanceled($call25)|0);
   $tobool27 = ($call26|0)==(0);
   if (!($tobool27)) {
    $retval$1$ph67 = 125;
    break;
   }
   $call45 = (_emscripten_futex_wait(($addr|0),($val|0),(+$$waitMsecs$028))|0);
   $sub46 = (0 - ($call45))|0;
   switch ($sub46|0) {
   case 110:  {
    break;
   }
   case 4: case 125:  {
    $retval$1$ph67 = $sub46;
    break L27;
    break;
   }
   default: {
    $retval$1 = 0;
    label = 21;
    break L27;
   }
   }
  }
  if ((label|0) == 21) {
   STACKTOP = sp;return ($retval$1|0);
  }
  $retval$1 = $retval$1$ph67;
  STACKTOP = sp;return ($retval$1|0);
 }
 L34: while(1) {
  $call25$us34 = (_pthread_self()|0);
  $call26$us35 = (__pthread_isduecanceled($call25$us34)|0);
  $tobool27$us36 = ($call26$us35|0)==(0);
  if (!($tobool27$us36)) {
   $retval$1$ph65 = 125;
   break;
  }
  $call34$us42 = (+__pthread_msecs_until($at));
  $cmp35$us43 = !($call34$us42 <= 0.0);
  if (!($cmp35$us43)) {
   $retval$1$ph65 = 110;
   break;
  }
  $cmp38$us44 = $call34$us42 > 100.0;
  $waitMsecs$0$us45 = $cmp38$us44 ? 100.0 : $call34$us42;
  $call45$us48 = (_emscripten_futex_wait(($addr|0),($val|0),(+$waitMsecs$0$us45))|0);
  $sub46$us49 = (0 - ($call45$us48))|0;
  switch ($sub46$us49|0) {
  case 110:  {
   break;
  }
  case 4: case 125:  {
   $retval$1$ph65 = $sub46$us49;
   break L34;
   break;
  }
  default: {
   $retval$1 = 0;
   label = 21;
   break L34;
  }
  }
 }
 if ((label|0) == 21) {
  STACKTOP = sp;return ($retval$1|0);
 }
 $retval$1 = $retval$1$ph65;
 STACKTOP = sp;return ($retval$1|0);
}
function __pthread_isduecanceled($pthread_ptr) {
 $pthread_ptr = $pthread_ptr|0;
 var $0 = 0, $cmp = 0, $conv = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$pthread_ptr>>2]|0;
 $cmp = ($0|0)==(2);
 $conv = $cmp&1;
 return ($conv|0);
}
function __pthread_msecs_until($at) {
 $at = $at|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $add = 0.0, $add8 = 0.0, $conv = 0.0, $conv1 = 0.0, $conv4 = 0.0, $conv6 = 0.0, $mul = 0.0, $mul2 = 0.0, $mul5 = 0.0, $mul7 = 0.0, $sub = 0.0, $t = 0, $tv_nsec = 0, $tv_usec = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $t = sp;
 (_gettimeofday(($t|0),(0|0))|0);
 $0 = HEAP32[$t>>2]|0;
 $conv = (+($0|0));
 $mul = $conv * 1000.0;
 $tv_usec = ((($t)) + 4|0);
 $1 = HEAP32[$tv_usec>>2]|0;
 $conv1 = (+($1|0));
 $mul2 = $conv1 * 0.001;
 $add = $mul + $mul2;
 $2 = HEAP32[$at>>2]|0;
 $conv4 = (+($2|0));
 $mul5 = $conv4 * 1000.0;
 $tv_nsec = ((($at)) + 4|0);
 $3 = HEAP32[$tv_nsec>>2]|0;
 $conv6 = (+($3|0));
 $mul7 = $conv6 * 9.9999999999999995E-7;
 $add8 = $mul5 + $mul7;
 $sub = $add8 - $add;
 STACKTOP = sp;return (+$sub);
}
function ___pthread_mutex_trylock($m) {
 $m = $m|0;
 var $0 = 0, $and = 0, $and3 = 0, $arrayidx2 = 0, $call$i = 0, $call4 = 0, $cmp = 0, $retval$0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$m>>2]|0;
 $and = $0 & 15;
 $cmp = ($and|0)==(0);
 if ($cmp) {
  $arrayidx2 = ((($m)) + 4|0);
  $call$i = (Atomics_compareExchange(HEAP32, $arrayidx2>>2, 0, 16)|0);
  $and3 = $call$i & 16;
  $retval$0 = $and3;
  return ($retval$0|0);
 } else {
  $call4 = (___pthread_mutex_trylock_owner($m)|0);
  $retval$0 = $call4;
  return ($retval$0|0);
 }
 return (0)|0;
}
function ___pthread_mutex_trylock_owner($m) {
 $m = $m|0;
 var $$or = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $add$ptr = 0, $and22 = 0, $and4 = 0, $and47 = 0, $and49 = 0, $and5 = 0, $arrayidx3 = 0, $arrayidx36 = 0, $arrayidx42 = 0, $arrayidx64 = 0;
 var $arrayidx69 = 0, $arrayidx89 = 0, $arrayidx9 = 0, $call$i = 0, $call$i43 = 0, $cmp = 0, $cmp10 = 0, $cmp16 = 0, $cmp56 = 0, $cmp6 = 0, $cmp72 = 0, $inc = 0, $off = 0, $or = 0, $or$cond = 0, $or$cond42 = 0, $or93 = 0, $pending = 0, $pending59 = 0, $pending84 = 0;
 var $retval$1 = 0, $robust_list61 = 0, $tid$1 = 0, $tid1 = 0, $tobool = 0, $tobool24 = 0, $tobool37 = 0, $tobool45 = 0, $tobool48 = 0, $tobool50 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$m>>2]|0;
 $call$i = (_pthread_self()|0);
 $tid1 = ((($call$i)) + 52|0);
 $1 = HEAP32[$tid1>>2]|0;
 $arrayidx3 = ((($m)) + 4|0);
 $2 = (Atomics_load(HEAP32,$arrayidx3>>2)|0);
 $and4 = $2 & 2147483647;
 $cmp = ($and4|0)==($1|0);
 $and5 = $0 & 3;
 $cmp6 = ($and5|0)==(1);
 $or$cond = $cmp6 & $cmp;
 if ($or$cond) {
  $arrayidx9 = ((($m)) + 20|0);
  $3 = HEAP32[$arrayidx9>>2]|0;
  $cmp10 = ($3>>>0)>(2147483646);
  if ($cmp10) {
   $retval$1 = 11;
   return ($retval$1|0);
  }
  $inc = (($3) + 1)|0;
  HEAP32[$arrayidx9>>2] = $inc;
  $retval$1 = 0;
  return ($retval$1|0);
 }
 $cmp16 = ($and4|0)==(2147483647);
 if ($cmp16) {
  $retval$1 = 131;
  return ($retval$1|0);
 }
 $4 = HEAP32[$m>>2]|0;
 $and22 = $4 & 128;
 $tobool = ($and22|0)==(0);
 if ($tobool) {
  $tid$1 = $1;
 } else {
  $off = ((($call$i)) + 172|0);
  $5 = HEAP32[$off>>2]|0;
  $tobool24 = ($5|0)==(0);
  if ($tobool24) {
   HEAP32[$off>>2] = -12;
  }
  $arrayidx36 = ((($m)) + 8|0);
  $6 = (Atomics_load(HEAP32,$arrayidx36>>2)|0);
  $tobool37 = ($6|0)==(0);
  $or = $1 | -2147483648;
  $$or = $tobool37 ? $1 : $or;
  $arrayidx42 = ((($m)) + 16|0);
  $pending = ((($call$i)) + 176|0);
  Atomics_store(HEAP32,$pending>>2,$arrayidx42)|0;
  $tid$1 = $$or;
 }
 $tobool45 = ($and4|0)!=(0);
 if ($tobool45) {
  $and47 = $2 & 1073741824;
  $tobool48 = ($and47|0)==(0);
  $and49 = $0 & 4;
  $tobool50 = ($and49|0)==(0);
  $or$cond42 = $tobool50 | $tobool48;
  if (!($or$cond42)) {
   label = 11;
  }
 } else {
  label = 11;
 }
 if ((label|0) == 11) {
  $call$i43 = (Atomics_compareExchange(HEAP32, $arrayidx3>>2, $2, $tid$1)|0);
  $cmp56 = ($call$i43|0)==($2|0);
  if ($cmp56) {
   $robust_list61 = ((($call$i)) + 168|0);
   $7 = (Atomics_load(HEAP32,$robust_list61>>2)|0);
   $arrayidx64 = ((($m)) + 16|0);
   HEAP32[$arrayidx64>>2] = $7;
   $arrayidx69 = ((($m)) + 12|0);
   HEAP32[$arrayidx69>>2] = $robust_list61;
   $cmp72 = ($7|0)==($robust_list61|0);
   if (!($cmp72)) {
    $add$ptr = ((($7)) + -4|0);
    Atomics_store(HEAP32,$add$ptr>>2,$arrayidx64)|0;
   }
   Atomics_store(HEAP32,$robust_list61>>2,$arrayidx64)|0;
   $pending84 = ((($call$i)) + 176|0);
   Atomics_store(HEAP32,$pending84>>2,0)|0;
   if (!($tobool45)) {
    $retval$1 = 0;
    return ($retval$1|0);
   }
   $arrayidx89 = ((($m)) + 20|0);
   HEAP32[$arrayidx89>>2] = 0;
   $8 = HEAP32[$m>>2]|0;
   $or93 = $8 | 8;
   HEAP32[$m>>2] = $or93;
   $retval$1 = 130;
   return ($retval$1|0);
  }
 }
 $pending59 = ((($call$i)) + 176|0);
 Atomics_store(HEAP32,$pending59>>2,0)|0;
 $retval$1 = 16;
 return ($retval$1|0);
}
function _pthread_mutexattr_destroy($a) {
 $a = $a|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function _pthread_mutexattr_init($a) {
 $a = $a|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$a>>2] = 0;
 return 0;
}
function _pthread_mutex_init($m,$a) {
 $m = $m|0;
 $a = $a|0;
 var $$compoundliteral$sroa$0 = 0, $0 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$compoundliteral$sroa$0 = sp;
 ;HEAP32[$$compoundliteral$sroa$0>>2]=0|0;HEAP32[$$compoundliteral$sroa$0+4>>2]=0|0;HEAP32[$$compoundliteral$sroa$0+8>>2]=0|0;HEAP32[$$compoundliteral$sroa$0+12>>2]=0|0;HEAP32[$$compoundliteral$sroa$0+16>>2]=0|0;HEAP32[$$compoundliteral$sroa$0+20>>2]=0|0;HEAP32[$$compoundliteral$sroa$0+24>>2]=0|0;
 ;HEAP32[$m>>2]=HEAP32[$$compoundliteral$sroa$0>>2]|0;HEAP32[$m+4>>2]=HEAP32[$$compoundliteral$sroa$0+4>>2]|0;HEAP32[$m+8>>2]=HEAP32[$$compoundliteral$sroa$0+8>>2]|0;HEAP32[$m+12>>2]=HEAP32[$$compoundliteral$sroa$0+12>>2]|0;HEAP32[$m+16>>2]=HEAP32[$$compoundliteral$sroa$0+16>>2]|0;HEAP32[$m+20>>2]=HEAP32[$$compoundliteral$sroa$0+20>>2]|0;HEAP32[$m+24>>2]=HEAP32[$$compoundliteral$sroa$0+24>>2]|0;
 $tobool = ($a|0)==(0|0);
 if ($tobool) {
  STACKTOP = sp;return 0;
 }
 $0 = HEAP32[$a>>2]|0;
 HEAP32[$m>>2] = $0;
 STACKTOP = sp;return 0;
}
function _malloc($bytes) {
 $bytes = $bytes|0;
 var $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i176 = 0, $$pre$i49$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i177Z2D = 0, $$pre$phi$i52$iZ2D = 0, $$pre$phi$iZ2D = 0, $$pre$phiZ2D = 0, $$pre5$i$i = 0, $$sink$i = 0, $$sink$i$i = 0, $$sink$i155 = 0, $$sink2$i = 0, $$sink2$i173 = 0, $$sink5$i = 0, $$v$0$i = 0, $0 = 0, $1 = 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0;
 var $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0;
 var $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0;
 var $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0;
 var $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $F$0$i$i = 0, $F113$0 = 0, $F197$0$i = 0, $F224$0$i$i = 0, $F290$0$i = 0, $I252$0$i$i = 0, $I316$0$i = 0, $I57$0$i$i = 0;
 var $K105$0$i$i = 0, $K305$0$i$i = 0, $K373$0$i = 0, $R$1$i = 0, $R$1$i$i = 0, $R$1$i166 = 0, $R$3$i = 0, $R$3$i$i = 0, $R$3$i169 = 0, $RP$1$i = 0, $RP$1$i$i = 0, $RP$1$i165 = 0, $T$0$i = 0, $T$0$i$i = 0, $T$0$i56$i = 0, $add$i = 0, $add$i$i = 0, $add$i146 = 0, $add$i181 = 0, $add$ptr = 0;
 var $add$ptr$i = 0, $add$ptr$i$i = 0, $add$ptr$i$i$i = 0, $add$ptr$i10$i = 0, $add$ptr$i12$i = 0, $add$ptr$i159 = 0, $add$ptr$i192 = 0, $add$ptr$i2$i$i = 0, $add$ptr$i23$i = 0, $add$ptr104 = 0, $add$ptr107 = 0, $add$ptr14$i$i = 0, $add$ptr15$i$i = 0, $add$ptr16$i$i = 0, $add$ptr17$i$i = 0, $add$ptr176 = 0, $add$ptr179 = 0, $add$ptr181$i = 0, $add$ptr188 = 0, $add$ptr190$i = 0;
 var $add$ptr192 = 0, $add$ptr193$i = 0, $add$ptr2$i$i = 0, $add$ptr203 = 0, $add$ptr205$i$i = 0, $add$ptr209 = 0, $add$ptr212$i$i = 0, $add$ptr225$i = 0, $add$ptr231$i = 0, $add$ptr24$i$i = 0, $add$ptr266$i = 0, $add$ptr273$i = 0, $add$ptr273$i205 = 0, $add$ptr282$i = 0, $add$ptr3$i$i = 0, $add$ptr30$i$i = 0, $add$ptr369$i$i = 0, $add$ptr4$i$i = 0, $add$ptr4$i$i$i = 0, $add$ptr4$i17$i = 0;
 var $add$ptr4$i28$i = 0, $add$ptr441$i = 0, $add$ptr5$i$i = 0, $add$ptr6$i$i = 0, $add$ptr6$i$i$i = 0, $add$ptr6$i21$i = 0, $add$ptr7$i$i = 0, $add$ptr81$i$i = 0, $add10$i = 0, $add102$i = 0, $add111$i = 0, $add13$i = 0, $add14$i = 0, $add144$i = 0, $add154 = 0, $add154$i = 0, $add16 = 0, $add17$i = 0, $add17$i184 = 0, $add177$i = 0;
 var $add18$i = 0, $add19$i = 0, $add20$i = 0, $add206$i$i = 0, $add216$i = 0, $add219$i = 0, $add22$i = 0, $add250$i = 0, $add26$i$i = 0, $add268$i = 0, $add269$i$i = 0, $add274$i$i = 0, $add278$i$i = 0, $add280$i$i = 0, $add283$i$i = 0, $add337$i = 0, $add342$i = 0, $add346$i = 0, $add348$i = 0, $add351$i = 0;
 var $add47$i = 0, $add52$i = 0, $add55$i = 0, $add59 = 0, $add63 = 0, $add67 = 0, $add71 = 0, $add73 = 0, $add74$i$i = 0, $add78$i = 0, $add78$i189 = 0, $add79$i$i = 0, $add82$i = 0, $add83$i$i = 0, $add85$i$i = 0, $add86$i = 0, $add88$i$i = 0, $add9 = 0, $add9$i = 0, $add90$i = 0;
 var $add92$i = 0, $and = 0, $and$i = 0, $and$i$i = 0, $and$i$i$i = 0, $and$i13$i = 0, $and$i143 = 0, $and$i24$i = 0, $and$i36$i = 0, $and10 = 0, $and100$i = 0, $and103$i = 0, $and105$i = 0, $and11$add52$i = 0, $and11$i = 0, $and115 = 0, $and119$i$i = 0, $and12 = 0, $and12$i = 0, $and13$i = 0;
 var $and13$i$i = 0, $and133$i$i = 0, $and15 = 0, $and155 = 0, $and17$i = 0, $and194$i = 0, $and198$i = 0, $and199$i = 0, $and209$i$i = 0, $and21$i = 0, $and21$i149 = 0, $and218 = 0, $and22 = 0, $and227$i$i = 0, $and240$i = 0, $and264$i$i = 0, $and268$i$i = 0, $and273$i$i = 0, $and282$i$i = 0, $and29$i = 0;
 var $and292$i = 0, $and295$i$i = 0, $and3$i = 0, $and3$i$i = 0, $and3$i$i$i = 0, $and3$i15$i = 0, $and3$i26$i = 0, $and30$i = 0, $and318$i$i = 0, $and32$i = 0, $and32$i$i = 0, $and33$i$i = 0, $and331$i = 0, $and336$i = 0, $and341$i = 0, $and350$i = 0, $and363$i = 0, $and37$i$i = 0, $and387$i = 0, $and40$i$i = 0;
 var $and43$i = 0, $and49$i$i = 0, $and50 = 0, $and50$i = 0, $and52 = 0, $and55 = 0, $and58 = 0, $and6$i = 0, $and6$i$i = 0, $and6$i38$i = 0, $and62 = 0, $and64$i = 0, $and66 = 0, $and68$i = 0, $and69$i$i = 0, $and7$i = 0, $and7$i$i = 0, $and70 = 0, $and73$i = 0, $and73$i$i = 0;
 var $and77$i = 0, $and78$i$i = 0, $and8$i = 0, $and81$i = 0, $and81$i190 = 0, $and83 = 0, $and85$i = 0, $and87$i$i = 0, $and89$i = 0, $and9$i = 0, $and96$i$i = 0, $arrayidx = 0, $arrayidx$i = 0, $arrayidx$i$i = 0, $arrayidx$i150 = 0, $arrayidx$i32$i = 0, $arrayidx$i48$i = 0, $arrayidx103$i$i = 0, $arrayidx106$i = 0, $arrayidx107$i$i = 0;
 var $arrayidx112 = 0, $arrayidx113$i = 0, $arrayidx113$i156 = 0, $arrayidx121$i = 0, $arrayidx123$i$i = 0, $arrayidx126$i$i = 0, $arrayidx137$i = 0, $arrayidx143$i$i = 0, $arrayidx148$i = 0, $arrayidx151$i = 0, $arrayidx151$i$i = 0, $arrayidx154$i = 0, $arrayidx155$i = 0, $arrayidx161$i = 0, $arrayidx165$i = 0, $arrayidx165$i167 = 0, $arrayidx178$i$i = 0, $arrayidx184$i = 0, $arrayidx184$i$i = 0, $arrayidx195$i$i = 0;
 var $arrayidx196$i = 0, $arrayidx204$i = 0, $arrayidx212$i = 0, $arrayidx223$i$i = 0, $arrayidx228$i = 0, $arrayidx23$i = 0, $arrayidx233$i = 0, $arrayidx239$i = 0, $arrayidx245$i = 0, $arrayidx256$i = 0, $arrayidx27$i = 0, $arrayidx276$i = 0, $arrayidx287$i$i = 0, $arrayidx289$i = 0, $arrayidx290$i$i = 0, $arrayidx325$i$i = 0, $arrayidx355$i = 0, $arrayidx358$i = 0, $arrayidx394$i = 0, $arrayidx40$i = 0;
 var $arrayidx44$i = 0, $arrayidx61$i = 0, $arrayidx65$i = 0, $arrayidx71$i = 0, $arrayidx75 = 0, $arrayidx75$i = 0, $arrayidx91$i$i = 0, $arrayidx92$i$i = 0, $arrayidx94$i = 0, $arrayidx94$i154 = 0, $arrayidx96$i$i = 0, $attr$i$i = 0, $attr$i$i$i = 0, $bk = 0, $bk$i = 0, $bk$i$i = 0, $bk$i161 = 0, $bk$i53$i = 0, $bk102$i$i = 0, $bk131 = 0;
 var $bk133 = 0, $bk136$i = 0, $bk139$i$i = 0, $bk158$i$i = 0, $bk161$i$i = 0, $bk218$i = 0, $bk220$i = 0, $bk246$i$i = 0, $bk248$i$i = 0, $bk302$i$i = 0, $bk311$i = 0, $bk313$i = 0, $bk338$i$i = 0, $bk357$i$i = 0, $bk360$i$i = 0, $bk370$i = 0, $bk407$i = 0, $bk429$i = 0, $bk43$i$i = 0, $bk432$i = 0;
 var $bk47$i = 0, $bk55$i$i = 0, $bk67$i$i = 0, $bk74$i$i = 0, $bk82$i$i = 0, $bk87 = 0, $br$2$ph$i = 0, $call$i$i = 0, $call$i$i$i = 0, $call1$i$i = 0, $call1$i$i$i = 0, $call108$i = 0, $call134$i = 0, $call134$tbase$4$i = 0, $call135$i = 0, $call2 = 0, $call279$i = 0, $call38$i = 0, $call69$i = 0, $call84$i = 0;
 var $child$i$i = 0, $child166$i$i = 0, $child289$i$i = 0, $child357$i = 0, $cmp = 0, $cmp$i = 0, $cmp$i$i = 0, $cmp$i$i$i = 0, $cmp$i11$i = 0, $cmp$i14$i = 0, $cmp$i140 = 0, $cmp$i178 = 0, $cmp$i25$i = 0, $cmp$i3$i$i = 0, $cmp$i37$i = 0, $cmp$i9$i = 0, $cmp1$i = 0, $cmp100$i$i = 0, $cmp102$i = 0, $cmp104$i$i = 0;
 var $cmp106$i = 0, $cmp106$i$i = 0, $cmp107$i = 0, $cmp108 = 0, $cmp108$i$i = 0, $cmp109$i = 0, $cmp112$i$i = 0, $cmp116$i = 0, $cmp119$i = 0, $cmp119$i196 = 0, $cmp12$i = 0, $cmp120$i$i = 0, $cmp120$i57$i = 0, $cmp121$i = 0, $cmp122 = 0, $cmp123$i = 0, $cmp124$i$i = 0, $cmp126$i = 0, $cmp127$i = 0, $cmp128$i = 0;
 var $cmp128$i$i = 0, $cmp129$i = 0, $cmp13 = 0, $cmp130$i = 0, $cmp133$i = 0, $cmp133$i$i = 0, $cmp137 = 0, $cmp137$i = 0, $cmp137$i$i = 0, $cmp137$i198 = 0, $cmp138$i = 0, $cmp139$i = 0, $cmp140$i = 0, $cmp141$i = 0, $cmp142$i = 0, $cmp145$i = 0, $cmp149 = 0, $cmp15$i = 0, $cmp151$i = 0, $cmp152$i = 0;
 var $cmp153$i$i = 0, $cmp155$i = 0, $cmp155$i200 = 0, $cmp156 = 0, $cmp156$i = 0, $cmp156$i$i = 0, $cmp159$i = 0, $cmp160$i$i = 0, $cmp161$i = 0, $cmp162$i = 0, $cmp163$i = 0, $cmp166 = 0, $cmp166$i = 0, $cmp166$i201 = 0, $cmp168$i$i = 0, $cmp171$i = 0, $cmp172 = 0, $cmp172$i$i = 0, $cmp174$i = 0, $cmp18 = 0;
 var $cmp180$i = 0, $cmp185$i = 0, $cmp185$i$i = 0, $cmp189$i$i = 0, $cmp19$i = 0, $cmp190$i = 0, $cmp191$i = 0, $cmp194$i = 0, $cmp196 = 0, $cmp198$i = 0, $cmp2$i$i = 0, $cmp2$i$i$i = 0, $cmp20$i$i = 0, $cmp207$i = 0, $cmp208$i = 0, $cmp21$i = 0, $cmp213$i = 0, $cmp215$i$i = 0, $cmp217$i = 0, $cmp221$i = 0;
 var $cmp222$i = 0, $cmp228$i = 0, $cmp229$i = 0, $cmp23 = 0, $cmp232$i = 0, $cmp233$i = 0, $cmp236$i$i = 0, $cmp24 = 0, $cmp24$i = 0, $cmp24$i$i = 0, $cmp246$i = 0, $cmp250$i = 0, $cmp254$i$i = 0, $cmp258$i$i = 0, $cmp26$i = 0, $cmp261$i = 0, $cmp265$i = 0, $cmp27$i$i = 0, $cmp28$i = 0, $cmp28$i$i = 0;
 var $cmp284$i = 0, $cmp287$i = 0, $cmp3$i$i = 0, $cmp301$i = 0, $cmp306$i$i = 0, $cmp319$i = 0, $cmp319$i$i = 0, $cmp32$i = 0, $cmp32$i186 = 0, $cmp323$i = 0, $cmp327$i$i = 0, $cmp33$i = 0, $cmp332$i$i = 0, $cmp34$i = 0, $cmp34$i$i = 0, $cmp35$i = 0, $cmp350$i$i = 0, $cmp36$i = 0, $cmp36$i$i = 0, $cmp374$i = 0;
 var $cmp38 = 0, $cmp38$i$i = 0, $cmp388$i = 0, $cmp39$i = 0, $cmp396$i = 0, $cmp4 = 0, $cmp40 = 0, $cmp40$i = 0, $cmp401$i = 0, $cmp41$i$i = 0, $cmp42$i$i = 0, $cmp422$i = 0, $cmp44$i = 0, $cmp44$i$i = 0, $cmp45$i = 0, $cmp45$i153 = 0, $cmp46$i = 0, $cmp46$i$i = 0, $cmp46$i50$i = 0, $cmp48$i = 0;
 var $cmp49$i = 0, $cmp51$i = 0, $cmp54$i$i = 0, $cmp55$i = 0, $cmp56$i = 0, $cmp57$i = 0, $cmp57$i$i = 0, $cmp58$i = 0, $cmp59$i$i = 0, $cmp6 = 0, $cmp60$i$i = 0, $cmp61$i = 0, $cmp62$i = 0, $cmp63$i$i = 0, $cmp64$i = 0, $cmp65$i = 0, $cmp66$i = 0, $cmp67$i = 0, $cmp7$i$i = 0, $cmp70$i = 0;
 var $cmp72$i = 0, $cmp75$i$i = 0, $cmp76$i = 0, $cmp79 = 0, $cmp81$i = 0, $cmp81$i$i = 0, $cmp82$i = 0, $cmp83$i$i = 0, $cmp85 = 0, $cmp86$i = 0, $cmp86$i$i = 0, $cmp88 = 0, $cmp9$i$i = 0, $cmp90$i = 0, $cmp90$i193 = 0, $cmp92$i = 0, $cmp94$i = 0, $cmp95$i = 0, $cmp97$i = 0, $cmp97$i$i = 0;
 var $cmp97$i195 = 0, $cmp977$i = 0, $cond = 0, $cond$i = 0, $cond$i$i = 0, $cond$i$i$i = 0, $cond$i151 = 0, $cond$i16$i = 0, $cond$i27$i = 0, $cond$i39$i = 0, $cond115$i$i = 0, $cond13$i$i = 0, $cond15$i$i = 0, $cond2$i$i = 0, $cond3$i = 0, $cond315$i$i = 0, $cond383$i = 0, $exitcond$i$i = 0, $fd$i = 0, $fd$i$i = 0;
 var $fd$i162 = 0, $fd103$i$i = 0, $fd132 = 0, $fd139$i = 0, $fd140$i$i = 0, $fd148$i$i = 0, $fd160$i$i = 0, $fd17 = 0, $fd219$i = 0, $fd247$i$i = 0, $fd303$i$i = 0, $fd312$i = 0, $fd339$i$i = 0, $fd344$i$i = 0, $fd359$i$i = 0, $fd371$i = 0, $fd408$i = 0, $fd416$i = 0, $fd431$i = 0, $fd50$i = 0;
 var $fd54$i$i = 0, $fd59$i$i = 0, $fd68$pre$phi$i$iZ2D = 0, $fd78 = 0, $fd78$i$i = 0, $fd85$i$i = 0, $head = 0, $head$i = 0, $head$i$i = 0, $head$i$i$i = 0, $head$i152 = 0, $head$i20$i = 0, $head$i29$i = 0, $head$i40$i = 0, $head103 = 0, $head106 = 0, $head118$i$i = 0, $head178 = 0, $head179$i = 0, $head182$i = 0;
 var $head183 = 0, $head187 = 0, $head187$i = 0, $head189 = 0, $head189$i = 0, $head205 = 0, $head208 = 0, $head208$i$i = 0, $head211$i$i = 0, $head23$i$i = 0, $head26$i$i = 0, $head269$i = 0, $head271$i = 0, $head272$i = 0, $head274$i = 0, $head279$i = 0, $head281$i = 0, $head29$i = 0, $head29$i$i = 0, $head317$i$i = 0;
 var $head32$i$i = 0, $head34 = 0, $head34$i$i = 0, $head386$i = 0, $head7$i$i = 0, $head7$i$i$i = 0, $head7$i22$i = 0, $head99$i = 0, $i$01$i$i = 0, $idx$0$i = 0, $inc$i$i = 0, $index$i = 0, $index$i$i = 0, $index$i170 = 0, $index$i54$i = 0, $index288$i$i = 0, $index356$i = 0, $magic$i = 0, $magic$i$i = 0, $mem$2 = 0;
 var $nb$0 = 0, $neg = 0, $neg$i = 0, $neg$i$i = 0, $neg$i171 = 0, $neg$i183 = 0, $neg104$i = 0, $neg132$i$i = 0, $neg21 = 0, $neg49$i = 0, $neg80$i = 0, $neg82 = 0, $next$i = 0, $next$i$i = 0, $next$i$i$i = 0, $next235$i = 0, $not$cmp$i = 0, $not$cmp107$i = 0, $not$cmp114$i = 0, $not$cmp144$i$i = 0;
 var $not$cmp150$i$i = 0, $not$cmp205$i = 0, $not$cmp346$i$i = 0, $not$cmp4$i = 0, $not$cmp418$i = 0, $not$cmp494$i = 0, $oldfirst$0$i$i = 0, $or$cond$i = 0, $or$cond$i188 = 0, $or$cond1$i = 0, $or$cond1$i185 = 0, $or$cond2$i = 0, $or$cond3$i = 0, $or$cond4$i = 0, $or$cond5$i = 0, $or$cond6$i = 0, $or$cond7$i = 0, $or$cond8$i = 0, $or$cond90$i = 0, $or$i = 0;
 var $or$i$i = 0, $or$i$i$i = 0, $or$i19$i = 0, $or$i197 = 0, $or101$i$i = 0, $or102 = 0, $or105 = 0, $or119 = 0, $or177 = 0, $or178$i = 0, $or182 = 0, $or183$i = 0, $or186 = 0, $or186$i = 0, $or188$i = 0, $or19$i$i = 0, $or190 = 0, $or204 = 0, $or204$i = 0, $or207 = 0;
 var $or210$i$i = 0, $or22$i$i = 0, $or232$i$i = 0, $or268$i = 0, $or270$i = 0, $or271$i = 0, $or275$i = 0, $or278$i = 0, $or28$i$i = 0, $or280$i = 0, $or297$i = 0, $or300$i$i = 0, $or32 = 0, $or33$i$i = 0, $or35 = 0, $or368$i = 0, $or44$i$i = 0, $or49 = 0, $parent$i = 0, $parent$i$i = 0;
 var $parent$i160 = 0, $parent$i55$i = 0, $parent135$i = 0, $parent138$i$i = 0, $parent149$i = 0, $parent162$i$i = 0, $parent165$i$i = 0, $parent166$i = 0, $parent179$i$i = 0, $parent196$i$i = 0, $parent226$i = 0, $parent240$i = 0, $parent257$i = 0, $parent301$i$i = 0, $parent337$i$i = 0, $parent361$i$i = 0, $parent369$i = 0, $parent406$i = 0, $parent433$i = 0, $qsize$0$i$i = 0;
 var $retval$1 = 0, $rsize$0$i = 0, $rsize$0$lcssa$i = 0, $rsize$08$i = 0, $rsize$1$i = 0, $rsize$3$i = 0, $rsize$4$lcssa$i = 0, $rsize$49$i = 0, $rst$0$i = 0, $rst$1$i = 0, $sflags197$i = 0, $sflags239$i = 0, $shl = 0, $shl$i = 0, $shl$i$i = 0, $shl$i144 = 0, $shl$i31$i = 0, $shl$i47$i = 0, $shl111 = 0, $shl114 = 0;
 var $shl116$i$i = 0, $shl127$i$i = 0, $shl131$i$i = 0, $shl15$i = 0, $shl18$i = 0, $shl192$i = 0, $shl195$i = 0, $shl198$i = 0, $shl20 = 0, $shl222$i$i = 0, $shl226$i$i = 0, $shl265$i$i = 0, $shl270$i$i = 0, $shl276$i$i = 0, $shl279$i$i = 0, $shl288$i = 0, $shl291$i = 0, $shl294$i$i = 0, $shl31 = 0, $shl31$i = 0;
 var $shl316$i$i = 0, $shl326$i$i = 0, $shl333$i = 0, $shl338$i = 0, $shl344$i = 0, $shl347$i = 0, $shl362$i = 0, $shl384$i = 0, $shl39$i$i = 0, $shl395$i = 0, $shl44 = 0, $shl46 = 0, $shl48$i$i = 0, $shl52$i = 0, $shl60$i = 0, $shl70$i$i = 0, $shl74 = 0, $shl75$i$i = 0, $shl81 = 0, $shl81$i$i = 0;
 var $shl84$i$i = 0, $shl9$i = 0, $shl95$i$i = 0, $shl99 = 0, $shr = 0, $shr$i = 0, $shr$i$i = 0, $shr$i139 = 0, $shr$i46$i = 0, $shr11 = 0, $shr11$i = 0, $shr11$i147 = 0, $shr110 = 0, $shr110$i$i = 0, $shr12$i = 0, $shr124$i$i = 0, $shr15$i = 0, $shr16$i = 0, $shr16$i148 = 0, $shr19$i = 0;
 var $shr194$i = 0, $shr20$i = 0, $shr214$i$i = 0, $shr253$i$i = 0, $shr263$i$i = 0, $shr267$i$i = 0, $shr27$i = 0, $shr272$i$i = 0, $shr277$i$i = 0, $shr281$i$i = 0, $shr283$i = 0, $shr310$i$i = 0, $shr318$i = 0, $shr323$i$i = 0, $shr330$i = 0, $shr335$i = 0, $shr340$i = 0, $shr345$i = 0, $shr349$i = 0, $shr378$i = 0;
 var $shr392$i = 0, $shr4$i = 0, $shr42$i = 0, $shr5$i = 0, $shr5$i142 = 0, $shr54 = 0, $shr56 = 0, $shr57 = 0, $shr58$i$i = 0, $shr60 = 0, $shr61 = 0, $shr64 = 0, $shr65 = 0, $shr68 = 0, $shr68$i$i = 0, $shr69 = 0, $shr7$i = 0, $shr7$i145 = 0, $shr72 = 0, $shr72$i = 0;
 var $shr72$i$i = 0, $shr75$i = 0, $shr76$i = 0, $shr77$i$i = 0, $shr79$i = 0, $shr8$i = 0, $shr80$i = 0, $shr82$i$i = 0, $shr83$i = 0, $shr84$i = 0, $shr86$i$i = 0, $shr87$i = 0, $shr88$i = 0, $shr91$i = 0, $size$i$i = 0, $size$i$i$i = 0, $size192$i = 0, $size249$i = 0, $sizebits$0$i = 0, $sizebits$0$shl52$i = 0;
 var $sp$0$i$i = 0, $sp$0$i$i$i = 0, $sp$099$i = 0, $sp$198$i = 0, $ssize$2$ph$i = 0, $sub = 0, $sub$i = 0, $sub$i138 = 0, $sub$i182 = 0, $sub$ptr$lhs$cast$i = 0, $sub$ptr$lhs$cast$i$i = 0, $sub$ptr$lhs$cast$i42$i = 0, $sub$ptr$rhs$cast$i = 0, $sub$ptr$rhs$cast$i$i = 0, $sub$ptr$rhs$cast$i43$i = 0, $sub$ptr$sub$i = 0, $sub$ptr$sub$i$i = 0, $sub$ptr$sub$i44$i = 0, $sub$ptr$sub$tsize$4$i = 0, $sub10$i = 0;
 var $sub100 = 0, $sub100$i = 0, $sub101$i = 0, $sub101$rsize$4$i = 0, $sub113$i = 0, $sub113$i$i = 0, $sub118$i = 0, $sub14$i = 0, $sub16$i$i = 0, $sub170 = 0, $sub176$i = 0, $sub18$i$i = 0, $sub2$i = 0, $sub200 = 0, $sub22$i = 0, $sub262$i$i = 0, $sub264$i = 0, $sub266$i$i = 0, $sub271$i$i = 0, $sub275$i$i = 0;
 var $sub30$i = 0, $sub31$i = 0, $sub31$rsize$0$i = 0, $sub313$i$i = 0, $sub329$i = 0, $sub33$i = 0, $sub334$i = 0, $sub339$i = 0, $sub343$i = 0, $sub381$i = 0, $sub4$i = 0, $sub42$i = 0, $sub5$i$i = 0, $sub5$i$i$i = 0, $sub5$i18$i = 0, $sub51 = 0, $sub51$i = 0, $sub53 = 0, $sub6$i = 0, $sub63$i = 0;
 var $sub67$i = 0, $sub67$i$i = 0, $sub70$i = 0, $sub71$i$i = 0, $sub76$i$i = 0, $sub77$i = 0, $sub80$i$i = 0, $t$0$i = 0, $t$2$i = 0, $t$4$ph$i = 0, $t$4$v$4$i = 0, $t$48$i = 0, $tbase$3$i = 0, $tbase$4$i = 0, $tbase$7$i = 0, $tobool$i$i = 0, $tobool$i$i$i = 0, $tobool$i$i204 = 0, $tobool1 = 0, $tobool116 = 0;
 var $tobool199$i = 0, $tobool2$i$i = 0, $tobool2$i$i$i = 0, $tobool200$i = 0, $tobool219 = 0, $tobool228$i$i = 0, $tobool241$i = 0, $tobool293$i = 0, $tobool296$i$i = 0, $tobool3 = 0, $tobool30$i = 0, $tobool364$i = 0, $tobool97$i$i = 0, $tsize$2657583$i = 0, $tsize$3$i = 0, $tsize$4$i = 0, $tsize$7$i = 0, $v$0$i = 0, $v$0$lcssa$i = 0, $v$09$i = 0;
 var $v$1$i = 0, $v$3$i = 0, $v$4$lcssa$i = 0, $v$4$ph$i = 0, $v$410$i = 0, $xor$i = 0, $xor$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $attr$i$i$i = sp + 12|0;
 $magic$i$i = sp + 8|0;
 $attr$i$i = sp + 4|0;
 $magic$i = sp;
 $0 = HEAP32[2043]|0;
 $cmp = ($0|0)==(0);
 if ($cmp) {
  (___pthread_mutex_lock(8196)|0);
  $1 = HEAP32[2043]|0;
  $cmp$i = ($1|0)==(0);
  if ($cmp$i) {
   HEAP32[(8180)>>2] = 4096;
   HEAP32[(8176)>>2] = 4096;
   HEAP32[(8184)>>2] = -1;
   HEAP32[(8188)>>2] = -1;
   HEAP32[(8192)>>2] = 2;
   HEAP32[(8668)>>2] = 2;
   $call$i$i = (_pthread_mutexattr_init($attr$i$i)|0);
   $tobool$i$i = ($call$i$i|0)==(0);
   if ($tobool$i$i) {
    $call1$i$i = (_pthread_mutex_init((8672),$attr$i$i)|0);
    $tobool2$i$i = ($call1$i$i|0)==(0);
    if ($tobool2$i$i) {
    }
   }
   $2 = $magic$i;
   $xor$i = $2 & -16;
   $and7$i = $xor$i ^ 1431655768;
   HEAP32[$magic$i>>2] = $and7$i;
   Atomics_store(HEAP32,2043,$and7$i)|0;
  }
  (___pthread_mutex_unlock(8196)|0);
 }
 $3 = HEAP32[(8668)>>2]|0;
 $and = $3 & 2;
 $tobool1 = ($and|0)==(0);
 if (!($tobool1)) {
  $call2 = (___pthread_mutex_lock((8672))|0);
  $tobool3 = ($call2|0)==(0);
  if (!($tobool3)) {
   $retval$1 = 0;
   STACKTOP = sp;return ($retval$1|0);
  }
 }
 $cmp4 = ($bytes>>>0)<(245);
 do {
  if ($cmp4) {
   $cmp6 = ($bytes>>>0)<(11);
   $add9 = (($bytes) + 11)|0;
   $and10 = $add9 & -8;
   $cond = $cmp6 ? 16 : $and10;
   $shr = $cond >>> 3;
   $4 = HEAP32[2056]|0;
   $shr11 = $4 >>> $shr;
   $and12 = $shr11 & 3;
   $cmp13 = ($and12|0)==(0);
   if (!($cmp13)) {
    $neg = $shr11 & 1;
    $and15 = $neg ^ 1;
    $add16 = (($and15) + ($shr))|0;
    $shl = $add16 << 1;
    $arrayidx = (8264 + ($shl<<2)|0);
    $5 = ((($arrayidx)) + 8|0);
    $6 = HEAP32[$5>>2]|0;
    $fd17 = ((($6)) + 8|0);
    $7 = HEAP32[$fd17>>2]|0;
    $cmp18 = ($arrayidx|0)==($7|0);
    do {
     if ($cmp18) {
      $shl20 = 1 << $add16;
      $neg21 = $shl20 ^ -1;
      $and22 = $4 & $neg21;
      HEAP32[2056] = $and22;
     } else {
      $8 = HEAP32[(8240)>>2]|0;
      $cmp23 = ($7>>>0)<($8>>>0);
      if ($cmp23) {
       _abort();
       // unreachable;
      }
      $bk = ((($7)) + 12|0);
      $9 = HEAP32[$bk>>2]|0;
      $cmp24 = ($9|0)==($6|0);
      if ($cmp24) {
       HEAP32[$bk>>2] = $arrayidx;
       HEAP32[$5>>2] = $7;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $shl31 = $add16 << 3;
    $or32 = $shl31 | 3;
    $head = ((($6)) + 4|0);
    HEAP32[$head>>2] = $or32;
    $add$ptr = (($6) + ($shl31)|0);
    $head34 = ((($add$ptr)) + 4|0);
    $10 = HEAP32[$head34>>2]|0;
    $or35 = $10 | 1;
    HEAP32[$head34>>2] = $or35;
    $mem$2 = $fd17;
    break;
   }
   $11 = HEAP32[(8232)>>2]|0;
   $cmp38 = ($cond>>>0)>($11>>>0);
   if ($cmp38) {
    $cmp40 = ($shr11|0)==(0);
    if (!($cmp40)) {
     $shl44 = $shr11 << $shr;
     $shl46 = 2 << $shr;
     $sub = (0 - ($shl46))|0;
     $or49 = $shl46 | $sub;
     $and50 = $shl44 & $or49;
     $sub51 = (0 - ($and50))|0;
     $and52 = $and50 & $sub51;
     $sub53 = (($and52) + -1)|0;
     $shr54 = $sub53 >>> 12;
     $and55 = $shr54 & 16;
     $shr56 = $sub53 >>> $and55;
     $shr57 = $shr56 >>> 5;
     $and58 = $shr57 & 8;
     $add59 = $and58 | $and55;
     $shr60 = $shr56 >>> $and58;
     $shr61 = $shr60 >>> 2;
     $and62 = $shr61 & 4;
     $add63 = $add59 | $and62;
     $shr64 = $shr60 >>> $and62;
     $shr65 = $shr64 >>> 1;
     $and66 = $shr65 & 2;
     $add67 = $add63 | $and66;
     $shr68 = $shr64 >>> $and66;
     $shr69 = $shr68 >>> 1;
     $and70 = $shr69 & 1;
     $add71 = $add67 | $and70;
     $shr72 = $shr68 >>> $and70;
     $add73 = (($add71) + ($shr72))|0;
     $shl74 = $add73 << 1;
     $arrayidx75 = (8264 + ($shl74<<2)|0);
     $12 = ((($arrayidx75)) + 8|0);
     $13 = HEAP32[$12>>2]|0;
     $fd78 = ((($13)) + 8|0);
     $14 = HEAP32[$fd78>>2]|0;
     $cmp79 = ($arrayidx75|0)==($14|0);
     do {
      if ($cmp79) {
       $shl81 = 1 << $add73;
       $neg82 = $shl81 ^ -1;
       $and83 = $4 & $neg82;
       HEAP32[2056] = $and83;
       $18 = $and83;
      } else {
       $15 = HEAP32[(8240)>>2]|0;
       $cmp85 = ($14>>>0)<($15>>>0);
       if ($cmp85) {
        _abort();
        // unreachable;
       }
       $bk87 = ((($14)) + 12|0);
       $16 = HEAP32[$bk87>>2]|0;
       $cmp88 = ($16|0)==($13|0);
       if ($cmp88) {
        HEAP32[$bk87>>2] = $arrayidx75;
        HEAP32[$12>>2] = $14;
        $18 = $4;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $shl99 = $add73 << 3;
     $sub100 = (($shl99) - ($cond))|0;
     $or102 = $cond | 3;
     $head103 = ((($13)) + 4|0);
     HEAP32[$head103>>2] = $or102;
     $add$ptr104 = (($13) + ($cond)|0);
     $or105 = $sub100 | 1;
     $head106 = ((($add$ptr104)) + 4|0);
     HEAP32[$head106>>2] = $or105;
     $add$ptr107 = (($add$ptr104) + ($sub100)|0);
     HEAP32[$add$ptr107>>2] = $sub100;
     $cmp108 = ($11|0)==(0);
     if (!($cmp108)) {
      $17 = HEAP32[(8244)>>2]|0;
      $shr110 = $11 >>> 3;
      $shl111 = $shr110 << 1;
      $arrayidx112 = (8264 + ($shl111<<2)|0);
      $shl114 = 1 << $shr110;
      $and115 = $18 & $shl114;
      $tobool116 = ($and115|0)==(0);
      if ($tobool116) {
       $or119 = $18 | $shl114;
       HEAP32[2056] = $or119;
       $$pre = ((($arrayidx112)) + 8|0);
       $$pre$phiZ2D = $$pre;$F113$0 = $arrayidx112;
      } else {
       $19 = ((($arrayidx112)) + 8|0);
       $20 = HEAP32[$19>>2]|0;
       $21 = HEAP32[(8240)>>2]|0;
       $cmp122 = ($20>>>0)<($21>>>0);
       if ($cmp122) {
        _abort();
        // unreachable;
       } else {
        $$pre$phiZ2D = $19;$F113$0 = $20;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $17;
      $bk131 = ((($F113$0)) + 12|0);
      HEAP32[$bk131>>2] = $17;
      $fd132 = ((($17)) + 8|0);
      HEAP32[$fd132>>2] = $F113$0;
      $bk133 = ((($17)) + 12|0);
      HEAP32[$bk133>>2] = $arrayidx112;
     }
     HEAP32[(8232)>>2] = $sub100;
     HEAP32[(8244)>>2] = $add$ptr104;
     $mem$2 = $fd78;
     break;
    }
    $22 = HEAP32[(8228)>>2]|0;
    $cmp137 = ($22|0)==(0);
    if ($cmp137) {
     $nb$0 = $cond;
     label = 153;
    } else {
     $sub$i = (0 - ($22))|0;
     $and$i = $22 & $sub$i;
     $sub2$i = (($and$i) + -1)|0;
     $shr$i = $sub2$i >>> 12;
     $and3$i = $shr$i & 16;
     $shr4$i = $sub2$i >>> $and3$i;
     $shr5$i = $shr4$i >>> 5;
     $and6$i = $shr5$i & 8;
     $add$i = $and6$i | $and3$i;
     $shr7$i = $shr4$i >>> $and6$i;
     $shr8$i = $shr7$i >>> 2;
     $and9$i = $shr8$i & 4;
     $add10$i = $add$i | $and9$i;
     $shr11$i = $shr7$i >>> $and9$i;
     $shr12$i = $shr11$i >>> 1;
     $and13$i = $shr12$i & 2;
     $add14$i = $add10$i | $and13$i;
     $shr15$i = $shr11$i >>> $and13$i;
     $shr16$i = $shr15$i >>> 1;
     $and17$i = $shr16$i & 1;
     $add18$i = $add14$i | $and17$i;
     $shr19$i = $shr15$i >>> $and17$i;
     $add20$i = (($add18$i) + ($shr19$i))|0;
     $arrayidx$i = (8528 + ($add20$i<<2)|0);
     $23 = HEAP32[$arrayidx$i>>2]|0;
     $head$i = ((($23)) + 4|0);
     $24 = HEAP32[$head$i>>2]|0;
     $and21$i = $24 & -8;
     $sub22$i = (($and21$i) - ($cond))|0;
     $arrayidx233$i = ((($23)) + 16|0);
     $25 = HEAP32[$arrayidx233$i>>2]|0;
     $not$cmp4$i = ($25|0)==(0|0);
     $$sink5$i = $not$cmp4$i&1;
     $arrayidx276$i = (((($23)) + 16|0) + ($$sink5$i<<2)|0);
     $26 = HEAP32[$arrayidx276$i>>2]|0;
     $cmp287$i = ($26|0)==(0|0);
     if ($cmp287$i) {
      $rsize$0$lcssa$i = $sub22$i;$v$0$lcssa$i = $23;
     } else {
      $27 = $26;$rsize$08$i = $sub22$i;$v$09$i = $23;
      while(1) {
       $head29$i = ((($27)) + 4|0);
       $28 = HEAP32[$head29$i>>2]|0;
       $and30$i = $28 & -8;
       $sub31$i = (($and30$i) - ($cond))|0;
       $cmp32$i = ($sub31$i>>>0)<($rsize$08$i>>>0);
       $sub31$rsize$0$i = $cmp32$i ? $sub31$i : $rsize$08$i;
       $$v$0$i = $cmp32$i ? $27 : $v$09$i;
       $arrayidx23$i = ((($27)) + 16|0);
       $29 = HEAP32[$arrayidx23$i>>2]|0;
       $not$cmp$i = ($29|0)==(0|0);
       $$sink$i = $not$cmp$i&1;
       $arrayidx27$i = (((($27)) + 16|0) + ($$sink$i<<2)|0);
       $30 = HEAP32[$arrayidx27$i>>2]|0;
       $cmp28$i = ($30|0)==(0|0);
       if ($cmp28$i) {
        $rsize$0$lcssa$i = $sub31$rsize$0$i;$v$0$lcssa$i = $$v$0$i;
        break;
       } else {
        $27 = $30;$rsize$08$i = $sub31$rsize$0$i;$v$09$i = $$v$0$i;
       }
      }
     }
     $31 = HEAP32[(8240)>>2]|0;
     $cmp33$i = ($v$0$lcssa$i>>>0)<($31>>>0);
     if ($cmp33$i) {
      _abort();
      // unreachable;
     }
     $add$ptr$i = (($v$0$lcssa$i) + ($cond)|0);
     $cmp35$i = ($v$0$lcssa$i>>>0)<($add$ptr$i>>>0);
     if (!($cmp35$i)) {
      _abort();
      // unreachable;
     }
     $parent$i = ((($v$0$lcssa$i)) + 24|0);
     $32 = HEAP32[$parent$i>>2]|0;
     $bk$i = ((($v$0$lcssa$i)) + 12|0);
     $33 = HEAP32[$bk$i>>2]|0;
     $cmp40$i = ($33|0)==($v$0$lcssa$i|0);
     do {
      if ($cmp40$i) {
       $arrayidx61$i = ((($v$0$lcssa$i)) + 20|0);
       $37 = HEAP32[$arrayidx61$i>>2]|0;
       $cmp62$i = ($37|0)==(0|0);
       if ($cmp62$i) {
        $arrayidx65$i = ((($v$0$lcssa$i)) + 16|0);
        $38 = HEAP32[$arrayidx65$i>>2]|0;
        $cmp66$i = ($38|0)==(0|0);
        if ($cmp66$i) {
         $R$3$i = 0;
         break;
        } else {
         $R$1$i = $38;$RP$1$i = $arrayidx65$i;
        }
       } else {
        $R$1$i = $37;$RP$1$i = $arrayidx61$i;
       }
       while(1) {
        $arrayidx71$i = ((($R$1$i)) + 20|0);
        $39 = HEAP32[$arrayidx71$i>>2]|0;
        $cmp72$i = ($39|0)==(0|0);
        if (!($cmp72$i)) {
         $R$1$i = $39;$RP$1$i = $arrayidx71$i;
         continue;
        }
        $arrayidx75$i = ((($R$1$i)) + 16|0);
        $40 = HEAP32[$arrayidx75$i>>2]|0;
        $cmp76$i = ($40|0)==(0|0);
        if ($cmp76$i) {
         break;
        } else {
         $R$1$i = $40;$RP$1$i = $arrayidx75$i;
        }
       }
       $cmp81$i = ($RP$1$i>>>0)<($31>>>0);
       if ($cmp81$i) {
        _abort();
        // unreachable;
       } else {
        HEAP32[$RP$1$i>>2] = 0;
        $R$3$i = $R$1$i;
        break;
       }
      } else {
       $fd$i = ((($v$0$lcssa$i)) + 8|0);
       $34 = HEAP32[$fd$i>>2]|0;
       $cmp45$i = ($34>>>0)<($31>>>0);
       if ($cmp45$i) {
        _abort();
        // unreachable;
       }
       $bk47$i = ((($34)) + 12|0);
       $35 = HEAP32[$bk47$i>>2]|0;
       $cmp48$i = ($35|0)==($v$0$lcssa$i|0);
       if (!($cmp48$i)) {
        _abort();
        // unreachable;
       }
       $fd50$i = ((($33)) + 8|0);
       $36 = HEAP32[$fd50$i>>2]|0;
       $cmp51$i = ($36|0)==($v$0$lcssa$i|0);
       if ($cmp51$i) {
        HEAP32[$bk47$i>>2] = $33;
        HEAP32[$fd50$i>>2] = $34;
        $R$3$i = $33;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $cmp90$i = ($32|0)==(0|0);
     L85: do {
      if (!($cmp90$i)) {
       $index$i = ((($v$0$lcssa$i)) + 28|0);
       $41 = HEAP32[$index$i>>2]|0;
       $arrayidx94$i = (8528 + ($41<<2)|0);
       $42 = HEAP32[$arrayidx94$i>>2]|0;
       $cmp95$i = ($v$0$lcssa$i|0)==($42|0);
       do {
        if ($cmp95$i) {
         HEAP32[$arrayidx94$i>>2] = $R$3$i;
         $cond$i = ($R$3$i|0)==(0|0);
         if ($cond$i) {
          $shl$i = 1 << $41;
          $neg$i = $shl$i ^ -1;
          $and103$i = $22 & $neg$i;
          HEAP32[(8228)>>2] = $and103$i;
          break L85;
         }
        } else {
         $43 = HEAP32[(8240)>>2]|0;
         $cmp107$i = ($32>>>0)<($43>>>0);
         if ($cmp107$i) {
          _abort();
          // unreachable;
         } else {
          $arrayidx113$i = ((($32)) + 16|0);
          $44 = HEAP32[$arrayidx113$i>>2]|0;
          $not$cmp114$i = ($44|0)!=($v$0$lcssa$i|0);
          $$sink2$i = $not$cmp114$i&1;
          $arrayidx121$i = (((($32)) + 16|0) + ($$sink2$i<<2)|0);
          HEAP32[$arrayidx121$i>>2] = $R$3$i;
          $cmp126$i = ($R$3$i|0)==(0|0);
          if ($cmp126$i) {
           break L85;
          } else {
           break;
          }
         }
        }
       } while(0);
       $45 = HEAP32[(8240)>>2]|0;
       $cmp130$i = ($R$3$i>>>0)<($45>>>0);
       if ($cmp130$i) {
        _abort();
        // unreachable;
       }
       $parent135$i = ((($R$3$i)) + 24|0);
       HEAP32[$parent135$i>>2] = $32;
       $arrayidx137$i = ((($v$0$lcssa$i)) + 16|0);
       $46 = HEAP32[$arrayidx137$i>>2]|0;
       $cmp138$i = ($46|0)==(0|0);
       do {
        if (!($cmp138$i)) {
         $cmp142$i = ($46>>>0)<($45>>>0);
         if ($cmp142$i) {
          _abort();
          // unreachable;
         } else {
          $arrayidx148$i = ((($R$3$i)) + 16|0);
          HEAP32[$arrayidx148$i>>2] = $46;
          $parent149$i = ((($46)) + 24|0);
          HEAP32[$parent149$i>>2] = $R$3$i;
          break;
         }
        }
       } while(0);
       $arrayidx154$i = ((($v$0$lcssa$i)) + 20|0);
       $47 = HEAP32[$arrayidx154$i>>2]|0;
       $cmp155$i = ($47|0)==(0|0);
       if (!($cmp155$i)) {
        $48 = HEAP32[(8240)>>2]|0;
        $cmp159$i = ($47>>>0)<($48>>>0);
        if ($cmp159$i) {
         _abort();
         // unreachable;
        } else {
         $arrayidx165$i = ((($R$3$i)) + 20|0);
         HEAP32[$arrayidx165$i>>2] = $47;
         $parent166$i = ((($47)) + 24|0);
         HEAP32[$parent166$i>>2] = $R$3$i;
         break;
        }
       }
      }
     } while(0);
     $cmp174$i = ($rsize$0$lcssa$i>>>0)<(16);
     if ($cmp174$i) {
      $add177$i = (($rsize$0$lcssa$i) + ($cond))|0;
      $or178$i = $add177$i | 3;
      $head179$i = ((($v$0$lcssa$i)) + 4|0);
      HEAP32[$head179$i>>2] = $or178$i;
      $add$ptr181$i = (($v$0$lcssa$i) + ($add177$i)|0);
      $head182$i = ((($add$ptr181$i)) + 4|0);
      $49 = HEAP32[$head182$i>>2]|0;
      $or183$i = $49 | 1;
      HEAP32[$head182$i>>2] = $or183$i;
     } else {
      $or186$i = $cond | 3;
      $head187$i = ((($v$0$lcssa$i)) + 4|0);
      HEAP32[$head187$i>>2] = $or186$i;
      $or188$i = $rsize$0$lcssa$i | 1;
      $head189$i = ((($add$ptr$i)) + 4|0);
      HEAP32[$head189$i>>2] = $or188$i;
      $add$ptr190$i = (($add$ptr$i) + ($rsize$0$lcssa$i)|0);
      HEAP32[$add$ptr190$i>>2] = $rsize$0$lcssa$i;
      $cmp191$i = ($11|0)==(0);
      if (!($cmp191$i)) {
       $50 = HEAP32[(8244)>>2]|0;
       $shr194$i = $11 >>> 3;
       $shl195$i = $shr194$i << 1;
       $arrayidx196$i = (8264 + ($shl195$i<<2)|0);
       $shl198$i = 1 << $shr194$i;
       $and199$i = $4 & $shl198$i;
       $tobool200$i = ($and199$i|0)==(0);
       if ($tobool200$i) {
        $or204$i = $4 | $shl198$i;
        HEAP32[2056] = $or204$i;
        $$pre$i = ((($arrayidx196$i)) + 8|0);
        $$pre$phi$iZ2D = $$pre$i;$F197$0$i = $arrayidx196$i;
       } else {
        $51 = ((($arrayidx196$i)) + 8|0);
        $52 = HEAP32[$51>>2]|0;
        $53 = HEAP32[(8240)>>2]|0;
        $cmp208$i = ($52>>>0)<($53>>>0);
        if ($cmp208$i) {
         _abort();
         // unreachable;
        } else {
         $$pre$phi$iZ2D = $51;$F197$0$i = $52;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $50;
       $bk218$i = ((($F197$0$i)) + 12|0);
       HEAP32[$bk218$i>>2] = $50;
       $fd219$i = ((($50)) + 8|0);
       HEAP32[$fd219$i>>2] = $F197$0$i;
       $bk220$i = ((($50)) + 12|0);
       HEAP32[$bk220$i>>2] = $arrayidx196$i;
      }
      HEAP32[(8232)>>2] = $rsize$0$lcssa$i;
      HEAP32[(8244)>>2] = $add$ptr$i;
     }
     $add$ptr225$i = ((($v$0$lcssa$i)) + 8|0);
     $mem$2 = $add$ptr225$i;
    }
   } else {
    $nb$0 = $cond;
    label = 153;
   }
  } else {
   $cmp149 = ($bytes>>>0)>(4294967231);
   if ($cmp149) {
    $nb$0 = -1;
    label = 153;
   } else {
    $add154 = (($bytes) + 11)|0;
    $and155 = $add154 & -8;
    $54 = HEAP32[(8228)>>2]|0;
    $cmp156 = ($54|0)==(0);
    if ($cmp156) {
     $nb$0 = $and155;
     label = 153;
    } else {
     $sub$i138 = (0 - ($and155))|0;
     $shr$i139 = $add154 >>> 8;
     $cmp$i140 = ($shr$i139|0)==(0);
     if ($cmp$i140) {
      $idx$0$i = 0;
     } else {
      $cmp1$i = ($and155>>>0)>(16777215);
      if ($cmp1$i) {
       $idx$0$i = 31;
      } else {
       $sub4$i = (($shr$i139) + 1048320)|0;
       $shr5$i142 = $sub4$i >>> 16;
       $and$i143 = $shr5$i142 & 8;
       $shl$i144 = $shr$i139 << $and$i143;
       $sub6$i = (($shl$i144) + 520192)|0;
       $shr7$i145 = $sub6$i >>> 16;
       $and8$i = $shr7$i145 & 4;
       $add$i146 = $and8$i | $and$i143;
       $shl9$i = $shl$i144 << $and8$i;
       $sub10$i = (($shl9$i) + 245760)|0;
       $shr11$i147 = $sub10$i >>> 16;
       $and12$i = $shr11$i147 & 2;
       $add13$i = $add$i146 | $and12$i;
       $sub14$i = (14 - ($add13$i))|0;
       $shl15$i = $shl9$i << $and12$i;
       $shr16$i148 = $shl15$i >>> 15;
       $add17$i = (($sub14$i) + ($shr16$i148))|0;
       $shl18$i = $add17$i << 1;
       $add19$i = (($add17$i) + 7)|0;
       $shr20$i = $and155 >>> $add19$i;
       $and21$i149 = $shr20$i & 1;
       $add22$i = $and21$i149 | $shl18$i;
       $idx$0$i = $add22$i;
      }
     }
     $arrayidx$i150 = (8528 + ($idx$0$i<<2)|0);
     $55 = HEAP32[$arrayidx$i150>>2]|0;
     $cmp24$i = ($55|0)==(0|0);
     L128: do {
      if ($cmp24$i) {
       $rsize$3$i = $sub$i138;$t$2$i = 0;$v$3$i = 0;
       label = 90;
      } else {
       $cmp26$i = ($idx$0$i|0)==(31);
       $shr27$i = $idx$0$i >>> 1;
       $sub30$i = (25 - ($shr27$i))|0;
       $cond$i151 = $cmp26$i ? 0 : $sub30$i;
       $shl31$i = $and155 << $cond$i151;
       $rsize$0$i = $sub$i138;$rst$0$i = 0;$sizebits$0$i = $shl31$i;$t$0$i = $55;$v$0$i = 0;
       while(1) {
        $head$i152 = ((($t$0$i)) + 4|0);
        $56 = HEAP32[$head$i152>>2]|0;
        $and32$i = $56 & -8;
        $sub33$i = (($and32$i) - ($and155))|0;
        $cmp34$i = ($sub33$i>>>0)<($rsize$0$i>>>0);
        if ($cmp34$i) {
         $cmp36$i = ($sub33$i|0)==(0);
         if ($cmp36$i) {
          $rsize$49$i = 0;$t$48$i = $t$0$i;$v$410$i = $t$0$i;
          label = 94;
          break L128;
         } else {
          $rsize$1$i = $sub33$i;$v$1$i = $t$0$i;
         }
        } else {
         $rsize$1$i = $rsize$0$i;$v$1$i = $v$0$i;
        }
        $arrayidx40$i = ((($t$0$i)) + 20|0);
        $57 = HEAP32[$arrayidx40$i>>2]|0;
        $shr42$i = $sizebits$0$i >>> 31;
        $arrayidx44$i = (((($t$0$i)) + 16|0) + ($shr42$i<<2)|0);
        $58 = HEAP32[$arrayidx44$i>>2]|0;
        $cmp45$i153 = ($57|0)==(0|0);
        $cmp46$i = ($57|0)==($58|0);
        $or$cond1$i = $cmp45$i153 | $cmp46$i;
        $rst$1$i = $or$cond1$i ? $rst$0$i : $57;
        $cmp49$i = ($58|0)==(0|0);
        $not$cmp494$i = $cmp49$i ^ 1;
        $shl52$i = $not$cmp494$i&1;
        $sizebits$0$shl52$i = $sizebits$0$i << $shl52$i;
        if ($cmp49$i) {
         $rsize$3$i = $rsize$1$i;$t$2$i = $rst$1$i;$v$3$i = $v$1$i;
         label = 90;
         break;
        } else {
         $rsize$0$i = $rsize$1$i;$rst$0$i = $rst$1$i;$sizebits$0$i = $sizebits$0$shl52$i;$t$0$i = $58;$v$0$i = $v$1$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 90) {
      $cmp55$i = ($t$2$i|0)==(0|0);
      $cmp57$i = ($v$3$i|0)==(0|0);
      $or$cond$i = $cmp55$i & $cmp57$i;
      if ($or$cond$i) {
       $shl60$i = 2 << $idx$0$i;
       $sub63$i = (0 - ($shl60$i))|0;
       $or$i = $shl60$i | $sub63$i;
       $and64$i = $54 & $or$i;
       $cmp65$i = ($and64$i|0)==(0);
       if ($cmp65$i) {
        $nb$0 = $and155;
        label = 153;
        break;
       }
       $sub67$i = (0 - ($and64$i))|0;
       $and68$i = $and64$i & $sub67$i;
       $sub70$i = (($and68$i) + -1)|0;
       $shr72$i = $sub70$i >>> 12;
       $and73$i = $shr72$i & 16;
       $shr75$i = $sub70$i >>> $and73$i;
       $shr76$i = $shr75$i >>> 5;
       $and77$i = $shr76$i & 8;
       $add78$i = $and77$i | $and73$i;
       $shr79$i = $shr75$i >>> $and77$i;
       $shr80$i = $shr79$i >>> 2;
       $and81$i = $shr80$i & 4;
       $add82$i = $add78$i | $and81$i;
       $shr83$i = $shr79$i >>> $and81$i;
       $shr84$i = $shr83$i >>> 1;
       $and85$i = $shr84$i & 2;
       $add86$i = $add82$i | $and85$i;
       $shr87$i = $shr83$i >>> $and85$i;
       $shr88$i = $shr87$i >>> 1;
       $and89$i = $shr88$i & 1;
       $add90$i = $add86$i | $and89$i;
       $shr91$i = $shr87$i >>> $and89$i;
       $add92$i = (($add90$i) + ($shr91$i))|0;
       $arrayidx94$i154 = (8528 + ($add92$i<<2)|0);
       $59 = HEAP32[$arrayidx94$i154>>2]|0;
       $t$4$ph$i = $59;$v$4$ph$i = 0;
      } else {
       $t$4$ph$i = $t$2$i;$v$4$ph$i = $v$3$i;
      }
      $cmp977$i = ($t$4$ph$i|0)==(0|0);
      if ($cmp977$i) {
       $rsize$4$lcssa$i = $rsize$3$i;$v$4$lcssa$i = $v$4$ph$i;
      } else {
       $rsize$49$i = $rsize$3$i;$t$48$i = $t$4$ph$i;$v$410$i = $v$4$ph$i;
       label = 94;
      }
     }
     if ((label|0) == 94) {
      while(1) {
       label = 0;
       $head99$i = ((($t$48$i)) + 4|0);
       $60 = HEAP32[$head99$i>>2]|0;
       $and100$i = $60 & -8;
       $sub101$i = (($and100$i) - ($and155))|0;
       $cmp102$i = ($sub101$i>>>0)<($rsize$49$i>>>0);
       $sub101$rsize$4$i = $cmp102$i ? $sub101$i : $rsize$49$i;
       $t$4$v$4$i = $cmp102$i ? $t$48$i : $v$410$i;
       $arrayidx106$i = ((($t$48$i)) + 16|0);
       $61 = HEAP32[$arrayidx106$i>>2]|0;
       $not$cmp107$i = ($61|0)==(0|0);
       $$sink$i155 = $not$cmp107$i&1;
       $arrayidx113$i156 = (((($t$48$i)) + 16|0) + ($$sink$i155<<2)|0);
       $62 = HEAP32[$arrayidx113$i156>>2]|0;
       $cmp97$i = ($62|0)==(0|0);
       if ($cmp97$i) {
        $rsize$4$lcssa$i = $sub101$rsize$4$i;$v$4$lcssa$i = $t$4$v$4$i;
        break;
       } else {
        $rsize$49$i = $sub101$rsize$4$i;$t$48$i = $62;$v$410$i = $t$4$v$4$i;
        label = 94;
       }
      }
     }
     $cmp116$i = ($v$4$lcssa$i|0)==(0|0);
     if ($cmp116$i) {
      $nb$0 = $and155;
      label = 153;
     } else {
      $63 = HEAP32[(8232)>>2]|0;
      $sub118$i = (($63) - ($and155))|0;
      $cmp119$i = ($rsize$4$lcssa$i>>>0)<($sub118$i>>>0);
      if ($cmp119$i) {
       $64 = HEAP32[(8240)>>2]|0;
       $cmp121$i = ($v$4$lcssa$i>>>0)<($64>>>0);
       if ($cmp121$i) {
        _abort();
        // unreachable;
       }
       $add$ptr$i159 = (($v$4$lcssa$i) + ($and155)|0);
       $cmp123$i = ($v$4$lcssa$i>>>0)<($add$ptr$i159>>>0);
       if (!($cmp123$i)) {
        _abort();
        // unreachable;
       }
       $parent$i160 = ((($v$4$lcssa$i)) + 24|0);
       $65 = HEAP32[$parent$i160>>2]|0;
       $bk$i161 = ((($v$4$lcssa$i)) + 12|0);
       $66 = HEAP32[$bk$i161>>2]|0;
       $cmp128$i = ($66|0)==($v$4$lcssa$i|0);
       do {
        if ($cmp128$i) {
         $arrayidx151$i = ((($v$4$lcssa$i)) + 20|0);
         $70 = HEAP32[$arrayidx151$i>>2]|0;
         $cmp152$i = ($70|0)==(0|0);
         if ($cmp152$i) {
          $arrayidx155$i = ((($v$4$lcssa$i)) + 16|0);
          $71 = HEAP32[$arrayidx155$i>>2]|0;
          $cmp156$i = ($71|0)==(0|0);
          if ($cmp156$i) {
           $R$3$i169 = 0;
           break;
          } else {
           $R$1$i166 = $71;$RP$1$i165 = $arrayidx155$i;
          }
         } else {
          $R$1$i166 = $70;$RP$1$i165 = $arrayidx151$i;
         }
         while(1) {
          $arrayidx161$i = ((($R$1$i166)) + 20|0);
          $72 = HEAP32[$arrayidx161$i>>2]|0;
          $cmp162$i = ($72|0)==(0|0);
          if (!($cmp162$i)) {
           $R$1$i166 = $72;$RP$1$i165 = $arrayidx161$i;
           continue;
          }
          $arrayidx165$i167 = ((($R$1$i166)) + 16|0);
          $73 = HEAP32[$arrayidx165$i167>>2]|0;
          $cmp166$i = ($73|0)==(0|0);
          if ($cmp166$i) {
           break;
          } else {
           $R$1$i166 = $73;$RP$1$i165 = $arrayidx165$i167;
          }
         }
         $cmp171$i = ($RP$1$i165>>>0)<($64>>>0);
         if ($cmp171$i) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$RP$1$i165>>2] = 0;
          $R$3$i169 = $R$1$i166;
          break;
         }
        } else {
         $fd$i162 = ((($v$4$lcssa$i)) + 8|0);
         $67 = HEAP32[$fd$i162>>2]|0;
         $cmp133$i = ($67>>>0)<($64>>>0);
         if ($cmp133$i) {
          _abort();
          // unreachable;
         }
         $bk136$i = ((($67)) + 12|0);
         $68 = HEAP32[$bk136$i>>2]|0;
         $cmp137$i = ($68|0)==($v$4$lcssa$i|0);
         if (!($cmp137$i)) {
          _abort();
          // unreachable;
         }
         $fd139$i = ((($66)) + 8|0);
         $69 = HEAP32[$fd139$i>>2]|0;
         $cmp140$i = ($69|0)==($v$4$lcssa$i|0);
         if ($cmp140$i) {
          HEAP32[$bk136$i>>2] = $66;
          HEAP32[$fd139$i>>2] = $67;
          $R$3$i169 = $66;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $cmp180$i = ($65|0)==(0|0);
       L175: do {
        if ($cmp180$i) {
         $87 = $54;
        } else {
         $index$i170 = ((($v$4$lcssa$i)) + 28|0);
         $74 = HEAP32[$index$i170>>2]|0;
         $arrayidx184$i = (8528 + ($74<<2)|0);
         $75 = HEAP32[$arrayidx184$i>>2]|0;
         $cmp185$i = ($v$4$lcssa$i|0)==($75|0);
         do {
          if ($cmp185$i) {
           HEAP32[$arrayidx184$i>>2] = $R$3$i169;
           $cond3$i = ($R$3$i169|0)==(0|0);
           if ($cond3$i) {
            $shl192$i = 1 << $74;
            $neg$i171 = $shl192$i ^ -1;
            $and194$i = $54 & $neg$i171;
            HEAP32[(8228)>>2] = $and194$i;
            $87 = $and194$i;
            break L175;
           }
          } else {
           $76 = HEAP32[(8240)>>2]|0;
           $cmp198$i = ($65>>>0)<($76>>>0);
           if ($cmp198$i) {
            _abort();
            // unreachable;
           } else {
            $arrayidx204$i = ((($65)) + 16|0);
            $77 = HEAP32[$arrayidx204$i>>2]|0;
            $not$cmp205$i = ($77|0)!=($v$4$lcssa$i|0);
            $$sink2$i173 = $not$cmp205$i&1;
            $arrayidx212$i = (((($65)) + 16|0) + ($$sink2$i173<<2)|0);
            HEAP32[$arrayidx212$i>>2] = $R$3$i169;
            $cmp217$i = ($R$3$i169|0)==(0|0);
            if ($cmp217$i) {
             $87 = $54;
             break L175;
            } else {
             break;
            }
           }
          }
         } while(0);
         $78 = HEAP32[(8240)>>2]|0;
         $cmp221$i = ($R$3$i169>>>0)<($78>>>0);
         if ($cmp221$i) {
          _abort();
          // unreachable;
         }
         $parent226$i = ((($R$3$i169)) + 24|0);
         HEAP32[$parent226$i>>2] = $65;
         $arrayidx228$i = ((($v$4$lcssa$i)) + 16|0);
         $79 = HEAP32[$arrayidx228$i>>2]|0;
         $cmp229$i = ($79|0)==(0|0);
         do {
          if (!($cmp229$i)) {
           $cmp233$i = ($79>>>0)<($78>>>0);
           if ($cmp233$i) {
            _abort();
            // unreachable;
           } else {
            $arrayidx239$i = ((($R$3$i169)) + 16|0);
            HEAP32[$arrayidx239$i>>2] = $79;
            $parent240$i = ((($79)) + 24|0);
            HEAP32[$parent240$i>>2] = $R$3$i169;
            break;
           }
          }
         } while(0);
         $arrayidx245$i = ((($v$4$lcssa$i)) + 20|0);
         $80 = HEAP32[$arrayidx245$i>>2]|0;
         $cmp246$i = ($80|0)==(0|0);
         if ($cmp246$i) {
          $87 = $54;
         } else {
          $81 = HEAP32[(8240)>>2]|0;
          $cmp250$i = ($80>>>0)<($81>>>0);
          if ($cmp250$i) {
           _abort();
           // unreachable;
          } else {
           $arrayidx256$i = ((($R$3$i169)) + 20|0);
           HEAP32[$arrayidx256$i>>2] = $80;
           $parent257$i = ((($80)) + 24|0);
           HEAP32[$parent257$i>>2] = $R$3$i169;
           $87 = $54;
           break;
          }
         }
        }
       } while(0);
       $cmp265$i = ($rsize$4$lcssa$i>>>0)<(16);
       do {
        if ($cmp265$i) {
         $add268$i = (($rsize$4$lcssa$i) + ($and155))|0;
         $or270$i = $add268$i | 3;
         $head271$i = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$head271$i>>2] = $or270$i;
         $add$ptr273$i = (($v$4$lcssa$i) + ($add268$i)|0);
         $head274$i = ((($add$ptr273$i)) + 4|0);
         $82 = HEAP32[$head274$i>>2]|0;
         $or275$i = $82 | 1;
         HEAP32[$head274$i>>2] = $or275$i;
        } else {
         $or278$i = $and155 | 3;
         $head279$i = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$head279$i>>2] = $or278$i;
         $or280$i = $rsize$4$lcssa$i | 1;
         $head281$i = ((($add$ptr$i159)) + 4|0);
         HEAP32[$head281$i>>2] = $or280$i;
         $add$ptr282$i = (($add$ptr$i159) + ($rsize$4$lcssa$i)|0);
         HEAP32[$add$ptr282$i>>2] = $rsize$4$lcssa$i;
         $shr283$i = $rsize$4$lcssa$i >>> 3;
         $cmp284$i = ($rsize$4$lcssa$i>>>0)<(256);
         if ($cmp284$i) {
          $shl288$i = $shr283$i << 1;
          $arrayidx289$i = (8264 + ($shl288$i<<2)|0);
          $83 = HEAP32[2056]|0;
          $shl291$i = 1 << $shr283$i;
          $and292$i = $83 & $shl291$i;
          $tobool293$i = ($and292$i|0)==(0);
          do {
           if ($tobool293$i) {
            $or297$i = $83 | $shl291$i;
            HEAP32[2056] = $or297$i;
            $$pre$i176 = ((($arrayidx289$i)) + 8|0);
            $$pre$phi$i177Z2D = $$pre$i176;$F290$0$i = $arrayidx289$i;
           } else {
            $84 = ((($arrayidx289$i)) + 8|0);
            $85 = HEAP32[$84>>2]|0;
            $86 = HEAP32[(8240)>>2]|0;
            $cmp301$i = ($85>>>0)<($86>>>0);
            if (!($cmp301$i)) {
             $$pre$phi$i177Z2D = $84;$F290$0$i = $85;
             break;
            }
            _abort();
            // unreachable;
           }
          } while(0);
          HEAP32[$$pre$phi$i177Z2D>>2] = $add$ptr$i159;
          $bk311$i = ((($F290$0$i)) + 12|0);
          HEAP32[$bk311$i>>2] = $add$ptr$i159;
          $fd312$i = ((($add$ptr$i159)) + 8|0);
          HEAP32[$fd312$i>>2] = $F290$0$i;
          $bk313$i = ((($add$ptr$i159)) + 12|0);
          HEAP32[$bk313$i>>2] = $arrayidx289$i;
          break;
         }
         $shr318$i = $rsize$4$lcssa$i >>> 8;
         $cmp319$i = ($shr318$i|0)==(0);
         if ($cmp319$i) {
          $I316$0$i = 0;
         } else {
          $cmp323$i = ($rsize$4$lcssa$i>>>0)>(16777215);
          if ($cmp323$i) {
           $I316$0$i = 31;
          } else {
           $sub329$i = (($shr318$i) + 1048320)|0;
           $shr330$i = $sub329$i >>> 16;
           $and331$i = $shr330$i & 8;
           $shl333$i = $shr318$i << $and331$i;
           $sub334$i = (($shl333$i) + 520192)|0;
           $shr335$i = $sub334$i >>> 16;
           $and336$i = $shr335$i & 4;
           $add337$i = $and336$i | $and331$i;
           $shl338$i = $shl333$i << $and336$i;
           $sub339$i = (($shl338$i) + 245760)|0;
           $shr340$i = $sub339$i >>> 16;
           $and341$i = $shr340$i & 2;
           $add342$i = $add337$i | $and341$i;
           $sub343$i = (14 - ($add342$i))|0;
           $shl344$i = $shl338$i << $and341$i;
           $shr345$i = $shl344$i >>> 15;
           $add346$i = (($sub343$i) + ($shr345$i))|0;
           $shl347$i = $add346$i << 1;
           $add348$i = (($add346$i) + 7)|0;
           $shr349$i = $rsize$4$lcssa$i >>> $add348$i;
           $and350$i = $shr349$i & 1;
           $add351$i = $and350$i | $shl347$i;
           $I316$0$i = $add351$i;
          }
         }
         $arrayidx355$i = (8528 + ($I316$0$i<<2)|0);
         $index356$i = ((($add$ptr$i159)) + 28|0);
         HEAP32[$index356$i>>2] = $I316$0$i;
         $child357$i = ((($add$ptr$i159)) + 16|0);
         $arrayidx358$i = ((($child357$i)) + 4|0);
         HEAP32[$arrayidx358$i>>2] = 0;
         HEAP32[$child357$i>>2] = 0;
         $shl362$i = 1 << $I316$0$i;
         $and363$i = $87 & $shl362$i;
         $tobool364$i = ($and363$i|0)==(0);
         if ($tobool364$i) {
          $or368$i = $87 | $shl362$i;
          HEAP32[(8228)>>2] = $or368$i;
          HEAP32[$arrayidx355$i>>2] = $add$ptr$i159;
          $parent369$i = ((($add$ptr$i159)) + 24|0);
          HEAP32[$parent369$i>>2] = $arrayidx355$i;
          $bk370$i = ((($add$ptr$i159)) + 12|0);
          HEAP32[$bk370$i>>2] = $add$ptr$i159;
          $fd371$i = ((($add$ptr$i159)) + 8|0);
          HEAP32[$fd371$i>>2] = $add$ptr$i159;
          break;
         }
         $88 = HEAP32[$arrayidx355$i>>2]|0;
         $cmp374$i = ($I316$0$i|0)==(31);
         $shr378$i = $I316$0$i >>> 1;
         $sub381$i = (25 - ($shr378$i))|0;
         $cond383$i = $cmp374$i ? 0 : $sub381$i;
         $shl384$i = $rsize$4$lcssa$i << $cond383$i;
         $K373$0$i = $shl384$i;$T$0$i = $88;
         while(1) {
          $head386$i = ((($T$0$i)) + 4|0);
          $89 = HEAP32[$head386$i>>2]|0;
          $and387$i = $89 & -8;
          $cmp388$i = ($and387$i|0)==($rsize$4$lcssa$i|0);
          if ($cmp388$i) {
           label = 148;
           break;
          }
          $shr392$i = $K373$0$i >>> 31;
          $arrayidx394$i = (((($T$0$i)) + 16|0) + ($shr392$i<<2)|0);
          $shl395$i = $K373$0$i << 1;
          $90 = HEAP32[$arrayidx394$i>>2]|0;
          $cmp396$i = ($90|0)==(0|0);
          if ($cmp396$i) {
           label = 145;
           break;
          } else {
           $K373$0$i = $shl395$i;$T$0$i = $90;
          }
         }
         if ((label|0) == 145) {
          $91 = HEAP32[(8240)>>2]|0;
          $cmp401$i = ($arrayidx394$i>>>0)<($91>>>0);
          if ($cmp401$i) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$arrayidx394$i>>2] = $add$ptr$i159;
           $parent406$i = ((($add$ptr$i159)) + 24|0);
           HEAP32[$parent406$i>>2] = $T$0$i;
           $bk407$i = ((($add$ptr$i159)) + 12|0);
           HEAP32[$bk407$i>>2] = $add$ptr$i159;
           $fd408$i = ((($add$ptr$i159)) + 8|0);
           HEAP32[$fd408$i>>2] = $add$ptr$i159;
           break;
          }
         }
         else if ((label|0) == 148) {
          $fd416$i = ((($T$0$i)) + 8|0);
          $92 = HEAP32[$fd416$i>>2]|0;
          $93 = HEAP32[(8240)>>2]|0;
          $cmp422$i = ($92>>>0)>=($93>>>0);
          $not$cmp418$i = ($T$0$i>>>0)>=($93>>>0);
          $94 = $cmp422$i & $not$cmp418$i;
          if ($94) {
           $bk429$i = ((($92)) + 12|0);
           HEAP32[$bk429$i>>2] = $add$ptr$i159;
           HEAP32[$fd416$i>>2] = $add$ptr$i159;
           $fd431$i = ((($add$ptr$i159)) + 8|0);
           HEAP32[$fd431$i>>2] = $92;
           $bk432$i = ((($add$ptr$i159)) + 12|0);
           HEAP32[$bk432$i>>2] = $T$0$i;
           $parent433$i = ((($add$ptr$i159)) + 24|0);
           HEAP32[$parent433$i>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       } while(0);
       $add$ptr441$i = ((($v$4$lcssa$i)) + 8|0);
       $mem$2 = $add$ptr441$i;
      } else {
       $nb$0 = $and155;
       label = 153;
      }
     }
    }
   }
  }
 } while(0);
 L230: do {
  if ((label|0) == 153) {
   $95 = HEAP32[(8232)>>2]|0;
   $cmp166 = ($95>>>0)<($nb$0>>>0);
   if (!($cmp166)) {
    $sub170 = (($95) - ($nb$0))|0;
    $96 = HEAP32[(8244)>>2]|0;
    $cmp172 = ($sub170>>>0)>(15);
    if ($cmp172) {
     $add$ptr176 = (($96) + ($nb$0)|0);
     HEAP32[(8244)>>2] = $add$ptr176;
     HEAP32[(8232)>>2] = $sub170;
     $or177 = $sub170 | 1;
     $head178 = ((($add$ptr176)) + 4|0);
     HEAP32[$head178>>2] = $or177;
     $add$ptr179 = (($add$ptr176) + ($sub170)|0);
     HEAP32[$add$ptr179>>2] = $sub170;
     $or182 = $nb$0 | 3;
     $head183 = ((($96)) + 4|0);
     HEAP32[$head183>>2] = $or182;
    } else {
     HEAP32[(8232)>>2] = 0;
     HEAP32[(8244)>>2] = 0;
     $or186 = $95 | 3;
     $head187 = ((($96)) + 4|0);
     HEAP32[$head187>>2] = $or186;
     $add$ptr188 = (($96) + ($95)|0);
     $head189 = ((($add$ptr188)) + 4|0);
     $97 = HEAP32[$head189>>2]|0;
     $or190 = $97 | 1;
     HEAP32[$head189>>2] = $or190;
    }
    $add$ptr192 = ((($96)) + 8|0);
    $mem$2 = $add$ptr192;
    break;
   }
   $98 = HEAP32[(8236)>>2]|0;
   $cmp196 = ($98>>>0)>($nb$0>>>0);
   if ($cmp196) {
    $sub200 = (($98) - ($nb$0))|0;
    HEAP32[(8236)>>2] = $sub200;
    $99 = HEAP32[(8248)>>2]|0;
    $add$ptr203 = (($99) + ($nb$0)|0);
    HEAP32[(8248)>>2] = $add$ptr203;
    $or204 = $sub200 | 1;
    $head205 = ((($add$ptr203)) + 4|0);
    HEAP32[$head205>>2] = $or204;
    $or207 = $nb$0 | 3;
    $head208 = ((($99)) + 4|0);
    HEAP32[$head208>>2] = $or207;
    $add$ptr209 = ((($99)) + 8|0);
    $mem$2 = $add$ptr209;
    break;
   }
   $100 = HEAP32[2043]|0;
   $cmp$i178 = ($100|0)==(0);
   if ($cmp$i178) {
    (___pthread_mutex_lock(8196)|0);
    $101 = HEAP32[2043]|0;
    $cmp$i$i = ($101|0)==(0);
    if ($cmp$i$i) {
     HEAP32[(8180)>>2] = 4096;
     HEAP32[(8176)>>2] = 4096;
     HEAP32[(8184)>>2] = -1;
     HEAP32[(8188)>>2] = -1;
     HEAP32[(8192)>>2] = 2;
     HEAP32[(8668)>>2] = 2;
     $call$i$i$i = (_pthread_mutexattr_init($attr$i$i$i)|0);
     $tobool$i$i$i = ($call$i$i$i|0)==(0);
     if ($tobool$i$i$i) {
      $call1$i$i$i = (_pthread_mutex_init((8672),$attr$i$i$i)|0);
      $tobool2$i$i$i = ($call1$i$i$i|0)==(0);
      if ($tobool2$i$i$i) {
      }
     }
     $102 = $magic$i$i;
     $xor$i$i = $102 & -16;
     $and7$i$i = $xor$i$i ^ 1431655768;
     HEAP32[$magic$i$i>>2] = $and7$i$i;
     Atomics_store(HEAP32,2043,$and7$i$i)|0;
    }
    (___pthread_mutex_unlock(8196)|0);
   }
   $add$i181 = (($nb$0) + 48)|0;
   $103 = HEAP32[(8180)>>2]|0;
   $sub$i182 = (($nb$0) + 47)|0;
   $add9$i = (($103) + ($sub$i182))|0;
   $neg$i183 = (0 - ($103))|0;
   $and11$i = $add9$i & $neg$i183;
   $cmp12$i = ($and11$i>>>0)>($nb$0>>>0);
   if ($cmp12$i) {
    $104 = HEAP32[(8664)>>2]|0;
    $cmp15$i = ($104|0)==(0);
    if (!($cmp15$i)) {
     $105 = HEAP32[(8656)>>2]|0;
     $add17$i184 = (($105) + ($and11$i))|0;
     $cmp19$i = ($add17$i184>>>0)<=($105>>>0);
     $cmp21$i = ($add17$i184>>>0)>($104>>>0);
     $or$cond1$i185 = $cmp19$i | $cmp21$i;
     if ($or$cond1$i185) {
      $mem$2 = 0;
      break;
     }
    }
    $106 = HEAP32[(8668)>>2]|0;
    $and29$i = $106 & 4;
    $tobool30$i = ($and29$i|0)==(0);
    if ($tobool30$i) {
     $107 = HEAP32[(8248)>>2]|0;
     $cmp32$i186 = ($107|0)==(0|0);
     L258: do {
      if ($cmp32$i186) {
       label = 176;
      } else {
       $sp$0$i$i = (8700);
       while(1) {
        $108 = HEAP32[$sp$0$i$i>>2]|0;
        $cmp$i9$i = ($108>>>0)>($107>>>0);
        if (!($cmp$i9$i)) {
         $size$i$i = ((($sp$0$i$i)) + 4|0);
         $109 = HEAP32[$size$i$i>>2]|0;
         $add$ptr$i$i = (($108) + ($109)|0);
         $cmp2$i$i = ($add$ptr$i$i>>>0)>($107>>>0);
         if ($cmp2$i$i) {
          break;
         }
        }
        $next$i$i = ((($sp$0$i$i)) + 8|0);
        $110 = HEAP32[$next$i$i>>2]|0;
        $cmp3$i$i = ($110|0)==(0|0);
        if ($cmp3$i$i) {
         label = 176;
         break L258;
        } else {
         $sp$0$i$i = $110;
        }
       }
       (___pthread_mutex_lock(8196)|0);
       $115 = HEAP32[(8236)>>2]|0;
       $116 = HEAP32[(8180)>>2]|0;
       $sub77$i = (($sub$i182) - ($115))|0;
       $add78$i189 = (($sub77$i) + ($116))|0;
       $neg80$i = (0 - ($116))|0;
       $and81$i190 = $add78$i189 & $neg80$i;
       $cmp82$i = ($and81$i190>>>0)<(2147483647);
       if ($cmp82$i) {
        $call84$i = (_sbrk(($and81$i190|0))|0);
        $117 = HEAP32[$sp$0$i$i>>2]|0;
        $118 = HEAP32[$size$i$i>>2]|0;
        $add$ptr$i192 = (($117) + ($118)|0);
        $cmp86$i = ($call84$i|0)==($add$ptr$i192|0);
        if ($cmp86$i) {
         $cmp90$i193 = ($call84$i|0)==((-1)|0);
         if ($cmp90$i193) {
          $tsize$2657583$i = $and81$i190;
          label = 190;
         } else {
          $tbase$3$i = $call84$i;$tsize$3$i = $and81$i190;
         }
        } else {
         $br$2$ph$i = $call84$i;$ssize$2$ph$i = $and81$i190;
         label = 184;
        }
       } else {
        $tsize$2657583$i = 0;
        label = 190;
       }
      }
     } while(0);
     do {
      if ((label|0) == 176) {
       (___pthread_mutex_lock(8196)|0);
       $call38$i = (_sbrk(0)|0);
       $cmp39$i = ($call38$i|0)==((-1)|0);
       if ($cmp39$i) {
        $tsize$2657583$i = 0;
        label = 190;
       } else {
        $111 = $call38$i;
        $112 = HEAP32[(8176)>>2]|0;
        $sub42$i = (($112) + -1)|0;
        $and43$i = $sub42$i & $111;
        $cmp44$i = ($and43$i|0)==(0);
        $add47$i = (($sub42$i) + ($111))|0;
        $neg49$i = (0 - ($112))|0;
        $and50$i = $add47$i & $neg49$i;
        $sub51$i = (($and50$i) - ($111))|0;
        $add52$i = $cmp44$i ? 0 : $sub51$i;
        $and11$add52$i = (($add52$i) + ($and11$i))|0;
        $113 = HEAP32[(8656)>>2]|0;
        $add55$i = (($and11$add52$i) + ($113))|0;
        $cmp56$i = ($and11$add52$i>>>0)>($nb$0>>>0);
        $cmp58$i = ($and11$add52$i>>>0)<(2147483647);
        $or$cond$i188 = $cmp56$i & $cmp58$i;
        if ($or$cond$i188) {
         $114 = HEAP32[(8664)>>2]|0;
         $cmp61$i = ($114|0)==(0);
         if (!($cmp61$i)) {
          $cmp64$i = ($add55$i>>>0)<=($113>>>0);
          $cmp67$i = ($add55$i>>>0)>($114>>>0);
          $or$cond2$i = $cmp64$i | $cmp67$i;
          if ($or$cond2$i) {
           $tsize$2657583$i = 0;
           label = 190;
           break;
          }
         }
         $call69$i = (_sbrk(($and11$add52$i|0))|0);
         $cmp70$i = ($call69$i|0)==($call38$i|0);
         if ($cmp70$i) {
          $tbase$3$i = $call38$i;$tsize$3$i = $and11$add52$i;
         } else {
          $br$2$ph$i = $call69$i;$ssize$2$ph$i = $and11$add52$i;
          label = 184;
         }
        } else {
         $tsize$2657583$i = 0;
         label = 190;
        }
       }
      }
     } while(0);
     do {
      if ((label|0) == 184) {
       $sub113$i = (0 - ($ssize$2$ph$i))|0;
       $cmp92$i = ($br$2$ph$i|0)!=((-1)|0);
       $cmp94$i = ($ssize$2$ph$i>>>0)<(2147483647);
       $or$cond5$i = $cmp94$i & $cmp92$i;
       $cmp97$i195 = ($add$i181>>>0)>($ssize$2$ph$i>>>0);
       $or$cond3$i = $cmp97$i195 & $or$cond5$i;
       if (!($or$cond3$i)) {
        $cmp119$i196 = ($br$2$ph$i|0)==((-1)|0);
        if ($cmp119$i196) {
         $tsize$2657583$i = 0;
         label = 190;
         break;
        } else {
         $tbase$3$i = $br$2$ph$i;$tsize$3$i = $ssize$2$ph$i;
         break;
        }
       }
       $119 = HEAP32[(8180)>>2]|0;
       $sub100$i = (($sub$i182) - ($ssize$2$ph$i))|0;
       $add102$i = (($sub100$i) + ($119))|0;
       $neg104$i = (0 - ($119))|0;
       $and105$i = $add102$i & $neg104$i;
       $cmp106$i = ($and105$i>>>0)<(2147483647);
       if ($cmp106$i) {
        $call108$i = (_sbrk(($and105$i|0))|0);
        $cmp109$i = ($call108$i|0)==((-1)|0);
        if ($cmp109$i) {
         (_sbrk(($sub113$i|0))|0);
         $tsize$2657583$i = 0;
         label = 190;
         break;
        } else {
         $add111$i = (($and105$i) + ($ssize$2$ph$i))|0;
         $tbase$3$i = $br$2$ph$i;$tsize$3$i = $add111$i;
         break;
        }
       } else {
        $tbase$3$i = $br$2$ph$i;$tsize$3$i = $ssize$2$ph$i;
       }
      }
     } while(0);
     if ((label|0) == 190) {
      $120 = HEAP32[(8668)>>2]|0;
      $or$i197 = $120 | 4;
      HEAP32[(8668)>>2] = $or$i197;
      $tbase$3$i = (-1);$tsize$3$i = $tsize$2657583$i;
     }
     (___pthread_mutex_unlock(8196)|0);
     $tbase$4$i = $tbase$3$i;$tsize$4$i = $tsize$3$i;
    } else {
     $tbase$4$i = (-1);$tsize$4$i = 0;
    }
    $cmp127$i = ($tbase$4$i|0)==((-1)|0);
    $cmp129$i = ($and11$i>>>0)<(2147483647);
    $or$cond6$i = $cmp129$i & $cmp127$i;
    if ($or$cond6$i) {
     (___pthread_mutex_lock(8196)|0);
     $call134$i = (_sbrk(($and11$i|0))|0);
     $call135$i = (_sbrk(0)|0);
     (___pthread_mutex_unlock(8196)|0);
     $cmp137$i198 = ($call134$i|0)!=((-1)|0);
     $cmp139$i = ($call135$i|0)!=((-1)|0);
     $or$cond4$i = $cmp137$i198 & $cmp139$i;
     $cmp141$i = ($call134$i>>>0)<($call135$i>>>0);
     $or$cond7$i = $cmp141$i & $or$cond4$i;
     $sub$ptr$lhs$cast$i = $call135$i;
     $sub$ptr$rhs$cast$i = $call134$i;
     $sub$ptr$sub$i = (($sub$ptr$lhs$cast$i) - ($sub$ptr$rhs$cast$i))|0;
     $add144$i = (($nb$0) + 40)|0;
     $cmp145$i = ($sub$ptr$sub$i>>>0)>($add144$i>>>0);
     $sub$ptr$sub$tsize$4$i = $cmp145$i ? $sub$ptr$sub$i : $tsize$4$i;
     $call134$tbase$4$i = $cmp145$i ? $call134$i : (-1);
     if ($or$cond7$i) {
      $tbase$7$i = $call134$tbase$4$i;$tsize$7$i = $sub$ptr$sub$tsize$4$i;
      label = 194;
     }
    } else {
     $tbase$7$i = $tbase$4$i;$tsize$7$i = $tsize$4$i;
     label = 194;
    }
    if ((label|0) == 194) {
     $cmp151$i = ($tbase$7$i|0)==((-1)|0);
     if (!($cmp151$i)) {
      $121 = HEAP32[(8656)>>2]|0;
      $add154$i = (($121) + ($tsize$7$i))|0;
      HEAP32[(8656)>>2] = $add154$i;
      $122 = HEAP32[(8660)>>2]|0;
      $cmp155$i200 = ($add154$i>>>0)>($122>>>0);
      if ($cmp155$i200) {
       HEAP32[(8660)>>2] = $add154$i;
      }
      $123 = HEAP32[(8248)>>2]|0;
      $cmp161$i = ($123|0)==(0|0);
      do {
       if ($cmp161$i) {
        $124 = HEAP32[(8240)>>2]|0;
        $cmp163$i = ($124|0)==(0|0);
        $cmp166$i201 = ($tbase$7$i>>>0)<($124>>>0);
        $or$cond8$i = $cmp163$i | $cmp166$i201;
        if ($or$cond8$i) {
         HEAP32[(8240)>>2] = $tbase$7$i;
        }
        HEAP32[(8700)>>2] = $tbase$7$i;
        HEAP32[(8704)>>2] = $tsize$7$i;
        HEAP32[(8712)>>2] = 0;
        $125 = HEAP32[2043]|0;
        HEAP32[(8260)>>2] = $125;
        HEAP32[(8256)>>2] = -1;
        $i$01$i$i = 0;
        while(1) {
         $shl$i$i = $i$01$i$i << 1;
         $arrayidx$i$i = (8264 + ($shl$i$i<<2)|0);
         $126 = ((($arrayidx$i$i)) + 12|0);
         HEAP32[$126>>2] = $arrayidx$i$i;
         $127 = ((($arrayidx$i$i)) + 8|0);
         HEAP32[$127>>2] = $arrayidx$i$i;
         $inc$i$i = (($i$01$i$i) + 1)|0;
         $exitcond$i$i = ($inc$i$i|0)==(32);
         if ($exitcond$i$i) {
          break;
         } else {
          $i$01$i$i = $inc$i$i;
         }
        }
        $sub176$i = (($tsize$7$i) + -40)|0;
        $add$ptr$i10$i = ((($tbase$7$i)) + 8|0);
        $128 = $add$ptr$i10$i;
        $and$i$i = $128 & 7;
        $cmp$i11$i = ($and$i$i|0)==(0);
        $129 = (0 - ($128))|0;
        $and3$i$i = $129 & 7;
        $cond$i$i = $cmp$i11$i ? 0 : $and3$i$i;
        $add$ptr4$i$i = (($tbase$7$i) + ($cond$i$i)|0);
        $sub5$i$i = (($sub176$i) - ($cond$i$i))|0;
        HEAP32[(8248)>>2] = $add$ptr4$i$i;
        HEAP32[(8236)>>2] = $sub5$i$i;
        $or$i$i = $sub5$i$i | 1;
        $head$i$i = ((($add$ptr4$i$i)) + 4|0);
        HEAP32[$head$i$i>>2] = $or$i$i;
        $add$ptr6$i$i = (($add$ptr4$i$i) + ($sub5$i$i)|0);
        $head7$i$i = ((($add$ptr6$i$i)) + 4|0);
        HEAP32[$head7$i$i>>2] = 40;
        $130 = HEAP32[(8188)>>2]|0;
        HEAP32[(8252)>>2] = $130;
       } else {
        $sp$099$i = (8700);
        while(1) {
         $131 = HEAP32[$sp$099$i>>2]|0;
         $size192$i = ((($sp$099$i)) + 4|0);
         $132 = HEAP32[$size192$i>>2]|0;
         $add$ptr193$i = (($131) + ($132)|0);
         $cmp194$i = ($tbase$7$i|0)==($add$ptr193$i|0);
         if ($cmp194$i) {
          label = 205;
          break;
         }
         $next$i = ((($sp$099$i)) + 8|0);
         $133 = HEAP32[$next$i>>2]|0;
         $cmp190$i = ($133|0)==(0|0);
         if ($cmp190$i) {
          break;
         } else {
          $sp$099$i = $133;
         }
        }
        if ((label|0) == 205) {
         $sflags197$i = ((($sp$099$i)) + 12|0);
         $134 = HEAP32[$sflags197$i>>2]|0;
         $and198$i = $134 & 8;
         $tobool199$i = ($and198$i|0)==(0);
         if ($tobool199$i) {
          $cmp207$i = ($123>>>0)>=($131>>>0);
          $cmp213$i = ($123>>>0)<($tbase$7$i>>>0);
          $or$cond90$i = $cmp213$i & $cmp207$i;
          if ($or$cond90$i) {
           $add216$i = (($132) + ($tsize$7$i))|0;
           HEAP32[$size192$i>>2] = $add216$i;
           $135 = HEAP32[(8236)>>2]|0;
           $add$ptr$i12$i = ((($123)) + 8|0);
           $136 = $add$ptr$i12$i;
           $and$i13$i = $136 & 7;
           $cmp$i14$i = ($and$i13$i|0)==(0);
           $137 = (0 - ($136))|0;
           $and3$i15$i = $137 & 7;
           $cond$i16$i = $cmp$i14$i ? 0 : $and3$i15$i;
           $add$ptr4$i17$i = (($123) + ($cond$i16$i)|0);
           $add219$i = (($tsize$7$i) - ($cond$i16$i))|0;
           $sub5$i18$i = (($135) + ($add219$i))|0;
           HEAP32[(8248)>>2] = $add$ptr4$i17$i;
           HEAP32[(8236)>>2] = $sub5$i18$i;
           $or$i19$i = $sub5$i18$i | 1;
           $head$i20$i = ((($add$ptr4$i17$i)) + 4|0);
           HEAP32[$head$i20$i>>2] = $or$i19$i;
           $add$ptr6$i21$i = (($add$ptr4$i17$i) + ($sub5$i18$i)|0);
           $head7$i22$i = ((($add$ptr6$i21$i)) + 4|0);
           HEAP32[$head7$i22$i>>2] = 40;
           $138 = HEAP32[(8188)>>2]|0;
           HEAP32[(8252)>>2] = $138;
           break;
          }
         }
        }
        $139 = HEAP32[(8240)>>2]|0;
        $cmp222$i = ($tbase$7$i>>>0)<($139>>>0);
        if ($cmp222$i) {
         HEAP32[(8240)>>2] = $tbase$7$i;
         $154 = $tbase$7$i;
        } else {
         $154 = $139;
        }
        $add$ptr231$i = (($tbase$7$i) + ($tsize$7$i)|0);
        $sp$198$i = (8700);
        while(1) {
         $140 = HEAP32[$sp$198$i>>2]|0;
         $cmp232$i = ($140|0)==($add$ptr231$i|0);
         if ($cmp232$i) {
          label = 213;
          break;
         }
         $next235$i = ((($sp$198$i)) + 8|0);
         $141 = HEAP32[$next235$i>>2]|0;
         $cmp228$i = ($141|0)==(0|0);
         if ($cmp228$i) {
          break;
         } else {
          $sp$198$i = $141;
         }
        }
        if ((label|0) == 213) {
         $sflags239$i = ((($sp$198$i)) + 12|0);
         $142 = HEAP32[$sflags239$i>>2]|0;
         $and240$i = $142 & 8;
         $tobool241$i = ($and240$i|0)==(0);
         if ($tobool241$i) {
          HEAP32[$sp$198$i>>2] = $tbase$7$i;
          $size249$i = ((($sp$198$i)) + 4|0);
          $143 = HEAP32[$size249$i>>2]|0;
          $add250$i = (($143) + ($tsize$7$i))|0;
          HEAP32[$size249$i>>2] = $add250$i;
          $add$ptr$i23$i = ((($tbase$7$i)) + 8|0);
          $144 = $add$ptr$i23$i;
          $and$i24$i = $144 & 7;
          $cmp$i25$i = ($and$i24$i|0)==(0);
          $145 = (0 - ($144))|0;
          $and3$i26$i = $145 & 7;
          $cond$i27$i = $cmp$i25$i ? 0 : $and3$i26$i;
          $add$ptr4$i28$i = (($tbase$7$i) + ($cond$i27$i)|0);
          $add$ptr5$i$i = ((($add$ptr231$i)) + 8|0);
          $146 = $add$ptr5$i$i;
          $and6$i$i = $146 & 7;
          $cmp7$i$i = ($and6$i$i|0)==(0);
          $147 = (0 - ($146))|0;
          $and13$i$i = $147 & 7;
          $cond15$i$i = $cmp7$i$i ? 0 : $and13$i$i;
          $add$ptr16$i$i = (($add$ptr231$i) + ($cond15$i$i)|0);
          $sub$ptr$lhs$cast$i$i = $add$ptr16$i$i;
          $sub$ptr$rhs$cast$i$i = $add$ptr4$i28$i;
          $sub$ptr$sub$i$i = (($sub$ptr$lhs$cast$i$i) - ($sub$ptr$rhs$cast$i$i))|0;
          $add$ptr17$i$i = (($add$ptr4$i28$i) + ($nb$0)|0);
          $sub18$i$i = (($sub$ptr$sub$i$i) - ($nb$0))|0;
          $or19$i$i = $nb$0 | 3;
          $head$i29$i = ((($add$ptr4$i28$i)) + 4|0);
          HEAP32[$head$i29$i>>2] = $or19$i$i;
          $cmp20$i$i = ($add$ptr16$i$i|0)==($123|0);
          do {
           if ($cmp20$i$i) {
            $148 = HEAP32[(8236)>>2]|0;
            $add$i$i = (($148) + ($sub18$i$i))|0;
            HEAP32[(8236)>>2] = $add$i$i;
            HEAP32[(8248)>>2] = $add$ptr17$i$i;
            $or22$i$i = $add$i$i | 1;
            $head23$i$i = ((($add$ptr17$i$i)) + 4|0);
            HEAP32[$head23$i$i>>2] = $or22$i$i;
           } else {
            $149 = HEAP32[(8244)>>2]|0;
            $cmp24$i$i = ($add$ptr16$i$i|0)==($149|0);
            if ($cmp24$i$i) {
             $150 = HEAP32[(8232)>>2]|0;
             $add26$i$i = (($150) + ($sub18$i$i))|0;
             HEAP32[(8232)>>2] = $add26$i$i;
             HEAP32[(8244)>>2] = $add$ptr17$i$i;
             $or28$i$i = $add26$i$i | 1;
             $head29$i$i = ((($add$ptr17$i$i)) + 4|0);
             HEAP32[$head29$i$i>>2] = $or28$i$i;
             $add$ptr30$i$i = (($add$ptr17$i$i) + ($add26$i$i)|0);
             HEAP32[$add$ptr30$i$i>>2] = $add26$i$i;
             break;
            }
            $head32$i$i = ((($add$ptr16$i$i)) + 4|0);
            $151 = HEAP32[$head32$i$i>>2]|0;
            $and33$i$i = $151 & 3;
            $cmp34$i$i = ($and33$i$i|0)==(1);
            if ($cmp34$i$i) {
             $and37$i$i = $151 & -8;
             $shr$i$i = $151 >>> 3;
             $cmp38$i$i = ($151>>>0)<(256);
             L329: do {
              if ($cmp38$i$i) {
               $fd$i$i = ((($add$ptr16$i$i)) + 8|0);
               $152 = HEAP32[$fd$i$i>>2]|0;
               $bk$i$i = ((($add$ptr16$i$i)) + 12|0);
               $153 = HEAP32[$bk$i$i>>2]|0;
               $shl$i31$i = $shr$i$i << 1;
               $arrayidx$i32$i = (8264 + ($shl$i31$i<<2)|0);
               $cmp41$i$i = ($152|0)==($arrayidx$i32$i|0);
               do {
                if (!($cmp41$i$i)) {
                 $cmp42$i$i = ($152>>>0)<($154>>>0);
                 if ($cmp42$i$i) {
                  _abort();
                  // unreachable;
                 }
                 $bk43$i$i = ((($152)) + 12|0);
                 $155 = HEAP32[$bk43$i$i>>2]|0;
                 $cmp44$i$i = ($155|0)==($add$ptr16$i$i|0);
                 if ($cmp44$i$i) {
                  break;
                 }
                 _abort();
                 // unreachable;
                }
               } while(0);
               $cmp46$i$i = ($153|0)==($152|0);
               if ($cmp46$i$i) {
                $shl48$i$i = 1 << $shr$i$i;
                $neg$i$i = $shl48$i$i ^ -1;
                $156 = HEAP32[2056]|0;
                $and49$i$i = $156 & $neg$i$i;
                HEAP32[2056] = $and49$i$i;
                break;
               }
               $cmp54$i$i = ($153|0)==($arrayidx$i32$i|0);
               do {
                if ($cmp54$i$i) {
                 $$pre5$i$i = ((($153)) + 8|0);
                 $fd68$pre$phi$i$iZ2D = $$pre5$i$i;
                } else {
                 $cmp57$i$i = ($153>>>0)<($154>>>0);
                 if ($cmp57$i$i) {
                  _abort();
                  // unreachable;
                 }
                 $fd59$i$i = ((($153)) + 8|0);
                 $157 = HEAP32[$fd59$i$i>>2]|0;
                 $cmp60$i$i = ($157|0)==($add$ptr16$i$i|0);
                 if ($cmp60$i$i) {
                  $fd68$pre$phi$i$iZ2D = $fd59$i$i;
                  break;
                 }
                 _abort();
                 // unreachable;
                }
               } while(0);
               $bk67$i$i = ((($152)) + 12|0);
               HEAP32[$bk67$i$i>>2] = $153;
               HEAP32[$fd68$pre$phi$i$iZ2D>>2] = $152;
              } else {
               $parent$i$i = ((($add$ptr16$i$i)) + 24|0);
               $158 = HEAP32[$parent$i$i>>2]|0;
               $bk74$i$i = ((($add$ptr16$i$i)) + 12|0);
               $159 = HEAP32[$bk74$i$i>>2]|0;
               $cmp75$i$i = ($159|0)==($add$ptr16$i$i|0);
               do {
                if ($cmp75$i$i) {
                 $child$i$i = ((($add$ptr16$i$i)) + 16|0);
                 $arrayidx96$i$i = ((($child$i$i)) + 4|0);
                 $163 = HEAP32[$arrayidx96$i$i>>2]|0;
                 $cmp97$i$i = ($163|0)==(0|0);
                 if ($cmp97$i$i) {
                  $164 = HEAP32[$child$i$i>>2]|0;
                  $cmp100$i$i = ($164|0)==(0|0);
                  if ($cmp100$i$i) {
                   $R$3$i$i = 0;
                   break;
                  } else {
                   $R$1$i$i = $164;$RP$1$i$i = $child$i$i;
                  }
                 } else {
                  $R$1$i$i = $163;$RP$1$i$i = $arrayidx96$i$i;
                 }
                 while(1) {
                  $arrayidx103$i$i = ((($R$1$i$i)) + 20|0);
                  $165 = HEAP32[$arrayidx103$i$i>>2]|0;
                  $cmp104$i$i = ($165|0)==(0|0);
                  if (!($cmp104$i$i)) {
                   $R$1$i$i = $165;$RP$1$i$i = $arrayidx103$i$i;
                   continue;
                  }
                  $arrayidx107$i$i = ((($R$1$i$i)) + 16|0);
                  $166 = HEAP32[$arrayidx107$i$i>>2]|0;
                  $cmp108$i$i = ($166|0)==(0|0);
                  if ($cmp108$i$i) {
                   break;
                  } else {
                   $R$1$i$i = $166;$RP$1$i$i = $arrayidx107$i$i;
                  }
                 }
                 $cmp112$i$i = ($RP$1$i$i>>>0)<($154>>>0);
                 if ($cmp112$i$i) {
                  _abort();
                  // unreachable;
                 } else {
                  HEAP32[$RP$1$i$i>>2] = 0;
                  $R$3$i$i = $R$1$i$i;
                  break;
                 }
                } else {
                 $fd78$i$i = ((($add$ptr16$i$i)) + 8|0);
                 $160 = HEAP32[$fd78$i$i>>2]|0;
                 $cmp81$i$i = ($160>>>0)<($154>>>0);
                 if ($cmp81$i$i) {
                  _abort();
                  // unreachable;
                 }
                 $bk82$i$i = ((($160)) + 12|0);
                 $161 = HEAP32[$bk82$i$i>>2]|0;
                 $cmp83$i$i = ($161|0)==($add$ptr16$i$i|0);
                 if (!($cmp83$i$i)) {
                  _abort();
                  // unreachable;
                 }
                 $fd85$i$i = ((($159)) + 8|0);
                 $162 = HEAP32[$fd85$i$i>>2]|0;
                 $cmp86$i$i = ($162|0)==($add$ptr16$i$i|0);
                 if ($cmp86$i$i) {
                  HEAP32[$bk82$i$i>>2] = $159;
                  HEAP32[$fd85$i$i>>2] = $160;
                  $R$3$i$i = $159;
                  break;
                 } else {
                  _abort();
                  // unreachable;
                 }
                }
               } while(0);
               $cmp120$i$i = ($158|0)==(0|0);
               if ($cmp120$i$i) {
                break;
               }
               $index$i$i = ((($add$ptr16$i$i)) + 28|0);
               $167 = HEAP32[$index$i$i>>2]|0;
               $arrayidx123$i$i = (8528 + ($167<<2)|0);
               $168 = HEAP32[$arrayidx123$i$i>>2]|0;
               $cmp124$i$i = ($add$ptr16$i$i|0)==($168|0);
               do {
                if ($cmp124$i$i) {
                 HEAP32[$arrayidx123$i$i>>2] = $R$3$i$i;
                 $cond2$i$i = ($R$3$i$i|0)==(0|0);
                 if (!($cond2$i$i)) {
                  break;
                 }
                 $shl131$i$i = 1 << $167;
                 $neg132$i$i = $shl131$i$i ^ -1;
                 $169 = HEAP32[(8228)>>2]|0;
                 $and133$i$i = $169 & $neg132$i$i;
                 HEAP32[(8228)>>2] = $and133$i$i;
                 break L329;
                } else {
                 $170 = HEAP32[(8240)>>2]|0;
                 $cmp137$i$i = ($158>>>0)<($170>>>0);
                 if ($cmp137$i$i) {
                  _abort();
                  // unreachable;
                 } else {
                  $arrayidx143$i$i = ((($158)) + 16|0);
                  $171 = HEAP32[$arrayidx143$i$i>>2]|0;
                  $not$cmp144$i$i = ($171|0)!=($add$ptr16$i$i|0);
                  $$sink$i$i = $not$cmp144$i$i&1;
                  $arrayidx151$i$i = (((($158)) + 16|0) + ($$sink$i$i<<2)|0);
                  HEAP32[$arrayidx151$i$i>>2] = $R$3$i$i;
                  $cmp156$i$i = ($R$3$i$i|0)==(0|0);
                  if ($cmp156$i$i) {
                   break L329;
                  } else {
                   break;
                  }
                 }
                }
               } while(0);
               $172 = HEAP32[(8240)>>2]|0;
               $cmp160$i$i = ($R$3$i$i>>>0)<($172>>>0);
               if ($cmp160$i$i) {
                _abort();
                // unreachable;
               }
               $parent165$i$i = ((($R$3$i$i)) + 24|0);
               HEAP32[$parent165$i$i>>2] = $158;
               $child166$i$i = ((($add$ptr16$i$i)) + 16|0);
               $173 = HEAP32[$child166$i$i>>2]|0;
               $cmp168$i$i = ($173|0)==(0|0);
               do {
                if (!($cmp168$i$i)) {
                 $cmp172$i$i = ($173>>>0)<($172>>>0);
                 if ($cmp172$i$i) {
                  _abort();
                  // unreachable;
                 } else {
                  $arrayidx178$i$i = ((($R$3$i$i)) + 16|0);
                  HEAP32[$arrayidx178$i$i>>2] = $173;
                  $parent179$i$i = ((($173)) + 24|0);
                  HEAP32[$parent179$i$i>>2] = $R$3$i$i;
                  break;
                 }
                }
               } while(0);
               $arrayidx184$i$i = ((($child166$i$i)) + 4|0);
               $174 = HEAP32[$arrayidx184$i$i>>2]|0;
               $cmp185$i$i = ($174|0)==(0|0);
               if ($cmp185$i$i) {
                break;
               }
               $175 = HEAP32[(8240)>>2]|0;
               $cmp189$i$i = ($174>>>0)<($175>>>0);
               if ($cmp189$i$i) {
                _abort();
                // unreachable;
               } else {
                $arrayidx195$i$i = ((($R$3$i$i)) + 20|0);
                HEAP32[$arrayidx195$i$i>>2] = $174;
                $parent196$i$i = ((($174)) + 24|0);
                HEAP32[$parent196$i$i>>2] = $R$3$i$i;
                break;
               }
              }
             } while(0);
             $add$ptr205$i$i = (($add$ptr16$i$i) + ($and37$i$i)|0);
             $add206$i$i = (($and37$i$i) + ($sub18$i$i))|0;
             $oldfirst$0$i$i = $add$ptr205$i$i;$qsize$0$i$i = $add206$i$i;
            } else {
             $oldfirst$0$i$i = $add$ptr16$i$i;$qsize$0$i$i = $sub18$i$i;
            }
            $head208$i$i = ((($oldfirst$0$i$i)) + 4|0);
            $176 = HEAP32[$head208$i$i>>2]|0;
            $and209$i$i = $176 & -2;
            HEAP32[$head208$i$i>>2] = $and209$i$i;
            $or210$i$i = $qsize$0$i$i | 1;
            $head211$i$i = ((($add$ptr17$i$i)) + 4|0);
            HEAP32[$head211$i$i>>2] = $or210$i$i;
            $add$ptr212$i$i = (($add$ptr17$i$i) + ($qsize$0$i$i)|0);
            HEAP32[$add$ptr212$i$i>>2] = $qsize$0$i$i;
            $shr214$i$i = $qsize$0$i$i >>> 3;
            $cmp215$i$i = ($qsize$0$i$i>>>0)<(256);
            if ($cmp215$i$i) {
             $shl222$i$i = $shr214$i$i << 1;
             $arrayidx223$i$i = (8264 + ($shl222$i$i<<2)|0);
             $177 = HEAP32[2056]|0;
             $shl226$i$i = 1 << $shr214$i$i;
             $and227$i$i = $177 & $shl226$i$i;
             $tobool228$i$i = ($and227$i$i|0)==(0);
             do {
              if ($tobool228$i$i) {
               $or232$i$i = $177 | $shl226$i$i;
               HEAP32[2056] = $or232$i$i;
               $$pre$i$i = ((($arrayidx223$i$i)) + 8|0);
               $$pre$phi$i$iZ2D = $$pre$i$i;$F224$0$i$i = $arrayidx223$i$i;
              } else {
               $178 = ((($arrayidx223$i$i)) + 8|0);
               $179 = HEAP32[$178>>2]|0;
               $180 = HEAP32[(8240)>>2]|0;
               $cmp236$i$i = ($179>>>0)<($180>>>0);
               if (!($cmp236$i$i)) {
                $$pre$phi$i$iZ2D = $178;$F224$0$i$i = $179;
                break;
               }
               _abort();
               // unreachable;
              }
             } while(0);
             HEAP32[$$pre$phi$i$iZ2D>>2] = $add$ptr17$i$i;
             $bk246$i$i = ((($F224$0$i$i)) + 12|0);
             HEAP32[$bk246$i$i>>2] = $add$ptr17$i$i;
             $fd247$i$i = ((($add$ptr17$i$i)) + 8|0);
             HEAP32[$fd247$i$i>>2] = $F224$0$i$i;
             $bk248$i$i = ((($add$ptr17$i$i)) + 12|0);
             HEAP32[$bk248$i$i>>2] = $arrayidx223$i$i;
             break;
            }
            $shr253$i$i = $qsize$0$i$i >>> 8;
            $cmp254$i$i = ($shr253$i$i|0)==(0);
            do {
             if ($cmp254$i$i) {
              $I252$0$i$i = 0;
             } else {
              $cmp258$i$i = ($qsize$0$i$i>>>0)>(16777215);
              if ($cmp258$i$i) {
               $I252$0$i$i = 31;
               break;
              }
              $sub262$i$i = (($shr253$i$i) + 1048320)|0;
              $shr263$i$i = $sub262$i$i >>> 16;
              $and264$i$i = $shr263$i$i & 8;
              $shl265$i$i = $shr253$i$i << $and264$i$i;
              $sub266$i$i = (($shl265$i$i) + 520192)|0;
              $shr267$i$i = $sub266$i$i >>> 16;
              $and268$i$i = $shr267$i$i & 4;
              $add269$i$i = $and268$i$i | $and264$i$i;
              $shl270$i$i = $shl265$i$i << $and268$i$i;
              $sub271$i$i = (($shl270$i$i) + 245760)|0;
              $shr272$i$i = $sub271$i$i >>> 16;
              $and273$i$i = $shr272$i$i & 2;
              $add274$i$i = $add269$i$i | $and273$i$i;
              $sub275$i$i = (14 - ($add274$i$i))|0;
              $shl276$i$i = $shl270$i$i << $and273$i$i;
              $shr277$i$i = $shl276$i$i >>> 15;
              $add278$i$i = (($sub275$i$i) + ($shr277$i$i))|0;
              $shl279$i$i = $add278$i$i << 1;
              $add280$i$i = (($add278$i$i) + 7)|0;
              $shr281$i$i = $qsize$0$i$i >>> $add280$i$i;
              $and282$i$i = $shr281$i$i & 1;
              $add283$i$i = $and282$i$i | $shl279$i$i;
              $I252$0$i$i = $add283$i$i;
             }
            } while(0);
            $arrayidx287$i$i = (8528 + ($I252$0$i$i<<2)|0);
            $index288$i$i = ((($add$ptr17$i$i)) + 28|0);
            HEAP32[$index288$i$i>>2] = $I252$0$i$i;
            $child289$i$i = ((($add$ptr17$i$i)) + 16|0);
            $arrayidx290$i$i = ((($child289$i$i)) + 4|0);
            HEAP32[$arrayidx290$i$i>>2] = 0;
            HEAP32[$child289$i$i>>2] = 0;
            $181 = HEAP32[(8228)>>2]|0;
            $shl294$i$i = 1 << $I252$0$i$i;
            $and295$i$i = $181 & $shl294$i$i;
            $tobool296$i$i = ($and295$i$i|0)==(0);
            if ($tobool296$i$i) {
             $or300$i$i = $181 | $shl294$i$i;
             HEAP32[(8228)>>2] = $or300$i$i;
             HEAP32[$arrayidx287$i$i>>2] = $add$ptr17$i$i;
             $parent301$i$i = ((($add$ptr17$i$i)) + 24|0);
             HEAP32[$parent301$i$i>>2] = $arrayidx287$i$i;
             $bk302$i$i = ((($add$ptr17$i$i)) + 12|0);
             HEAP32[$bk302$i$i>>2] = $add$ptr17$i$i;
             $fd303$i$i = ((($add$ptr17$i$i)) + 8|0);
             HEAP32[$fd303$i$i>>2] = $add$ptr17$i$i;
             break;
            }
            $182 = HEAP32[$arrayidx287$i$i>>2]|0;
            $cmp306$i$i = ($I252$0$i$i|0)==(31);
            $shr310$i$i = $I252$0$i$i >>> 1;
            $sub313$i$i = (25 - ($shr310$i$i))|0;
            $cond315$i$i = $cmp306$i$i ? 0 : $sub313$i$i;
            $shl316$i$i = $qsize$0$i$i << $cond315$i$i;
            $K305$0$i$i = $shl316$i$i;$T$0$i$i = $182;
            while(1) {
             $head317$i$i = ((($T$0$i$i)) + 4|0);
             $183 = HEAP32[$head317$i$i>>2]|0;
             $and318$i$i = $183 & -8;
             $cmp319$i$i = ($and318$i$i|0)==($qsize$0$i$i|0);
             if ($cmp319$i$i) {
              label = 280;
              break;
             }
             $shr323$i$i = $K305$0$i$i >>> 31;
             $arrayidx325$i$i = (((($T$0$i$i)) + 16|0) + ($shr323$i$i<<2)|0);
             $shl326$i$i = $K305$0$i$i << 1;
             $184 = HEAP32[$arrayidx325$i$i>>2]|0;
             $cmp327$i$i = ($184|0)==(0|0);
             if ($cmp327$i$i) {
              label = 277;
              break;
             } else {
              $K305$0$i$i = $shl326$i$i;$T$0$i$i = $184;
             }
            }
            if ((label|0) == 277) {
             $185 = HEAP32[(8240)>>2]|0;
             $cmp332$i$i = ($arrayidx325$i$i>>>0)<($185>>>0);
             if ($cmp332$i$i) {
              _abort();
              // unreachable;
             } else {
              HEAP32[$arrayidx325$i$i>>2] = $add$ptr17$i$i;
              $parent337$i$i = ((($add$ptr17$i$i)) + 24|0);
              HEAP32[$parent337$i$i>>2] = $T$0$i$i;
              $bk338$i$i = ((($add$ptr17$i$i)) + 12|0);
              HEAP32[$bk338$i$i>>2] = $add$ptr17$i$i;
              $fd339$i$i = ((($add$ptr17$i$i)) + 8|0);
              HEAP32[$fd339$i$i>>2] = $add$ptr17$i$i;
              break;
             }
            }
            else if ((label|0) == 280) {
             $fd344$i$i = ((($T$0$i$i)) + 8|0);
             $186 = HEAP32[$fd344$i$i>>2]|0;
             $187 = HEAP32[(8240)>>2]|0;
             $cmp350$i$i = ($186>>>0)>=($187>>>0);
             $not$cmp346$i$i = ($T$0$i$i>>>0)>=($187>>>0);
             $188 = $cmp350$i$i & $not$cmp346$i$i;
             if ($188) {
              $bk357$i$i = ((($186)) + 12|0);
              HEAP32[$bk357$i$i>>2] = $add$ptr17$i$i;
              HEAP32[$fd344$i$i>>2] = $add$ptr17$i$i;
              $fd359$i$i = ((($add$ptr17$i$i)) + 8|0);
              HEAP32[$fd359$i$i>>2] = $186;
              $bk360$i$i = ((($add$ptr17$i$i)) + 12|0);
              HEAP32[$bk360$i$i>>2] = $T$0$i$i;
              $parent361$i$i = ((($add$ptr17$i$i)) + 24|0);
              HEAP32[$parent361$i$i>>2] = 0;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           }
          } while(0);
          $add$ptr369$i$i = ((($add$ptr4$i28$i)) + 8|0);
          $mem$2 = $add$ptr369$i$i;
          break L230;
         }
        }
        $sp$0$i$i$i = (8700);
        while(1) {
         $189 = HEAP32[$sp$0$i$i$i>>2]|0;
         $cmp$i$i$i = ($189>>>0)>($123>>>0);
         if (!($cmp$i$i$i)) {
          $size$i$i$i = ((($sp$0$i$i$i)) + 4|0);
          $190 = HEAP32[$size$i$i$i>>2]|0;
          $add$ptr$i$i$i = (($189) + ($190)|0);
          $cmp2$i$i$i = ($add$ptr$i$i$i>>>0)>($123>>>0);
          if ($cmp2$i$i$i) {
           break;
          }
         }
         $next$i$i$i = ((($sp$0$i$i$i)) + 8|0);
         $191 = HEAP32[$next$i$i$i>>2]|0;
         $sp$0$i$i$i = $191;
        }
        $add$ptr2$i$i = ((($add$ptr$i$i$i)) + -47|0);
        $add$ptr3$i$i = ((($add$ptr2$i$i)) + 8|0);
        $192 = $add$ptr3$i$i;
        $and$i36$i = $192 & 7;
        $cmp$i37$i = ($and$i36$i|0)==(0);
        $193 = (0 - ($192))|0;
        $and6$i38$i = $193 & 7;
        $cond$i39$i = $cmp$i37$i ? 0 : $and6$i38$i;
        $add$ptr7$i$i = (($add$ptr2$i$i) + ($cond$i39$i)|0);
        $add$ptr81$i$i = ((($123)) + 16|0);
        $cmp9$i$i = ($add$ptr7$i$i>>>0)<($add$ptr81$i$i>>>0);
        $cond13$i$i = $cmp9$i$i ? $123 : $add$ptr7$i$i;
        $add$ptr14$i$i = ((($cond13$i$i)) + 8|0);
        $add$ptr15$i$i = ((($cond13$i$i)) + 24|0);
        $sub16$i$i = (($tsize$7$i) + -40)|0;
        $add$ptr$i2$i$i = ((($tbase$7$i)) + 8|0);
        $194 = $add$ptr$i2$i$i;
        $and$i$i$i = $194 & 7;
        $cmp$i3$i$i = ($and$i$i$i|0)==(0);
        $195 = (0 - ($194))|0;
        $and3$i$i$i = $195 & 7;
        $cond$i$i$i = $cmp$i3$i$i ? 0 : $and3$i$i$i;
        $add$ptr4$i$i$i = (($tbase$7$i) + ($cond$i$i$i)|0);
        $sub5$i$i$i = (($sub16$i$i) - ($cond$i$i$i))|0;
        HEAP32[(8248)>>2] = $add$ptr4$i$i$i;
        HEAP32[(8236)>>2] = $sub5$i$i$i;
        $or$i$i$i = $sub5$i$i$i | 1;
        $head$i$i$i = ((($add$ptr4$i$i$i)) + 4|0);
        HEAP32[$head$i$i$i>>2] = $or$i$i$i;
        $add$ptr6$i$i$i = (($add$ptr4$i$i$i) + ($sub5$i$i$i)|0);
        $head7$i$i$i = ((($add$ptr6$i$i$i)) + 4|0);
        HEAP32[$head7$i$i$i>>2] = 40;
        $196 = HEAP32[(8188)>>2]|0;
        HEAP32[(8252)>>2] = $196;
        $head$i40$i = ((($cond13$i$i)) + 4|0);
        HEAP32[$head$i40$i>>2] = 27;
        ;HEAP32[$add$ptr14$i$i>>2]=HEAP32[(8700)>>2]|0;HEAP32[$add$ptr14$i$i+4>>2]=HEAP32[(8700)+4>>2]|0;HEAP32[$add$ptr14$i$i+8>>2]=HEAP32[(8700)+8>>2]|0;HEAP32[$add$ptr14$i$i+12>>2]=HEAP32[(8700)+12>>2]|0;
        HEAP32[(8700)>>2] = $tbase$7$i;
        HEAP32[(8704)>>2] = $tsize$7$i;
        HEAP32[(8712)>>2] = 0;
        HEAP32[(8708)>>2] = $add$ptr14$i$i;
        $197 = $add$ptr15$i$i;
        while(1) {
         $add$ptr24$i$i = ((($197)) + 4|0);
         HEAP32[$add$ptr24$i$i>>2] = 7;
         $head26$i$i = ((($197)) + 8|0);
         $cmp27$i$i = ($head26$i$i>>>0)<($add$ptr$i$i$i>>>0);
         if ($cmp27$i$i) {
          $197 = $add$ptr24$i$i;
         } else {
          break;
         }
        }
        $cmp28$i$i = ($cond13$i$i|0)==($123|0);
        if (!($cmp28$i$i)) {
         $sub$ptr$lhs$cast$i42$i = $cond13$i$i;
         $sub$ptr$rhs$cast$i43$i = $123;
         $sub$ptr$sub$i44$i = (($sub$ptr$lhs$cast$i42$i) - ($sub$ptr$rhs$cast$i43$i))|0;
         $198 = HEAP32[$head$i40$i>>2]|0;
         $and32$i$i = $198 & -2;
         HEAP32[$head$i40$i>>2] = $and32$i$i;
         $or33$i$i = $sub$ptr$sub$i44$i | 1;
         $head34$i$i = ((($123)) + 4|0);
         HEAP32[$head34$i$i>>2] = $or33$i$i;
         HEAP32[$cond13$i$i>>2] = $sub$ptr$sub$i44$i;
         $shr$i46$i = $sub$ptr$sub$i44$i >>> 3;
         $cmp36$i$i = ($sub$ptr$sub$i44$i>>>0)<(256);
         if ($cmp36$i$i) {
          $shl$i47$i = $shr$i46$i << 1;
          $arrayidx$i48$i = (8264 + ($shl$i47$i<<2)|0);
          $199 = HEAP32[2056]|0;
          $shl39$i$i = 1 << $shr$i46$i;
          $and40$i$i = $199 & $shl39$i$i;
          $tobool$i$i204 = ($and40$i$i|0)==(0);
          do {
           if ($tobool$i$i204) {
            $or44$i$i = $199 | $shl39$i$i;
            HEAP32[2056] = $or44$i$i;
            $$pre$i49$i = ((($arrayidx$i48$i)) + 8|0);
            $$pre$phi$i52$iZ2D = $$pre$i49$i;$F$0$i$i = $arrayidx$i48$i;
           } else {
            $200 = ((($arrayidx$i48$i)) + 8|0);
            $201 = HEAP32[$200>>2]|0;
            $202 = HEAP32[(8240)>>2]|0;
            $cmp46$i50$i = ($201>>>0)<($202>>>0);
            if (!($cmp46$i50$i)) {
             $$pre$phi$i52$iZ2D = $200;$F$0$i$i = $201;
             break;
            }
            _abort();
            // unreachable;
           }
          } while(0);
          HEAP32[$$pre$phi$i52$iZ2D>>2] = $123;
          $bk$i53$i = ((($F$0$i$i)) + 12|0);
          HEAP32[$bk$i53$i>>2] = $123;
          $fd54$i$i = ((($123)) + 8|0);
          HEAP32[$fd54$i$i>>2] = $F$0$i$i;
          $bk55$i$i = ((($123)) + 12|0);
          HEAP32[$bk55$i$i>>2] = $arrayidx$i48$i;
          break;
         }
         $shr58$i$i = $sub$ptr$sub$i44$i >>> 8;
         $cmp59$i$i = ($shr58$i$i|0)==(0);
         do {
          if ($cmp59$i$i) {
           $I57$0$i$i = 0;
          } else {
           $cmp63$i$i = ($sub$ptr$sub$i44$i>>>0)>(16777215);
           if ($cmp63$i$i) {
            $I57$0$i$i = 31;
            break;
           }
           $sub67$i$i = (($shr58$i$i) + 1048320)|0;
           $shr68$i$i = $sub67$i$i >>> 16;
           $and69$i$i = $shr68$i$i & 8;
           $shl70$i$i = $shr58$i$i << $and69$i$i;
           $sub71$i$i = (($shl70$i$i) + 520192)|0;
           $shr72$i$i = $sub71$i$i >>> 16;
           $and73$i$i = $shr72$i$i & 4;
           $add74$i$i = $and73$i$i | $and69$i$i;
           $shl75$i$i = $shl70$i$i << $and73$i$i;
           $sub76$i$i = (($shl75$i$i) + 245760)|0;
           $shr77$i$i = $sub76$i$i >>> 16;
           $and78$i$i = $shr77$i$i & 2;
           $add79$i$i = $add74$i$i | $and78$i$i;
           $sub80$i$i = (14 - ($add79$i$i))|0;
           $shl81$i$i = $shl75$i$i << $and78$i$i;
           $shr82$i$i = $shl81$i$i >>> 15;
           $add83$i$i = (($sub80$i$i) + ($shr82$i$i))|0;
           $shl84$i$i = $add83$i$i << 1;
           $add85$i$i = (($add83$i$i) + 7)|0;
           $shr86$i$i = $sub$ptr$sub$i44$i >>> $add85$i$i;
           $and87$i$i = $shr86$i$i & 1;
           $add88$i$i = $and87$i$i | $shl84$i$i;
           $I57$0$i$i = $add88$i$i;
          }
         } while(0);
         $arrayidx91$i$i = (8528 + ($I57$0$i$i<<2)|0);
         $index$i54$i = ((($123)) + 28|0);
         HEAP32[$index$i54$i>>2] = $I57$0$i$i;
         $arrayidx92$i$i = ((($123)) + 20|0);
         HEAP32[$arrayidx92$i$i>>2] = 0;
         HEAP32[$add$ptr81$i$i>>2] = 0;
         $203 = HEAP32[(8228)>>2]|0;
         $shl95$i$i = 1 << $I57$0$i$i;
         $and96$i$i = $203 & $shl95$i$i;
         $tobool97$i$i = ($and96$i$i|0)==(0);
         if ($tobool97$i$i) {
          $or101$i$i = $203 | $shl95$i$i;
          HEAP32[(8228)>>2] = $or101$i$i;
          HEAP32[$arrayidx91$i$i>>2] = $123;
          $parent$i55$i = ((($123)) + 24|0);
          HEAP32[$parent$i55$i>>2] = $arrayidx91$i$i;
          $bk102$i$i = ((($123)) + 12|0);
          HEAP32[$bk102$i$i>>2] = $123;
          $fd103$i$i = ((($123)) + 8|0);
          HEAP32[$fd103$i$i>>2] = $123;
          break;
         }
         $204 = HEAP32[$arrayidx91$i$i>>2]|0;
         $cmp106$i$i = ($I57$0$i$i|0)==(31);
         $shr110$i$i = $I57$0$i$i >>> 1;
         $sub113$i$i = (25 - ($shr110$i$i))|0;
         $cond115$i$i = $cmp106$i$i ? 0 : $sub113$i$i;
         $shl116$i$i = $sub$ptr$sub$i44$i << $cond115$i$i;
         $K105$0$i$i = $shl116$i$i;$T$0$i56$i = $204;
         while(1) {
          $head118$i$i = ((($T$0$i56$i)) + 4|0);
          $205 = HEAP32[$head118$i$i>>2]|0;
          $and119$i$i = $205 & -8;
          $cmp120$i57$i = ($and119$i$i|0)==($sub$ptr$sub$i44$i|0);
          if ($cmp120$i57$i) {
           label = 307;
           break;
          }
          $shr124$i$i = $K105$0$i$i >>> 31;
          $arrayidx126$i$i = (((($T$0$i56$i)) + 16|0) + ($shr124$i$i<<2)|0);
          $shl127$i$i = $K105$0$i$i << 1;
          $206 = HEAP32[$arrayidx126$i$i>>2]|0;
          $cmp128$i$i = ($206|0)==(0|0);
          if ($cmp128$i$i) {
           label = 304;
           break;
          } else {
           $K105$0$i$i = $shl127$i$i;$T$0$i56$i = $206;
          }
         }
         if ((label|0) == 304) {
          $207 = HEAP32[(8240)>>2]|0;
          $cmp133$i$i = ($arrayidx126$i$i>>>0)<($207>>>0);
          if ($cmp133$i$i) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$arrayidx126$i$i>>2] = $123;
           $parent138$i$i = ((($123)) + 24|0);
           HEAP32[$parent138$i$i>>2] = $T$0$i56$i;
           $bk139$i$i = ((($123)) + 12|0);
           HEAP32[$bk139$i$i>>2] = $123;
           $fd140$i$i = ((($123)) + 8|0);
           HEAP32[$fd140$i$i>>2] = $123;
           break;
          }
         }
         else if ((label|0) == 307) {
          $fd148$i$i = ((($T$0$i56$i)) + 8|0);
          $208 = HEAP32[$fd148$i$i>>2]|0;
          $209 = HEAP32[(8240)>>2]|0;
          $cmp153$i$i = ($208>>>0)>=($209>>>0);
          $not$cmp150$i$i = ($T$0$i56$i>>>0)>=($209>>>0);
          $210 = $cmp153$i$i & $not$cmp150$i$i;
          if ($210) {
           $bk158$i$i = ((($208)) + 12|0);
           HEAP32[$bk158$i$i>>2] = $123;
           HEAP32[$fd148$i$i>>2] = $123;
           $fd160$i$i = ((($123)) + 8|0);
           HEAP32[$fd160$i$i>>2] = $208;
           $bk161$i$i = ((($123)) + 12|0);
           HEAP32[$bk161$i$i>>2] = $T$0$i56$i;
           $parent162$i$i = ((($123)) + 24|0);
           HEAP32[$parent162$i$i>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       }
      } while(0);
      $211 = HEAP32[(8236)>>2]|0;
      $cmp261$i = ($211>>>0)>($nb$0>>>0);
      if ($cmp261$i) {
       $sub264$i = (($211) - ($nb$0))|0;
       HEAP32[(8236)>>2] = $sub264$i;
       $212 = HEAP32[(8248)>>2]|0;
       $add$ptr266$i = (($212) + ($nb$0)|0);
       HEAP32[(8248)>>2] = $add$ptr266$i;
       $or268$i = $sub264$i | 1;
       $head269$i = ((($add$ptr266$i)) + 4|0);
       HEAP32[$head269$i>>2] = $or268$i;
       $or271$i = $nb$0 | 3;
       $head272$i = ((($212)) + 4|0);
       HEAP32[$head272$i>>2] = $or271$i;
       $add$ptr273$i205 = ((($212)) + 8|0);
       $mem$2 = $add$ptr273$i205;
       break;
      }
     }
    }
    $call279$i = (___errno_location()|0);
    HEAP32[$call279$i>>2] = 12;
    $mem$2 = 0;
   } else {
    $mem$2 = 0;
   }
  }
 } while(0);
 $213 = HEAP32[(8668)>>2]|0;
 $and218 = $213 & 2;
 $tobool219 = ($and218|0)==(0);
 if ($tobool219) {
  $retval$1 = $mem$2;
  STACKTOP = sp;return ($retval$1|0);
 }
 (___pthread_mutex_unlock((8672))|0);
 $retval$1 = $mem$2;
 STACKTOP = sp;return ($retval$1|0);
}
function _free($mem) {
 $mem = $mem|0;
 var $$pre = 0, $$pre$phiZ2D = 0, $$pre308 = 0, $$pre309 = 0, $$sink = 0, $$sink4 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0;
 var $76 = 0, $8 = 0, $9 = 0, $F514$0 = 0, $I538$0 = 0, $K587$0 = 0, $R$1 = 0, $R$3 = 0, $R336$1 = 0, $R336$3 = 0, $RP$1 = 0, $RP364$1 = 0, $T$0 = 0, $add$ptr = 0, $add$ptr10 = 0, $add$ptr20 = 0, $add$ptr221 = 0, $add$ptr265 = 0, $add$ptr486 = 0, $add$ptr502 = 0;
 var $add21 = 0, $add250 = 0, $add262 = 0, $add271 = 0, $add554 = 0, $add559 = 0, $add563 = 0, $add565 = 0, $add568 = 0, $and = 0, $and12 = 0, $and144 = 0, $and214 = 0, $and219 = 0, $and236 = 0, $and244 = 0, $and270 = 0, $and305 = 0, $and4 = 0, $and414 = 0;
 var $and499 = 0, $and50 = 0, $and516 = 0, $and549 = 0, $and553 = 0, $and558 = 0, $and567 = 0, $and578 = 0, $and598 = 0, $and658 = 0, $and9 = 0, $arrayidx = 0, $arrayidx103 = 0, $arrayidx112 = 0, $arrayidx117 = 0, $arrayidx134 = 0, $arrayidx153 = 0, $arrayidx161 = 0, $arrayidx186 = 0, $arrayidx192 = 0;
 var $arrayidx202 = 0, $arrayidx283 = 0, $arrayidx366 = 0, $arrayidx378 = 0, $arrayidx383 = 0, $arrayidx404 = 0, $arrayidx423 = 0, $arrayidx431 = 0, $arrayidx458 = 0, $arrayidx464 = 0, $arrayidx474 = 0, $arrayidx513 = 0, $arrayidx571 = 0, $arrayidx574 = 0, $arrayidx605 = 0, $bk = 0, $bk279 = 0, $bk290 = 0, $bk325 = 0, $bk337 = 0;
 var $bk347 = 0, $bk38 = 0, $bk533 = 0, $bk535 = 0, $bk584 = 0, $bk617 = 0, $bk637 = 0, $bk640 = 0, $bk70 = 0, $bk77 = 0, $bk86 = 0, $call = 0, $child = 0, $child175 = 0, $child365 = 0, $child447 = 0, $child573 = 0, $cmp = 0, $cmp$i = 0, $cmp104 = 0;
 var $cmp108 = 0, $cmp113 = 0, $cmp118 = 0, $cmp122 = 0, $cmp131 = 0, $cmp135 = 0, $cmp147 = 0, $cmp166 = 0, $cmp169 = 0, $cmp17 = 0, $cmp177 = 0, $cmp180 = 0, $cmp193 = 0, $cmp196 = 0, $cmp215 = 0, $cmp22 = 0, $cmp232 = 0, $cmp247 = 0, $cmp253 = 0, $cmp259 = 0;
 var $cmp26 = 0, $cmp273 = 0, $cmp284 = 0, $cmp287 = 0, $cmp29 = 0, $cmp291 = 0, $cmp3 = 0, $cmp300 = 0, $cmp309 = 0, $cmp312 = 0, $cmp316 = 0, $cmp33 = 0, $cmp338 = 0, $cmp344 = 0, $cmp348 = 0, $cmp35 = 0, $cmp352 = 0, $cmp367 = 0, $cmp372 = 0, $cmp379 = 0;
 var $cmp384 = 0, $cmp39 = 0, $cmp390 = 0, $cmp399 = 0, $cmp405 = 0, $cmp417 = 0, $cmp436 = 0, $cmp439 = 0, $cmp449 = 0, $cmp452 = 0, $cmp46 = 0, $cmp465 = 0, $cmp468 = 0, $cmp488 = 0, $cmp5 = 0, $cmp506 = 0, $cmp523 = 0, $cmp54 = 0, $cmp540 = 0, $cmp544 = 0;
 var $cmp57 = 0, $cmp588 = 0, $cmp599 = 0, $cmp607 = 0, $cmp61 = 0, $cmp611 = 0, $cmp630 = 0, $cmp646 = 0, $cmp78 = 0, $cmp84 = 0, $cmp87 = 0, $cmp91 = 0, $cond = 0, $cond292 = 0, $cond293 = 0, $dec = 0, $fd = 0, $fd277 = 0, $fd315 = 0, $fd326$pre$phiZ2D = 0;
 var $fd342 = 0, $fd351 = 0, $fd534 = 0, $fd585 = 0, $fd60 = 0, $fd618 = 0, $fd626 = 0, $fd639 = 0, $fd71$pre$phiZ2D = 0, $fd82 = 0, $fd90 = 0, $head = 0, $head213 = 0, $head220 = 0, $head235 = 0, $head252 = 0, $head264 = 0, $head485 = 0, $head501 = 0, $head597 = 0;
 var $idx$neg = 0, $index = 0, $index403 = 0, $index572 = 0, $neg = 0, $neg143 = 0, $neg304 = 0, $neg413 = 0, $next4$i = 0, $not$cmp154 = 0, $not$cmp424 = 0, $not$cmp627 = 0, $or = 0, $or251 = 0, $or263 = 0, $or484 = 0, $or500 = 0, $or520 = 0, $or582 = 0, $p$1 = 0;
 var $parent = 0, $parent174 = 0, $parent187 = 0, $parent203 = 0, $parent335 = 0, $parent446 = 0, $parent459 = 0, $parent475 = 0, $parent583 = 0, $parent616 = 0, $parent641 = 0, $psize$1 = 0, $psize$2 = 0, $shl = 0, $shl142 = 0, $shl282 = 0, $shl303 = 0, $shl412 = 0, $shl49 = 0, $shl512 = 0;
 var $shl515 = 0, $shl550 = 0, $shl555 = 0, $shl561 = 0, $shl564 = 0, $shl577 = 0, $shl596 = 0, $shl606 = 0, $shr = 0, $shr272 = 0, $shr505 = 0, $shr539 = 0, $shr548 = 0, $shr552 = 0, $shr557 = 0, $shr562 = 0, $shr566 = 0, $shr592 = 0, $shr603 = 0, $sp$0$i = 0;
 var $sp$0$in$i = 0, $sub = 0, $sub551 = 0, $sub556 = 0, $sub560 = 0, $sub595 = 0, $tobool = 0, $tobool1 = 0, $tobool13 = 0, $tobool237 = 0, $tobool245 = 0, $tobool517 = 0, $tobool579 = 0, $tobool659 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($mem|0)==(0|0);
 if ($cmp) {
  return;
 }
 $add$ptr = ((($mem)) + -8|0);
 $0 = HEAP32[(8668)>>2]|0;
 $and = $0 & 2;
 $tobool = ($and|0)==(0);
 if (!($tobool)) {
  $call = (___pthread_mutex_lock((8672))|0);
  $tobool1 = ($call|0)==(0);
  if (!($tobool1)) {
   return;
  }
 }
 $1 = HEAP32[(8240)>>2]|0;
 $cmp3 = ($add$ptr>>>0)<($1>>>0);
 if ($cmp3) {
  _abort();
  // unreachable;
 }
 $head = ((($mem)) + -4|0);
 $2 = HEAP32[$head>>2]|0;
 $and4 = $2 & 3;
 $cmp5 = ($and4|0)==(1);
 if ($cmp5) {
  _abort();
  // unreachable;
 }
 $and9 = $2 & -8;
 $add$ptr10 = (($add$ptr) + ($and9)|0);
 $and12 = $2 & 1;
 $tobool13 = ($and12|0)==(0);
 L14: do {
  if ($tobool13) {
   $3 = HEAP32[$add$ptr>>2]|0;
   $cmp17 = ($and4|0)==(0);
   if (!($cmp17)) {
    $idx$neg = (0 - ($3))|0;
    $add$ptr20 = (($add$ptr) + ($idx$neg)|0);
    $add21 = (($3) + ($and9))|0;
    $cmp22 = ($add$ptr20>>>0)<($1>>>0);
    if ($cmp22) {
     _abort();
     // unreachable;
    }
    $4 = HEAP32[(8244)>>2]|0;
    $cmp26 = ($add$ptr20|0)==($4|0);
    if ($cmp26) {
     $head213 = ((($add$ptr10)) + 4|0);
     $28 = HEAP32[$head213>>2]|0;
     $and214 = $28 & 3;
     $cmp215 = ($and214|0)==(3);
     if (!($cmp215)) {
      $29 = $add$ptr20;$p$1 = $add$ptr20;$psize$1 = $add21;
      label = 55;
      break;
     }
     $add$ptr221 = (($add$ptr20) + ($add21)|0);
     $head220 = ((($add$ptr20)) + 4|0);
     $or = $add21 | 1;
     $and219 = $28 & -2;
     HEAP32[(8232)>>2] = $add21;
     HEAP32[$head213>>2] = $and219;
     HEAP32[$head220>>2] = $or;
     HEAP32[$add$ptr221>>2] = $add21;
     break;
    }
    $shr = $3 >>> 3;
    $cmp29 = ($3>>>0)<(256);
    if ($cmp29) {
     $fd = ((($add$ptr20)) + 8|0);
     $5 = HEAP32[$fd>>2]|0;
     $bk = ((($add$ptr20)) + 12|0);
     $6 = HEAP32[$bk>>2]|0;
     $shl = $shr << 1;
     $arrayidx = (8264 + ($shl<<2)|0);
     $cmp33 = ($5|0)==($arrayidx|0);
     if (!($cmp33)) {
      $cmp35 = ($5>>>0)<($1>>>0);
      if ($cmp35) {
       _abort();
       // unreachable;
      }
      $bk38 = ((($5)) + 12|0);
      $7 = HEAP32[$bk38>>2]|0;
      $cmp39 = ($7|0)==($add$ptr20|0);
      if (!($cmp39)) {
       _abort();
       // unreachable;
      }
     }
     $cmp46 = ($6|0)==($5|0);
     if ($cmp46) {
      $shl49 = 1 << $shr;
      $neg = $shl49 ^ -1;
      $8 = HEAP32[2056]|0;
      $and50 = $8 & $neg;
      HEAP32[2056] = $and50;
      $29 = $add$ptr20;$p$1 = $add$ptr20;$psize$1 = $add21;
      label = 55;
      break;
     }
     $cmp54 = ($6|0)==($arrayidx|0);
     if ($cmp54) {
      $$pre309 = ((($6)) + 8|0);
      $fd71$pre$phiZ2D = $$pre309;
     } else {
      $cmp57 = ($6>>>0)<($1>>>0);
      if ($cmp57) {
       _abort();
       // unreachable;
      }
      $fd60 = ((($6)) + 8|0);
      $9 = HEAP32[$fd60>>2]|0;
      $cmp61 = ($9|0)==($add$ptr20|0);
      if ($cmp61) {
       $fd71$pre$phiZ2D = $fd60;
      } else {
       _abort();
       // unreachable;
      }
     }
     $bk70 = ((($5)) + 12|0);
     HEAP32[$bk70>>2] = $6;
     HEAP32[$fd71$pre$phiZ2D>>2] = $5;
     $29 = $add$ptr20;$p$1 = $add$ptr20;$psize$1 = $add21;
     label = 55;
     break;
    }
    $parent = ((($add$ptr20)) + 24|0);
    $10 = HEAP32[$parent>>2]|0;
    $bk77 = ((($add$ptr20)) + 12|0);
    $11 = HEAP32[$bk77>>2]|0;
    $cmp78 = ($11|0)==($add$ptr20|0);
    do {
     if ($cmp78) {
      $child = ((($add$ptr20)) + 16|0);
      $arrayidx103 = ((($child)) + 4|0);
      $15 = HEAP32[$arrayidx103>>2]|0;
      $cmp104 = ($15|0)==(0|0);
      if ($cmp104) {
       $16 = HEAP32[$child>>2]|0;
       $cmp108 = ($16|0)==(0|0);
       if ($cmp108) {
        $R$3 = 0;
        break;
       } else {
        $R$1 = $16;$RP$1 = $child;
       }
      } else {
       $R$1 = $15;$RP$1 = $arrayidx103;
      }
      while(1) {
       $arrayidx112 = ((($R$1)) + 20|0);
       $17 = HEAP32[$arrayidx112>>2]|0;
       $cmp113 = ($17|0)==(0|0);
       if (!($cmp113)) {
        $R$1 = $17;$RP$1 = $arrayidx112;
        continue;
       }
       $arrayidx117 = ((($R$1)) + 16|0);
       $18 = HEAP32[$arrayidx117>>2]|0;
       $cmp118 = ($18|0)==(0|0);
       if ($cmp118) {
        break;
       } else {
        $R$1 = $18;$RP$1 = $arrayidx117;
       }
      }
      $cmp122 = ($RP$1>>>0)<($1>>>0);
      if ($cmp122) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$RP$1>>2] = 0;
       $R$3 = $R$1;
       break;
      }
     } else {
      $fd82 = ((($add$ptr20)) + 8|0);
      $12 = HEAP32[$fd82>>2]|0;
      $cmp84 = ($12>>>0)<($1>>>0);
      if ($cmp84) {
       _abort();
       // unreachable;
      }
      $bk86 = ((($12)) + 12|0);
      $13 = HEAP32[$bk86>>2]|0;
      $cmp87 = ($13|0)==($add$ptr20|0);
      if (!($cmp87)) {
       _abort();
       // unreachable;
      }
      $fd90 = ((($11)) + 8|0);
      $14 = HEAP32[$fd90>>2]|0;
      $cmp91 = ($14|0)==($add$ptr20|0);
      if ($cmp91) {
       HEAP32[$bk86>>2] = $11;
       HEAP32[$fd90>>2] = $12;
       $R$3 = $11;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $cmp131 = ($10|0)==(0|0);
    if ($cmp131) {
     $29 = $add$ptr20;$p$1 = $add$ptr20;$psize$1 = $add21;
     label = 55;
    } else {
     $index = ((($add$ptr20)) + 28|0);
     $19 = HEAP32[$index>>2]|0;
     $arrayidx134 = (8528 + ($19<<2)|0);
     $20 = HEAP32[$arrayidx134>>2]|0;
     $cmp135 = ($add$ptr20|0)==($20|0);
     do {
      if ($cmp135) {
       HEAP32[$arrayidx134>>2] = $R$3;
       $cond292 = ($R$3|0)==(0|0);
       if ($cond292) {
        $shl142 = 1 << $19;
        $neg143 = $shl142 ^ -1;
        $21 = HEAP32[(8228)>>2]|0;
        $and144 = $21 & $neg143;
        HEAP32[(8228)>>2] = $and144;
        $29 = $add$ptr20;$p$1 = $add$ptr20;$psize$1 = $add21;
        label = 55;
        break L14;
       }
      } else {
       $22 = HEAP32[(8240)>>2]|0;
       $cmp147 = ($10>>>0)<($22>>>0);
       if ($cmp147) {
        _abort();
        // unreachable;
       } else {
        $arrayidx153 = ((($10)) + 16|0);
        $23 = HEAP32[$arrayidx153>>2]|0;
        $not$cmp154 = ($23|0)!=($add$ptr20|0);
        $$sink = $not$cmp154&1;
        $arrayidx161 = (((($10)) + 16|0) + ($$sink<<2)|0);
        HEAP32[$arrayidx161>>2] = $R$3;
        $cmp166 = ($R$3|0)==(0|0);
        if ($cmp166) {
         $29 = $add$ptr20;$p$1 = $add$ptr20;$psize$1 = $add21;
         label = 55;
         break L14;
        } else {
         break;
        }
       }
      }
     } while(0);
     $24 = HEAP32[(8240)>>2]|0;
     $cmp169 = ($R$3>>>0)<($24>>>0);
     if ($cmp169) {
      _abort();
      // unreachable;
     }
     $parent174 = ((($R$3)) + 24|0);
     HEAP32[$parent174>>2] = $10;
     $child175 = ((($add$ptr20)) + 16|0);
     $25 = HEAP32[$child175>>2]|0;
     $cmp177 = ($25|0)==(0|0);
     do {
      if (!($cmp177)) {
       $cmp180 = ($25>>>0)<($24>>>0);
       if ($cmp180) {
        _abort();
        // unreachable;
       } else {
        $arrayidx186 = ((($R$3)) + 16|0);
        HEAP32[$arrayidx186>>2] = $25;
        $parent187 = ((($25)) + 24|0);
        HEAP32[$parent187>>2] = $R$3;
        break;
       }
      }
     } while(0);
     $arrayidx192 = ((($child175)) + 4|0);
     $26 = HEAP32[$arrayidx192>>2]|0;
     $cmp193 = ($26|0)==(0|0);
     if ($cmp193) {
      $29 = $add$ptr20;$p$1 = $add$ptr20;$psize$1 = $add21;
      label = 55;
     } else {
      $27 = HEAP32[(8240)>>2]|0;
      $cmp196 = ($26>>>0)<($27>>>0);
      if ($cmp196) {
       _abort();
       // unreachable;
      } else {
       $arrayidx202 = ((($R$3)) + 20|0);
       HEAP32[$arrayidx202>>2] = $26;
       $parent203 = ((($26)) + 24|0);
       HEAP32[$parent203>>2] = $R$3;
       $29 = $add$ptr20;$p$1 = $add$ptr20;$psize$1 = $add21;
       label = 55;
       break;
      }
     }
    }
   }
  } else {
   $29 = $add$ptr;$p$1 = $add$ptr;$psize$1 = $and9;
   label = 55;
  }
 } while(0);
 do {
  if ((label|0) == 55) {
   $cmp232 = ($29>>>0)<($add$ptr10>>>0);
   if (!($cmp232)) {
    _abort();
    // unreachable;
   }
   $head235 = ((($add$ptr10)) + 4|0);
   $30 = HEAP32[$head235>>2]|0;
   $and236 = $30 & 1;
   $tobool237 = ($and236|0)==(0);
   if ($tobool237) {
    _abort();
    // unreachable;
   }
   $and244 = $30 & 2;
   $tobool245 = ($and244|0)==(0);
   if ($tobool245) {
    $31 = HEAP32[(8248)>>2]|0;
    $cmp247 = ($add$ptr10|0)==($31|0);
    $32 = HEAP32[(8244)>>2]|0;
    if ($cmp247) {
     $33 = HEAP32[(8236)>>2]|0;
     $add250 = (($33) + ($psize$1))|0;
     HEAP32[(8236)>>2] = $add250;
     HEAP32[(8248)>>2] = $p$1;
     $or251 = $add250 | 1;
     $head252 = ((($p$1)) + 4|0);
     HEAP32[$head252>>2] = $or251;
     $cmp253 = ($p$1|0)==($32|0);
     if (!($cmp253)) {
      break;
     }
     HEAP32[(8244)>>2] = 0;
     HEAP32[(8232)>>2] = 0;
     break;
    }
    $cmp259 = ($add$ptr10|0)==($32|0);
    if ($cmp259) {
     $34 = HEAP32[(8232)>>2]|0;
     $add262 = (($34) + ($psize$1))|0;
     HEAP32[(8232)>>2] = $add262;
     HEAP32[(8244)>>2] = $29;
     $or263 = $add262 | 1;
     $head264 = ((($p$1)) + 4|0);
     HEAP32[$head264>>2] = $or263;
     $add$ptr265 = (($29) + ($add262)|0);
     HEAP32[$add$ptr265>>2] = $add262;
     break;
    }
    $and270 = $30 & -8;
    $add271 = (($and270) + ($psize$1))|0;
    $shr272 = $30 >>> 3;
    $cmp273 = ($30>>>0)<(256);
    L106: do {
     if ($cmp273) {
      $fd277 = ((($add$ptr10)) + 8|0);
      $35 = HEAP32[$fd277>>2]|0;
      $bk279 = ((($add$ptr10)) + 12|0);
      $36 = HEAP32[$bk279>>2]|0;
      $shl282 = $shr272 << 1;
      $arrayidx283 = (8264 + ($shl282<<2)|0);
      $cmp284 = ($35|0)==($arrayidx283|0);
      if (!($cmp284)) {
       $37 = HEAP32[(8240)>>2]|0;
       $cmp287 = ($35>>>0)<($37>>>0);
       if ($cmp287) {
        _abort();
        // unreachable;
       }
       $bk290 = ((($35)) + 12|0);
       $38 = HEAP32[$bk290>>2]|0;
       $cmp291 = ($38|0)==($add$ptr10|0);
       if (!($cmp291)) {
        _abort();
        // unreachable;
       }
      }
      $cmp300 = ($36|0)==($35|0);
      if ($cmp300) {
       $shl303 = 1 << $shr272;
       $neg304 = $shl303 ^ -1;
       $39 = HEAP32[2056]|0;
       $and305 = $39 & $neg304;
       HEAP32[2056] = $and305;
       break;
      }
      $cmp309 = ($36|0)==($arrayidx283|0);
      if ($cmp309) {
       $$pre308 = ((($36)) + 8|0);
       $fd326$pre$phiZ2D = $$pre308;
      } else {
       $40 = HEAP32[(8240)>>2]|0;
       $cmp312 = ($36>>>0)<($40>>>0);
       if ($cmp312) {
        _abort();
        // unreachable;
       }
       $fd315 = ((($36)) + 8|0);
       $41 = HEAP32[$fd315>>2]|0;
       $cmp316 = ($41|0)==($add$ptr10|0);
       if ($cmp316) {
        $fd326$pre$phiZ2D = $fd315;
       } else {
        _abort();
        // unreachable;
       }
      }
      $bk325 = ((($35)) + 12|0);
      HEAP32[$bk325>>2] = $36;
      HEAP32[$fd326$pre$phiZ2D>>2] = $35;
     } else {
      $parent335 = ((($add$ptr10)) + 24|0);
      $42 = HEAP32[$parent335>>2]|0;
      $bk337 = ((($add$ptr10)) + 12|0);
      $43 = HEAP32[$bk337>>2]|0;
      $cmp338 = ($43|0)==($add$ptr10|0);
      do {
       if ($cmp338) {
        $child365 = ((($add$ptr10)) + 16|0);
        $arrayidx366 = ((($child365)) + 4|0);
        $48 = HEAP32[$arrayidx366>>2]|0;
        $cmp367 = ($48|0)==(0|0);
        if ($cmp367) {
         $49 = HEAP32[$child365>>2]|0;
         $cmp372 = ($49|0)==(0|0);
         if ($cmp372) {
          $R336$3 = 0;
          break;
         } else {
          $R336$1 = $49;$RP364$1 = $child365;
         }
        } else {
         $R336$1 = $48;$RP364$1 = $arrayidx366;
        }
        while(1) {
         $arrayidx378 = ((($R336$1)) + 20|0);
         $50 = HEAP32[$arrayidx378>>2]|0;
         $cmp379 = ($50|0)==(0|0);
         if (!($cmp379)) {
          $R336$1 = $50;$RP364$1 = $arrayidx378;
          continue;
         }
         $arrayidx383 = ((($R336$1)) + 16|0);
         $51 = HEAP32[$arrayidx383>>2]|0;
         $cmp384 = ($51|0)==(0|0);
         if ($cmp384) {
          break;
         } else {
          $R336$1 = $51;$RP364$1 = $arrayidx383;
         }
        }
        $52 = HEAP32[(8240)>>2]|0;
        $cmp390 = ($RP364$1>>>0)<($52>>>0);
        if ($cmp390) {
         _abort();
         // unreachable;
        } else {
         HEAP32[$RP364$1>>2] = 0;
         $R336$3 = $R336$1;
         break;
        }
       } else {
        $fd342 = ((($add$ptr10)) + 8|0);
        $44 = HEAP32[$fd342>>2]|0;
        $45 = HEAP32[(8240)>>2]|0;
        $cmp344 = ($44>>>0)<($45>>>0);
        if ($cmp344) {
         _abort();
         // unreachable;
        }
        $bk347 = ((($44)) + 12|0);
        $46 = HEAP32[$bk347>>2]|0;
        $cmp348 = ($46|0)==($add$ptr10|0);
        if (!($cmp348)) {
         _abort();
         // unreachable;
        }
        $fd351 = ((($43)) + 8|0);
        $47 = HEAP32[$fd351>>2]|0;
        $cmp352 = ($47|0)==($add$ptr10|0);
        if ($cmp352) {
         HEAP32[$bk347>>2] = $43;
         HEAP32[$fd351>>2] = $44;
         $R336$3 = $43;
         break;
        } else {
         _abort();
         // unreachable;
        }
       }
      } while(0);
      $cmp399 = ($42|0)==(0|0);
      if (!($cmp399)) {
       $index403 = ((($add$ptr10)) + 28|0);
       $53 = HEAP32[$index403>>2]|0;
       $arrayidx404 = (8528 + ($53<<2)|0);
       $54 = HEAP32[$arrayidx404>>2]|0;
       $cmp405 = ($add$ptr10|0)==($54|0);
       do {
        if ($cmp405) {
         HEAP32[$arrayidx404>>2] = $R336$3;
         $cond293 = ($R336$3|0)==(0|0);
         if ($cond293) {
          $shl412 = 1 << $53;
          $neg413 = $shl412 ^ -1;
          $55 = HEAP32[(8228)>>2]|0;
          $and414 = $55 & $neg413;
          HEAP32[(8228)>>2] = $and414;
          break L106;
         }
        } else {
         $56 = HEAP32[(8240)>>2]|0;
         $cmp417 = ($42>>>0)<($56>>>0);
         if ($cmp417) {
          _abort();
          // unreachable;
         } else {
          $arrayidx423 = ((($42)) + 16|0);
          $57 = HEAP32[$arrayidx423>>2]|0;
          $not$cmp424 = ($57|0)!=($add$ptr10|0);
          $$sink4 = $not$cmp424&1;
          $arrayidx431 = (((($42)) + 16|0) + ($$sink4<<2)|0);
          HEAP32[$arrayidx431>>2] = $R336$3;
          $cmp436 = ($R336$3|0)==(0|0);
          if ($cmp436) {
           break L106;
          } else {
           break;
          }
         }
        }
       } while(0);
       $58 = HEAP32[(8240)>>2]|0;
       $cmp439 = ($R336$3>>>0)<($58>>>0);
       if ($cmp439) {
        _abort();
        // unreachable;
       }
       $parent446 = ((($R336$3)) + 24|0);
       HEAP32[$parent446>>2] = $42;
       $child447 = ((($add$ptr10)) + 16|0);
       $59 = HEAP32[$child447>>2]|0;
       $cmp449 = ($59|0)==(0|0);
       do {
        if (!($cmp449)) {
         $cmp452 = ($59>>>0)<($58>>>0);
         if ($cmp452) {
          _abort();
          // unreachable;
         } else {
          $arrayidx458 = ((($R336$3)) + 16|0);
          HEAP32[$arrayidx458>>2] = $59;
          $parent459 = ((($59)) + 24|0);
          HEAP32[$parent459>>2] = $R336$3;
          break;
         }
        }
       } while(0);
       $arrayidx464 = ((($child447)) + 4|0);
       $60 = HEAP32[$arrayidx464>>2]|0;
       $cmp465 = ($60|0)==(0|0);
       if (!($cmp465)) {
        $61 = HEAP32[(8240)>>2]|0;
        $cmp468 = ($60>>>0)<($61>>>0);
        if ($cmp468) {
         _abort();
         // unreachable;
        } else {
         $arrayidx474 = ((($R336$3)) + 20|0);
         HEAP32[$arrayidx474>>2] = $60;
         $parent475 = ((($60)) + 24|0);
         HEAP32[$parent475>>2] = $R336$3;
         break;
        }
       }
      }
     }
    } while(0);
    $or484 = $add271 | 1;
    $head485 = ((($p$1)) + 4|0);
    HEAP32[$head485>>2] = $or484;
    $add$ptr486 = (($29) + ($add271)|0);
    HEAP32[$add$ptr486>>2] = $add271;
    $62 = HEAP32[(8244)>>2]|0;
    $cmp488 = ($p$1|0)==($62|0);
    if ($cmp488) {
     HEAP32[(8232)>>2] = $add271;
     break;
    } else {
     $psize$2 = $add271;
    }
   } else {
    $and499 = $30 & -2;
    HEAP32[$head235>>2] = $and499;
    $or500 = $psize$1 | 1;
    $head501 = ((($p$1)) + 4|0);
    HEAP32[$head501>>2] = $or500;
    $add$ptr502 = (($29) + ($psize$1)|0);
    HEAP32[$add$ptr502>>2] = $psize$1;
    $psize$2 = $psize$1;
   }
   $shr505 = $psize$2 >>> 3;
   $cmp506 = ($psize$2>>>0)<(256);
   if ($cmp506) {
    $shl512 = $shr505 << 1;
    $arrayidx513 = (8264 + ($shl512<<2)|0);
    $63 = HEAP32[2056]|0;
    $shl515 = 1 << $shr505;
    $and516 = $63 & $shl515;
    $tobool517 = ($and516|0)==(0);
    if ($tobool517) {
     $or520 = $63 | $shl515;
     HEAP32[2056] = $or520;
     $$pre = ((($arrayidx513)) + 8|0);
     $$pre$phiZ2D = $$pre;$F514$0 = $arrayidx513;
    } else {
     $64 = ((($arrayidx513)) + 8|0);
     $65 = HEAP32[$64>>2]|0;
     $66 = HEAP32[(8240)>>2]|0;
     $cmp523 = ($65>>>0)<($66>>>0);
     if ($cmp523) {
      _abort();
      // unreachable;
     } else {
      $$pre$phiZ2D = $64;$F514$0 = $65;
     }
    }
    HEAP32[$$pre$phiZ2D>>2] = $p$1;
    $bk533 = ((($F514$0)) + 12|0);
    HEAP32[$bk533>>2] = $p$1;
    $fd534 = ((($p$1)) + 8|0);
    HEAP32[$fd534>>2] = $F514$0;
    $bk535 = ((($p$1)) + 12|0);
    HEAP32[$bk535>>2] = $arrayidx513;
    break;
   }
   $shr539 = $psize$2 >>> 8;
   $cmp540 = ($shr539|0)==(0);
   if ($cmp540) {
    $I538$0 = 0;
   } else {
    $cmp544 = ($psize$2>>>0)>(16777215);
    if ($cmp544) {
     $I538$0 = 31;
    } else {
     $sub = (($shr539) + 1048320)|0;
     $shr548 = $sub >>> 16;
     $and549 = $shr548 & 8;
     $shl550 = $shr539 << $and549;
     $sub551 = (($shl550) + 520192)|0;
     $shr552 = $sub551 >>> 16;
     $and553 = $shr552 & 4;
     $add554 = $and553 | $and549;
     $shl555 = $shl550 << $and553;
     $sub556 = (($shl555) + 245760)|0;
     $shr557 = $sub556 >>> 16;
     $and558 = $shr557 & 2;
     $add559 = $add554 | $and558;
     $sub560 = (14 - ($add559))|0;
     $shl561 = $shl555 << $and558;
     $shr562 = $shl561 >>> 15;
     $add563 = (($sub560) + ($shr562))|0;
     $shl564 = $add563 << 1;
     $add565 = (($add563) + 7)|0;
     $shr566 = $psize$2 >>> $add565;
     $and567 = $shr566 & 1;
     $add568 = $and567 | $shl564;
     $I538$0 = $add568;
    }
   }
   $arrayidx571 = (8528 + ($I538$0<<2)|0);
   $index572 = ((($p$1)) + 28|0);
   HEAP32[$index572>>2] = $I538$0;
   $child573 = ((($p$1)) + 16|0);
   $arrayidx574 = ((($p$1)) + 20|0);
   HEAP32[$arrayidx574>>2] = 0;
   HEAP32[$child573>>2] = 0;
   $67 = HEAP32[(8228)>>2]|0;
   $shl577 = 1 << $I538$0;
   $and578 = $67 & $shl577;
   $tobool579 = ($and578|0)==(0);
   do {
    if ($tobool579) {
     $or582 = $67 | $shl577;
     HEAP32[(8228)>>2] = $or582;
     HEAP32[$arrayidx571>>2] = $p$1;
     $parent583 = ((($p$1)) + 24|0);
     HEAP32[$parent583>>2] = $arrayidx571;
     $bk584 = ((($p$1)) + 12|0);
     HEAP32[$bk584>>2] = $p$1;
     $fd585 = ((($p$1)) + 8|0);
     HEAP32[$fd585>>2] = $p$1;
    } else {
     $68 = HEAP32[$arrayidx571>>2]|0;
     $cmp588 = ($I538$0|0)==(31);
     $shr592 = $I538$0 >>> 1;
     $sub595 = (25 - ($shr592))|0;
     $cond = $cmp588 ? 0 : $sub595;
     $shl596 = $psize$2 << $cond;
     $K587$0 = $shl596;$T$0 = $68;
     while(1) {
      $head597 = ((($T$0)) + 4|0);
      $69 = HEAP32[$head597>>2]|0;
      $and598 = $69 & -8;
      $cmp599 = ($and598|0)==($psize$2|0);
      if ($cmp599) {
       label = 126;
       break;
      }
      $shr603 = $K587$0 >>> 31;
      $arrayidx605 = (((($T$0)) + 16|0) + ($shr603<<2)|0);
      $shl606 = $K587$0 << 1;
      $70 = HEAP32[$arrayidx605>>2]|0;
      $cmp607 = ($70|0)==(0|0);
      if ($cmp607) {
       label = 123;
       break;
      } else {
       $K587$0 = $shl606;$T$0 = $70;
      }
     }
     if ((label|0) == 123) {
      $71 = HEAP32[(8240)>>2]|0;
      $cmp611 = ($arrayidx605>>>0)<($71>>>0);
      if ($cmp611) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$arrayidx605>>2] = $p$1;
       $parent616 = ((($p$1)) + 24|0);
       HEAP32[$parent616>>2] = $T$0;
       $bk617 = ((($p$1)) + 12|0);
       HEAP32[$bk617>>2] = $p$1;
       $fd618 = ((($p$1)) + 8|0);
       HEAP32[$fd618>>2] = $p$1;
       break;
      }
     }
     else if ((label|0) == 126) {
      $fd626 = ((($T$0)) + 8|0);
      $72 = HEAP32[$fd626>>2]|0;
      $73 = HEAP32[(8240)>>2]|0;
      $cmp630 = ($72>>>0)>=($73>>>0);
      $not$cmp627 = ($T$0>>>0)>=($73>>>0);
      $74 = $cmp630 & $not$cmp627;
      if ($74) {
       $bk637 = ((($72)) + 12|0);
       HEAP32[$bk637>>2] = $p$1;
       HEAP32[$fd626>>2] = $p$1;
       $fd639 = ((($p$1)) + 8|0);
       HEAP32[$fd639>>2] = $72;
       $bk640 = ((($p$1)) + 12|0);
       HEAP32[$bk640>>2] = $T$0;
       $parent641 = ((($p$1)) + 24|0);
       HEAP32[$parent641>>2] = 0;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    }
   } while(0);
   $75 = HEAP32[(8256)>>2]|0;
   $dec = (($75) + -1)|0;
   HEAP32[(8256)>>2] = $dec;
   $cmp646 = ($dec|0)==(0);
   if ($cmp646) {
    $sp$0$in$i = (8708);
    while(1) {
     $sp$0$i = HEAP32[$sp$0$in$i>>2]|0;
     $cmp$i = ($sp$0$i|0)==(0|0);
     $next4$i = ((($sp$0$i)) + 8|0);
     if ($cmp$i) {
      break;
     } else {
      $sp$0$in$i = $next4$i;
     }
    }
    HEAP32[(8256)>>2] = -1;
   }
  }
 } while(0);
 $76 = HEAP32[(8668)>>2]|0;
 $and658 = $76 & 2;
 $tobool659 = ($and658|0)==(0);
 if ($tobool659) {
  return;
 }
 (___pthread_mutex_unlock((8672))|0);
 return;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($this);
 __ZdlPv($this);
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($this,$thrown_type,$adjustedPtr) {
 $this = $this|0;
 $thrown_type = $thrown_type|0;
 $adjustedPtr = $adjustedPtr|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $call = 0, $cmp = 0, $cmp4 = 0, $dst_ptr_leading_to_static_ptr = 0, $info = 0, $number_of_dst_type = 0, $path_dst_ptr_to_static_ptr = 0, $retval$0 = 0, $retval$2 = 0, $src2dst_offset = 0, $static_type = 0, $vfn = 0, $vtable = 0;
 var dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $info = sp;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$thrown_type,0)|0);
 if ($call) {
  $retval$2 = 1;
 } else {
  $0 = ($thrown_type|0)==(0|0);
  if ($0) {
   $retval$2 = 0;
  } else {
   $1 = (___dynamic_cast($thrown_type,208,192,0)|0);
   $cmp = ($1|0)==(0|0);
   if ($cmp) {
    $retval$2 = 0;
   } else {
    $2 = ((($info)) + 4|0);
    dest=$2; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
    HEAP32[$info>>2] = $1;
    $static_type = ((($info)) + 8|0);
    HEAP32[$static_type>>2] = $this;
    $src2dst_offset = ((($info)) + 12|0);
    HEAP32[$src2dst_offset>>2] = -1;
    $number_of_dst_type = ((($info)) + 48|0);
    HEAP32[$number_of_dst_type>>2] = 1;
    $vtable = HEAP32[$1>>2]|0;
    $vfn = ((($vtable)) + 28|0);
    $3 = HEAP32[$vfn>>2]|0;
    $4 = HEAP32[$adjustedPtr>>2]|0;
    FUNCTION_TABLE_viiii[$3 & 31]($1,$info,$4,1);
    $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
    $5 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
    $cmp4 = ($5|0)==(1);
    if ($cmp4) {
     $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
     $6 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
     HEAP32[$adjustedPtr>>2] = $6;
     $retval$0 = 1;
    } else {
     $retval$0 = 0;
    }
    $retval$2 = $retval$0;
   }
  }
 }
 STACKTOP = sp;return ($retval$2|0);
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($this,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $dst_ptr = $dst_ptr|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $call = 0, $static_type = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,$use_strcmp)|0);
 if ($call) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$info,$dst_ptr,$current_ptr,$path_below);
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($this,$info,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $add = 0, $call = 0, $call3 = 0, $cmp = 0, $cmp12 = 0, $cmp13 = 0, $cmp5 = 0, $cmp7 = 0, $dst_ptr_leading_to_static_ptr = 0, $dst_ptr_not_leading_to_static_ptr = 0, $is_dst_type_derived_from_static_type = 0, $number_to_dst_ptr = 0, $number_to_static_ptr = 0;
 var $path_dst_ptr_to_static_ptr = 0, $path_dynamic_ptr_to_dst_ptr = 0, $search_done = 0, $static_type = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,$use_strcmp)|0);
 do {
  if ($call) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$info,$current_ptr,$path_below);
  } else {
   $1 = HEAP32[$info>>2]|0;
   $call3 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$1,$use_strcmp)|0);
   if ($call3) {
    $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
    $2 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
    $cmp = ($2|0)==($current_ptr|0);
    $path_dynamic_ptr_to_dst_ptr = ((($info)) + 32|0);
    if (!($cmp)) {
     $dst_ptr_not_leading_to_static_ptr = ((($info)) + 20|0);
     $3 = HEAP32[$dst_ptr_not_leading_to_static_ptr>>2]|0;
     $cmp5 = ($3|0)==($current_ptr|0);
     if (!($cmp5)) {
      HEAP32[$path_dynamic_ptr_to_dst_ptr>>2] = $path_below;
      HEAP32[$dst_ptr_not_leading_to_static_ptr>>2] = $current_ptr;
      $number_to_dst_ptr = ((($info)) + 40|0);
      $4 = HEAP32[$number_to_dst_ptr>>2]|0;
      $add = (($4) + 1)|0;
      HEAP32[$number_to_dst_ptr>>2] = $add;
      $number_to_static_ptr = ((($info)) + 36|0);
      $5 = HEAP32[$number_to_static_ptr>>2]|0;
      $cmp12 = ($5|0)==(1);
      if ($cmp12) {
       $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
       $6 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
       $cmp13 = ($6|0)==(2);
       if ($cmp13) {
        $search_done = ((($info)) + 54|0);
        HEAP8[$search_done>>0] = 1;
       }
      }
      $is_dst_type_derived_from_static_type = ((($info)) + 44|0);
      HEAP32[$is_dst_type_derived_from_static_type>>2] = 4;
      break;
     }
    }
    $cmp7 = ($path_below|0)==(1);
    if ($cmp7) {
     HEAP32[$path_dynamic_ptr_to_dst_ptr>>2] = 1;
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($this,$info,$adjustedPtr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $adjustedPtr = $adjustedPtr|0;
 $path_below = $path_below|0;
 var $0 = 0, $call = 0, $static_type = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,0)|0);
 if ($call) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$info,$adjustedPtr,$path_below);
 }
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($x,$y,$0) {
 $x = $x|0;
 $y = $y|0;
 $0 = $0|0;
 var $cmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($x|0)==($y|0);
 return ($cmp|0);
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($this,$info,$adjustedPtr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $adjustedPtr = $adjustedPtr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $2 = 0, $add = 0, $cmp = 0, $cmp4 = 0, $cmp7 = 0, $dst_ptr_leading_to_static_ptr = 0, $number_to_static_ptr = 0, $path_dst_ptr_to_static_ptr = 0, $search_done = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
 $0 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
 $cmp = ($0|0)==(0|0);
 $number_to_static_ptr = ((($info)) + 36|0);
 $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
 do {
  if ($cmp) {
   HEAP32[$dst_ptr_leading_to_static_ptr>>2] = $adjustedPtr;
   HEAP32[$path_dst_ptr_to_static_ptr>>2] = $path_below;
   HEAP32[$number_to_static_ptr>>2] = 1;
  } else {
   $cmp4 = ($0|0)==($adjustedPtr|0);
   if (!($cmp4)) {
    $2 = HEAP32[$number_to_static_ptr>>2]|0;
    $add = (($2) + 1)|0;
    HEAP32[$number_to_static_ptr>>2] = $add;
    HEAP32[$path_dst_ptr_to_static_ptr>>2] = 2;
    $search_done = ((($info)) + 54|0);
    HEAP8[$search_done>>0] = 1;
    break;
   }
   $1 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
   $cmp7 = ($1|0)==(2);
   if ($cmp7) {
    HEAP32[$path_dst_ptr_to_static_ptr>>2] = $path_below;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($this,$info,$current_ptr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $cmp = 0, $cmp2 = 0, $path_dynamic_ptr_to_static_ptr = 0, $static_ptr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_ptr = ((($info)) + 4|0);
 $0 = HEAP32[$static_ptr>>2]|0;
 $cmp = ($0|0)==($current_ptr|0);
 if ($cmp) {
  $path_dynamic_ptr_to_static_ptr = ((($info)) + 28|0);
  $1 = HEAP32[$path_dynamic_ptr_to_static_ptr>>2]|0;
  $cmp2 = ($1|0)==(1);
  if (!($cmp2)) {
   HEAP32[$path_dynamic_ptr_to_static_ptr>>2] = $path_below;
  }
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($this,$info,$dst_ptr,$current_ptr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $dst_ptr = $dst_ptr|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $add = 0, $cmp = 0, $cmp10 = 0, $cmp13 = 0, $cmp18 = 0, $cmp2 = 0, $cmp21 = 0, $cmp5 = 0, $cmp7 = 0, $dst_ptr_leading_to_static_ptr = 0, $found_any_static_type = 0, $found_our_static_ptr = 0, $number_of_dst_type = 0;
 var $number_to_static_ptr = 0, $or$cond = 0, $or$cond19 = 0, $path_dst_ptr_to_static_ptr = 0, $search_done = 0, $static_ptr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $found_any_static_type = ((($info)) + 53|0);
 HEAP8[$found_any_static_type>>0] = 1;
 $static_ptr = ((($info)) + 4|0);
 $0 = HEAP32[$static_ptr>>2]|0;
 $cmp = ($0|0)==($current_ptr|0);
 do {
  if ($cmp) {
   $found_our_static_ptr = ((($info)) + 52|0);
   HEAP8[$found_our_static_ptr>>0] = 1;
   $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
   $1 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
   $cmp2 = ($1|0)==(0|0);
   $search_done = ((($info)) + 54|0);
   $number_of_dst_type = ((($info)) + 48|0);
   $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
   $number_to_static_ptr = ((($info)) + 36|0);
   if ($cmp2) {
    HEAP32[$dst_ptr_leading_to_static_ptr>>2] = $dst_ptr;
    HEAP32[$path_dst_ptr_to_static_ptr>>2] = $path_below;
    HEAP32[$number_to_static_ptr>>2] = 1;
    $2 = HEAP32[$number_of_dst_type>>2]|0;
    $cmp5 = ($2|0)==(1);
    $cmp7 = ($path_below|0)==(1);
    $or$cond = $cmp5 & $cmp7;
    if (!($or$cond)) {
     break;
    }
    HEAP8[$search_done>>0] = 1;
    break;
   }
   $cmp10 = ($1|0)==($dst_ptr|0);
   if (!($cmp10)) {
    $6 = HEAP32[$number_to_static_ptr>>2]|0;
    $add = (($6) + 1)|0;
    HEAP32[$number_to_static_ptr>>2] = $add;
    HEAP8[$search_done>>0] = 1;
    break;
   }
   $3 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
   $cmp13 = ($3|0)==(2);
   if ($cmp13) {
    HEAP32[$path_dst_ptr_to_static_ptr>>2] = $path_below;
    $5 = $path_below;
   } else {
    $5 = $3;
   }
   $4 = HEAP32[$number_of_dst_type>>2]|0;
   $cmp18 = ($4|0)==(1);
   $cmp21 = ($5|0)==(1);
   $or$cond19 = $cmp18 & $cmp21;
   if ($or$cond19) {
    HEAP8[$search_done>>0] = 1;
   }
  }
 } while(0);
 return;
}
function ___dynamic_cast($static_ptr,$static_type,$dst_type,$src2dst_offset) {
 $static_ptr = $static_ptr|0;
 $static_type = $static_type|0;
 $dst_type = $dst_type|0;
 $src2dst_offset = $src2dst_offset|0;
 var $$ = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add$ptr = 0, $add$ptr$ = 0, $arrayidx = 0;
 var $arrayidx1 = 0, $call = 0, $cmp = 0, $cmp14 = 0, $cmp16 = 0, $cmp19 = 0, $cmp25 = 0, $cmp27 = 0, $cmp30 = 0, $cmp33 = 0, $dst_ptr$0 = 0, $dst_ptr_leading_to_static_ptr = 0, $dst_ptr_not_leading_to_static_ptr = 0, $info = 0, $number_of_dst_type = 0, $number_to_dst_ptr = 0, $number_to_static_ptr = 0, $or$cond = 0, $or$cond15 = 0, $or$cond16 = 0;
 var $or$cond17 = 0, $path_dst_ptr_to_static_ptr = 0, $path_dynamic_ptr_to_dst_ptr = 0, $path_dynamic_ptr_to_static_ptr = 0, $src2dst_offset5 = 0, $static_ptr3 = 0, $static_type4 = 0, $vfn = 0, $vfn11 = 0, $vtable10 = 0, $vtable7 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $info = sp;
 $0 = HEAP32[$static_ptr>>2]|0;
 $arrayidx = ((($0)) + -8|0);
 $1 = HEAP32[$arrayidx>>2]|0;
 $add$ptr = (($static_ptr) + ($1)|0);
 $arrayidx1 = ((($0)) + -4|0);
 $2 = HEAP32[$arrayidx1>>2]|0;
 HEAP32[$info>>2] = $dst_type;
 $static_ptr3 = ((($info)) + 4|0);
 HEAP32[$static_ptr3>>2] = $static_ptr;
 $static_type4 = ((($info)) + 8|0);
 HEAP32[$static_type4>>2] = $static_type;
 $src2dst_offset5 = ((($info)) + 12|0);
 HEAP32[$src2dst_offset5>>2] = $src2dst_offset;
 $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
 $dst_ptr_not_leading_to_static_ptr = ((($info)) + 20|0);
 $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
 $path_dynamic_ptr_to_static_ptr = ((($info)) + 28|0);
 $path_dynamic_ptr_to_dst_ptr = ((($info)) + 32|0);
 $number_to_dst_ptr = ((($info)) + 40|0);
 dest=$dst_ptr_leading_to_static_ptr; stop=dest+36|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));HEAP16[$dst_ptr_leading_to_static_ptr+36>>1]=0|0;HEAP8[$dst_ptr_leading_to_static_ptr+38>>0]=0|0;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($2,$dst_type,0)|0);
 L1: do {
  if ($call) {
   $number_of_dst_type = ((($info)) + 48|0);
   HEAP32[$number_of_dst_type>>2] = 1;
   $vtable7 = HEAP32[$2>>2]|0;
   $vfn = ((($vtable7)) + 20|0);
   $3 = HEAP32[$vfn>>2]|0;
   FUNCTION_TABLE_viiiiii[$3 & 31]($2,$info,$add$ptr,$add$ptr,1,0);
   $4 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
   $cmp = ($4|0)==(1);
   $add$ptr$ = $cmp ? $add$ptr : 0;
   $dst_ptr$0 = $add$ptr$;
  } else {
   $number_to_static_ptr = ((($info)) + 36|0);
   $vtable10 = HEAP32[$2>>2]|0;
   $vfn11 = ((($vtable10)) + 24|0);
   $5 = HEAP32[$vfn11>>2]|0;
   FUNCTION_TABLE_viiiii[$5 & 31]($2,$info,$add$ptr,1,0);
   $6 = HEAP32[$number_to_static_ptr>>2]|0;
   switch ($6|0) {
   case 0:  {
    $7 = HEAP32[$number_to_dst_ptr>>2]|0;
    $cmp14 = ($7|0)==(1);
    $8 = HEAP32[$path_dynamic_ptr_to_static_ptr>>2]|0;
    $cmp16 = ($8|0)==(1);
    $or$cond = $cmp14 & $cmp16;
    $9 = HEAP32[$path_dynamic_ptr_to_dst_ptr>>2]|0;
    $cmp19 = ($9|0)==(1);
    $or$cond15 = $or$cond & $cmp19;
    $10 = HEAP32[$dst_ptr_not_leading_to_static_ptr>>2]|0;
    $$ = $or$cond15 ? $10 : 0;
    $dst_ptr$0 = $$;
    break L1;
    break;
   }
   case 1:  {
    break;
   }
   default: {
    $dst_ptr$0 = 0;
    break L1;
   }
   }
   $11 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
   $cmp25 = ($11|0)==(1);
   if (!($cmp25)) {
    $12 = HEAP32[$number_to_dst_ptr>>2]|0;
    $cmp27 = ($12|0)==(0);
    $13 = HEAP32[$path_dynamic_ptr_to_static_ptr>>2]|0;
    $cmp30 = ($13|0)==(1);
    $or$cond16 = $cmp27 & $cmp30;
    $14 = HEAP32[$path_dynamic_ptr_to_dst_ptr>>2]|0;
    $cmp33 = ($14|0)==(1);
    $or$cond17 = $or$cond16 & $cmp33;
    if (!($or$cond17)) {
     $dst_ptr$0 = 0;
     break;
    }
   }
   $15 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
   $dst_ptr$0 = $15;
  }
 } while(0);
 STACKTOP = sp;return ($dst_ptr$0|0);
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($this);
 __ZdlPv($this);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($this,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $dst_ptr = $dst_ptr|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $2 = 0, $__base_type = 0, $call = 0, $static_type = 0, $vfn = 0, $vtable = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,$use_strcmp)|0);
 if ($call) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$info,$dst_ptr,$current_ptr,$path_below);
 } else {
  $__base_type = ((($this)) + 8|0);
  $1 = HEAP32[$__base_type>>2]|0;
  $vtable = HEAP32[$1>>2]|0;
  $vfn = ((($vtable)) + 20|0);
  $2 = HEAP32[$vfn>>2]|0;
  FUNCTION_TABLE_viiiiii[$2 & 31]($1,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp);
 }
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($this,$info,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__base_type = 0, $add = 0, $call = 0, $call3 = 0, $cmp = 0, $cmp11 = 0;
 var $cmp26 = 0, $cmp27 = 0, $cmp5 = 0, $cmp7 = 0, $dst_ptr_leading_to_static_ptr = 0, $dst_ptr_not_leading_to_static_ptr = 0, $found_any_static_type = 0, $found_our_static_ptr = 0, $is_dst_type_derived_from_static_type = 0, $is_dst_type_derived_from_static_type13$0$off032 = 0, $is_dst_type_derived_from_static_type13$0$off033 = 0, $not$tobool19 = 0, $number_to_dst_ptr = 0, $number_to_static_ptr = 0, $path_dst_ptr_to_static_ptr = 0, $path_dynamic_ptr_to_dst_ptr = 0, $search_done = 0, $static_type = 0, $tobool16 = 0, $vfn = 0;
 var $vfn42 = 0, $vtable = 0, $vtable41 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,$use_strcmp)|0);
 do {
  if ($call) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$info,$current_ptr,$path_below);
  } else {
   $1 = HEAP32[$info>>2]|0;
   $call3 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$1,$use_strcmp)|0);
   $__base_type = ((($this)) + 8|0);
   if (!($call3)) {
    $12 = HEAP32[$__base_type>>2]|0;
    $vtable41 = HEAP32[$12>>2]|0;
    $vfn42 = ((($vtable41)) + 24|0);
    $13 = HEAP32[$vfn42>>2]|0;
    FUNCTION_TABLE_viiiii[$13 & 31]($12,$info,$current_ptr,$path_below,$use_strcmp);
    break;
   }
   $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
   $2 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
   $cmp = ($2|0)==($current_ptr|0);
   $path_dynamic_ptr_to_dst_ptr = ((($info)) + 32|0);
   if (!($cmp)) {
    $dst_ptr_not_leading_to_static_ptr = ((($info)) + 20|0);
    $3 = HEAP32[$dst_ptr_not_leading_to_static_ptr>>2]|0;
    $cmp5 = ($3|0)==($current_ptr|0);
    if (!($cmp5)) {
     HEAP32[$path_dynamic_ptr_to_dst_ptr>>2] = $path_below;
     $is_dst_type_derived_from_static_type = ((($info)) + 44|0);
     $4 = HEAP32[$is_dst_type_derived_from_static_type>>2]|0;
     $cmp11 = ($4|0)==(4);
     if ($cmp11) {
      break;
     }
     $found_our_static_ptr = ((($info)) + 52|0);
     HEAP8[$found_our_static_ptr>>0] = 0;
     $found_any_static_type = ((($info)) + 53|0);
     HEAP8[$found_any_static_type>>0] = 0;
     $5 = HEAP32[$__base_type>>2]|0;
     $vtable = HEAP32[$5>>2]|0;
     $vfn = ((($vtable)) + 20|0);
     $6 = HEAP32[$vfn>>2]|0;
     FUNCTION_TABLE_viiiiii[$6 & 31]($5,$info,$current_ptr,$current_ptr,1,$use_strcmp);
     $7 = HEAP8[$found_any_static_type>>0]|0;
     $tobool16 = ($7<<24>>24)==(0);
     if ($tobool16) {
      $is_dst_type_derived_from_static_type13$0$off032 = 4;
      label = 11;
     } else {
      $8 = HEAP8[$found_our_static_ptr>>0]|0;
      $not$tobool19 = ($8<<24>>24)==(0);
      if ($not$tobool19) {
       $is_dst_type_derived_from_static_type13$0$off032 = 3;
       label = 11;
      } else {
       $is_dst_type_derived_from_static_type13$0$off033 = 3;
      }
     }
     if ((label|0) == 11) {
      HEAP32[$dst_ptr_not_leading_to_static_ptr>>2] = $current_ptr;
      $number_to_dst_ptr = ((($info)) + 40|0);
      $9 = HEAP32[$number_to_dst_ptr>>2]|0;
      $add = (($9) + 1)|0;
      HEAP32[$number_to_dst_ptr>>2] = $add;
      $number_to_static_ptr = ((($info)) + 36|0);
      $10 = HEAP32[$number_to_static_ptr>>2]|0;
      $cmp26 = ($10|0)==(1);
      if ($cmp26) {
       $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
       $11 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
       $cmp27 = ($11|0)==(2);
       if ($cmp27) {
        $search_done = ((($info)) + 54|0);
        HEAP8[$search_done>>0] = 1;
        $is_dst_type_derived_from_static_type13$0$off033 = $is_dst_type_derived_from_static_type13$0$off032;
       } else {
        $is_dst_type_derived_from_static_type13$0$off033 = $is_dst_type_derived_from_static_type13$0$off032;
       }
      } else {
       $is_dst_type_derived_from_static_type13$0$off033 = $is_dst_type_derived_from_static_type13$0$off032;
      }
     }
     HEAP32[$is_dst_type_derived_from_static_type>>2] = $is_dst_type_derived_from_static_type13$0$off033;
     break;
    }
   }
   $cmp7 = ($path_below|0)==(1);
   if ($cmp7) {
    HEAP32[$path_dynamic_ptr_to_dst_ptr>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($this,$info,$adjustedPtr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $adjustedPtr = $adjustedPtr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $2 = 0, $__base_type = 0, $call = 0, $static_type = 0, $vfn = 0, $vtable = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,0)|0);
 if ($call) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$info,$adjustedPtr,$path_below);
 } else {
  $__base_type = ((($this)) + 8|0);
  $1 = HEAP32[$__base_type>>2]|0;
  $vtable = HEAP32[$1>>2]|0;
  $vfn = ((($vtable)) + 28|0);
  $2 = HEAP32[$vfn>>2]|0;
  FUNCTION_TABLE_viiii[$2 & 31]($1,$info,$adjustedPtr,$path_below);
 }
 return;
}
function __ZdlPv($ptr) {
 $ptr = $ptr|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($ptr);
 return;
}
function __ZNSt9type_infoD2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv123__fundamental_type_infoD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($this);
 __ZdlPv($this);
 return;
}
function __ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv($this,$thrown_type,$0) {
 $this = $this|0;
 $thrown_type = $thrown_type|0;
 $0 = $0|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$thrown_type,0)|0);
 return ($call|0);
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($this);
 __ZdlPv($this);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($this,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $dst_ptr = $dst_ptr|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__base_count = 0, $__flags = 0, $add$ptr = 0, $and = 0, $and30 = 0, $arraydecay = 0, $call = 0, $cmp = 0, $cmp19 = 0, $cmp40 = 0;
 var $found_any_static_type5 = 0, $found_our_static_ptr2 = 0, $incdec$ptr = 0, $incdec$ptr39 = 0, $p$0 = 0, $path_dst_ptr_to_static_ptr = 0, $search_done = 0, $static_type = 0, $tobool14 = 0, $tobool17 = 0, $tobool22 = 0, $tobool27 = 0, $tobool31 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,$use_strcmp)|0);
 if ($call) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$info,$dst_ptr,$current_ptr,$path_below);
 } else {
  $found_our_static_ptr2 = ((($info)) + 52|0);
  $1 = HEAP8[$found_our_static_ptr2>>0]|0;
  $found_any_static_type5 = ((($info)) + 53|0);
  $2 = HEAP8[$found_any_static_type5>>0]|0;
  $arraydecay = ((($this)) + 16|0);
  $__base_count = ((($this)) + 12|0);
  $3 = HEAP32[$__base_count>>2]|0;
  $add$ptr = (((($this)) + 16|0) + ($3<<3)|0);
  HEAP8[$found_our_static_ptr2>>0] = 0;
  HEAP8[$found_any_static_type5>>0] = 0;
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($arraydecay,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp);
  $cmp = ($3|0)>(1);
  L4: do {
   if ($cmp) {
    $incdec$ptr = ((($this)) + 24|0);
    $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
    $search_done = ((($info)) + 54|0);
    $__flags = ((($this)) + 8|0);
    $p$0 = $incdec$ptr;
    while(1) {
     $4 = HEAP8[$search_done>>0]|0;
     $tobool14 = ($4<<24>>24)==(0);
     if (!($tobool14)) {
      break L4;
     }
     $5 = HEAP8[$found_our_static_ptr2>>0]|0;
     $tobool17 = ($5<<24>>24)==(0);
     if ($tobool17) {
      $8 = HEAP8[$found_any_static_type5>>0]|0;
      $tobool27 = ($8<<24>>24)==(0);
      if (!($tobool27)) {
       $9 = HEAP32[$__flags>>2]|0;
       $and30 = $9 & 1;
       $tobool31 = ($and30|0)==(0);
       if ($tobool31) {
        break L4;
       }
      }
     } else {
      $6 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
      $cmp19 = ($6|0)==(1);
      if ($cmp19) {
       break L4;
      }
      $7 = HEAP32[$__flags>>2]|0;
      $and = $7 & 2;
      $tobool22 = ($and|0)==(0);
      if ($tobool22) {
       break L4;
      }
     }
     HEAP8[$found_our_static_ptr2>>0] = 0;
     HEAP8[$found_any_static_type5>>0] = 0;
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($p$0,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp);
     $incdec$ptr39 = ((($p$0)) + 8|0);
     $cmp40 = ($incdec$ptr39>>>0)<($add$ptr>>>0);
     if ($cmp40) {
      $p$0 = $incdec$ptr39;
     } else {
      break;
     }
    }
   }
  } while(0);
  HEAP8[$found_our_static_ptr2>>0] = $1;
  HEAP8[$found_any_static_type5>>0] = $2;
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($this,$info,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__base_count = 0, $__flags = 0, $add = 0, $add$ptr = 0, $add$ptr64 = 0, $and = 0, $and35 = 0, $and73 = 0, $and88 = 0, $arraydecay = 0, $call = 0, $call3 = 0, $cmp = 0, $cmp100 = 0, $cmp106 = 0;
 var $cmp11 = 0, $cmp115 = 0, $cmp121 = 0, $cmp16 = 0, $cmp27 = 0, $cmp44 = 0, $cmp46 = 0, $cmp5 = 0, $cmp7 = 0, $cmp70 = 0, $cmp77 = 0, $cmp85 = 0, $cmp97 = 0, $does_dst_type_point_to_our_static_type$0$off0 = 0, $does_dst_type_point_to_our_static_type$1$off0 = 0, $dst_ptr_leading_to_static_ptr = 0, $dst_ptr_not_leading_to_static_ptr = 0, $found_any_static_type = 0, $found_our_static_ptr = 0, $incdec$ptr = 0;
 var $incdec$ptr105 = 0, $incdec$ptr120 = 0, $incdec$ptr69 = 0, $incdec$ptr84 = 0, $is_dst_type_derived_from_static_type = 0, $is_dst_type_derived_from_static_type13$0$off0 = 0, $is_dst_type_derived_from_static_type13$1$off0 = 0, $is_dst_type_derived_from_static_type13$2$off0 = 0, $number_to_dst_ptr = 0, $number_to_static_ptr = 0, $p$0 = 0, $p65$0 = 0, $p65$1 = 0, $p65$2 = 0, $path_dst_ptr_to_static_ptr45 = 0, $path_dynamic_ptr_to_dst_ptr = 0, $search_done48 = 0, $static_type = 0, $tobool111 = 0, $tobool18 = 0;
 var $tobool22 = 0, $tobool25 = 0, $tobool30 = 0, $tobool36 = 0, $tobool74 = 0, $tobool80 = 0, $tobool89 = 0, $tobool93 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,$use_strcmp)|0);
 L1: do {
  if ($call) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$info,$current_ptr,$path_below);
  } else {
   $1 = HEAP32[$info>>2]|0;
   $call3 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$1,$use_strcmp)|0);
   $__base_count = ((($this)) + 12|0);
   $path_dst_ptr_to_static_ptr45 = ((($info)) + 24|0);
   $number_to_static_ptr = ((($info)) + 36|0);
   $search_done48 = ((($info)) + 54|0);
   $__flags = ((($this)) + 8|0);
   $arraydecay = ((($this)) + 16|0);
   if (!($call3)) {
    $16 = HEAP32[$__base_count>>2]|0;
    $add$ptr64 = (((($this)) + 16|0) + ($16<<3)|0);
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($arraydecay,$info,$current_ptr,$path_below,$use_strcmp);
    $incdec$ptr69 = ((($this)) + 24|0);
    $cmp70 = ($16|0)>(1);
    if (!($cmp70)) {
     break;
    }
    $17 = HEAP32[$__flags>>2]|0;
    $and73 = $17 & 2;
    $tobool74 = ($and73|0)==(0);
    if ($tobool74) {
     $18 = HEAP32[$number_to_static_ptr>>2]|0;
     $cmp77 = ($18|0)==(1);
     if ($cmp77) {
      $p65$0 = $incdec$ptr69;
     } else {
      $and88 = $17 & 1;
      $tobool89 = ($and88|0)==(0);
      if ($tobool89) {
       $p65$2 = $incdec$ptr69;
       while(1) {
        $23 = HEAP8[$search_done48>>0]|0;
        $tobool111 = ($23<<24>>24)==(0);
        if (!($tobool111)) {
         break L1;
        }
        $24 = HEAP32[$number_to_static_ptr>>2]|0;
        $cmp115 = ($24|0)==(1);
        if ($cmp115) {
         break L1;
        }
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($p65$2,$info,$current_ptr,$path_below,$use_strcmp);
        $incdec$ptr120 = ((($p65$2)) + 8|0);
        $cmp121 = ($incdec$ptr120>>>0)<($add$ptr64>>>0);
        if ($cmp121) {
         $p65$2 = $incdec$ptr120;
        } else {
         break L1;
        }
       }
      } else {
       $p65$1 = $incdec$ptr69;
      }
      while(1) {
       $20 = HEAP8[$search_done48>>0]|0;
       $tobool93 = ($20<<24>>24)==(0);
       if (!($tobool93)) {
        break L1;
       }
       $21 = HEAP32[$number_to_static_ptr>>2]|0;
       $cmp97 = ($21|0)==(1);
       if ($cmp97) {
        $22 = HEAP32[$path_dst_ptr_to_static_ptr45>>2]|0;
        $cmp100 = ($22|0)==(1);
        if ($cmp100) {
         break L1;
        }
       }
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($p65$1,$info,$current_ptr,$path_below,$use_strcmp);
       $incdec$ptr105 = ((($p65$1)) + 8|0);
       $cmp106 = ($incdec$ptr105>>>0)<($add$ptr64>>>0);
       if ($cmp106) {
        $p65$1 = $incdec$ptr105;
       } else {
        break L1;
       }
      }
     }
    } else {
     $p65$0 = $incdec$ptr69;
    }
    while(1) {
     $19 = HEAP8[$search_done48>>0]|0;
     $tobool80 = ($19<<24>>24)==(0);
     if (!($tobool80)) {
      break L1;
     }
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($p65$0,$info,$current_ptr,$path_below,$use_strcmp);
     $incdec$ptr84 = ((($p65$0)) + 8|0);
     $cmp85 = ($incdec$ptr84>>>0)<($add$ptr64>>>0);
     if ($cmp85) {
      $p65$0 = $incdec$ptr84;
     } else {
      break L1;
     }
    }
   }
   $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
   $2 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
   $cmp = ($2|0)==($current_ptr|0);
   $path_dynamic_ptr_to_dst_ptr = ((($info)) + 32|0);
   if (!($cmp)) {
    $dst_ptr_not_leading_to_static_ptr = ((($info)) + 20|0);
    $3 = HEAP32[$dst_ptr_not_leading_to_static_ptr>>2]|0;
    $cmp5 = ($3|0)==($current_ptr|0);
    if (!($cmp5)) {
     HEAP32[$path_dynamic_ptr_to_dst_ptr>>2] = $path_below;
     $is_dst_type_derived_from_static_type = ((($info)) + 44|0);
     $4 = HEAP32[$is_dst_type_derived_from_static_type>>2]|0;
     $cmp11 = ($4|0)==(4);
     if ($cmp11) {
      break;
     }
     $5 = HEAP32[$__base_count>>2]|0;
     $add$ptr = (((($this)) + 16|0) + ($5<<3)|0);
     $found_our_static_ptr = ((($info)) + 52|0);
     $found_any_static_type = ((($info)) + 53|0);
     $does_dst_type_point_to_our_static_type$0$off0 = 0;$is_dst_type_derived_from_static_type13$0$off0 = 0;$p$0 = $arraydecay;
     L29: while(1) {
      $cmp16 = ($p$0>>>0)<($add$ptr>>>0);
      if (!($cmp16)) {
       $is_dst_type_derived_from_static_type13$2$off0 = $is_dst_type_derived_from_static_type13$0$off0;
       label = 18;
       break;
      }
      HEAP8[$found_our_static_ptr>>0] = 0;
      HEAP8[$found_any_static_type>>0] = 0;
      __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($p$0,$info,$current_ptr,$current_ptr,1,$use_strcmp);
      $6 = HEAP8[$search_done48>>0]|0;
      $tobool18 = ($6<<24>>24)==(0);
      if (!($tobool18)) {
       $is_dst_type_derived_from_static_type13$2$off0 = $is_dst_type_derived_from_static_type13$0$off0;
       label = 18;
       break;
      }
      $7 = HEAP8[$found_any_static_type>>0]|0;
      $tobool22 = ($7<<24>>24)==(0);
      do {
       if ($tobool22) {
        $does_dst_type_point_to_our_static_type$1$off0 = $does_dst_type_point_to_our_static_type$0$off0;$is_dst_type_derived_from_static_type13$1$off0 = $is_dst_type_derived_from_static_type13$0$off0;
       } else {
        $8 = HEAP8[$found_our_static_ptr>>0]|0;
        $tobool25 = ($8<<24>>24)==(0);
        if ($tobool25) {
         $11 = HEAP32[$__flags>>2]|0;
         $and35 = $11 & 1;
         $tobool36 = ($and35|0)==(0);
         if ($tobool36) {
          $is_dst_type_derived_from_static_type13$2$off0 = 1;
          label = 18;
          break L29;
         } else {
          $does_dst_type_point_to_our_static_type$1$off0 = $does_dst_type_point_to_our_static_type$0$off0;$is_dst_type_derived_from_static_type13$1$off0 = 1;
          break;
         }
        }
        $9 = HEAP32[$path_dst_ptr_to_static_ptr45>>2]|0;
        $cmp27 = ($9|0)==(1);
        if ($cmp27) {
         label = 23;
         break L29;
        }
        $10 = HEAP32[$__flags>>2]|0;
        $and = $10 & 2;
        $tobool30 = ($and|0)==(0);
        if ($tobool30) {
         label = 23;
         break L29;
        } else {
         $does_dst_type_point_to_our_static_type$1$off0 = 1;$is_dst_type_derived_from_static_type13$1$off0 = 1;
        }
       }
      } while(0);
      $incdec$ptr = ((($p$0)) + 8|0);
      $does_dst_type_point_to_our_static_type$0$off0 = $does_dst_type_point_to_our_static_type$1$off0;$is_dst_type_derived_from_static_type13$0$off0 = $is_dst_type_derived_from_static_type13$1$off0;$p$0 = $incdec$ptr;
     }
     do {
      if ((label|0) == 18) {
       if (!($does_dst_type_point_to_our_static_type$0$off0)) {
        HEAP32[$dst_ptr_not_leading_to_static_ptr>>2] = $current_ptr;
        $number_to_dst_ptr = ((($info)) + 40|0);
        $12 = HEAP32[$number_to_dst_ptr>>2]|0;
        $add = (($12) + 1)|0;
        HEAP32[$number_to_dst_ptr>>2] = $add;
        $13 = HEAP32[$number_to_static_ptr>>2]|0;
        $cmp44 = ($13|0)==(1);
        if ($cmp44) {
         $14 = HEAP32[$path_dst_ptr_to_static_ptr45>>2]|0;
         $cmp46 = ($14|0)==(2);
         if ($cmp46) {
          HEAP8[$search_done48>>0] = 1;
          if ($is_dst_type_derived_from_static_type13$2$off0) {
           label = 23;
           break;
          } else {
           $15 = 4;
           break;
          }
         }
        }
       }
       if ($is_dst_type_derived_from_static_type13$2$off0) {
        label = 23;
       } else {
        $15 = 4;
       }
      }
     } while(0);
     if ((label|0) == 23) {
      $15 = 3;
     }
     HEAP32[$is_dst_type_derived_from_static_type>>2] = $15;
     break;
    }
   }
   $cmp7 = ($path_below|0)==(1);
   if ($cmp7) {
    HEAP32[$path_dynamic_ptr_to_dst_ptr>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($this,$info,$adjustedPtr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $adjustedPtr = $adjustedPtr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $2 = 0, $__base_count = 0, $add$ptr = 0, $arraydecay = 0, $call = 0, $cmp = 0, $cmp7 = 0, $incdec$ptr = 0, $incdec$ptr6 = 0, $p$0 = 0, $search_done = 0, $static_type = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,0)|0);
 L1: do {
  if ($call) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$info,$adjustedPtr,$path_below);
  } else {
   $arraydecay = ((($this)) + 16|0);
   $__base_count = ((($this)) + 12|0);
   $1 = HEAP32[$__base_count>>2]|0;
   $add$ptr = (((($this)) + 16|0) + ($1<<3)|0);
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($arraydecay,$info,$adjustedPtr,$path_below);
   $cmp = ($1|0)>(1);
   if ($cmp) {
    $incdec$ptr = ((($this)) + 24|0);
    $search_done = ((($info)) + 54|0);
    $p$0 = $incdec$ptr;
    while(1) {
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($p$0,$info,$adjustedPtr,$path_below);
     $2 = HEAP8[$search_done>>0]|0;
     $tobool = ($2<<24>>24)==(0);
     if (!($tobool)) {
      break L1;
     }
     $incdec$ptr6 = ((($p$0)) + 8|0);
     $cmp7 = ($incdec$ptr6>>>0)<($add$ptr>>>0);
     if ($cmp7) {
      $p$0 = $incdec$ptr6;
     } else {
      break;
     }
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($this,$info,$adjustedPtr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $adjustedPtr = $adjustedPtr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $__offset_flags = 0, $add$ptr = 0, $add$ptr4 = 0, $and = 0, $and6 = 0, $cond = 0, $offset_to_base$0 = 0, $shr = 0, $tobool = 0, $tobool7 = 0, $vfn = 0, $vtable3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $__offset_flags = ((($this)) + 4|0);
 $0 = HEAP32[$__offset_flags>>2]|0;
 $shr = $0 >> 8;
 $and = $0 & 1;
 $tobool = ($and|0)==(0);
 if ($tobool) {
  $offset_to_base$0 = $shr;
 } else {
  $1 = HEAP32[$adjustedPtr>>2]|0;
  $add$ptr = (($1) + ($shr)|0);
  $2 = HEAP32[$add$ptr>>2]|0;
  $offset_to_base$0 = $2;
 }
 $3 = HEAP32[$this>>2]|0;
 $vtable3 = HEAP32[$3>>2]|0;
 $vfn = ((($vtable3)) + 28|0);
 $4 = HEAP32[$vfn>>2]|0;
 $add$ptr4 = (($adjustedPtr) + ($offset_to_base$0)|0);
 $and6 = $0 & 2;
 $tobool7 = ($and6|0)!=(0);
 $cond = $tobool7 ? $path_below : 2;
 FUNCTION_TABLE_viiii[$4 & 31]($3,$info,$add$ptr4,$cond);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($this,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $dst_ptr = $dst_ptr|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $__offset_flags = 0, $add$ptr = 0, $add$ptr4 = 0, $and = 0, $and6 = 0, $cond = 0, $offset_to_base$0 = 0, $shr = 0, $tobool = 0, $tobool7 = 0, $vfn = 0, $vtable3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $__offset_flags = ((($this)) + 4|0);
 $0 = HEAP32[$__offset_flags>>2]|0;
 $shr = $0 >> 8;
 $and = $0 & 1;
 $tobool = ($and|0)==(0);
 if ($tobool) {
  $offset_to_base$0 = $shr;
 } else {
  $1 = HEAP32[$current_ptr>>2]|0;
  $add$ptr = (($1) + ($shr)|0);
  $2 = HEAP32[$add$ptr>>2]|0;
  $offset_to_base$0 = $2;
 }
 $3 = HEAP32[$this>>2]|0;
 $vtable3 = HEAP32[$3>>2]|0;
 $vfn = ((($vtable3)) + 20|0);
 $4 = HEAP32[$vfn>>2]|0;
 $add$ptr4 = (($current_ptr) + ($offset_to_base$0)|0);
 $and6 = $0 & 2;
 $tobool7 = ($and6|0)!=(0);
 $cond = $tobool7 ? $path_below : 2;
 FUNCTION_TABLE_viiiiii[$4 & 31]($3,$info,$dst_ptr,$add$ptr4,$cond,$use_strcmp);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($this,$info,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $__offset_flags = 0, $add$ptr = 0, $add$ptr4 = 0, $and = 0, $and6 = 0, $cond = 0, $offset_to_base$0 = 0, $shr = 0, $tobool = 0, $tobool7 = 0, $vfn = 0, $vtable3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $__offset_flags = ((($this)) + 4|0);
 $0 = HEAP32[$__offset_flags>>2]|0;
 $shr = $0 >> 8;
 $and = $0 & 1;
 $tobool = ($and|0)==(0);
 if ($tobool) {
  $offset_to_base$0 = $shr;
 } else {
  $1 = HEAP32[$current_ptr>>2]|0;
  $add$ptr = (($1) + ($shr)|0);
  $2 = HEAP32[$add$ptr>>2]|0;
  $offset_to_base$0 = $2;
 }
 $3 = HEAP32[$this>>2]|0;
 $vtable3 = HEAP32[$3>>2]|0;
 $vfn = ((($vtable3)) + 24|0);
 $4 = HEAP32[$vfn>>2]|0;
 $add$ptr4 = (($current_ptr) + ($offset_to_base$0)|0);
 $and6 = $0 & 2;
 $tobool7 = ($and6|0)!=(0);
 $cond = $tobool7 ? $path_below : 2;
 FUNCTION_TABLE_viiiii[$4 & 31]($3,$info,$add$ptr4,$cond,$use_strcmp);
 return;
}
function runPostSets() {
}
function _emscripten_set_current_thread_status(newStatus) {
    newStatus = newStatus|0;
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
    end = (ptr + num)|0;

    value = value & 0xff;
    if ((num|0) >= 67 /* 64 bytes for an unrolled loop + 3 bytes for unaligned head*/) {
      while ((ptr&3) != 0) {
        HEAP8[((ptr)>>0)]=value;
        ptr = (ptr+1)|0;
      }

      aligned_end = (end & -4)|0;
      block_aligned_end = (aligned_end - 64)|0;
      value4 = value | (value << 8) | (value << 16) | (value << 24);

      while((ptr|0) <= (block_aligned_end|0)) {
        HEAP32[((ptr)>>2)]=value4;
        HEAP32[(((ptr)+(4))>>2)]=value4;
        HEAP32[(((ptr)+(8))>>2)]=value4;
        HEAP32[(((ptr)+(12))>>2)]=value4;
        HEAP32[(((ptr)+(16))>>2)]=value4;
        HEAP32[(((ptr)+(20))>>2)]=value4;
        HEAP32[(((ptr)+(24))>>2)]=value4;
        HEAP32[(((ptr)+(28))>>2)]=value4;
        HEAP32[(((ptr)+(32))>>2)]=value4;
        HEAP32[(((ptr)+(36))>>2)]=value4;
        HEAP32[(((ptr)+(40))>>2)]=value4;
        HEAP32[(((ptr)+(44))>>2)]=value4;
        HEAP32[(((ptr)+(48))>>2)]=value4;
        HEAP32[(((ptr)+(52))>>2)]=value4;
        HEAP32[(((ptr)+(56))>>2)]=value4;
        HEAP32[(((ptr)+(60))>>2)]=value4;
        ptr = (ptr + 64)|0;
      }

      while ((ptr|0) < (aligned_end|0) ) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    // The remaining bytes.
    while ((ptr|0) < (end|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (end-num)|0;
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _emscripten_conditional_set_current_thread_status(expectedStatus, newStatus) {
    expectedStatus = expectedStatus|0;
    newStatus = newStatus|0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    var aligned_dest_end = 0;
    var block_aligned_dest_end = 0;
    var dest_end = 0;
    // Test against a benchmarked cutoff limit for when HEAPU8.set() becomes faster to use.
    if ((num|0) >=
      8192
    ) {
      return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    }

    ret = dest|0;
    dest_end = (dest + num)|0;
    if ((dest&3) == (src&3)) {
      // The initial unaligned < 4-byte front.
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      aligned_dest_end = (dest_end & -4)|0;
      block_aligned_dest_end = (aligned_dest_end - 64)|0;
      while ((dest|0) <= (block_aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        HEAP32[(((dest)+(4))>>2)]=((HEAP32[(((src)+(4))>>2)])|0);
        HEAP32[(((dest)+(8))>>2)]=((HEAP32[(((src)+(8))>>2)])|0);
        HEAP32[(((dest)+(12))>>2)]=((HEAP32[(((src)+(12))>>2)])|0);
        HEAP32[(((dest)+(16))>>2)]=((HEAP32[(((src)+(16))>>2)])|0);
        HEAP32[(((dest)+(20))>>2)]=((HEAP32[(((src)+(20))>>2)])|0);
        HEAP32[(((dest)+(24))>>2)]=((HEAP32[(((src)+(24))>>2)])|0);
        HEAP32[(((dest)+(28))>>2)]=((HEAP32[(((src)+(28))>>2)])|0);
        HEAP32[(((dest)+(32))>>2)]=((HEAP32[(((src)+(32))>>2)])|0);
        HEAP32[(((dest)+(36))>>2)]=((HEAP32[(((src)+(36))>>2)])|0);
        HEAP32[(((dest)+(40))>>2)]=((HEAP32[(((src)+(40))>>2)])|0);
        HEAP32[(((dest)+(44))>>2)]=((HEAP32[(((src)+(44))>>2)])|0);
        HEAP32[(((dest)+(48))>>2)]=((HEAP32[(((src)+(48))>>2)])|0);
        HEAP32[(((dest)+(52))>>2)]=((HEAP32[(((src)+(52))>>2)])|0);
        HEAP32[(((dest)+(56))>>2)]=((HEAP32[(((src)+(56))>>2)])|0);
        HEAP32[(((dest)+(60))>>2)]=((HEAP32[(((src)+(60))>>2)])|0);
        dest = (dest+64)|0;
        src = (src+64)|0;
      }
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    } else {
      // In the unaligned copy case, unroll a bit as well.
      aligned_dest_end = (dest_end - 4)|0;
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        HEAP8[(((dest)+(1))>>0)]=((HEAP8[(((src)+(1))>>0)])|0);
        HEAP8[(((dest)+(2))>>0)]=((HEAP8[(((src)+(2))>>0)])|0);
        HEAP8[(((dest)+(3))>>0)]=((HEAP8[(((src)+(3))>>0)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    }
    // The remaining unaligned < 4 byte tail.
    while ((dest|0) < (dest_end|0)) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
    }
    return ret|0;
}
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    $rem = $rem | 0;
    var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
    $n_sroa_0_0_extract_trunc = $a$0;
    $n_sroa_1_4_extract_shift$0 = $a$1;
    $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
    $d_sroa_0_0_extract_trunc = $b$0;
    $d_sroa_1_4_extract_shift$0 = $b$1;
    $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
    if (($n_sroa_1_4_extract_trunc | 0) == 0) {
      $4 = ($rem | 0) != 0;
      if (($d_sroa_1_4_extract_trunc | 0) == 0) {
        if ($4) {
          HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$4) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
    $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
    do {
      if (($d_sroa_0_0_extract_trunc | 0) == 0) {
        if ($17) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
            HEAP32[$rem + 4 >> 2] = 0;
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        if (($n_sroa_0_0_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0;
            HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
        if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0 | $a$0 & -1;
            HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
          }
          $_0$1 = 0;
          $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($51 >>> 0 <= 30) {
          $57 = $51 + 1 | 0;
          $58 = 31 - $51 | 0;
          $sr_1_ph = $57;
          $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$17) {
          $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
          $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          if ($119 >>> 0 <= 31) {
            $125 = $119 + 1 | 0;
            $126 = 31 - $119 | 0;
            $130 = $119 - 31 >> 31;
            $sr_1_ph = $125;
            $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
            $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
            $q_sroa_0_1_ph = 0;
            $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
            break;
          }
          if (($rem | 0) == 0) {
            $_0$1 = 0;
            $_0$0 = 0;
            return (tempRet0 = $_0$1, $_0$0) | 0;
          }
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
        if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
          $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
          $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          $89 = 64 - $88 | 0;
          $91 = 32 - $88 | 0;
          $92 = $91 >> 31;
          $95 = $88 - 32 | 0;
          $105 = $95 >> 31;
          $sr_1_ph = $88;
          $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
          $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
          $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
          $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
          break;
        }
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
          HEAP32[$rem + 4 >> 2] = 0;
        }
        if (($d_sroa_0_0_extract_trunc | 0) == 1) {
          $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$0 = 0 | $a$0 & -1;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        } else {
          $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
          $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
          $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
      }
    } while (0);
    if (($sr_1_ph | 0) == 0) {
      $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
      $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
      $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
      $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = 0;
    } else {
      $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
      $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
      $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
      $137$1 = tempRet0;
      $q_sroa_1_1198 = $q_sroa_1_1_ph;
      $q_sroa_0_1199 = $q_sroa_0_1_ph;
      $r_sroa_1_1200 = $r_sroa_1_1_ph;
      $r_sroa_0_1201 = $r_sroa_0_1_ph;
      $sr_1202 = $sr_1_ph;
      $carry_0203 = 0;
      while (1) {
        $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
        $149 = $carry_0203 | $q_sroa_0_1199 << 1;
        $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
        $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
        _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
        $150$1 = tempRet0;
        $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
        $152 = $151$0 & 1;
        $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
        $r_sroa_0_0_extract_trunc = $154$0;
        $r_sroa_1_4_extract_trunc = tempRet0;
        $155 = $sr_1202 - 1 | 0;
        if (($155 | 0) == 0) {
          break;
        } else {
          $q_sroa_1_1198 = $147;
          $q_sroa_0_1199 = $149;
          $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
          $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
          $sr_1202 = $155;
          $carry_0203 = $152;
        }
      }
      $q_sroa_1_1_lcssa = $147;
      $q_sroa_0_1_lcssa = $149;
      $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
      $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = $152;
    }
    $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
    $q_sroa_0_0_insert_ext75$1 = 0;
    $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
    if (($rem | 0) != 0) {
      HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
      HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
    }
    $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
    $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $1$0 = 0;
    $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
    return $1$0 | 0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $rem = 0, __stackBase__ = 0;
    __stackBase__ = STACKTOP;
    STACKTOP = STACKTOP + 16 | 0;
    $rem = __stackBase__ | 0;
    ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
    STACKTOP = __stackBase__;
    return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function _llvm_bswap_i32(x) {
    x = x|0;
    return (((x&0xff)<<24) | (((x>>8)&0xff)<<16) | (((x>>16)&0xff)<<8) | (x>>>24))|0;
}
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    increment = ((increment + 15) & -16)|0;
    totalMemory = getTotalMemory()|0;

    // Perform a compare-and-swap loop to update the new dynamic top value. This is because
    // this function can becalled simultaneously in multiple threads.
    do {
      oldDynamicTop = Atomics_load(HEAP32, DYNAMICTOP_PTR>>2)|0;
      newDynamicTop = oldDynamicTop + increment | 0;
      // Asking to increase dynamic top to a too high value? In pthreads builds we cannot
      // enlarge memory, so this needs to fail.
      if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
        | (newDynamicTop|0) < 0 // Also underflow, sbrk() should be able to be used to subtract.
        | (newDynamicTop|0) > (totalMemory|0)) {
        abortOnCannotGrowMemory()|0;
      }
      // Attempt to update the dynamic top to new value. Another thread may have beat this thread to the update,
      // in which case we will need to start over by iterating the loop body again.
      oldDynamicTopOnChange = Atomics_compareExchange(HEAP32, DYNAMICTOP_PTR>>2, oldDynamicTop|0, newDynamicTop|0)|0;
    } while((oldDynamicTopOnChange|0) != (oldDynamicTop|0));
    return oldDynamicTop|0;
}

  
function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&31](a1|0,a2|0,a3|0)|0;
}


function dynCall_viiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  FUNCTION_TABLE_viiiii[index&31](a1|0,a2|0,a3|0,a4|0,a5|0);
}


function dynCall_i(index) {
  index = index|0;
  
  return FUNCTION_TABLE_i[index&0]()|0;
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&31](a1|0);
}


function dynCall_vii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  FUNCTION_TABLE_vii[index&0](a1|0,a2|0);
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&1](a1|0)|0;
}


function dynCall_viii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  FUNCTION_TABLE_viii[index&0](a1|0,a2|0,a3|0);
}


function dynCall_v(index) {
  index = index|0;
  
  FUNCTION_TABLE_v[index&0]();
}


function dynCall_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0;
  FUNCTION_TABLE_viiiiii[index&31](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0);
}


function dynCall_iii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  return FUNCTION_TABLE_iii[index&0](a1|0,a2|0)|0;
}


function dynCall_viiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  FUNCTION_TABLE_viiii[index&31](a1|0,a2|0,a3|0,a4|0);
}

function b0(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(0);return 0;
}
function b1(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; nullFunc_viiiii(1);
}
function b2() {
 ; nullFunc_i(2);return 0;
}
function b3(p0) {
 p0 = p0|0; nullFunc_vi(3);
}
function b4(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_vii(4);
}
function b5(p0) {
 p0 = p0|0; nullFunc_ii(5);return 0;
}
function b6(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_viii(6);
}
function b7() {
 ; nullFunc_v(7);
}
function b8(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; nullFunc_viiiiii(8);
}
function b9(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_iii(9);return 0;
}
function b10(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; nullFunc_viiii(10);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_iiii = [b0,b0,___stdout_write,___stdio_seek,_sn_write,b0,b0,b0,b0,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b0,b0,b0,b0,b0,b0,b0,b0,__ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv,b0,b0,b0,b0,b0,b0,___stdio_write,b0,b0,b0
,b0,b0,b0];
var FUNCTION_TABLE_viiiii = [b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,b1,b1,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1];
var FUNCTION_TABLE_i = [b2];
var FUNCTION_TABLE_vi = [b3,b3,b3,b3,b3,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,b3,b3,b3,b3,__ZN10__cxxabiv120__si_class_type_infoD0Ev,b3,b3,b3,__ZN10__cxxabiv123__fundamental_type_infoD0Ev,b3,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,b3,b3,b3,__Z17downloadSucceededP18emscripten_fetch_t,__Z14downloadFailedP18emscripten_fetch_t,b3,b3,b3,b3
,b3,b3,b3];
var FUNCTION_TABLE_vii = [b4];
var FUNCTION_TABLE_ii = [b5,___stdio_close];
var FUNCTION_TABLE_viii = [b6];
var FUNCTION_TABLE_v = [b7];
var FUNCTION_TABLE_viiiiii = [b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b8,b8,b8,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b8,b8,b8,b8,b8,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8];
var FUNCTION_TABLE_iii = [b9];
var FUNCTION_TABLE_viiii = [b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b10,b10,b10,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b10,b10,b10,b10,b10,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b10,b10,b10,b10,b10,b10
,b10,b10,b10];

  return { __emscripten_atomic_fetch_and_xor_u64: __emscripten_atomic_fetch_and_xor_u64, _bitshift64Shl: _bitshift64Shl, _emscripten_atomic_load_f32: _emscripten_atomic_load_f32, ___emscripten_pthread_data_constructor: ___emscripten_pthread_data_constructor, __GLOBAL__sub_I_fetch_cpp: __GLOBAL__sub_I_fetch_cpp, stackSave: stackSave, _emscripten_atomic_xor_u64: _emscripten_atomic_xor_u64, _emscripten_atomic_load_u64: _emscripten_atomic_load_u64, _llvm_cttz_i32: _llvm_cttz_i32, _bitshift64Lshr: _bitshift64Lshr, getTempRet0: getTempRet0, _emscripten_atomic_and_u64: _emscripten_atomic_and_u64, _emscripten_sync_run_in_main_thread: _emscripten_sync_run_in_main_thread, _emscripten_sync_run_in_main_thread_4: _emscripten_sync_run_in_main_thread_4, _emscripten_sync_run_in_main_thread_5: _emscripten_sync_run_in_main_thread_5, _emscripten_sync_run_in_main_thread_6: _emscripten_sync_run_in_main_thread_6, _emscripten_sync_run_in_main_thread_7: _emscripten_sync_run_in_main_thread_7, _emscripten_sync_run_in_main_thread_0: _emscripten_sync_run_in_main_thread_0, _emscripten_sync_run_in_main_thread_1: _emscripten_sync_run_in_main_thread_1, _emscripten_sync_run_in_main_thread_2: _emscripten_sync_run_in_main_thread_2, _emscripten_sync_run_in_main_thread_3: _emscripten_sync_run_in_main_thread_3, _emscripten_atomic_exchange_u32: _emscripten_atomic_exchange_u32, _emscripten_async_run_in_main_thread: _emscripten_async_run_in_main_thread, _fflush: _fflush, _emscripten_set_current_thread_status: _emscripten_set_current_thread_status, _emscripten_atomic_cas_u64: _emscripten_atomic_cas_u64, _memset: _memset, _emscripten_atomic_sub_u64: _emscripten_atomic_sub_u64, _emscripten_sync_run_in_main_thread_xprintf_varargs: _emscripten_sync_run_in_main_thread_xprintf_varargs, _memcpy: _memcpy, ___errno_location: ___errno_location, __emscripten_atomic_fetch_and_and_u64: __emscripten_atomic_fetch_and_and_u64, __emscripten_atomic_fetch_and_sub_u64: __emscripten_atomic_fetch_and_sub_u64, _emscripten_atomic_store_f64: _emscripten_atomic_store_f64, stackAlloc: stackAlloc, _i64Subtract: _i64Subtract, __GLOBAL__sub_I_bind_cpp: __GLOBAL__sub_I_bind_cpp, ___udivmoddi4: ___udivmoddi4, setTempRet0: setTempRet0, _i64Add: _i64Add, _emscripten_atomic_store_u64: _emscripten_atomic_store_u64, _emscripten_atomic_load_f64: _emscripten_atomic_load_f64, _emscripten_get_global_libc: _emscripten_get_global_libc, __emscripten_atomic_fetch_and_add_u64: __emscripten_atomic_fetch_and_add_u64, __emscripten_atomic_fetch_and_or_u64: __emscripten_atomic_fetch_and_or_u64, ___udivdi3: ___udivdi3, _llvm_bswap_i32: _llvm_bswap_i32, runPostSets: runPostSets, _main: _main, _emscripten_main_thread_process_queued_calls: _emscripten_main_thread_process_queued_calls, _emscripten_atomic_add_u64: _emscripten_atomic_add_u64, _free: _free, _emscripten_atomic_store_f32: _emscripten_atomic_store_f32, setThrew: setThrew, _emscripten_atomic_exchange_u64: _emscripten_atomic_exchange_u64, ___uremdi3: ___uremdi3, ___pthread_tsd_run_dtors: ___pthread_tsd_run_dtors, stackRestore: stackRestore, _malloc: _malloc, establishStackSpace: establishStackSpace, _emscripten_conditional_set_current_thread_status: _emscripten_conditional_set_current_thread_status, _sbrk: _sbrk, ___getTypeName: ___getTypeName, _emscripten_atomic_or_u64: _emscripten_atomic_or_u64, stackAlloc: stackAlloc, stackSave: stackSave, stackRestore: stackRestore, establishStackSpace: establishStackSpace, setThrew: setThrew, setTempRet0: setTempRet0, getTempRet0: getTempRet0, dynCall_iiii: dynCall_iiii, dynCall_viiiii: dynCall_viiiii, dynCall_i: dynCall_i, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_ii: dynCall_ii, dynCall_viii: dynCall_viii, dynCall_v: dynCall_v, dynCall_viiiiii: dynCall_viiiiii, dynCall_iii: dynCall_iii, dynCall_viiii: dynCall_viiii };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real___emscripten_atomic_fetch_and_xor_u64 = asm["__emscripten_atomic_fetch_and_xor_u64"]; asm["__emscripten_atomic_fetch_and_xor_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___emscripten_atomic_fetch_and_xor_u64.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Shl.apply(null, arguments);
};

var real__emscripten_atomic_load_f32 = asm["_emscripten_atomic_load_f32"]; asm["_emscripten_atomic_load_f32"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_load_f32.apply(null, arguments);
};

var real____emscripten_pthread_data_constructor = asm["___emscripten_pthread_data_constructor"]; asm["___emscripten_pthread_data_constructor"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____emscripten_pthread_data_constructor.apply(null, arguments);
};

var real___GLOBAL__sub_I_fetch_cpp = asm["__GLOBAL__sub_I_fetch_cpp"]; asm["__GLOBAL__sub_I_fetch_cpp"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___GLOBAL__sub_I_fetch_cpp.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_stackSave.apply(null, arguments);
};

var real__emscripten_atomic_xor_u64 = asm["_emscripten_atomic_xor_u64"]; asm["_emscripten_atomic_xor_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_xor_u64.apply(null, arguments);
};

var real__emscripten_atomic_load_u64 = asm["_emscripten_atomic_load_u64"]; asm["_emscripten_atomic_load_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_load_u64.apply(null, arguments);
};

var real__llvm_cttz_i32 = asm["_llvm_cttz_i32"]; asm["_llvm_cttz_i32"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__llvm_cttz_i32.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Lshr.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_getTempRet0.apply(null, arguments);
};

var real__emscripten_atomic_and_u64 = asm["_emscripten_atomic_and_u64"]; asm["_emscripten_atomic_and_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_and_u64.apply(null, arguments);
};

var real__emscripten_sync_run_in_main_thread = asm["_emscripten_sync_run_in_main_thread"]; asm["_emscripten_sync_run_in_main_thread"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_sync_run_in_main_thread.apply(null, arguments);
};

var real__emscripten_sync_run_in_main_thread_4 = asm["_emscripten_sync_run_in_main_thread_4"]; asm["_emscripten_sync_run_in_main_thread_4"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_sync_run_in_main_thread_4.apply(null, arguments);
};

var real__emscripten_sync_run_in_main_thread_5 = asm["_emscripten_sync_run_in_main_thread_5"]; asm["_emscripten_sync_run_in_main_thread_5"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_sync_run_in_main_thread_5.apply(null, arguments);
};

var real__emscripten_sync_run_in_main_thread_6 = asm["_emscripten_sync_run_in_main_thread_6"]; asm["_emscripten_sync_run_in_main_thread_6"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_sync_run_in_main_thread_6.apply(null, arguments);
};

var real__emscripten_sync_run_in_main_thread_7 = asm["_emscripten_sync_run_in_main_thread_7"]; asm["_emscripten_sync_run_in_main_thread_7"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_sync_run_in_main_thread_7.apply(null, arguments);
};

var real__emscripten_sync_run_in_main_thread_0 = asm["_emscripten_sync_run_in_main_thread_0"]; asm["_emscripten_sync_run_in_main_thread_0"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_sync_run_in_main_thread_0.apply(null, arguments);
};

var real__emscripten_sync_run_in_main_thread_1 = asm["_emscripten_sync_run_in_main_thread_1"]; asm["_emscripten_sync_run_in_main_thread_1"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_sync_run_in_main_thread_1.apply(null, arguments);
};

var real__emscripten_sync_run_in_main_thread_2 = asm["_emscripten_sync_run_in_main_thread_2"]; asm["_emscripten_sync_run_in_main_thread_2"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_sync_run_in_main_thread_2.apply(null, arguments);
};

var real__emscripten_sync_run_in_main_thread_3 = asm["_emscripten_sync_run_in_main_thread_3"]; asm["_emscripten_sync_run_in_main_thread_3"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_sync_run_in_main_thread_3.apply(null, arguments);
};

var real__emscripten_atomic_exchange_u32 = asm["_emscripten_atomic_exchange_u32"]; asm["_emscripten_atomic_exchange_u32"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_exchange_u32.apply(null, arguments);
};

var real__emscripten_async_run_in_main_thread = asm["_emscripten_async_run_in_main_thread"]; asm["_emscripten_async_run_in_main_thread"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_async_run_in_main_thread.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__fflush.apply(null, arguments);
};

var real__emscripten_set_current_thread_status = asm["_emscripten_set_current_thread_status"]; asm["_emscripten_set_current_thread_status"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_set_current_thread_status.apply(null, arguments);
};

var real__emscripten_atomic_cas_u64 = asm["_emscripten_atomic_cas_u64"]; asm["_emscripten_atomic_cas_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_cas_u64.apply(null, arguments);
};

var real__emscripten_atomic_sub_u64 = asm["_emscripten_atomic_sub_u64"]; asm["_emscripten_atomic_sub_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_sub_u64.apply(null, arguments);
};

var real__emscripten_sync_run_in_main_thread_xprintf_varargs = asm["_emscripten_sync_run_in_main_thread_xprintf_varargs"]; asm["_emscripten_sync_run_in_main_thread_xprintf_varargs"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_sync_run_in_main_thread_xprintf_varargs.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____errno_location.apply(null, arguments);
};

var real___emscripten_atomic_fetch_and_and_u64 = asm["__emscripten_atomic_fetch_and_and_u64"]; asm["__emscripten_atomic_fetch_and_and_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___emscripten_atomic_fetch_and_and_u64.apply(null, arguments);
};

var real___emscripten_atomic_fetch_and_sub_u64 = asm["__emscripten_atomic_fetch_and_sub_u64"]; asm["__emscripten_atomic_fetch_and_sub_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___emscripten_atomic_fetch_and_sub_u64.apply(null, arguments);
};

var real__emscripten_atomic_store_f64 = asm["_emscripten_atomic_store_f64"]; asm["_emscripten_atomic_store_f64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_store_f64.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_stackAlloc.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Subtract.apply(null, arguments);
};

var real___GLOBAL__sub_I_bind_cpp = asm["__GLOBAL__sub_I_bind_cpp"]; asm["__GLOBAL__sub_I_bind_cpp"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___GLOBAL__sub_I_bind_cpp.apply(null, arguments);
};

var real____udivmoddi4 = asm["___udivmoddi4"]; asm["___udivmoddi4"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____udivmoddi4.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_setTempRet0.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Add.apply(null, arguments);
};

var real__emscripten_atomic_store_u64 = asm["_emscripten_atomic_store_u64"]; asm["_emscripten_atomic_store_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_store_u64.apply(null, arguments);
};

var real__emscripten_atomic_load_f64 = asm["_emscripten_atomic_load_f64"]; asm["_emscripten_atomic_load_f64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_load_f64.apply(null, arguments);
};

var real__emscripten_get_global_libc = asm["_emscripten_get_global_libc"]; asm["_emscripten_get_global_libc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_get_global_libc.apply(null, arguments);
};

var real___emscripten_atomic_fetch_and_add_u64 = asm["__emscripten_atomic_fetch_and_add_u64"]; asm["__emscripten_atomic_fetch_and_add_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___emscripten_atomic_fetch_and_add_u64.apply(null, arguments);
};

var real___emscripten_atomic_fetch_and_or_u64 = asm["__emscripten_atomic_fetch_and_or_u64"]; asm["__emscripten_atomic_fetch_and_or_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___emscripten_atomic_fetch_and_or_u64.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____udivdi3.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__llvm_bswap_i32.apply(null, arguments);
};

var real__main = asm["_main"]; asm["_main"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__main.apply(null, arguments);
};

var real__emscripten_main_thread_process_queued_calls = asm["_emscripten_main_thread_process_queued_calls"]; asm["_emscripten_main_thread_process_queued_calls"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_main_thread_process_queued_calls.apply(null, arguments);
};

var real__emscripten_atomic_add_u64 = asm["_emscripten_atomic_add_u64"]; asm["_emscripten_atomic_add_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_add_u64.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__free.apply(null, arguments);
};

var real__emscripten_atomic_store_f32 = asm["_emscripten_atomic_store_f32"]; asm["_emscripten_atomic_store_f32"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_store_f32.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_setThrew.apply(null, arguments);
};

var real__emscripten_atomic_exchange_u64 = asm["_emscripten_atomic_exchange_u64"]; asm["_emscripten_atomic_exchange_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_exchange_u64.apply(null, arguments);
};

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____uremdi3.apply(null, arguments);
};

var real____pthread_tsd_run_dtors = asm["___pthread_tsd_run_dtors"]; asm["___pthread_tsd_run_dtors"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____pthread_tsd_run_dtors.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_stackRestore.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__malloc.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_establishStackSpace.apply(null, arguments);
};

var real__emscripten_conditional_set_current_thread_status = asm["_emscripten_conditional_set_current_thread_status"]; asm["_emscripten_conditional_set_current_thread_status"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_conditional_set_current_thread_status.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__sbrk.apply(null, arguments);
};

var real____getTypeName = asm["___getTypeName"]; asm["___getTypeName"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____getTypeName.apply(null, arguments);
};

var real__emscripten_atomic_or_u64 = asm["_emscripten_atomic_or_u64"]; asm["_emscripten_atomic_or_u64"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_atomic_or_u64.apply(null, arguments);
};
var __emscripten_atomic_fetch_and_xor_u64 = Module["__emscripten_atomic_fetch_and_xor_u64"] = asm["__emscripten_atomic_fetch_and_xor_u64"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _emscripten_atomic_load_f32 = Module["_emscripten_atomic_load_f32"] = asm["_emscripten_atomic_load_f32"];
var ___emscripten_pthread_data_constructor = Module["___emscripten_pthread_data_constructor"] = asm["___emscripten_pthread_data_constructor"];
var __GLOBAL__sub_I_fetch_cpp = Module["__GLOBAL__sub_I_fetch_cpp"] = asm["__GLOBAL__sub_I_fetch_cpp"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var _emscripten_atomic_xor_u64 = Module["_emscripten_atomic_xor_u64"] = asm["_emscripten_atomic_xor_u64"];
var _emscripten_atomic_load_u64 = Module["_emscripten_atomic_load_u64"] = asm["_emscripten_atomic_load_u64"];
var _llvm_cttz_i32 = Module["_llvm_cttz_i32"] = asm["_llvm_cttz_i32"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var _emscripten_atomic_and_u64 = Module["_emscripten_atomic_and_u64"] = asm["_emscripten_atomic_and_u64"];
var _emscripten_sync_run_in_main_thread = Module["_emscripten_sync_run_in_main_thread"] = asm["_emscripten_sync_run_in_main_thread"];
var _emscripten_sync_run_in_main_thread_4 = Module["_emscripten_sync_run_in_main_thread_4"] = asm["_emscripten_sync_run_in_main_thread_4"];
var _emscripten_sync_run_in_main_thread_5 = Module["_emscripten_sync_run_in_main_thread_5"] = asm["_emscripten_sync_run_in_main_thread_5"];
var _emscripten_sync_run_in_main_thread_6 = Module["_emscripten_sync_run_in_main_thread_6"] = asm["_emscripten_sync_run_in_main_thread_6"];
var _emscripten_sync_run_in_main_thread_7 = Module["_emscripten_sync_run_in_main_thread_7"] = asm["_emscripten_sync_run_in_main_thread_7"];
var _emscripten_sync_run_in_main_thread_0 = Module["_emscripten_sync_run_in_main_thread_0"] = asm["_emscripten_sync_run_in_main_thread_0"];
var _emscripten_sync_run_in_main_thread_1 = Module["_emscripten_sync_run_in_main_thread_1"] = asm["_emscripten_sync_run_in_main_thread_1"];
var _emscripten_sync_run_in_main_thread_2 = Module["_emscripten_sync_run_in_main_thread_2"] = asm["_emscripten_sync_run_in_main_thread_2"];
var _emscripten_sync_run_in_main_thread_3 = Module["_emscripten_sync_run_in_main_thread_3"] = asm["_emscripten_sync_run_in_main_thread_3"];
var _emscripten_atomic_exchange_u32 = Module["_emscripten_atomic_exchange_u32"] = asm["_emscripten_atomic_exchange_u32"];
var _emscripten_async_run_in_main_thread = Module["_emscripten_async_run_in_main_thread"] = asm["_emscripten_async_run_in_main_thread"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var _emscripten_set_current_thread_status = Module["_emscripten_set_current_thread_status"] = asm["_emscripten_set_current_thread_status"];
var _emscripten_atomic_cas_u64 = Module["_emscripten_atomic_cas_u64"] = asm["_emscripten_atomic_cas_u64"];
var _memset = Module["_memset"] = asm["_memset"];
var _emscripten_atomic_sub_u64 = Module["_emscripten_atomic_sub_u64"] = asm["_emscripten_atomic_sub_u64"];
var _emscripten_sync_run_in_main_thread_xprintf_varargs = Module["_emscripten_sync_run_in_main_thread_xprintf_varargs"] = asm["_emscripten_sync_run_in_main_thread_xprintf_varargs"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var __emscripten_atomic_fetch_and_and_u64 = Module["__emscripten_atomic_fetch_and_and_u64"] = asm["__emscripten_atomic_fetch_and_and_u64"];
var __emscripten_atomic_fetch_and_sub_u64 = Module["__emscripten_atomic_fetch_and_sub_u64"] = asm["__emscripten_atomic_fetch_and_sub_u64"];
var _emscripten_atomic_store_f64 = Module["_emscripten_atomic_store_f64"] = asm["_emscripten_atomic_store_f64"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var __GLOBAL__sub_I_bind_cpp = Module["__GLOBAL__sub_I_bind_cpp"] = asm["__GLOBAL__sub_I_bind_cpp"];
var ___udivmoddi4 = Module["___udivmoddi4"] = asm["___udivmoddi4"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _emscripten_atomic_store_u64 = Module["_emscripten_atomic_store_u64"] = asm["_emscripten_atomic_store_u64"];
var _emscripten_atomic_load_f64 = Module["_emscripten_atomic_load_f64"] = asm["_emscripten_atomic_load_f64"];
var _emscripten_get_global_libc = Module["_emscripten_get_global_libc"] = asm["_emscripten_get_global_libc"];
var __emscripten_atomic_fetch_and_add_u64 = Module["__emscripten_atomic_fetch_and_add_u64"] = asm["__emscripten_atomic_fetch_and_add_u64"];
var __emscripten_atomic_fetch_and_or_u64 = Module["__emscripten_atomic_fetch_and_or_u64"] = asm["__emscripten_atomic_fetch_and_or_u64"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var _main = Module["_main"] = asm["_main"];
var _emscripten_main_thread_process_queued_calls = Module["_emscripten_main_thread_process_queued_calls"] = asm["_emscripten_main_thread_process_queued_calls"];
var _emscripten_atomic_add_u64 = Module["_emscripten_atomic_add_u64"] = asm["_emscripten_atomic_add_u64"];
var _free = Module["_free"] = asm["_free"];
var _emscripten_atomic_store_f32 = Module["_emscripten_atomic_store_f32"] = asm["_emscripten_atomic_store_f32"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var _emscripten_atomic_exchange_u64 = Module["_emscripten_atomic_exchange_u64"] = asm["_emscripten_atomic_exchange_u64"];
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var ___pthread_tsd_run_dtors = Module["___pthread_tsd_run_dtors"] = asm["___pthread_tsd_run_dtors"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var _emscripten_conditional_set_current_thread_status = Module["_emscripten_conditional_set_current_thread_status"] = asm["_emscripten_conditional_set_current_thread_status"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var ___getTypeName = Module["___getTypeName"] = asm["___getTypeName"];
var _emscripten_atomic_or_u64 = Module["_emscripten_atomic_or_u64"] = asm["_emscripten_atomic_or_u64"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
;
Runtime.stackAlloc = Module['stackAlloc'];
Runtime.stackSave = Module['stackSave'];
Runtime.stackRestore = Module['stackRestore'];
Runtime.establishStackSpace = Module['establishStackSpace'];
Runtime.setTempRet0 = Module['setTempRet0'];
Runtime.getTempRet0 = Module['getTempRet0'];


// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;






/**
 * @constructor
 * @extends {Error}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      var toLog = e;
      if (e && typeof e === 'object' && e.stack) {
        toLog = [e, e.stack];
      }
      Module.printErr('exception thrown: ' + toLog);
      Module['quit'](1, e);
    }
  } finally {
    calledMain = true;
  }
}




/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
      Module.printErr('pre-main prep time: ' + (Date.now() - preloadStartTime) + ' ms');
    }

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') implicitly called by end of main(), but noExitRuntime, so not exiting the runtime (you can use emscripten_force_exit, if you want to force a true shutdown)');
    return;
  }

  if (Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') called, but noExitRuntime, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)');
  } else {
    PThread.terminateAllThreads();

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  }
  Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (ENVIRONMENT_IS_PTHREAD) console.error('Pthread aborting at ' + new Error().stack);
  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}


if (!ENVIRONMENT_IS_PTHREAD) run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}



