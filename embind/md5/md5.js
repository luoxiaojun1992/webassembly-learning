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

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


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
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
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


function preRun() {
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
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
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



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;



// === Body ===

var ASM_CONSTS = [];




STATIC_BASE = Runtime.GLOBAL_BASE;

STATICTOP = STATIC_BASE + 4560;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_md5_cpp() } }, { func: function() { __GLOBAL__sub_I_bind_cpp() } });


/* memory initializer */ allocate([92,3,0,0,183,4,0,0,4,4,0,0,120,4,0,0,0,0,0,0,1,0,0,0,8,0,0,0,0,0,0,0,92,3,0,0,254,7,0,0,92,3,0,0,29,8,0,0,92,3,0,0,60,8,0,0,92,3,0,0,91,8,0,0,92,3,0,0,122,8,0,0,92,3,0,0,153,8,0,0,92,3,0,0,184,8,0,0,92,3,0,0,215,8,0,0,92,3,0,0,246,8,0,0,92,3,0,0,21,9,0,0,92,3,0,0,52,9,0,0,92,3,0,0,83,9,0,0,92,3,0,0,114,9,0,0,4,4,0,0,133,9,0,0,0,0,0,0,1,0,0,0,8,0,0,0,0,0,0,0,4,4,0,0,196,9,0,0,0,0,0,0,1,0,0,0,8,0,0,0,0,0,0,0,92,3,0,0,16,10,0,0,132,3,0,0,112,10,0,0,216,0,0,0,0,0,0,0,132,3,0,0,29,10,0,0,232,0,0,0,0,0,0,0,92,3,0,0,62,10,0,0,132,3,0,0,75,10,0,0,200,0,0,0,0,0,0,0,132,3,0,0,161,10,0,0,192,0,0,0,0,0,0,0,132,3,0,0,174,10,0,0,192,0,0,0,0,0,0,0,132,3,0,0,190,10,0,0,16,1,0,0,0,0,0,0,132,3,0,0,243,10,0,0,216,0,0,0,0,0,0,0,132,3,0,0,207,10,0,0,48,1,0,0,0,0,0,0,132,3,0,0,21,11,0,0,216,0,0,0,0,0,0,0,232,3,0,0,61,11,0,0,232,3,0,0,63,11,0,0,232,3,0,0,65,11,0,0,232,3,0,0,67,11,0,0,232,3,0,0,69,11,0,0,232,3,0,0,71,11,0,0,232,3,0,0,73,11,0,0,232,3,0,0,75,11,0,0,232,3,0,0,77,11,0,0,232,3,0,0,79,11,0,0,232,3,0,0,81,11,0,0,232,3,0,0,83,11,0,0,232,3,0,0,85,11,0,0,132,3,0,0,87,11,0,0,200,0,0,0,0,0,0,0,16,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,168,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,3,0,0,0,202,13,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,212,2,0,0,0,0,0,0,200,0,0,0,4,0,0,0,5,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,11,0,0,0,0,0,0,0,240,0,0,0,4,0,0,0,12,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,13,0,0,0,14,0,0,0,15,0,0,0,0,0,0,0,0,1,0,0,16,0,0,0,17,0,0,0,18,0,0,0,0,0,0,0,16,1,0,0,19,0,0,0,20,0,0,0,21,0,0,0,0,0,0,0,32,1,0,0,19,0,0,0,22,0,0,0,21,0,0,0,0,0,0,0,80,1,0,0,4,0,0,0,23,0,0,0,6,0,0,0,7,0,0,0,24,0,0,0,0,0,0,0,200,1,0,0,4,0,0,0,25,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,26,0,0,0,27,0,0,0,28,0,0,0,128,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,48,49,50,51,52,53,54,55,56,57,97,98,99,100,101,102,109,100,53,0,78,83,116,51,95,95,50,49,50,98,97,115,105,99,95,115,116,114,105,110,103,73,99,78,83,95,49,49,99,104,97,114,95,116,114,97,105,116,115,73,99,69,69,78,83,95,57,97,108,108,111,99,97,116,111,114,73,99,69,69,69,69,0,78,83,116,51,95,95,50,50,49,95,95,98,97,115,105,99,95,115,116,114,105,110,103,95,99,111,109,109,111,110,73,76,98,49,69,69,69,0,105,105,105,0,118,111,105,100,0,98,111,111,108,0,99,104,97,114,0,115,105,103,110,101,100,32,99,104,97,114,0,117,110,115,105,103,110,101,100,32,99,104,97,114,0,115,104,111,114,116,0,117,110,115,105,103,110,101,100,32,115,104,111,114,116,0,105,110,116,0,117,110,115,105,103,110,101,100,32,105,110,116,0,108,111,110,103,0,117,110,115,105,103,110,101,100,32,108,111,110,103,0,102,108,111,97,116,0,100,111,117,98,108,101,0,115,116,100,58,58,115,116,114,105,110,103,0,115,116,100,58,58,98,97,115,105,99,95,115,116,114,105,110,103,60,117,110,115,105,103,110,101,100,32,99,104,97,114,62,0,115,116,100,58,58,119,115,116,114,105,110,103,0,101,109,115,99,114,105,112,116,101,110,58,58,118,97,108,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,99,104,97,114,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,115,105,103,110,101,100,32,99,104,97,114,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,99,104,97,114,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,115,104,111,114,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,115,104,111,114,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,105,110,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,108,111,110,103,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,108,111,110,103,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,56,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,105,110,116,56,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,49,54,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,105,110,116,49,54,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,51,50,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,105,110,116,51,50,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,102,108,111,97,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,100,111,117,98,108,101,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,108,111,110,103,32,100,111,117,98,108,101,62,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,101,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,100,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,102,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,109,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,108,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,106,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,105,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,116,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,115,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,104,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,97,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,99,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,51,118,97,108,69,0,78,83,116,51,95,95,50,49,50,98,97,115,105,99,95,115,116,114,105,110,103,73,119,78,83,95,49,49,99,104,97,114,95,116,114,97,105,116,115,73,119,69,69,78,83,95,57,97,108,108,111,99,97,116,111,114,73,119,69,69,69,69,0,78,83,116,51,95,95,50,49,50,98,97,115,105,99,95,115,116,114,105,110,103,73,104,78,83,95,49,49,99,104,97,114,95,116,114,97,105,116,115,73,104,69,69,78,83,95,57,97,108,108,111,99,97,116,111,114,73,104,69,69,69,69,0,98,97,115,105,99,95,115,116,114,105,110,103,0,83,116,57,101,120,99,101,112,116,105,111,110,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,54,95,95,115,104,105,109,95,116,121,112,101,95,105,110,102,111,69,0,83,116,57,116,121,112,101,95,105,110,102,111,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,48,95,95,115,105,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,115,116,100,58,58,98,97,100,95,97,108,108,111,99,0,83,116,57,98,97,100,95,97,108,108,111,99,0,83,116,49,49,108,111,103,105,99,95,101,114,114,111,114,0,83,116,49,50,108,101,110,103,116,104,95,101,114,114,111,114,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,57,95,95,112,111,105,110,116,101,114,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,112,98,97,115,101,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,51,95,95,102,117,110,100,97,109,101,110,116,97,108,95,116,121,112,101,95,105,110,102,111,69,0,118,0,98,0,99,0,104,0,97,0,115,0,116,0,105,0,106,0,108,0,109,0,102,0,100,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,49,95,95,118,109,105,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

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
    }
  
  function getShiftFromSize(size) {
      switch (size) {
          case 1: return 0;
          case 2: return 1;
          case 4: return 2;
          case 8: return 3;
          default:
              throw new TypeError('Unknown type size: ' + size);
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
    }function ___cxa_throw(ptr, type, destructor) {
      EXCEPTIONS.infos[ptr] = {
        ptr: ptr,
        adjusted: ptr,
        type: type,
        destructor: destructor,
        refcount: 0,
        caught: false,
        rethrown: false
      };
      EXCEPTIONS.last = ptr;
      if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1;
      } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++;
      }
      throw ptr;
    }

   
  Module["_memset"] = _memset;

  function __embind_register_bool(rawType, name, size, trueValue, falseValue) {
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

  
  
  function new_(constructor, argumentList) {
      if (!(constructor instanceof Function)) {
          throw new TypeError('new_ called with constructor type ' + typeof(constructor) + " which is not a function");
      }
  
      /*
       * Previously, the following line was just:
  
       function dummy() {};
  
       * Unfortunately, Chrome was preserving 'dummy' as the object's name, even though at creation, the 'dummy' has the
       * correct constructor name.  Thus, objects created with IMVU.new would show up in the debugger as 'dummy', which
       * isn't very helpful.  Using IMVU.createNamedFunction addresses the issue.  Doublely-unfortunately, there's no way
       * to write a test for this behavior.  -NRD 2013.02.22
       */
      var dummy = createNamedFunction(constructor.name || 'unknownFunctionName', function(){});
      dummy.prototype = constructor.prototype;
      var obj = new dummy;
  
      var r = constructor.apply(obj, argumentList);
      return (r instanceof Object) ? r : obj;
    }
  
  function runDestructors(destructors) {
      while (destructors.length) {
          var ptr = destructors.pop();
          var del = destructors.pop();
          del(ptr);
      }
    }function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc) {
      // humanName: a human-readable string name for the function to be generated.
      // argTypes: An array that contains the embind type objects for all types in the function signature.
      //    argTypes[0] is the type object for the function return value.
      //    argTypes[1] is the type object for function this object/class type, or null if not crafting an invoker for a class method.
      //    argTypes[2...] are the actual function parameters.
      // classType: The embind type object for the class to be bound, or null if this is not a method of a class.
      // cppInvokerFunc: JS Function object to the C++-side function that interops into C++ code.
      // cppTargetFunc: Function pointer (an integer to FUNCTION_TABLE) to the target C++ function the cppInvokerFunc will end up calling.
      var argCount = argTypes.length;
  
      if (argCount < 2) {
          throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");
      }
  
      var isClassMethodFunc = (argTypes[1] !== null && classType !== null);
  
      // Free functions with signature "void function()" do not need an invoker that marshalls between wire types.
  // TODO: This omits argument count check - enable only at -O3 or similar.
  //    if (ENABLE_UNSAFE_OPTS && argCount == 2 && argTypes[0].name == "void" && !isClassMethodFunc) {
  //       return FUNCTION_TABLE[fn];
  //    }
  
      var argsList = "";
      var argsListWired = "";
      for(var i = 0; i < argCount - 2; ++i) {
          argsList += (i!==0?", ":"")+"arg"+i;
          argsListWired += (i!==0?", ":"")+"arg"+i+"Wired";
      }
  
      var invokerFnBody =
          "return function "+makeLegalFunctionName(humanName)+"("+argsList+") {\n" +
          "if (arguments.length !== "+(argCount - 2)+") {\n" +
              "throwBindingError('function "+humanName+" called with ' + arguments.length + ' arguments, expected "+(argCount - 2)+" args!');\n" +
          "}\n";
  
  
      // Determine if we need to use a dynamic stack to store the destructors for the function parameters.
      // TODO: Remove this completely once all function invokers are being dynamically generated.
      var needsDestructorStack = false;
  
      for(var i = 1; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here.
          if (argTypes[i] !== null && argTypes[i].destructorFunction === undefined) { // The type does not define a destructor function - must use dynamic stack
              needsDestructorStack = true;
              break;
          }
      }
  
      if (needsDestructorStack) {
          invokerFnBody +=
              "var destructors = [];\n";
      }
  
      var dtorStack = needsDestructorStack ? "destructors" : "null";
      var args1 = ["throwBindingError", "invoker", "fn", "runDestructors", "retType", "classParam"];
      var args2 = [throwBindingError, cppInvokerFunc, cppTargetFunc, runDestructors, argTypes[0], argTypes[1]];
  
  
      if (isClassMethodFunc) {
          invokerFnBody += "var thisWired = classParam.toWireType("+dtorStack+", this);\n";
      }
  
      for(var i = 0; i < argCount - 2; ++i) {
          invokerFnBody += "var arg"+i+"Wired = argType"+i+".toWireType("+dtorStack+", arg"+i+"); // "+argTypes[i+2].name+"\n";
          args1.push("argType"+i);
          args2.push(argTypes[i+2]);
      }
  
      if (isClassMethodFunc) {
          argsListWired = "thisWired" + (argsListWired.length > 0 ? ", " : "") + argsListWired;
      }
  
      var returns = (argTypes[0].name !== "void");
  
      invokerFnBody +=
          (returns?"var rv = ":"") + "invoker(fn"+(argsListWired.length>0?", ":"")+argsListWired+");\n";
  
      if (needsDestructorStack) {
          invokerFnBody += "runDestructors(destructors);\n";
      } else {
          for(var i = isClassMethodFunc?1:2; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here. Also skip class type if not a method.
              var paramName = (i === 1 ? "thisWired" : ("arg"+(i - 2)+"Wired"));
              if (argTypes[i].destructorFunction !== null) {
                  invokerFnBody += paramName+"_dtor("+paramName+"); // "+argTypes[i].name+"\n";
                  args1.push(paramName+"_dtor");
                  args2.push(argTypes[i].destructorFunction);
              }
          }
      }
  
      if (returns) {
          invokerFnBody += "var ret = retType.fromWireType(rv);\n" +
                           "return ret;\n";
      } else {
      }
      invokerFnBody += "}\n";
  
      args1.push(invokerFnBody);
  
      var invokerFunction = new_(Function, args1).apply(null, args2);
      return invokerFunction;
    }
  
  
  function ensureOverloadTable(proto, methodName, humanName) {
      if (undefined === proto[methodName].overloadTable) {
          var prevFunc = proto[methodName];
          // Inject an overload resolver function that routes to the appropriate overload based on the number of arguments.
          proto[methodName] = function() {
              // TODO This check can be removed in -O3 level "unsafe" optimizations.
              if (!proto[methodName].overloadTable.hasOwnProperty(arguments.length)) {
                  throwBindingError("Function '" + humanName + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + proto[methodName].overloadTable + ")!");
              }
              return proto[methodName].overloadTable[arguments.length].apply(this, arguments);
          };
          // Move the previous function into the overload table.
          proto[methodName].overloadTable = [];
          proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
      }
    }function exposePublicSymbol(name, value, numArguments) {
      if (Module.hasOwnProperty(name)) {
          if (undefined === numArguments || (undefined !== Module[name].overloadTable && undefined !== Module[name].overloadTable[numArguments])) {
              throwBindingError("Cannot register public name '" + name + "' twice");
          }
  
          // We are exposing a function with the same name as an existing function. Create an overload table and a function selector
          // that routes between the two.
          ensureOverloadTable(Module, name, name);
          if (Module.hasOwnProperty(numArguments)) {
              throwBindingError("Cannot register multiple overloads of a function with the same number of arguments (" + numArguments + ")!");
          }
          // Add the new function into the overload table.
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          if (undefined !== numArguments) {
              Module[name].numArguments = numArguments;
          }
      }
    }
  
  function heap32VectorToArray(count, firstElement) {
      var array = [];
      for (var i = 0; i < count; i++) {
          array.push(HEAP32[(firstElement >> 2) + i]);
      }
      return array;
    }
  
  function replacePublicSymbol(name, value, numArguments) {
      if (!Module.hasOwnProperty(name)) {
          throwInternalError('Replacing nonexistant public symbol');
      }
      // If there's an overload table for this symbol, replace the symbol in the overload table instead.
      if (undefined !== Module[name].overloadTable && undefined !== numArguments) {
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          Module[name].argCount = numArguments;
      }
    }
  
  function requireFunction(signature, rawFunction) {
      signature = readLatin1String(signature);
  
      function makeDynCaller(dynCall) {
          var args = [];
          for (var i = 1; i < signature.length; ++i) {
              args.push('a' + i);
          }
  
          var name = 'dynCall_' + signature + '_' + rawFunction;
          var body = 'return function ' + name + '(' + args.join(', ') + ') {\n';
          body    += '    return dynCall(rawFunction' + (args.length ? ', ' : '') + args.join(', ') + ');\n';
          body    += '};\n';
  
          return (new Function('dynCall', 'rawFunction', body))(dynCall, rawFunction);
      }
  
      var fp;
      if (Module['FUNCTION_TABLE_' + signature] !== undefined) {
          fp = Module['FUNCTION_TABLE_' + signature][rawFunction];
      } else if (typeof FUNCTION_TABLE !== "undefined") {
          fp = FUNCTION_TABLE[rawFunction];
      } else {
          // asm.js does not give direct access to the function tables,
          // and thus we must go through the dynCall interface which allows
          // calling into a signature's function table by pointer value.
          //
          // https://github.com/dherman/asm.js/issues/83
          //
          // This has three main penalties:
          // - dynCall is another function call in the path from JavaScript to C++.
          // - JITs may not predict through the function table indirection at runtime.
          var dc = Module["asm"]['dynCall_' + signature];
          if (dc === undefined) {
              // We will always enter this branch if the signature
              // contains 'f' and PRECISE_F32 is not enabled.
              //
              // Try again, replacing 'f' with 'd'.
              dc = Module["asm"]['dynCall_' + signature.replace(/f/g, 'd')];
              if (dc === undefined) {
                  throwBindingError("No dynCall invoker for signature: " + signature);
              }
          }
          fp = makeDynCaller(dc);
      }
  
      if (typeof fp !== "function") {
          throwBindingError("unknown function pointer with signature " + signature + ": " + rawFunction);
      }
      return fp;
    }
  
  
  var UnboundTypeError=undefined;
  
  
  function _free() {
  }
  Module["_free"] = _free;function getTypeName(type) {
      var ptr = ___getTypeName(type);
      var rv = readLatin1String(ptr);
      _free(ptr);
      return rv;
    }function throwUnboundTypeError(message, types) {
      var unboundTypes = [];
      var seen = {};
      function visit(type) {
          if (seen[type]) {
              return;
          }
          if (registeredTypes[type]) {
              return;
          }
          if (typeDependencies[type]) {
              typeDependencies[type].forEach(visit);
              return;
          }
          unboundTypes.push(type);
          seen[type] = true;
      }
      types.forEach(visit);
  
      throw new UnboundTypeError(message + ': ' + unboundTypes.map(getTypeName).join([', ']));
    }function __embind_register_function(name, argCount, rawArgTypesAddr, signature, rawInvoker, fn) {
      var argTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      name = readLatin1String(name);
      
      rawInvoker = requireFunction(signature, rawInvoker);
  
      exposePublicSymbol(name, function() {
          throwUnboundTypeError('Cannot call ' + name + ' due to unbound types', argTypes);
      }, argCount - 1);
  
      whenDependentTypesAreResolved([], argTypes, function(argTypes) {
          var invokerArgsArray = [argTypes[0] /* return value */, null /* no class 'this'*/].concat(argTypes.slice(1) /* actual params */);
          replacePublicSymbol(name, craftInvokerFunction(name, invokerArgsArray, null /* no class 'this'*/, rawInvoker, fn), argCount - 1);
          return [];
      });
    }

  function _abort() {
      Module['abort']();
    }

  function ___cxa_find_matching_catch_2() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }

  
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

  function ___cxa_free_exception(ptr) {
      try {
        return _free(ptr);
      } catch(e) { // XXX FIXME
        Module.printErr('exception during cxa_free_exception: ' + e);
      }
    }

  function ___cxa_end_catch() {
      // Clear state flag.
      Module['setThrew'](0);
      // Call destructor if one is registered then clear it.
      var ptr = EXCEPTIONS.caught.pop();
      if (ptr) {
        EXCEPTIONS.decRef(EXCEPTIONS.deAdjust(ptr));
        EXCEPTIONS.last = 0; // XXX in decRef?
      }
    }

  function ___lock() {}

  function ___unlock() {}

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
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

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    } 
  Module["_sbrk"] = _sbrk;

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

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffer) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___cxa_begin_catch(ptr) {
      var info = EXCEPTIONS.infos[ptr];
      if (info && !info.caught) {
        info.caught = true;
        __ZSt18uncaught_exceptionv.uncaught_exception--;
      }
      if (info) info.rethrown = false;
      EXCEPTIONS.caught.push(ptr);
      EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
      return ptr;
    }

  function ___gxx_personality_v0() {
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 
  Module["_memcpy"] = _memcpy;

  
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


  function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
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

  function ___cxa_allocate_exception(size) {
      return _malloc(size);
    }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___cxa_find_matching_catch_3() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }
embind_init_charCodes();
BindingError = Module['BindingError'] = extendError(Error, 'BindingError');;
InternalError = Module['InternalError'] = extendError(Error, 'InternalError');;
UnboundTypeError = Module['UnboundTypeError'] = extendError(Error, 'UnboundTypeError');;
/* flush anything remaining in the buffer during shutdown */ __ATEXIT__.push(function() { var fflush = Module["_fflush"]; if (fflush) fflush(0); var printChar = ___syscall146.printChar; if (!printChar) return; var buffers = ___syscall146.buffers; if (buffers[1].length) printChar(1, 10); if (buffers[2].length) printChar(2, 10); });;
init_emval();;
DYNAMICTOP_PTR = allocate(1, "i32", ALLOC_STATIC);

STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = Runtime.alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");


function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_iiii": nullFunc_iiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_ii": nullFunc_ii, "nullFunc_v": nullFunc_v, "nullFunc_viiiiii": nullFunc_viiiiii, "nullFunc_iii": nullFunc_iii, "nullFunc_viiii": nullFunc_viiii, "invoke_iiii": invoke_iiii, "invoke_viiiii": invoke_viiiii, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_ii": invoke_ii, "invoke_v": invoke_v, "invoke_viiiiii": invoke_viiiiii, "invoke_iii": invoke_iii, "invoke_viiii": invoke_viiii, "floatReadValueFromPointer": floatReadValueFromPointer, "simpleReadValueFromPointer": simpleReadValueFromPointer, "integerReadValueFromPointer": integerReadValueFromPointer, "__embind_register_integer": __embind_register_integer, "throwInternalError": throwInternalError, "get_first_emval": get_first_emval, "_abort": _abort, "___gxx_personality_v0": ___gxx_personality_v0, "extendError": extendError, "__embind_register_void": __embind_register_void, "___cxa_free_exception": ___cxa_free_exception, "___cxa_find_matching_catch_2": ___cxa_find_matching_catch_2, "___cxa_find_matching_catch_3": ___cxa_find_matching_catch_3, "getShiftFromSize": getShiftFromSize, "__embind_register_function": __embind_register_function, "embind_init_charCodes": embind_init_charCodes, "requireFunction": requireFunction, "___setErrNo": ___setErrNo, "__emval_register": __emval_register, "___cxa_begin_catch": ___cxa_begin_catch, "_emscripten_memcpy_big": _emscripten_memcpy_big, "___cxa_end_catch": ___cxa_end_catch, "__embind_register_bool": __embind_register_bool, "___resumeException": ___resumeException, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "_embind_repr": _embind_repr, "__embind_register_std_wstring": __embind_register_std_wstring, "createNamedFunction": createNamedFunction, "__embind_register_emval": __embind_register_emval, "readLatin1String": readLatin1String, "__embind_register_memory_view": __embind_register_memory_view, "throwUnboundTypeError": throwUnboundTypeError, "craftInvokerFunction": craftInvokerFunction, "__emval_decref": __emval_decref, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "__embind_register_float": __embind_register_float, "makeLegalFunctionName": makeLegalFunctionName, "___syscall54": ___syscall54, "___unlock": ___unlock, "heap32VectorToArray": heap32VectorToArray, "init_emval": init_emval, "whenDependentTypesAreResolved": whenDependentTypesAreResolved, "new_": new_, "registerType": registerType, "___cxa_throw": ___cxa_throw, "___lock": ___lock, "___syscall6": ___syscall6, "throwBindingError": throwBindingError, "ensureOverloadTable": ensureOverloadTable, "count_emval_handles": count_emval_handles, "___cxa_allocate_exception": ___cxa_allocate_exception, "runDestructors": runDestructors, "getTypeName": getTypeName, "___syscall140": ___syscall140, "exposePublicSymbol": exposePublicSymbol, "__embind_register_std_string": __embind_register_std_string, "replacePublicSymbol": replacePublicSymbol, "___syscall146": ___syscall146, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX };
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
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var nullFunc_iii=env.nullFunc_iii;
  var nullFunc_viiii=env.nullFunc_viiii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_ii=env.invoke_ii;
  var invoke_v=env.invoke_v;
  var invoke_viiiiii=env.invoke_viiiiii;
  var invoke_iii=env.invoke_iii;
  var invoke_viiii=env.invoke_viiii;
  var floatReadValueFromPointer=env.floatReadValueFromPointer;
  var simpleReadValueFromPointer=env.simpleReadValueFromPointer;
  var integerReadValueFromPointer=env.integerReadValueFromPointer;
  var __embind_register_integer=env.__embind_register_integer;
  var throwInternalError=env.throwInternalError;
  var get_first_emval=env.get_first_emval;
  var _abort=env._abort;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var extendError=env.extendError;
  var __embind_register_void=env.__embind_register_void;
  var ___cxa_free_exception=env.___cxa_free_exception;
  var ___cxa_find_matching_catch_2=env.___cxa_find_matching_catch_2;
  var ___cxa_find_matching_catch_3=env.___cxa_find_matching_catch_3;
  var getShiftFromSize=env.getShiftFromSize;
  var __embind_register_function=env.__embind_register_function;
  var embind_init_charCodes=env.embind_init_charCodes;
  var requireFunction=env.requireFunction;
  var ___setErrNo=env.___setErrNo;
  var __emval_register=env.__emval_register;
  var ___cxa_begin_catch=env.___cxa_begin_catch;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var ___cxa_end_catch=env.___cxa_end_catch;
  var __embind_register_bool=env.__embind_register_bool;
  var ___resumeException=env.___resumeException;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var _embind_repr=env._embind_repr;
  var __embind_register_std_wstring=env.__embind_register_std_wstring;
  var createNamedFunction=env.createNamedFunction;
  var __embind_register_emval=env.__embind_register_emval;
  var readLatin1String=env.readLatin1String;
  var __embind_register_memory_view=env.__embind_register_memory_view;
  var throwUnboundTypeError=env.throwUnboundTypeError;
  var craftInvokerFunction=env.craftInvokerFunction;
  var __emval_decref=env.__emval_decref;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var __embind_register_float=env.__embind_register_float;
  var makeLegalFunctionName=env.makeLegalFunctionName;
  var ___syscall54=env.___syscall54;
  var ___unlock=env.___unlock;
  var heap32VectorToArray=env.heap32VectorToArray;
  var init_emval=env.init_emval;
  var whenDependentTypesAreResolved=env.whenDependentTypesAreResolved;
  var new_=env.new_;
  var registerType=env.registerType;
  var ___cxa_throw=env.___cxa_throw;
  var ___lock=env.___lock;
  var ___syscall6=env.___syscall6;
  var throwBindingError=env.throwBindingError;
  var ensureOverloadTable=env.ensureOverloadTable;
  var count_emval_handles=env.count_emval_handles;
  var ___cxa_allocate_exception=env.___cxa_allocate_exception;
  var runDestructors=env.runDestructors;
  var getTypeName=env.getTypeName;
  var ___syscall140=env.___syscall140;
  var exposePublicSymbol=env.exposePublicSymbol;
  var __embind_register_std_string=env.__embind_register_std_string;
  var replacePublicSymbol=env.replacePublicSymbol;
  var ___syscall146=env.___syscall146;
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

function __ZN3MD5C2ERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE($this,$message) {
 $this = $this|0;
 $message = $message|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__p$addr$i$i$i = 0, $__r$addr$i$i$i$i$i = 0, $__size_$i23$i$i = 0, $__x$addr$i$i$i$i$i$i = 0, $and$i$i$i = 0, $and$i$i$i$i = 0, $arrayidx = 0;
 var $arrayidx10 = 0, $arrayidx6 = 0, $arrayidx8 = 0, $cond$i$i = 0, $cond$i$i$i = 0, $conv$i$i$i = 0, $conv$i$i$i$i = 0, $conv$i14$i$i = 0, $count = 0, $count2 = 0, $message$addr = 0, $state = 0, $state5 = 0, $state7 = 0, $state9 = 0, $this$addr = 0, $this$addr$i = 0, $this$addr$i$i = 0, $this$addr$i$i$i = 0, $this$addr$i$i$i$i = 0;
 var $this$addr$i$i$i$i$i = 0, $this$addr$i$i$i$i$i$i = 0, $this$addr$i$i$i$i$i12 = 0, $this$addr$i$i$i$i13 = 0, $this$addr$i$i$i13$i$i$i = 0, $this$addr$i$i$i14 = 0, $this$addr$i$i$i15$i$i = 0, $this$addr$i$i$i4$i$i = 0, $this$addr$i$i$i4$i$i$i = 0, $this$addr$i$i14$i$i$i = 0, $this$addr$i$i15 = 0, $this$addr$i$i16$i$i = 0, $this$addr$i$i5$i$i = 0, $this$addr$i$i5$i$i$i = 0, $this$addr$i15$i$i$i = 0, $this$addr$i16 = 0, $this$addr$i17$i$i = 0, $this$addr$i6$i$i = 0, $this$addr$i6$i$i$i = 0, $this1 = 0;
 var $this1$i = 0, $this1$i$i = 0, $this1$i$i$i = 0, $this1$i$i$i$i = 0, $this1$i$i$i$i$i = 0, $this1$i$i$i$i$i$i = 0, $this1$i$i$i$i$i21 = 0, $this1$i$i$i$i20 = 0, $this1$i$i$i10$i$i = 0, $this1$i$i$i10$i$i$i = 0, $this1$i$i$i19 = 0, $this1$i$i$i19$i$i$i = 0, $this1$i$i$i21$i$i = 0, $this1$i$i18 = 0, $this1$i$i18$i$i$i = 0, $this1$i$i20$i$i = 0, $this1$i$i9$i$i = 0, $this1$i$i9$i$i$i = 0, $this1$i16$i$i$i = 0, $this1$i17 = 0;
 var $this1$i18$i$i = 0, $this1$i7$i$i = 0, $this1$i7$i$i$i = 0, $tobool$i$i$i = 0, $tobool$i$i$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $this$addr = $this;
 $message$addr = $message;
 $this1 = $this$addr;
 HEAP8[$this1>>0] = 0;
 $count = ((($this1)) + 20|0);
 $arrayidx = ((($count)) + 4|0);
 HEAP32[$arrayidx>>2] = 0;
 $count2 = ((($this1)) + 20|0);
 HEAP32[$count2>>2] = 0;
 $state = ((($this1)) + 4|0);
 HEAP32[$state>>2] = 1732584193;
 $state5 = ((($this1)) + 4|0);
 $arrayidx6 = ((($state5)) + 4|0);
 HEAP32[$arrayidx6>>2] = -271733879;
 $state7 = ((($this1)) + 4|0);
 $arrayidx8 = ((($state7)) + 8|0);
 HEAP32[$arrayidx8>>2] = -1732584194;
 $state9 = ((($this1)) + 4|0);
 $arrayidx10 = ((($state9)) + 12|0);
 HEAP32[$arrayidx10>>2] = 271733878;
 $0 = $message$addr;
 $this$addr$i = $0;
 $this1$i = $this$addr$i;
 $this$addr$i$i = $this1$i;
 $this1$i$i = $this$addr$i$i;
 $this$addr$i$i$i = $this1$i$i;
 $this1$i$i$i = $this$addr$i$i$i;
 $this$addr$i$i$i$i = $this1$i$i$i;
 $this1$i$i$i$i = $this$addr$i$i$i$i;
 $this$addr$i$i$i$i$i = $this1$i$i$i$i;
 $this1$i$i$i$i$i = $this$addr$i$i$i$i$i;
 $this$addr$i$i$i$i$i$i = $this1$i$i$i$i$i;
 $this1$i$i$i$i$i$i = $this$addr$i$i$i$i$i$i;
 $1 = ((($this1$i$i$i$i$i$i)) + 11|0);
 $2 = HEAP8[$1>>0]|0;
 $conv$i$i$i$i = $2&255;
 $and$i$i$i$i = $conv$i$i$i$i & 128;
 $tobool$i$i$i$i = ($and$i$i$i$i|0)!=(0);
 if ($tobool$i$i$i$i) {
  $this$addr$i15$i$i$i = $this1$i$i$i;
  $this1$i16$i$i$i = $this$addr$i15$i$i$i;
  $this$addr$i$i14$i$i$i = $this1$i16$i$i$i;
  $this1$i$i18$i$i$i = $this$addr$i$i14$i$i$i;
  $this$addr$i$i$i13$i$i$i = $this1$i$i18$i$i$i;
  $this1$i$i$i19$i$i$i = $this$addr$i$i$i13$i$i$i;
  $3 = HEAP32[$this1$i$i$i19$i$i$i>>2]|0;
  $cond$i$i$i = $3;
 } else {
  $this$addr$i6$i$i$i = $this1$i$i$i;
  $this1$i7$i$i$i = $this$addr$i6$i$i$i;
  $this$addr$i$i5$i$i$i = $this1$i7$i$i$i;
  $this1$i$i9$i$i$i = $this$addr$i$i5$i$i$i;
  $this$addr$i$i$i4$i$i$i = $this1$i$i9$i$i$i;
  $this1$i$i$i10$i$i$i = $this$addr$i$i$i4$i$i$i;
  $__r$addr$i$i$i$i$i = $this1$i$i$i10$i$i$i;
  $4 = $__r$addr$i$i$i$i$i;
  $__x$addr$i$i$i$i$i$i = $4;
  $5 = $__x$addr$i$i$i$i$i$i;
  $cond$i$i$i = $5;
 }
 $__p$addr$i$i$i = $cond$i$i$i;
 $6 = $__p$addr$i$i$i;
 $7 = $message$addr;
 $this$addr$i16 = $7;
 $this1$i17 = $this$addr$i16;
 $this$addr$i$i15 = $this1$i17;
 $this1$i$i18 = $this$addr$i$i15;
 $this$addr$i$i$i14 = $this1$i$i18;
 $this1$i$i$i19 = $this$addr$i$i$i14;
 $this$addr$i$i$i$i13 = $this1$i$i$i19;
 $this1$i$i$i$i20 = $this$addr$i$i$i$i13;
 $this$addr$i$i$i$i$i12 = $this1$i$i$i$i20;
 $this1$i$i$i$i$i21 = $this$addr$i$i$i$i$i12;
 $8 = ((($this1$i$i$i$i$i21)) + 11|0);
 $9 = HEAP8[$8>>0]|0;
 $conv$i$i$i = $9&255;
 $and$i$i$i = $conv$i$i$i & 128;
 $tobool$i$i$i = ($and$i$i$i|0)!=(0);
 if ($tobool$i$i$i) {
  $this$addr$i17$i$i = $this1$i$i18;
  $this1$i18$i$i = $this$addr$i17$i$i;
  $this$addr$i$i16$i$i = $this1$i18$i$i;
  $this1$i$i20$i$i = $this$addr$i$i16$i$i;
  $this$addr$i$i$i15$i$i = $this1$i$i20$i$i;
  $this1$i$i$i21$i$i = $this$addr$i$i$i15$i$i;
  $__size_$i23$i$i = ((($this1$i$i$i21$i$i)) + 4|0);
  $10 = HEAP32[$__size_$i23$i$i>>2]|0;
  $cond$i$i = $10;
  __ZN3MD54initEPKhj($this1,$6,$cond$i$i);
  STACKTOP = sp;return;
 } else {
  $this$addr$i6$i$i = $this1$i$i18;
  $this1$i7$i$i = $this$addr$i6$i$i;
  $this$addr$i$i5$i$i = $this1$i7$i$i;
  $this1$i$i9$i$i = $this$addr$i$i5$i$i;
  $this$addr$i$i$i4$i$i = $this1$i$i9$i$i;
  $this1$i$i$i10$i$i = $this$addr$i$i$i4$i$i;
  $11 = ((($this1$i$i$i10$i$i)) + 11|0);
  $12 = HEAP8[$11>>0]|0;
  $conv$i14$i$i = $12&255;
  $cond$i$i = $conv$i14$i$i;
  __ZN3MD54initEPKhj($this1,$6,$cond$i$i);
  STACKTOP = sp;return;
 }
}
function __ZN3MD54initEPKhj($this,$input,$len) {
 $this = $this|0;
 $input = $input|0;
 $len = $len|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add10 = 0, $add15 = 0, $add18 = 0, $and = 0, $arrayidx13 = 0, $arrayidx17 = 0, $arrayidx21 = 0, $arrayidx22 = 0, $arrayidx6 = 0, $arrayidx9 = 0, $buffer = 0, $buffer14 = 0, $buffer20 = 0, $cmp = 0, $cmp11 = 0;
 var $cmp16 = 0, $count = 0, $count2 = 0, $count5 = 0, $count8 = 0, $i = 0, $inc = 0, $index = 0, $input$addr = 0, $len$addr = 0, $partLen = 0, $shl = 0, $shl4 = 0, $shr = 0, $shr7 = 0, $sub = 0, $sub23 = 0, $this$addr = 0, $this1 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $this$addr = $this;
 $input$addr = $input;
 $len$addr = $len;
 $this1 = $this$addr;
 HEAP8[$this1>>0] = 0;
 $count = ((($this1)) + 20|0);
 $0 = HEAP32[$count>>2]|0;
 $shr = $0 >>> 3;
 $and = $shr & 63;
 $index = $and;
 $1 = $len$addr;
 $shl = $1 << 3;
 $count2 = ((($this1)) + 20|0);
 $2 = HEAP32[$count2>>2]|0;
 $add = (($2) + ($shl))|0;
 HEAP32[$count2>>2] = $add;
 $3 = $len$addr;
 $shl4 = $3 << 3;
 $cmp = ($add>>>0)<($shl4>>>0);
 if ($cmp) {
  $count5 = ((($this1)) + 20|0);
  $arrayidx6 = ((($count5)) + 4|0);
  $4 = HEAP32[$arrayidx6>>2]|0;
  $inc = (($4) + 1)|0;
  HEAP32[$arrayidx6>>2] = $inc;
 }
 $5 = $len$addr;
 $shr7 = $5 >>> 29;
 $count8 = ((($this1)) + 20|0);
 $arrayidx9 = ((($count8)) + 4|0);
 $6 = HEAP32[$arrayidx9>>2]|0;
 $add10 = (($6) + ($shr7))|0;
 HEAP32[$arrayidx9>>2] = $add10;
 $7 = $index;
 $sub = (64 - ($7))|0;
 $partLen = $sub;
 $8 = $len$addr;
 $9 = $partLen;
 $cmp11 = ($8>>>0)>=($9>>>0);
 if (!($cmp11)) {
  $i = 0;
  $buffer20 = ((($this1)) + 28|0);
  $19 = $index;
  $arrayidx21 = (($buffer20) + ($19)|0);
  $20 = $input$addr;
  $21 = $i;
  $arrayidx22 = (($20) + ($21)|0);
  $22 = $len$addr;
  $23 = $i;
  $sub23 = (($22) - ($23))|0;
  _memcpy(($arrayidx21|0),($arrayidx22|0),($sub23|0))|0;
  STACKTOP = sp;return;
 }
 $buffer = ((($this1)) + 28|0);
 $10 = $index;
 $arrayidx13 = (($buffer) + ($10)|0);
 $11 = $input$addr;
 $12 = $partLen;
 _memcpy(($arrayidx13|0),($11|0),($12|0))|0;
 $buffer14 = ((($this1)) + 28|0);
 __ZN3MD59transformEPKh($this1,$buffer14);
 $13 = $partLen;
 $i = $13;
 while(1) {
  $14 = $i;
  $add15 = (($14) + 63)|0;
  $15 = $len$addr;
  $cmp16 = ($add15>>>0)<($15>>>0);
  if (!($cmp16)) {
   break;
  }
  $16 = $input$addr;
  $17 = $i;
  $arrayidx17 = (($16) + ($17)|0);
  __ZN3MD59transformEPKh($this1,$arrayidx17);
  $18 = $i;
  $add18 = (($18) + 64)|0;
  $i = $add18;
 }
 $index = 0;
 $buffer20 = ((($this1)) + 28|0);
 $19 = $index;
 $arrayidx21 = (($buffer20) + ($19)|0);
 $20 = $input$addr;
 $21 = $i;
 $arrayidx22 = (($20) + ($21)|0);
 $22 = $len$addr;
 $23 = $i;
 $sub23 = (($22) - ($23))|0;
 _memcpy(($arrayidx21|0),($arrayidx22|0),($sub23|0))|0;
 STACKTOP = sp;return;
}
function __ZN3MD59getDigestEv($this) {
 $this = $this|0;
 var $$sink = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $and = 0, $bits = 0, $cmp = 0, $count = 0, $count18 = 0, $count6 = 0, $count9 = 0, $digest = 0, $digest21 = 0, $index = 0, $oldCount = 0, $oldState = 0, $padLen = 0, $shr = 0;
 var $state = 0, $state12 = 0, $state15 = 0, $sub10 = 0, $this$addr = 0, $this1 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $bits = sp + 40|0;
 $oldState = sp + 16|0;
 $oldCount = sp + 8|0;
 $this$addr = $this;
 $this1 = $this$addr;
 $0 = HEAP8[$this1>>0]|0;
 $tobool = $0&1;
 if ($tobool) {
  $digest21 = ((($this1)) + 92|0);
  STACKTOP = sp;return ($digest21|0);
 }
 HEAP8[$this1>>0] = 1;
 $state = ((($this1)) + 4|0);
 ;HEAP32[$oldState>>2]=HEAP32[$state>>2]|0;HEAP32[$oldState+4>>2]=HEAP32[$state+4>>2]|0;HEAP32[$oldState+8>>2]=HEAP32[$state+8>>2]|0;HEAP32[$oldState+12>>2]=HEAP32[$state+12>>2]|0;
 $count = ((($this1)) + 20|0);
 ;HEAP32[$oldCount>>2]=HEAP32[$count>>2]|0;HEAP32[$oldCount+4>>2]=HEAP32[$count+4>>2]|0;
 $count6 = ((($this1)) + 20|0);
 __ZN3MD56encodeEPKjPhj($this1,$count6,$bits,8);
 $count9 = ((($this1)) + 20|0);
 $1 = HEAP32[$count9>>2]|0;
 $shr = $1 >>> 3;
 $and = $shr & 63;
 $index = $and;
 $2 = $index;
 $cmp = ($2>>>0)<(56);
 $3 = $index;
 $$sink = $cmp ? 56 : 120;
 $sub10 = (($$sink) - ($3))|0;
 $padLen = $sub10;
 $4 = $padLen;
 __ZN3MD54initEPKhj($this1,1060,$4);
 __ZN3MD54initEPKhj($this1,$bits,8);
 $state12 = ((($this1)) + 4|0);
 $digest = ((($this1)) + 92|0);
 __ZN3MD56encodeEPKjPhj($this1,$state12,$digest,16);
 $state15 = ((($this1)) + 4|0);
 ;HEAP32[$state15>>2]=HEAP32[$oldState>>2]|0;HEAP32[$state15+4>>2]=HEAP32[$oldState+4>>2]|0;HEAP32[$state15+8>>2]=HEAP32[$oldState+8>>2]|0;HEAP32[$state15+12>>2]=HEAP32[$oldState+12>>2]|0;
 $count18 = ((($this1)) + 20|0);
 ;HEAP32[$count18>>2]=HEAP32[$oldCount>>2]|0;HEAP32[$count18+4>>2]=HEAP32[$oldCount+4>>2]|0;
 $digest21 = ((($this1)) + 92|0);
 STACKTOP = sp;return ($digest21|0);
}
function __ZN3MD56encodeEPKjPhj($this,$input,$output,$length) {
 $this = $this|0;
 $input = $input|0;
 $output = $output|0;
 $length = $length|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add11 = 0, $add17 = 0, $add19 = 0, $and = 0, $and15 = 0, $and4 = 0, $and9 = 0, $arrayidx = 0, $arrayidx12 = 0, $arrayidx13 = 0, $arrayidx18 = 0, $arrayidx2 = 0, $arrayidx3 = 0, $arrayidx6 = 0, $arrayidx7 = 0;
 var $cmp = 0, $conv = 0, $conv10 = 0, $conv16 = 0, $conv5 = 0, $i = 0, $inc = 0, $input$addr = 0, $j = 0, $length$addr = 0, $output$addr = 0, $shr = 0, $shr14 = 0, $shr8 = 0, $this$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $this$addr = $this;
 $input$addr = $input;
 $output$addr = $output;
 $length$addr = $length;
 $i = 0;
 $j = 0;
 while(1) {
  $0 = $j;
  $1 = $length$addr;
  $cmp = ($0>>>0)<($1>>>0);
  if (!($cmp)) {
   break;
  }
  $2 = $input$addr;
  $3 = $i;
  $arrayidx = (($2) + ($3<<2)|0);
  $4 = HEAP32[$arrayidx>>2]|0;
  $and = $4 & 255;
  $conv = $and&255;
  $5 = $output$addr;
  $6 = $j;
  $arrayidx2 = (($5) + ($6)|0);
  HEAP8[$arrayidx2>>0] = $conv;
  $7 = $input$addr;
  $8 = $i;
  $arrayidx3 = (($7) + ($8<<2)|0);
  $9 = HEAP32[$arrayidx3>>2]|0;
  $shr = $9 >>> 8;
  $and4 = $shr & 255;
  $conv5 = $and4&255;
  $10 = $output$addr;
  $11 = $j;
  $add = (($11) + 1)|0;
  $arrayidx6 = (($10) + ($add)|0);
  HEAP8[$arrayidx6>>0] = $conv5;
  $12 = $input$addr;
  $13 = $i;
  $arrayidx7 = (($12) + ($13<<2)|0);
  $14 = HEAP32[$arrayidx7>>2]|0;
  $shr8 = $14 >>> 16;
  $and9 = $shr8 & 255;
  $conv10 = $and9&255;
  $15 = $output$addr;
  $16 = $j;
  $add11 = (($16) + 2)|0;
  $arrayidx12 = (($15) + ($add11)|0);
  HEAP8[$arrayidx12>>0] = $conv10;
  $17 = $input$addr;
  $18 = $i;
  $arrayidx13 = (($17) + ($18<<2)|0);
  $19 = HEAP32[$arrayidx13>>2]|0;
  $shr14 = $19 >>> 24;
  $and15 = $shr14 & 255;
  $conv16 = $and15&255;
  $20 = $output$addr;
  $21 = $j;
  $add17 = (($21) + 3)|0;
  $arrayidx18 = (($20) + ($add17)|0);
  HEAP8[$arrayidx18>>0] = $conv16;
  $22 = $i;
  $inc = (($22) + 1)|0;
  $i = $inc;
  $23 = $j;
  $add19 = (($23) + 4)|0;
  $j = $add19;
 }
 STACKTOP = sp;return;
}
function __ZN3MD59transformEPKh($this,$block) {
 $this = $this|0;
 $block = $block|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0;
 var $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0;
 var $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0;
 var $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0;
 var $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0;
 var $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0;
 var $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0;
 var $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0;
 var $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0;
 var $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0;
 var $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0;
 var $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0;
 var $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0;
 var $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0;
 var $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0;
 var $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0;
 var $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0;
 var $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0;
 var $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0;
 var $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0;
 var $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0;
 var $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0;
 var $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0;
 var $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0;
 var $620 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, $a = 0, $add = 0, $add10 = 0, $add103 = 0, $add104 = 0, $add105 = 0, $add109 = 0, $add11 = 0, $add115 = 0, $add116 = 0, $add117 = 0, $add121 = 0, $add127 = 0, $add128 = 0, $add129 = 0, $add13 = 0, $add133 = 0, $add139 = 0, $add140 = 0;
 var $add141 = 0, $add145 = 0, $add151 = 0, $add152 = 0, $add153 = 0, $add157 = 0, $add163 = 0, $add164 = 0, $add165 = 0, $add169 = 0, $add175 = 0, $add176 = 0, $add177 = 0, $add181 = 0, $add187 = 0, $add188 = 0, $add189 = 0, $add19 = 0, $add193 = 0, $add199 = 0;
 var $add20 = 0, $add200 = 0, $add201 = 0, $add205 = 0, $add21 = 0, $add211 = 0, $add212 = 0, $add213 = 0, $add217 = 0, $add223 = 0, $add224 = 0, $add225 = 0, $add229 = 0, $add235 = 0, $add236 = 0, $add237 = 0, $add241 = 0, $add247 = 0, $add248 = 0, $add249 = 0;
 var $add25 = 0, $add253 = 0, $add259 = 0, $add260 = 0, $add261 = 0, $add265 = 0, $add271 = 0, $add272 = 0, $add273 = 0, $add277 = 0, $add283 = 0, $add284 = 0, $add285 = 0, $add289 = 0, $add295 = 0, $add296 = 0, $add297 = 0, $add301 = 0, $add307 = 0, $add308 = 0;
 var $add309 = 0, $add31 = 0, $add313 = 0, $add319 = 0, $add32 = 0, $add320 = 0, $add321 = 0, $add325 = 0, $add33 = 0, $add331 = 0, $add332 = 0, $add333 = 0, $add337 = 0, $add343 = 0, $add344 = 0, $add345 = 0, $add349 = 0, $add355 = 0, $add356 = 0, $add357 = 0;
 var $add361 = 0, $add367 = 0, $add368 = 0, $add369 = 0, $add37 = 0, $add373 = 0, $add379 = 0, $add380 = 0, $add381 = 0, $add385 = 0, $add388 = 0, $add389 = 0, $add390 = 0, $add394 = 0, $add398 = 0, $add399 = 0, $add400 = 0, $add404 = 0, $add408 = 0, $add409 = 0;
 var $add410 = 0, $add414 = 0, $add418 = 0, $add419 = 0, $add420 = 0, $add424 = 0, $add428 = 0, $add429 = 0, $add43 = 0, $add430 = 0, $add434 = 0, $add438 = 0, $add439 = 0, $add44 = 0, $add440 = 0, $add444 = 0, $add448 = 0, $add449 = 0, $add45 = 0, $add450 = 0;
 var $add454 = 0, $add458 = 0, $add459 = 0, $add460 = 0, $add464 = 0, $add468 = 0, $add469 = 0, $add470 = 0, $add474 = 0, $add478 = 0, $add479 = 0, $add480 = 0, $add484 = 0, $add488 = 0, $add489 = 0, $add49 = 0, $add490 = 0, $add494 = 0, $add498 = 0, $add499 = 0;
 var $add500 = 0, $add504 = 0, $add508 = 0, $add509 = 0, $add510 = 0, $add514 = 0, $add518 = 0, $add519 = 0, $add520 = 0, $add524 = 0, $add528 = 0, $add529 = 0, $add530 = 0, $add534 = 0, $add538 = 0, $add539 = 0, $add540 = 0, $add544 = 0, $add549 = 0, $add55 = 0;
 var $add550 = 0, $add551 = 0, $add555 = 0, $add56 = 0, $add560 = 0, $add561 = 0, $add562 = 0, $add566 = 0, $add57 = 0, $add571 = 0, $add572 = 0, $add573 = 0, $add577 = 0, $add582 = 0, $add583 = 0, $add584 = 0, $add588 = 0, $add593 = 0, $add594 = 0, $add595 = 0;
 var $add599 = 0, $add604 = 0, $add605 = 0, $add606 = 0, $add61 = 0, $add610 = 0, $add615 = 0, $add616 = 0, $add617 = 0, $add621 = 0, $add626 = 0, $add627 = 0, $add628 = 0, $add632 = 0, $add637 = 0, $add638 = 0, $add639 = 0, $add643 = 0, $add648 = 0, $add649 = 0;
 var $add650 = 0, $add654 = 0, $add659 = 0, $add660 = 0, $add661 = 0, $add665 = 0, $add67 = 0, $add670 = 0, $add671 = 0, $add672 = 0, $add676 = 0, $add68 = 0, $add681 = 0, $add682 = 0, $add683 = 0, $add687 = 0, $add69 = 0, $add692 = 0, $add693 = 0, $add694 = 0;
 var $add698 = 0, $add703 = 0, $add704 = 0, $add705 = 0, $add709 = 0, $add714 = 0, $add715 = 0, $add716 = 0, $add720 = 0, $add723 = 0, $add726 = 0, $add729 = 0, $add73 = 0, $add732 = 0, $add79 = 0, $add80 = 0, $add81 = 0, $add85 = 0, $add91 = 0, $add92 = 0;
 var $add93 = 0, $add97 = 0, $and = 0, $and100 = 0, $and110 = 0, $and112 = 0, $and122 = 0, $and124 = 0, $and134 = 0, $and136 = 0, $and14 = 0, $and146 = 0, $and148 = 0, $and158 = 0, $and16 = 0, $and160 = 0, $and170 = 0, $and172 = 0, $and182 = 0, $and184 = 0;
 var $and194 = 0, $and196 = 0, $and206 = 0, $and208 = 0, $and218 = 0, $and220 = 0, $and230 = 0, $and232 = 0, $and242 = 0, $and244 = 0, $and254 = 0, $and256 = 0, $and26 = 0, $and266 = 0, $and268 = 0, $and278 = 0, $and28 = 0, $and280 = 0, $and290 = 0, $and292 = 0;
 var $and302 = 0, $and304 = 0, $and314 = 0, $and316 = 0, $and326 = 0, $and328 = 0, $and338 = 0, $and340 = 0, $and350 = 0, $and352 = 0, $and362 = 0, $and364 = 0, $and374 = 0, $and376 = 0, $and38 = 0, $and40 = 0, $and50 = 0, $and52 = 0, $and62 = 0, $and64 = 0;
 var $and74 = 0, $and76 = 0, $and8 = 0, $and86 = 0, $and88 = 0, $and98 = 0, $arrayidx102 = 0, $arrayidx114 = 0, $arrayidx126 = 0, $arrayidx138 = 0, $arrayidx150 = 0, $arrayidx162 = 0, $arrayidx174 = 0, $arrayidx18 = 0, $arrayidx186 = 0, $arrayidx198 = 0, $arrayidx210 = 0, $arrayidx222 = 0, $arrayidx246 = 0, $arrayidx258 = 0;
 var $arrayidx270 = 0, $arrayidx282 = 0, $arrayidx294 = 0, $arrayidx3 = 0, $arrayidx30 = 0, $arrayidx306 = 0, $arrayidx318 = 0, $arrayidx330 = 0, $arrayidx342 = 0, $arrayidx354 = 0, $arrayidx366 = 0, $arrayidx378 = 0, $arrayidx387 = 0, $arrayidx397 = 0, $arrayidx407 = 0, $arrayidx417 = 0, $arrayidx42 = 0, $arrayidx427 = 0, $arrayidx437 = 0, $arrayidx447 = 0;
 var $arrayidx457 = 0, $arrayidx467 = 0, $arrayidx487 = 0, $arrayidx497 = 0, $arrayidx5 = 0, $arrayidx507 = 0, $arrayidx517 = 0, $arrayidx527 = 0, $arrayidx537 = 0, $arrayidx54 = 0, $arrayidx559 = 0, $arrayidx570 = 0, $arrayidx581 = 0, $arrayidx592 = 0, $arrayidx603 = 0, $arrayidx614 = 0, $arrayidx625 = 0, $arrayidx636 = 0, $arrayidx647 = 0, $arrayidx658 = 0;
 var $arrayidx66 = 0, $arrayidx669 = 0, $arrayidx680 = 0, $arrayidx691 = 0, $arrayidx7 = 0, $arrayidx702 = 0, $arrayidx713 = 0, $arrayidx725 = 0, $arrayidx728 = 0, $arrayidx731 = 0, $arrayidx78 = 0, $arrayidx90 = 0, $b = 0, $block$addr = 0, $c = 0, $d = 0, $neg = 0, $neg111 = 0, $neg123 = 0, $neg135 = 0;
 var $neg147 = 0, $neg15 = 0, $neg159 = 0, $neg171 = 0, $neg183 = 0, $neg195 = 0, $neg207 = 0, $neg219 = 0, $neg231 = 0, $neg243 = 0, $neg255 = 0, $neg267 = 0, $neg27 = 0, $neg279 = 0, $neg291 = 0, $neg303 = 0, $neg315 = 0, $neg327 = 0, $neg339 = 0, $neg351 = 0;
 var $neg363 = 0, $neg375 = 0, $neg39 = 0, $neg51 = 0, $neg545 = 0, $neg556 = 0, $neg567 = 0, $neg578 = 0, $neg589 = 0, $neg600 = 0, $neg611 = 0, $neg622 = 0, $neg63 = 0, $neg633 = 0, $neg644 = 0, $neg655 = 0, $neg666 = 0, $neg677 = 0, $neg688 = 0, $neg699 = 0;
 var $neg710 = 0, $neg75 = 0, $neg87 = 0, $neg99 = 0, $or = 0, $or101 = 0, $or108 = 0, $or113 = 0, $or12 = 0, $or120 = 0, $or125 = 0, $or132 = 0, $or137 = 0, $or144 = 0, $or149 = 0, $or156 = 0, $or161 = 0, $or168 = 0, $or17 = 0, $or173 = 0;
 var $or180 = 0, $or185 = 0, $or192 = 0, $or197 = 0, $or204 = 0, $or209 = 0, $or216 = 0, $or221 = 0, $or228 = 0, $or233 = 0, $or24 = 0, $or240 = 0, $or245 = 0, $or252 = 0, $or257 = 0, $or264 = 0, $or269 = 0, $or276 = 0, $or281 = 0, $or288 = 0;
 var $or29 = 0, $or293 = 0, $or300 = 0, $or305 = 0, $or312 = 0, $or317 = 0, $or324 = 0, $or329 = 0, $or336 = 0, $or341 = 0, $or348 = 0, $or353 = 0, $or36 = 0, $or360 = 0, $or365 = 0, $or372 = 0, $or377 = 0, $or384 = 0, $or393 = 0, $or403 = 0;
 var $or41 = 0, $or413 = 0, $or423 = 0, $or433 = 0, $or443 = 0, $or453 = 0, $or463 = 0, $or473 = 0, $or48 = 0, $or483 = 0, $or493 = 0, $or503 = 0, $or513 = 0, $or523 = 0, $or53 = 0, $or533 = 0, $or543 = 0, $or546 = 0, $or554 = 0, $or557 = 0;
 var $or565 = 0, $or568 = 0, $or576 = 0, $or579 = 0, $or587 = 0, $or590 = 0, $or598 = 0, $or60 = 0, $or601 = 0, $or609 = 0, $or612 = 0, $or620 = 0, $or623 = 0, $or631 = 0, $or634 = 0, $or642 = 0, $or645 = 0, $or65 = 0, $or653 = 0, $or656 = 0;
 var $or664 = 0, $or667 = 0, $or675 = 0, $or678 = 0, $or686 = 0, $or689 = 0, $or697 = 0, $or700 = 0, $or708 = 0, $or711 = 0, $or719 = 0, $or72 = 0, $or77 = 0, $or84 = 0, $or89 = 0, $or96 = 0, $shl = 0, $shl106 = 0, $shl118 = 0, $shl130 = 0;
 var $shl142 = 0, $shl154 = 0, $shl166 = 0, $shl178 = 0, $shl190 = 0, $shl202 = 0, $shl214 = 0, $shl22 = 0, $shl226 = 0, $shl238 = 0, $shl250 = 0, $shl262 = 0, $shl274 = 0, $shl286 = 0, $shl298 = 0, $shl310 = 0, $shl322 = 0, $shl334 = 0, $shl34 = 0, $shl346 = 0;
 var $shl358 = 0, $shl370 = 0, $shl382 = 0, $shl391 = 0, $shl401 = 0, $shl411 = 0, $shl421 = 0, $shl431 = 0, $shl441 = 0, $shl451 = 0, $shl46 = 0, $shl461 = 0, $shl471 = 0, $shl481 = 0, $shl491 = 0, $shl501 = 0, $shl511 = 0, $shl521 = 0, $shl531 = 0, $shl541 = 0;
 var $shl552 = 0, $shl563 = 0, $shl574 = 0, $shl58 = 0, $shl585 = 0, $shl596 = 0, $shl607 = 0, $shl618 = 0, $shl629 = 0, $shl640 = 0, $shl651 = 0, $shl662 = 0, $shl673 = 0, $shl684 = 0, $shl695 = 0, $shl70 = 0, $shl706 = 0, $shl717 = 0, $shl82 = 0, $shl94 = 0;
 var $shr = 0, $shr107 = 0, $shr119 = 0, $shr131 = 0, $shr143 = 0, $shr155 = 0, $shr167 = 0, $shr179 = 0, $shr191 = 0, $shr203 = 0, $shr215 = 0, $shr227 = 0, $shr23 = 0, $shr239 = 0, $shr251 = 0, $shr263 = 0, $shr275 = 0, $shr287 = 0, $shr299 = 0, $shr311 = 0;
 var $shr323 = 0, $shr335 = 0, $shr347 = 0, $shr35 = 0, $shr359 = 0, $shr371 = 0, $shr383 = 0, $shr392 = 0, $shr402 = 0, $shr412 = 0, $shr422 = 0, $shr432 = 0, $shr442 = 0, $shr452 = 0, $shr462 = 0, $shr47 = 0, $shr472 = 0, $shr482 = 0, $shr492 = 0, $shr502 = 0;
 var $shr512 = 0, $shr522 = 0, $shr532 = 0, $shr542 = 0, $shr553 = 0, $shr564 = 0, $shr575 = 0, $shr586 = 0, $shr59 = 0, $shr597 = 0, $shr608 = 0, $shr619 = 0, $shr630 = 0, $shr641 = 0, $shr652 = 0, $shr663 = 0, $shr674 = 0, $shr685 = 0, $shr696 = 0, $shr707 = 0;
 var $shr71 = 0, $shr718 = 0, $shr83 = 0, $shr95 = 0, $state = 0, $state2 = 0, $state4 = 0, $state6 = 0, $state721 = 0, $state724 = 0, $state727 = 0, $state730 = 0, $this$addr = 0, $this1 = 0, $x = 0, $xor = 0, $xor386 = 0, $xor395 = 0, $xor396 = 0, $xor405 = 0;
 var $xor406 = 0, $xor415 = 0, $xor416 = 0, $xor425 = 0, $xor426 = 0, $xor435 = 0, $xor436 = 0, $xor445 = 0, $xor446 = 0, $xor455 = 0, $xor456 = 0, $xor465 = 0, $xor466 = 0, $xor475 = 0, $xor476 = 0, $xor485 = 0, $xor486 = 0, $xor495 = 0, $xor496 = 0, $xor505 = 0;
 var $xor506 = 0, $xor515 = 0, $xor516 = 0, $xor525 = 0, $xor526 = 0, $xor535 = 0, $xor536 = 0, $xor547 = 0, $xor558 = 0, $xor569 = 0, $xor580 = 0, $xor591 = 0, $xor602 = 0, $xor613 = 0, $xor624 = 0, $xor635 = 0, $xor646 = 0, $xor657 = 0, $xor668 = 0, $xor679 = 0;
 var $xor690 = 0, $xor701 = 0, $xor712 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $x = sp;
 $this$addr = $this;
 $block$addr = $block;
 $this1 = $this$addr;
 $state = ((($this1)) + 4|0);
 $0 = HEAP32[$state>>2]|0;
 $a = $0;
 $state2 = ((($this1)) + 4|0);
 $arrayidx3 = ((($state2)) + 4|0);
 $1 = HEAP32[$arrayidx3>>2]|0;
 $b = $1;
 $state4 = ((($this1)) + 4|0);
 $arrayidx5 = ((($state4)) + 8|0);
 $2 = HEAP32[$arrayidx5>>2]|0;
 $c = $2;
 $state6 = ((($this1)) + 4|0);
 $arrayidx7 = ((($state6)) + 12|0);
 $3 = HEAP32[$arrayidx7>>2]|0;
 $d = $3;
 $4 = $block$addr;
 __ZN3MD56decodeEPKhPjj($this1,$4,$x,64);
 $5 = $b;
 $6 = $c;
 $and = $5 & $6;
 $7 = $b;
 $neg = $7 ^ -1;
 $8 = $d;
 $and8 = $neg & $8;
 $or = $and | $and8;
 $9 = HEAP32[$x>>2]|0;
 $add = (($or) + ($9))|0;
 $add10 = (($add) + -680876936)|0;
 $10 = $a;
 $add11 = (($10) + ($add10))|0;
 $a = $add11;
 $11 = $a;
 $shl = $11 << 7;
 $12 = $a;
 $shr = $12 >>> 25;
 $or12 = $shl | $shr;
 $a = $or12;
 $13 = $b;
 $14 = $a;
 $add13 = (($14) + ($13))|0;
 $a = $add13;
 $15 = $a;
 $16 = $b;
 $and14 = $15 & $16;
 $17 = $a;
 $neg15 = $17 ^ -1;
 $18 = $c;
 $and16 = $neg15 & $18;
 $or17 = $and14 | $and16;
 $arrayidx18 = ((($x)) + 4|0);
 $19 = HEAP32[$arrayidx18>>2]|0;
 $add19 = (($or17) + ($19))|0;
 $add20 = (($add19) + -389564586)|0;
 $20 = $d;
 $add21 = (($20) + ($add20))|0;
 $d = $add21;
 $21 = $d;
 $shl22 = $21 << 12;
 $22 = $d;
 $shr23 = $22 >>> 20;
 $or24 = $shl22 | $shr23;
 $d = $or24;
 $23 = $a;
 $24 = $d;
 $add25 = (($24) + ($23))|0;
 $d = $add25;
 $25 = $d;
 $26 = $a;
 $and26 = $25 & $26;
 $27 = $d;
 $neg27 = $27 ^ -1;
 $28 = $b;
 $and28 = $neg27 & $28;
 $or29 = $and26 | $and28;
 $arrayidx30 = ((($x)) + 8|0);
 $29 = HEAP32[$arrayidx30>>2]|0;
 $add31 = (($or29) + ($29))|0;
 $add32 = (($add31) + 606105819)|0;
 $30 = $c;
 $add33 = (($30) + ($add32))|0;
 $c = $add33;
 $31 = $c;
 $shl34 = $31 << 17;
 $32 = $c;
 $shr35 = $32 >>> 15;
 $or36 = $shl34 | $shr35;
 $c = $or36;
 $33 = $d;
 $34 = $c;
 $add37 = (($34) + ($33))|0;
 $c = $add37;
 $35 = $c;
 $36 = $d;
 $and38 = $35 & $36;
 $37 = $c;
 $neg39 = $37 ^ -1;
 $38 = $a;
 $and40 = $neg39 & $38;
 $or41 = $and38 | $and40;
 $arrayidx42 = ((($x)) + 12|0);
 $39 = HEAP32[$arrayidx42>>2]|0;
 $add43 = (($or41) + ($39))|0;
 $add44 = (($add43) + -1044525330)|0;
 $40 = $b;
 $add45 = (($40) + ($add44))|0;
 $b = $add45;
 $41 = $b;
 $shl46 = $41 << 22;
 $42 = $b;
 $shr47 = $42 >>> 10;
 $or48 = $shl46 | $shr47;
 $b = $or48;
 $43 = $c;
 $44 = $b;
 $add49 = (($44) + ($43))|0;
 $b = $add49;
 $45 = $b;
 $46 = $c;
 $and50 = $45 & $46;
 $47 = $b;
 $neg51 = $47 ^ -1;
 $48 = $d;
 $and52 = $neg51 & $48;
 $or53 = $and50 | $and52;
 $arrayidx54 = ((($x)) + 16|0);
 $49 = HEAP32[$arrayidx54>>2]|0;
 $add55 = (($or53) + ($49))|0;
 $add56 = (($add55) + -176418897)|0;
 $50 = $a;
 $add57 = (($50) + ($add56))|0;
 $a = $add57;
 $51 = $a;
 $shl58 = $51 << 7;
 $52 = $a;
 $shr59 = $52 >>> 25;
 $or60 = $shl58 | $shr59;
 $a = $or60;
 $53 = $b;
 $54 = $a;
 $add61 = (($54) + ($53))|0;
 $a = $add61;
 $55 = $a;
 $56 = $b;
 $and62 = $55 & $56;
 $57 = $a;
 $neg63 = $57 ^ -1;
 $58 = $c;
 $and64 = $neg63 & $58;
 $or65 = $and62 | $and64;
 $arrayidx66 = ((($x)) + 20|0);
 $59 = HEAP32[$arrayidx66>>2]|0;
 $add67 = (($or65) + ($59))|0;
 $add68 = (($add67) + 1200080426)|0;
 $60 = $d;
 $add69 = (($60) + ($add68))|0;
 $d = $add69;
 $61 = $d;
 $shl70 = $61 << 12;
 $62 = $d;
 $shr71 = $62 >>> 20;
 $or72 = $shl70 | $shr71;
 $d = $or72;
 $63 = $a;
 $64 = $d;
 $add73 = (($64) + ($63))|0;
 $d = $add73;
 $65 = $d;
 $66 = $a;
 $and74 = $65 & $66;
 $67 = $d;
 $neg75 = $67 ^ -1;
 $68 = $b;
 $and76 = $neg75 & $68;
 $or77 = $and74 | $and76;
 $arrayidx78 = ((($x)) + 24|0);
 $69 = HEAP32[$arrayidx78>>2]|0;
 $add79 = (($or77) + ($69))|0;
 $add80 = (($add79) + -1473231341)|0;
 $70 = $c;
 $add81 = (($70) + ($add80))|0;
 $c = $add81;
 $71 = $c;
 $shl82 = $71 << 17;
 $72 = $c;
 $shr83 = $72 >>> 15;
 $or84 = $shl82 | $shr83;
 $c = $or84;
 $73 = $d;
 $74 = $c;
 $add85 = (($74) + ($73))|0;
 $c = $add85;
 $75 = $c;
 $76 = $d;
 $and86 = $75 & $76;
 $77 = $c;
 $neg87 = $77 ^ -1;
 $78 = $a;
 $and88 = $neg87 & $78;
 $or89 = $and86 | $and88;
 $arrayidx90 = ((($x)) + 28|0);
 $79 = HEAP32[$arrayidx90>>2]|0;
 $add91 = (($or89) + ($79))|0;
 $add92 = (($add91) + -45705983)|0;
 $80 = $b;
 $add93 = (($80) + ($add92))|0;
 $b = $add93;
 $81 = $b;
 $shl94 = $81 << 22;
 $82 = $b;
 $shr95 = $82 >>> 10;
 $or96 = $shl94 | $shr95;
 $b = $or96;
 $83 = $c;
 $84 = $b;
 $add97 = (($84) + ($83))|0;
 $b = $add97;
 $85 = $b;
 $86 = $c;
 $and98 = $85 & $86;
 $87 = $b;
 $neg99 = $87 ^ -1;
 $88 = $d;
 $and100 = $neg99 & $88;
 $or101 = $and98 | $and100;
 $arrayidx102 = ((($x)) + 32|0);
 $89 = HEAP32[$arrayidx102>>2]|0;
 $add103 = (($or101) + ($89))|0;
 $add104 = (($add103) + 1770035416)|0;
 $90 = $a;
 $add105 = (($90) + ($add104))|0;
 $a = $add105;
 $91 = $a;
 $shl106 = $91 << 7;
 $92 = $a;
 $shr107 = $92 >>> 25;
 $or108 = $shl106 | $shr107;
 $a = $or108;
 $93 = $b;
 $94 = $a;
 $add109 = (($94) + ($93))|0;
 $a = $add109;
 $95 = $a;
 $96 = $b;
 $and110 = $95 & $96;
 $97 = $a;
 $neg111 = $97 ^ -1;
 $98 = $c;
 $and112 = $neg111 & $98;
 $or113 = $and110 | $and112;
 $arrayidx114 = ((($x)) + 36|0);
 $99 = HEAP32[$arrayidx114>>2]|0;
 $add115 = (($or113) + ($99))|0;
 $add116 = (($add115) + -1958414417)|0;
 $100 = $d;
 $add117 = (($100) + ($add116))|0;
 $d = $add117;
 $101 = $d;
 $shl118 = $101 << 12;
 $102 = $d;
 $shr119 = $102 >>> 20;
 $or120 = $shl118 | $shr119;
 $d = $or120;
 $103 = $a;
 $104 = $d;
 $add121 = (($104) + ($103))|0;
 $d = $add121;
 $105 = $d;
 $106 = $a;
 $and122 = $105 & $106;
 $107 = $d;
 $neg123 = $107 ^ -1;
 $108 = $b;
 $and124 = $neg123 & $108;
 $or125 = $and122 | $and124;
 $arrayidx126 = ((($x)) + 40|0);
 $109 = HEAP32[$arrayidx126>>2]|0;
 $add127 = (($or125) + ($109))|0;
 $add128 = (($add127) + -42063)|0;
 $110 = $c;
 $add129 = (($110) + ($add128))|0;
 $c = $add129;
 $111 = $c;
 $shl130 = $111 << 17;
 $112 = $c;
 $shr131 = $112 >>> 15;
 $or132 = $shl130 | $shr131;
 $c = $or132;
 $113 = $d;
 $114 = $c;
 $add133 = (($114) + ($113))|0;
 $c = $add133;
 $115 = $c;
 $116 = $d;
 $and134 = $115 & $116;
 $117 = $c;
 $neg135 = $117 ^ -1;
 $118 = $a;
 $and136 = $neg135 & $118;
 $or137 = $and134 | $and136;
 $arrayidx138 = ((($x)) + 44|0);
 $119 = HEAP32[$arrayidx138>>2]|0;
 $add139 = (($or137) + ($119))|0;
 $add140 = (($add139) + -1990404162)|0;
 $120 = $b;
 $add141 = (($120) + ($add140))|0;
 $b = $add141;
 $121 = $b;
 $shl142 = $121 << 22;
 $122 = $b;
 $shr143 = $122 >>> 10;
 $or144 = $shl142 | $shr143;
 $b = $or144;
 $123 = $c;
 $124 = $b;
 $add145 = (($124) + ($123))|0;
 $b = $add145;
 $125 = $b;
 $126 = $c;
 $and146 = $125 & $126;
 $127 = $b;
 $neg147 = $127 ^ -1;
 $128 = $d;
 $and148 = $neg147 & $128;
 $or149 = $and146 | $and148;
 $arrayidx150 = ((($x)) + 48|0);
 $129 = HEAP32[$arrayidx150>>2]|0;
 $add151 = (($or149) + ($129))|0;
 $add152 = (($add151) + 1804603682)|0;
 $130 = $a;
 $add153 = (($130) + ($add152))|0;
 $a = $add153;
 $131 = $a;
 $shl154 = $131 << 7;
 $132 = $a;
 $shr155 = $132 >>> 25;
 $or156 = $shl154 | $shr155;
 $a = $or156;
 $133 = $b;
 $134 = $a;
 $add157 = (($134) + ($133))|0;
 $a = $add157;
 $135 = $a;
 $136 = $b;
 $and158 = $135 & $136;
 $137 = $a;
 $neg159 = $137 ^ -1;
 $138 = $c;
 $and160 = $neg159 & $138;
 $or161 = $and158 | $and160;
 $arrayidx162 = ((($x)) + 52|0);
 $139 = HEAP32[$arrayidx162>>2]|0;
 $add163 = (($or161) + ($139))|0;
 $add164 = (($add163) + -40341101)|0;
 $140 = $d;
 $add165 = (($140) + ($add164))|0;
 $d = $add165;
 $141 = $d;
 $shl166 = $141 << 12;
 $142 = $d;
 $shr167 = $142 >>> 20;
 $or168 = $shl166 | $shr167;
 $d = $or168;
 $143 = $a;
 $144 = $d;
 $add169 = (($144) + ($143))|0;
 $d = $add169;
 $145 = $d;
 $146 = $a;
 $and170 = $145 & $146;
 $147 = $d;
 $neg171 = $147 ^ -1;
 $148 = $b;
 $and172 = $neg171 & $148;
 $or173 = $and170 | $and172;
 $arrayidx174 = ((($x)) + 56|0);
 $149 = HEAP32[$arrayidx174>>2]|0;
 $add175 = (($or173) + ($149))|0;
 $add176 = (($add175) + -1502002290)|0;
 $150 = $c;
 $add177 = (($150) + ($add176))|0;
 $c = $add177;
 $151 = $c;
 $shl178 = $151 << 17;
 $152 = $c;
 $shr179 = $152 >>> 15;
 $or180 = $shl178 | $shr179;
 $c = $or180;
 $153 = $d;
 $154 = $c;
 $add181 = (($154) + ($153))|0;
 $c = $add181;
 $155 = $c;
 $156 = $d;
 $and182 = $155 & $156;
 $157 = $c;
 $neg183 = $157 ^ -1;
 $158 = $a;
 $and184 = $neg183 & $158;
 $or185 = $and182 | $and184;
 $arrayidx186 = ((($x)) + 60|0);
 $159 = HEAP32[$arrayidx186>>2]|0;
 $add187 = (($or185) + ($159))|0;
 $add188 = (($add187) + 1236535329)|0;
 $160 = $b;
 $add189 = (($160) + ($add188))|0;
 $b = $add189;
 $161 = $b;
 $shl190 = $161 << 22;
 $162 = $b;
 $shr191 = $162 >>> 10;
 $or192 = $shl190 | $shr191;
 $b = $or192;
 $163 = $c;
 $164 = $b;
 $add193 = (($164) + ($163))|0;
 $b = $add193;
 $165 = $b;
 $166 = $d;
 $and194 = $165 & $166;
 $167 = $c;
 $168 = $d;
 $neg195 = $168 ^ -1;
 $and196 = $167 & $neg195;
 $or197 = $and194 | $and196;
 $arrayidx198 = ((($x)) + 4|0);
 $169 = HEAP32[$arrayidx198>>2]|0;
 $add199 = (($or197) + ($169))|0;
 $add200 = (($add199) + -165796510)|0;
 $170 = $a;
 $add201 = (($170) + ($add200))|0;
 $a = $add201;
 $171 = $a;
 $shl202 = $171 << 5;
 $172 = $a;
 $shr203 = $172 >>> 27;
 $or204 = $shl202 | $shr203;
 $a = $or204;
 $173 = $b;
 $174 = $a;
 $add205 = (($174) + ($173))|0;
 $a = $add205;
 $175 = $a;
 $176 = $c;
 $and206 = $175 & $176;
 $177 = $b;
 $178 = $c;
 $neg207 = $178 ^ -1;
 $and208 = $177 & $neg207;
 $or209 = $and206 | $and208;
 $arrayidx210 = ((($x)) + 24|0);
 $179 = HEAP32[$arrayidx210>>2]|0;
 $add211 = (($or209) + ($179))|0;
 $add212 = (($add211) + -1069501632)|0;
 $180 = $d;
 $add213 = (($180) + ($add212))|0;
 $d = $add213;
 $181 = $d;
 $shl214 = $181 << 9;
 $182 = $d;
 $shr215 = $182 >>> 23;
 $or216 = $shl214 | $shr215;
 $d = $or216;
 $183 = $a;
 $184 = $d;
 $add217 = (($184) + ($183))|0;
 $d = $add217;
 $185 = $d;
 $186 = $b;
 $and218 = $185 & $186;
 $187 = $a;
 $188 = $b;
 $neg219 = $188 ^ -1;
 $and220 = $187 & $neg219;
 $or221 = $and218 | $and220;
 $arrayidx222 = ((($x)) + 44|0);
 $189 = HEAP32[$arrayidx222>>2]|0;
 $add223 = (($or221) + ($189))|0;
 $add224 = (($add223) + 643717713)|0;
 $190 = $c;
 $add225 = (($190) + ($add224))|0;
 $c = $add225;
 $191 = $c;
 $shl226 = $191 << 14;
 $192 = $c;
 $shr227 = $192 >>> 18;
 $or228 = $shl226 | $shr227;
 $c = $or228;
 $193 = $d;
 $194 = $c;
 $add229 = (($194) + ($193))|0;
 $c = $add229;
 $195 = $c;
 $196 = $a;
 $and230 = $195 & $196;
 $197 = $d;
 $198 = $a;
 $neg231 = $198 ^ -1;
 $and232 = $197 & $neg231;
 $or233 = $and230 | $and232;
 $199 = HEAP32[$x>>2]|0;
 $add235 = (($or233) + ($199))|0;
 $add236 = (($add235) + -373897302)|0;
 $200 = $b;
 $add237 = (($200) + ($add236))|0;
 $b = $add237;
 $201 = $b;
 $shl238 = $201 << 20;
 $202 = $b;
 $shr239 = $202 >>> 12;
 $or240 = $shl238 | $shr239;
 $b = $or240;
 $203 = $c;
 $204 = $b;
 $add241 = (($204) + ($203))|0;
 $b = $add241;
 $205 = $b;
 $206 = $d;
 $and242 = $205 & $206;
 $207 = $c;
 $208 = $d;
 $neg243 = $208 ^ -1;
 $and244 = $207 & $neg243;
 $or245 = $and242 | $and244;
 $arrayidx246 = ((($x)) + 20|0);
 $209 = HEAP32[$arrayidx246>>2]|0;
 $add247 = (($or245) + ($209))|0;
 $add248 = (($add247) + -701558691)|0;
 $210 = $a;
 $add249 = (($210) + ($add248))|0;
 $a = $add249;
 $211 = $a;
 $shl250 = $211 << 5;
 $212 = $a;
 $shr251 = $212 >>> 27;
 $or252 = $shl250 | $shr251;
 $a = $or252;
 $213 = $b;
 $214 = $a;
 $add253 = (($214) + ($213))|0;
 $a = $add253;
 $215 = $a;
 $216 = $c;
 $and254 = $215 & $216;
 $217 = $b;
 $218 = $c;
 $neg255 = $218 ^ -1;
 $and256 = $217 & $neg255;
 $or257 = $and254 | $and256;
 $arrayidx258 = ((($x)) + 40|0);
 $219 = HEAP32[$arrayidx258>>2]|0;
 $add259 = (($or257) + ($219))|0;
 $add260 = (($add259) + 38016083)|0;
 $220 = $d;
 $add261 = (($220) + ($add260))|0;
 $d = $add261;
 $221 = $d;
 $shl262 = $221 << 9;
 $222 = $d;
 $shr263 = $222 >>> 23;
 $or264 = $shl262 | $shr263;
 $d = $or264;
 $223 = $a;
 $224 = $d;
 $add265 = (($224) + ($223))|0;
 $d = $add265;
 $225 = $d;
 $226 = $b;
 $and266 = $225 & $226;
 $227 = $a;
 $228 = $b;
 $neg267 = $228 ^ -1;
 $and268 = $227 & $neg267;
 $or269 = $and266 | $and268;
 $arrayidx270 = ((($x)) + 60|0);
 $229 = HEAP32[$arrayidx270>>2]|0;
 $add271 = (($or269) + ($229))|0;
 $add272 = (($add271) + -660478335)|0;
 $230 = $c;
 $add273 = (($230) + ($add272))|0;
 $c = $add273;
 $231 = $c;
 $shl274 = $231 << 14;
 $232 = $c;
 $shr275 = $232 >>> 18;
 $or276 = $shl274 | $shr275;
 $c = $or276;
 $233 = $d;
 $234 = $c;
 $add277 = (($234) + ($233))|0;
 $c = $add277;
 $235 = $c;
 $236 = $a;
 $and278 = $235 & $236;
 $237 = $d;
 $238 = $a;
 $neg279 = $238 ^ -1;
 $and280 = $237 & $neg279;
 $or281 = $and278 | $and280;
 $arrayidx282 = ((($x)) + 16|0);
 $239 = HEAP32[$arrayidx282>>2]|0;
 $add283 = (($or281) + ($239))|0;
 $add284 = (($add283) + -405537848)|0;
 $240 = $b;
 $add285 = (($240) + ($add284))|0;
 $b = $add285;
 $241 = $b;
 $shl286 = $241 << 20;
 $242 = $b;
 $shr287 = $242 >>> 12;
 $or288 = $shl286 | $shr287;
 $b = $or288;
 $243 = $c;
 $244 = $b;
 $add289 = (($244) + ($243))|0;
 $b = $add289;
 $245 = $b;
 $246 = $d;
 $and290 = $245 & $246;
 $247 = $c;
 $248 = $d;
 $neg291 = $248 ^ -1;
 $and292 = $247 & $neg291;
 $or293 = $and290 | $and292;
 $arrayidx294 = ((($x)) + 36|0);
 $249 = HEAP32[$arrayidx294>>2]|0;
 $add295 = (($or293) + ($249))|0;
 $add296 = (($add295) + 568446438)|0;
 $250 = $a;
 $add297 = (($250) + ($add296))|0;
 $a = $add297;
 $251 = $a;
 $shl298 = $251 << 5;
 $252 = $a;
 $shr299 = $252 >>> 27;
 $or300 = $shl298 | $shr299;
 $a = $or300;
 $253 = $b;
 $254 = $a;
 $add301 = (($254) + ($253))|0;
 $a = $add301;
 $255 = $a;
 $256 = $c;
 $and302 = $255 & $256;
 $257 = $b;
 $258 = $c;
 $neg303 = $258 ^ -1;
 $and304 = $257 & $neg303;
 $or305 = $and302 | $and304;
 $arrayidx306 = ((($x)) + 56|0);
 $259 = HEAP32[$arrayidx306>>2]|0;
 $add307 = (($or305) + ($259))|0;
 $add308 = (($add307) + -1019803690)|0;
 $260 = $d;
 $add309 = (($260) + ($add308))|0;
 $d = $add309;
 $261 = $d;
 $shl310 = $261 << 9;
 $262 = $d;
 $shr311 = $262 >>> 23;
 $or312 = $shl310 | $shr311;
 $d = $or312;
 $263 = $a;
 $264 = $d;
 $add313 = (($264) + ($263))|0;
 $d = $add313;
 $265 = $d;
 $266 = $b;
 $and314 = $265 & $266;
 $267 = $a;
 $268 = $b;
 $neg315 = $268 ^ -1;
 $and316 = $267 & $neg315;
 $or317 = $and314 | $and316;
 $arrayidx318 = ((($x)) + 12|0);
 $269 = HEAP32[$arrayidx318>>2]|0;
 $add319 = (($or317) + ($269))|0;
 $add320 = (($add319) + -187363961)|0;
 $270 = $c;
 $add321 = (($270) + ($add320))|0;
 $c = $add321;
 $271 = $c;
 $shl322 = $271 << 14;
 $272 = $c;
 $shr323 = $272 >>> 18;
 $or324 = $shl322 | $shr323;
 $c = $or324;
 $273 = $d;
 $274 = $c;
 $add325 = (($274) + ($273))|0;
 $c = $add325;
 $275 = $c;
 $276 = $a;
 $and326 = $275 & $276;
 $277 = $d;
 $278 = $a;
 $neg327 = $278 ^ -1;
 $and328 = $277 & $neg327;
 $or329 = $and326 | $and328;
 $arrayidx330 = ((($x)) + 32|0);
 $279 = HEAP32[$arrayidx330>>2]|0;
 $add331 = (($or329) + ($279))|0;
 $add332 = (($add331) + 1163531501)|0;
 $280 = $b;
 $add333 = (($280) + ($add332))|0;
 $b = $add333;
 $281 = $b;
 $shl334 = $281 << 20;
 $282 = $b;
 $shr335 = $282 >>> 12;
 $or336 = $shl334 | $shr335;
 $b = $or336;
 $283 = $c;
 $284 = $b;
 $add337 = (($284) + ($283))|0;
 $b = $add337;
 $285 = $b;
 $286 = $d;
 $and338 = $285 & $286;
 $287 = $c;
 $288 = $d;
 $neg339 = $288 ^ -1;
 $and340 = $287 & $neg339;
 $or341 = $and338 | $and340;
 $arrayidx342 = ((($x)) + 52|0);
 $289 = HEAP32[$arrayidx342>>2]|0;
 $add343 = (($or341) + ($289))|0;
 $add344 = (($add343) + -1444681467)|0;
 $290 = $a;
 $add345 = (($290) + ($add344))|0;
 $a = $add345;
 $291 = $a;
 $shl346 = $291 << 5;
 $292 = $a;
 $shr347 = $292 >>> 27;
 $or348 = $shl346 | $shr347;
 $a = $or348;
 $293 = $b;
 $294 = $a;
 $add349 = (($294) + ($293))|0;
 $a = $add349;
 $295 = $a;
 $296 = $c;
 $and350 = $295 & $296;
 $297 = $b;
 $298 = $c;
 $neg351 = $298 ^ -1;
 $and352 = $297 & $neg351;
 $or353 = $and350 | $and352;
 $arrayidx354 = ((($x)) + 8|0);
 $299 = HEAP32[$arrayidx354>>2]|0;
 $add355 = (($or353) + ($299))|0;
 $add356 = (($add355) + -51403784)|0;
 $300 = $d;
 $add357 = (($300) + ($add356))|0;
 $d = $add357;
 $301 = $d;
 $shl358 = $301 << 9;
 $302 = $d;
 $shr359 = $302 >>> 23;
 $or360 = $shl358 | $shr359;
 $d = $or360;
 $303 = $a;
 $304 = $d;
 $add361 = (($304) + ($303))|0;
 $d = $add361;
 $305 = $d;
 $306 = $b;
 $and362 = $305 & $306;
 $307 = $a;
 $308 = $b;
 $neg363 = $308 ^ -1;
 $and364 = $307 & $neg363;
 $or365 = $and362 | $and364;
 $arrayidx366 = ((($x)) + 28|0);
 $309 = HEAP32[$arrayidx366>>2]|0;
 $add367 = (($or365) + ($309))|0;
 $add368 = (($add367) + 1735328473)|0;
 $310 = $c;
 $add369 = (($310) + ($add368))|0;
 $c = $add369;
 $311 = $c;
 $shl370 = $311 << 14;
 $312 = $c;
 $shr371 = $312 >>> 18;
 $or372 = $shl370 | $shr371;
 $c = $or372;
 $313 = $d;
 $314 = $c;
 $add373 = (($314) + ($313))|0;
 $c = $add373;
 $315 = $c;
 $316 = $a;
 $and374 = $315 & $316;
 $317 = $d;
 $318 = $a;
 $neg375 = $318 ^ -1;
 $and376 = $317 & $neg375;
 $or377 = $and374 | $and376;
 $arrayidx378 = ((($x)) + 48|0);
 $319 = HEAP32[$arrayidx378>>2]|0;
 $add379 = (($or377) + ($319))|0;
 $add380 = (($add379) + -1926607734)|0;
 $320 = $b;
 $add381 = (($320) + ($add380))|0;
 $b = $add381;
 $321 = $b;
 $shl382 = $321 << 20;
 $322 = $b;
 $shr383 = $322 >>> 12;
 $or384 = $shl382 | $shr383;
 $b = $or384;
 $323 = $c;
 $324 = $b;
 $add385 = (($324) + ($323))|0;
 $b = $add385;
 $325 = $b;
 $326 = $c;
 $xor = $325 ^ $326;
 $327 = $d;
 $xor386 = $xor ^ $327;
 $arrayidx387 = ((($x)) + 20|0);
 $328 = HEAP32[$arrayidx387>>2]|0;
 $add388 = (($xor386) + ($328))|0;
 $add389 = (($add388) + -378558)|0;
 $329 = $a;
 $add390 = (($329) + ($add389))|0;
 $a = $add390;
 $330 = $a;
 $shl391 = $330 << 4;
 $331 = $a;
 $shr392 = $331 >>> 28;
 $or393 = $shl391 | $shr392;
 $a = $or393;
 $332 = $b;
 $333 = $a;
 $add394 = (($333) + ($332))|0;
 $a = $add394;
 $334 = $a;
 $335 = $b;
 $xor395 = $334 ^ $335;
 $336 = $c;
 $xor396 = $xor395 ^ $336;
 $arrayidx397 = ((($x)) + 32|0);
 $337 = HEAP32[$arrayidx397>>2]|0;
 $add398 = (($xor396) + ($337))|0;
 $add399 = (($add398) + -2022574463)|0;
 $338 = $d;
 $add400 = (($338) + ($add399))|0;
 $d = $add400;
 $339 = $d;
 $shl401 = $339 << 11;
 $340 = $d;
 $shr402 = $340 >>> 21;
 $or403 = $shl401 | $shr402;
 $d = $or403;
 $341 = $a;
 $342 = $d;
 $add404 = (($342) + ($341))|0;
 $d = $add404;
 $343 = $d;
 $344 = $a;
 $xor405 = $343 ^ $344;
 $345 = $b;
 $xor406 = $xor405 ^ $345;
 $arrayidx407 = ((($x)) + 44|0);
 $346 = HEAP32[$arrayidx407>>2]|0;
 $add408 = (($xor406) + ($346))|0;
 $add409 = (($add408) + 1839030562)|0;
 $347 = $c;
 $add410 = (($347) + ($add409))|0;
 $c = $add410;
 $348 = $c;
 $shl411 = $348 << 16;
 $349 = $c;
 $shr412 = $349 >>> 16;
 $or413 = $shl411 | $shr412;
 $c = $or413;
 $350 = $d;
 $351 = $c;
 $add414 = (($351) + ($350))|0;
 $c = $add414;
 $352 = $c;
 $353 = $d;
 $xor415 = $352 ^ $353;
 $354 = $a;
 $xor416 = $xor415 ^ $354;
 $arrayidx417 = ((($x)) + 56|0);
 $355 = HEAP32[$arrayidx417>>2]|0;
 $add418 = (($xor416) + ($355))|0;
 $add419 = (($add418) + -35309556)|0;
 $356 = $b;
 $add420 = (($356) + ($add419))|0;
 $b = $add420;
 $357 = $b;
 $shl421 = $357 << 23;
 $358 = $b;
 $shr422 = $358 >>> 9;
 $or423 = $shl421 | $shr422;
 $b = $or423;
 $359 = $c;
 $360 = $b;
 $add424 = (($360) + ($359))|0;
 $b = $add424;
 $361 = $b;
 $362 = $c;
 $xor425 = $361 ^ $362;
 $363 = $d;
 $xor426 = $xor425 ^ $363;
 $arrayidx427 = ((($x)) + 4|0);
 $364 = HEAP32[$arrayidx427>>2]|0;
 $add428 = (($xor426) + ($364))|0;
 $add429 = (($add428) + -1530992060)|0;
 $365 = $a;
 $add430 = (($365) + ($add429))|0;
 $a = $add430;
 $366 = $a;
 $shl431 = $366 << 4;
 $367 = $a;
 $shr432 = $367 >>> 28;
 $or433 = $shl431 | $shr432;
 $a = $or433;
 $368 = $b;
 $369 = $a;
 $add434 = (($369) + ($368))|0;
 $a = $add434;
 $370 = $a;
 $371 = $b;
 $xor435 = $370 ^ $371;
 $372 = $c;
 $xor436 = $xor435 ^ $372;
 $arrayidx437 = ((($x)) + 16|0);
 $373 = HEAP32[$arrayidx437>>2]|0;
 $add438 = (($xor436) + ($373))|0;
 $add439 = (($add438) + 1272893353)|0;
 $374 = $d;
 $add440 = (($374) + ($add439))|0;
 $d = $add440;
 $375 = $d;
 $shl441 = $375 << 11;
 $376 = $d;
 $shr442 = $376 >>> 21;
 $or443 = $shl441 | $shr442;
 $d = $or443;
 $377 = $a;
 $378 = $d;
 $add444 = (($378) + ($377))|0;
 $d = $add444;
 $379 = $d;
 $380 = $a;
 $xor445 = $379 ^ $380;
 $381 = $b;
 $xor446 = $xor445 ^ $381;
 $arrayidx447 = ((($x)) + 28|0);
 $382 = HEAP32[$arrayidx447>>2]|0;
 $add448 = (($xor446) + ($382))|0;
 $add449 = (($add448) + -155497632)|0;
 $383 = $c;
 $add450 = (($383) + ($add449))|0;
 $c = $add450;
 $384 = $c;
 $shl451 = $384 << 16;
 $385 = $c;
 $shr452 = $385 >>> 16;
 $or453 = $shl451 | $shr452;
 $c = $or453;
 $386 = $d;
 $387 = $c;
 $add454 = (($387) + ($386))|0;
 $c = $add454;
 $388 = $c;
 $389 = $d;
 $xor455 = $388 ^ $389;
 $390 = $a;
 $xor456 = $xor455 ^ $390;
 $arrayidx457 = ((($x)) + 40|0);
 $391 = HEAP32[$arrayidx457>>2]|0;
 $add458 = (($xor456) + ($391))|0;
 $add459 = (($add458) + -1094730640)|0;
 $392 = $b;
 $add460 = (($392) + ($add459))|0;
 $b = $add460;
 $393 = $b;
 $shl461 = $393 << 23;
 $394 = $b;
 $shr462 = $394 >>> 9;
 $or463 = $shl461 | $shr462;
 $b = $or463;
 $395 = $c;
 $396 = $b;
 $add464 = (($396) + ($395))|0;
 $b = $add464;
 $397 = $b;
 $398 = $c;
 $xor465 = $397 ^ $398;
 $399 = $d;
 $xor466 = $xor465 ^ $399;
 $arrayidx467 = ((($x)) + 52|0);
 $400 = HEAP32[$arrayidx467>>2]|0;
 $add468 = (($xor466) + ($400))|0;
 $add469 = (($add468) + 681279174)|0;
 $401 = $a;
 $add470 = (($401) + ($add469))|0;
 $a = $add470;
 $402 = $a;
 $shl471 = $402 << 4;
 $403 = $a;
 $shr472 = $403 >>> 28;
 $or473 = $shl471 | $shr472;
 $a = $or473;
 $404 = $b;
 $405 = $a;
 $add474 = (($405) + ($404))|0;
 $a = $add474;
 $406 = $a;
 $407 = $b;
 $xor475 = $406 ^ $407;
 $408 = $c;
 $xor476 = $xor475 ^ $408;
 $409 = HEAP32[$x>>2]|0;
 $add478 = (($xor476) + ($409))|0;
 $add479 = (($add478) + -358537222)|0;
 $410 = $d;
 $add480 = (($410) + ($add479))|0;
 $d = $add480;
 $411 = $d;
 $shl481 = $411 << 11;
 $412 = $d;
 $shr482 = $412 >>> 21;
 $or483 = $shl481 | $shr482;
 $d = $or483;
 $413 = $a;
 $414 = $d;
 $add484 = (($414) + ($413))|0;
 $d = $add484;
 $415 = $d;
 $416 = $a;
 $xor485 = $415 ^ $416;
 $417 = $b;
 $xor486 = $xor485 ^ $417;
 $arrayidx487 = ((($x)) + 12|0);
 $418 = HEAP32[$arrayidx487>>2]|0;
 $add488 = (($xor486) + ($418))|0;
 $add489 = (($add488) + -722521979)|0;
 $419 = $c;
 $add490 = (($419) + ($add489))|0;
 $c = $add490;
 $420 = $c;
 $shl491 = $420 << 16;
 $421 = $c;
 $shr492 = $421 >>> 16;
 $or493 = $shl491 | $shr492;
 $c = $or493;
 $422 = $d;
 $423 = $c;
 $add494 = (($423) + ($422))|0;
 $c = $add494;
 $424 = $c;
 $425 = $d;
 $xor495 = $424 ^ $425;
 $426 = $a;
 $xor496 = $xor495 ^ $426;
 $arrayidx497 = ((($x)) + 24|0);
 $427 = HEAP32[$arrayidx497>>2]|0;
 $add498 = (($xor496) + ($427))|0;
 $add499 = (($add498) + 76029189)|0;
 $428 = $b;
 $add500 = (($428) + ($add499))|0;
 $b = $add500;
 $429 = $b;
 $shl501 = $429 << 23;
 $430 = $b;
 $shr502 = $430 >>> 9;
 $or503 = $shl501 | $shr502;
 $b = $or503;
 $431 = $c;
 $432 = $b;
 $add504 = (($432) + ($431))|0;
 $b = $add504;
 $433 = $b;
 $434 = $c;
 $xor505 = $433 ^ $434;
 $435 = $d;
 $xor506 = $xor505 ^ $435;
 $arrayidx507 = ((($x)) + 36|0);
 $436 = HEAP32[$arrayidx507>>2]|0;
 $add508 = (($xor506) + ($436))|0;
 $add509 = (($add508) + -640364487)|0;
 $437 = $a;
 $add510 = (($437) + ($add509))|0;
 $a = $add510;
 $438 = $a;
 $shl511 = $438 << 4;
 $439 = $a;
 $shr512 = $439 >>> 28;
 $or513 = $shl511 | $shr512;
 $a = $or513;
 $440 = $b;
 $441 = $a;
 $add514 = (($441) + ($440))|0;
 $a = $add514;
 $442 = $a;
 $443 = $b;
 $xor515 = $442 ^ $443;
 $444 = $c;
 $xor516 = $xor515 ^ $444;
 $arrayidx517 = ((($x)) + 48|0);
 $445 = HEAP32[$arrayidx517>>2]|0;
 $add518 = (($xor516) + ($445))|0;
 $add519 = (($add518) + -421815835)|0;
 $446 = $d;
 $add520 = (($446) + ($add519))|0;
 $d = $add520;
 $447 = $d;
 $shl521 = $447 << 11;
 $448 = $d;
 $shr522 = $448 >>> 21;
 $or523 = $shl521 | $shr522;
 $d = $or523;
 $449 = $a;
 $450 = $d;
 $add524 = (($450) + ($449))|0;
 $d = $add524;
 $451 = $d;
 $452 = $a;
 $xor525 = $451 ^ $452;
 $453 = $b;
 $xor526 = $xor525 ^ $453;
 $arrayidx527 = ((($x)) + 60|0);
 $454 = HEAP32[$arrayidx527>>2]|0;
 $add528 = (($xor526) + ($454))|0;
 $add529 = (($add528) + 530742520)|0;
 $455 = $c;
 $add530 = (($455) + ($add529))|0;
 $c = $add530;
 $456 = $c;
 $shl531 = $456 << 16;
 $457 = $c;
 $shr532 = $457 >>> 16;
 $or533 = $shl531 | $shr532;
 $c = $or533;
 $458 = $d;
 $459 = $c;
 $add534 = (($459) + ($458))|0;
 $c = $add534;
 $460 = $c;
 $461 = $d;
 $xor535 = $460 ^ $461;
 $462 = $a;
 $xor536 = $xor535 ^ $462;
 $arrayidx537 = ((($x)) + 8|0);
 $463 = HEAP32[$arrayidx537>>2]|0;
 $add538 = (($xor536) + ($463))|0;
 $add539 = (($add538) + -995338651)|0;
 $464 = $b;
 $add540 = (($464) + ($add539))|0;
 $b = $add540;
 $465 = $b;
 $shl541 = $465 << 23;
 $466 = $b;
 $shr542 = $466 >>> 9;
 $or543 = $shl541 | $shr542;
 $b = $or543;
 $467 = $c;
 $468 = $b;
 $add544 = (($468) + ($467))|0;
 $b = $add544;
 $469 = $c;
 $470 = $b;
 $471 = $d;
 $neg545 = $471 ^ -1;
 $or546 = $470 | $neg545;
 $xor547 = $469 ^ $or546;
 $472 = HEAP32[$x>>2]|0;
 $add549 = (($xor547) + ($472))|0;
 $add550 = (($add549) + -198630844)|0;
 $473 = $a;
 $add551 = (($473) + ($add550))|0;
 $a = $add551;
 $474 = $a;
 $shl552 = $474 << 6;
 $475 = $a;
 $shr553 = $475 >>> 26;
 $or554 = $shl552 | $shr553;
 $a = $or554;
 $476 = $b;
 $477 = $a;
 $add555 = (($477) + ($476))|0;
 $a = $add555;
 $478 = $b;
 $479 = $a;
 $480 = $c;
 $neg556 = $480 ^ -1;
 $or557 = $479 | $neg556;
 $xor558 = $478 ^ $or557;
 $arrayidx559 = ((($x)) + 28|0);
 $481 = HEAP32[$arrayidx559>>2]|0;
 $add560 = (($xor558) + ($481))|0;
 $add561 = (($add560) + 1126891415)|0;
 $482 = $d;
 $add562 = (($482) + ($add561))|0;
 $d = $add562;
 $483 = $d;
 $shl563 = $483 << 10;
 $484 = $d;
 $shr564 = $484 >>> 22;
 $or565 = $shl563 | $shr564;
 $d = $or565;
 $485 = $a;
 $486 = $d;
 $add566 = (($486) + ($485))|0;
 $d = $add566;
 $487 = $a;
 $488 = $d;
 $489 = $b;
 $neg567 = $489 ^ -1;
 $or568 = $488 | $neg567;
 $xor569 = $487 ^ $or568;
 $arrayidx570 = ((($x)) + 56|0);
 $490 = HEAP32[$arrayidx570>>2]|0;
 $add571 = (($xor569) + ($490))|0;
 $add572 = (($add571) + -1416354905)|0;
 $491 = $c;
 $add573 = (($491) + ($add572))|0;
 $c = $add573;
 $492 = $c;
 $shl574 = $492 << 15;
 $493 = $c;
 $shr575 = $493 >>> 17;
 $or576 = $shl574 | $shr575;
 $c = $or576;
 $494 = $d;
 $495 = $c;
 $add577 = (($495) + ($494))|0;
 $c = $add577;
 $496 = $d;
 $497 = $c;
 $498 = $a;
 $neg578 = $498 ^ -1;
 $or579 = $497 | $neg578;
 $xor580 = $496 ^ $or579;
 $arrayidx581 = ((($x)) + 20|0);
 $499 = HEAP32[$arrayidx581>>2]|0;
 $add582 = (($xor580) + ($499))|0;
 $add583 = (($add582) + -57434055)|0;
 $500 = $b;
 $add584 = (($500) + ($add583))|0;
 $b = $add584;
 $501 = $b;
 $shl585 = $501 << 21;
 $502 = $b;
 $shr586 = $502 >>> 11;
 $or587 = $shl585 | $shr586;
 $b = $or587;
 $503 = $c;
 $504 = $b;
 $add588 = (($504) + ($503))|0;
 $b = $add588;
 $505 = $c;
 $506 = $b;
 $507 = $d;
 $neg589 = $507 ^ -1;
 $or590 = $506 | $neg589;
 $xor591 = $505 ^ $or590;
 $arrayidx592 = ((($x)) + 48|0);
 $508 = HEAP32[$arrayidx592>>2]|0;
 $add593 = (($xor591) + ($508))|0;
 $add594 = (($add593) + 1700485571)|0;
 $509 = $a;
 $add595 = (($509) + ($add594))|0;
 $a = $add595;
 $510 = $a;
 $shl596 = $510 << 6;
 $511 = $a;
 $shr597 = $511 >>> 26;
 $or598 = $shl596 | $shr597;
 $a = $or598;
 $512 = $b;
 $513 = $a;
 $add599 = (($513) + ($512))|0;
 $a = $add599;
 $514 = $b;
 $515 = $a;
 $516 = $c;
 $neg600 = $516 ^ -1;
 $or601 = $515 | $neg600;
 $xor602 = $514 ^ $or601;
 $arrayidx603 = ((($x)) + 12|0);
 $517 = HEAP32[$arrayidx603>>2]|0;
 $add604 = (($xor602) + ($517))|0;
 $add605 = (($add604) + -1894986606)|0;
 $518 = $d;
 $add606 = (($518) + ($add605))|0;
 $d = $add606;
 $519 = $d;
 $shl607 = $519 << 10;
 $520 = $d;
 $shr608 = $520 >>> 22;
 $or609 = $shl607 | $shr608;
 $d = $or609;
 $521 = $a;
 $522 = $d;
 $add610 = (($522) + ($521))|0;
 $d = $add610;
 $523 = $a;
 $524 = $d;
 $525 = $b;
 $neg611 = $525 ^ -1;
 $or612 = $524 | $neg611;
 $xor613 = $523 ^ $or612;
 $arrayidx614 = ((($x)) + 40|0);
 $526 = HEAP32[$arrayidx614>>2]|0;
 $add615 = (($xor613) + ($526))|0;
 $add616 = (($add615) + -1051523)|0;
 $527 = $c;
 $add617 = (($527) + ($add616))|0;
 $c = $add617;
 $528 = $c;
 $shl618 = $528 << 15;
 $529 = $c;
 $shr619 = $529 >>> 17;
 $or620 = $shl618 | $shr619;
 $c = $or620;
 $530 = $d;
 $531 = $c;
 $add621 = (($531) + ($530))|0;
 $c = $add621;
 $532 = $d;
 $533 = $c;
 $534 = $a;
 $neg622 = $534 ^ -1;
 $or623 = $533 | $neg622;
 $xor624 = $532 ^ $or623;
 $arrayidx625 = ((($x)) + 4|0);
 $535 = HEAP32[$arrayidx625>>2]|0;
 $add626 = (($xor624) + ($535))|0;
 $add627 = (($add626) + -2054922799)|0;
 $536 = $b;
 $add628 = (($536) + ($add627))|0;
 $b = $add628;
 $537 = $b;
 $shl629 = $537 << 21;
 $538 = $b;
 $shr630 = $538 >>> 11;
 $or631 = $shl629 | $shr630;
 $b = $or631;
 $539 = $c;
 $540 = $b;
 $add632 = (($540) + ($539))|0;
 $b = $add632;
 $541 = $c;
 $542 = $b;
 $543 = $d;
 $neg633 = $543 ^ -1;
 $or634 = $542 | $neg633;
 $xor635 = $541 ^ $or634;
 $arrayidx636 = ((($x)) + 32|0);
 $544 = HEAP32[$arrayidx636>>2]|0;
 $add637 = (($xor635) + ($544))|0;
 $add638 = (($add637) + 1873313359)|0;
 $545 = $a;
 $add639 = (($545) + ($add638))|0;
 $a = $add639;
 $546 = $a;
 $shl640 = $546 << 6;
 $547 = $a;
 $shr641 = $547 >>> 26;
 $or642 = $shl640 | $shr641;
 $a = $or642;
 $548 = $b;
 $549 = $a;
 $add643 = (($549) + ($548))|0;
 $a = $add643;
 $550 = $b;
 $551 = $a;
 $552 = $c;
 $neg644 = $552 ^ -1;
 $or645 = $551 | $neg644;
 $xor646 = $550 ^ $or645;
 $arrayidx647 = ((($x)) + 60|0);
 $553 = HEAP32[$arrayidx647>>2]|0;
 $add648 = (($xor646) + ($553))|0;
 $add649 = (($add648) + -30611744)|0;
 $554 = $d;
 $add650 = (($554) + ($add649))|0;
 $d = $add650;
 $555 = $d;
 $shl651 = $555 << 10;
 $556 = $d;
 $shr652 = $556 >>> 22;
 $or653 = $shl651 | $shr652;
 $d = $or653;
 $557 = $a;
 $558 = $d;
 $add654 = (($558) + ($557))|0;
 $d = $add654;
 $559 = $a;
 $560 = $d;
 $561 = $b;
 $neg655 = $561 ^ -1;
 $or656 = $560 | $neg655;
 $xor657 = $559 ^ $or656;
 $arrayidx658 = ((($x)) + 24|0);
 $562 = HEAP32[$arrayidx658>>2]|0;
 $add659 = (($xor657) + ($562))|0;
 $add660 = (($add659) + -1560198380)|0;
 $563 = $c;
 $add661 = (($563) + ($add660))|0;
 $c = $add661;
 $564 = $c;
 $shl662 = $564 << 15;
 $565 = $c;
 $shr663 = $565 >>> 17;
 $or664 = $shl662 | $shr663;
 $c = $or664;
 $566 = $d;
 $567 = $c;
 $add665 = (($567) + ($566))|0;
 $c = $add665;
 $568 = $d;
 $569 = $c;
 $570 = $a;
 $neg666 = $570 ^ -1;
 $or667 = $569 | $neg666;
 $xor668 = $568 ^ $or667;
 $arrayidx669 = ((($x)) + 52|0);
 $571 = HEAP32[$arrayidx669>>2]|0;
 $add670 = (($xor668) + ($571))|0;
 $add671 = (($add670) + 1309151649)|0;
 $572 = $b;
 $add672 = (($572) + ($add671))|0;
 $b = $add672;
 $573 = $b;
 $shl673 = $573 << 21;
 $574 = $b;
 $shr674 = $574 >>> 11;
 $or675 = $shl673 | $shr674;
 $b = $or675;
 $575 = $c;
 $576 = $b;
 $add676 = (($576) + ($575))|0;
 $b = $add676;
 $577 = $c;
 $578 = $b;
 $579 = $d;
 $neg677 = $579 ^ -1;
 $or678 = $578 | $neg677;
 $xor679 = $577 ^ $or678;
 $arrayidx680 = ((($x)) + 16|0);
 $580 = HEAP32[$arrayidx680>>2]|0;
 $add681 = (($xor679) + ($580))|0;
 $add682 = (($add681) + -145523070)|0;
 $581 = $a;
 $add683 = (($581) + ($add682))|0;
 $a = $add683;
 $582 = $a;
 $shl684 = $582 << 6;
 $583 = $a;
 $shr685 = $583 >>> 26;
 $or686 = $shl684 | $shr685;
 $a = $or686;
 $584 = $b;
 $585 = $a;
 $add687 = (($585) + ($584))|0;
 $a = $add687;
 $586 = $b;
 $587 = $a;
 $588 = $c;
 $neg688 = $588 ^ -1;
 $or689 = $587 | $neg688;
 $xor690 = $586 ^ $or689;
 $arrayidx691 = ((($x)) + 44|0);
 $589 = HEAP32[$arrayidx691>>2]|0;
 $add692 = (($xor690) + ($589))|0;
 $add693 = (($add692) + -1120210379)|0;
 $590 = $d;
 $add694 = (($590) + ($add693))|0;
 $d = $add694;
 $591 = $d;
 $shl695 = $591 << 10;
 $592 = $d;
 $shr696 = $592 >>> 22;
 $or697 = $shl695 | $shr696;
 $d = $or697;
 $593 = $a;
 $594 = $d;
 $add698 = (($594) + ($593))|0;
 $d = $add698;
 $595 = $a;
 $596 = $d;
 $597 = $b;
 $neg699 = $597 ^ -1;
 $or700 = $596 | $neg699;
 $xor701 = $595 ^ $or700;
 $arrayidx702 = ((($x)) + 8|0);
 $598 = HEAP32[$arrayidx702>>2]|0;
 $add703 = (($xor701) + ($598))|0;
 $add704 = (($add703) + 718787259)|0;
 $599 = $c;
 $add705 = (($599) + ($add704))|0;
 $c = $add705;
 $600 = $c;
 $shl706 = $600 << 15;
 $601 = $c;
 $shr707 = $601 >>> 17;
 $or708 = $shl706 | $shr707;
 $c = $or708;
 $602 = $d;
 $603 = $c;
 $add709 = (($603) + ($602))|0;
 $c = $add709;
 $604 = $d;
 $605 = $c;
 $606 = $a;
 $neg710 = $606 ^ -1;
 $or711 = $605 | $neg710;
 $xor712 = $604 ^ $or711;
 $arrayidx713 = ((($x)) + 36|0);
 $607 = HEAP32[$arrayidx713>>2]|0;
 $add714 = (($xor712) + ($607))|0;
 $add715 = (($add714) + -343485551)|0;
 $608 = $b;
 $add716 = (($608) + ($add715))|0;
 $b = $add716;
 $609 = $b;
 $shl717 = $609 << 21;
 $610 = $b;
 $shr718 = $610 >>> 11;
 $or719 = $shl717 | $shr718;
 $b = $or719;
 $611 = $c;
 $612 = $b;
 $add720 = (($612) + ($611))|0;
 $b = $add720;
 $613 = $a;
 $state721 = ((($this1)) + 4|0);
 $614 = HEAP32[$state721>>2]|0;
 $add723 = (($614) + ($613))|0;
 HEAP32[$state721>>2] = $add723;
 $615 = $b;
 $state724 = ((($this1)) + 4|0);
 $arrayidx725 = ((($state724)) + 4|0);
 $616 = HEAP32[$arrayidx725>>2]|0;
 $add726 = (($616) + ($615))|0;
 HEAP32[$arrayidx725>>2] = $add726;
 $617 = $c;
 $state727 = ((($this1)) + 4|0);
 $arrayidx728 = ((($state727)) + 8|0);
 $618 = HEAP32[$arrayidx728>>2]|0;
 $add729 = (($618) + ($617))|0;
 HEAP32[$arrayidx728>>2] = $add729;
 $619 = $d;
 $state730 = ((($this1)) + 4|0);
 $arrayidx731 = ((($state730)) + 12|0);
 $620 = HEAP32[$arrayidx731>>2]|0;
 $add732 = (($620) + ($619))|0;
 HEAP32[$arrayidx731>>2] = $add732;
 STACKTOP = sp;return;
}
function __ZN3MD56decodeEPKhPjj($this,$input,$output,$length) {
 $this = $this|0;
 $input = $input|0;
 $output = $output|0;
 $length = $length|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add15 = 0;
 var $add4 = 0, $add9 = 0, $arrayidx = 0, $arrayidx10 = 0, $arrayidx14 = 0, $arrayidx2 = 0, $arrayidx5 = 0, $cmp = 0, $conv = 0, $conv11 = 0, $conv3 = 0, $conv6 = 0, $i = 0, $inc = 0, $input$addr = 0, $j = 0, $length$addr = 0, $or = 0, $or13 = 0, $or8 = 0;
 var $output$addr = 0, $shl = 0, $shl12 = 0, $shl7 = 0, $this$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $this$addr = $this;
 $input$addr = $input;
 $output$addr = $output;
 $length$addr = $length;
 $i = 0;
 $j = 0;
 while(1) {
  $0 = $j;
  $1 = $length$addr;
  $cmp = ($0>>>0)<($1>>>0);
  if (!($cmp)) {
   break;
  }
  $2 = $input$addr;
  $3 = $j;
  $arrayidx = (($2) + ($3)|0);
  $4 = HEAP8[$arrayidx>>0]|0;
  $conv = $4&255;
  $5 = $input$addr;
  $6 = $j;
  $add = (($6) + 1)|0;
  $arrayidx2 = (($5) + ($add)|0);
  $7 = HEAP8[$arrayidx2>>0]|0;
  $conv3 = $7&255;
  $shl = $conv3 << 8;
  $or = $conv | $shl;
  $8 = $input$addr;
  $9 = $j;
  $add4 = (($9) + 2)|0;
  $arrayidx5 = (($8) + ($add4)|0);
  $10 = HEAP8[$arrayidx5>>0]|0;
  $conv6 = $10&255;
  $shl7 = $conv6 << 16;
  $or8 = $or | $shl7;
  $11 = $input$addr;
  $12 = $j;
  $add9 = (($12) + 3)|0;
  $arrayidx10 = (($11) + ($add9)|0);
  $13 = HEAP8[$arrayidx10>>0]|0;
  $conv11 = $13&255;
  $shl12 = $conv11 << 24;
  $or13 = $or8 | $shl12;
  $14 = $output$addr;
  $15 = $i;
  $arrayidx14 = (($14) + ($15<<2)|0);
  HEAP32[$arrayidx14>>2] = $or13;
  $16 = $i;
  $inc = (($16) + 1)|0;
  $i = $inc;
  $17 = $j;
  $add15 = (($17) + 4)|0;
  $j = $add15;
 }
 STACKTOP = sp;return;
}
function __ZN3MD55toStrEv($agg$result,$this) {
 $agg$result = $agg$result|0;
 $this = $this|0;
 var $$expand_i1_val = 0, $$expand_i1_val2 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__a$i$i = 0, $__i$i$i = 0, $a = 0, $arrayidx = 0, $arrayidx$i$i = 0, $arrayidx2 = 0, $arrayidx5 = 0, $b = 0, $call = 0, $cmp = 0, $cmp$i$i = 0, $conv = 0, $digest_ = 0, $div = 0, $ehselector$slot = 0;
 var $exn = 0, $exn$slot = 0, $i = 0, $inc = 0, $inc$i$i = 0, $nrvo = 0, $nrvo$val = 0, $nrvo$val$pre_trunc = 0, $rem = 0, $sel = 0, $t = 0, $this$addr = 0, $this$addr$i = 0, $this$addr$i$i = 0, $this$addr$i$i$i = 0, $this$addr$i$i$i$i = 0, $this$addr$i$i$i2$i = 0, $this$addr$i$i3$i = 0, $this$addr$i4$i = 0, $this1 = 0;
 var $this1$i = 0, $this1$i$i = 0, $this1$i$i$i = 0, $this1$i$i$i7$i = 0, $this1$i$i6$i = 0, $this1$i5$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $nrvo = sp + 68|0;
 $this$addr = $this;
 $this1 = $this$addr;
 $call = (__ZN3MD59getDigestEv($this1)|0);
 $digest_ = $call;
 $$expand_i1_val = 0;
 HEAP8[$nrvo>>0] = $$expand_i1_val;
 $this$addr$i = $agg$result;
 $this1$i = $this$addr$i;
 $this$addr$i$i = $this1$i;
 $this1$i$i = $this$addr$i$i;
 $this$addr$i$i$i = $this1$i$i;
 $this1$i$i$i = $this$addr$i$i$i;
 $this$addr$i$i$i$i = $this1$i$i$i;
 ;HEAP32[$this1$i$i$i>>2]=0|0;HEAP32[$this1$i$i$i+4>>2]=0|0;HEAP32[$this1$i$i$i+8>>2]=0|0;
 $this$addr$i4$i = $this1$i;
 $this1$i5$i = $this$addr$i4$i;
 $this$addr$i$i3$i = $this1$i5$i;
 $this1$i$i6$i = $this$addr$i$i3$i;
 $this$addr$i$i$i2$i = $this1$i$i6$i;
 $this1$i$i$i7$i = $this$addr$i$i$i2$i;
 $__a$i$i = $this1$i$i$i7$i;
 $__i$i$i = 0;
 while(1) {
  $0 = $__i$i$i;
  $cmp$i$i = ($0>>>0)<(3);
  if (!($cmp$i$i)) {
   break;
  }
  $1 = $__a$i$i;
  $2 = $__i$i$i;
  $arrayidx$i$i = (($1) + ($2<<2)|0);
  HEAP32[$arrayidx$i$i>>2] = 0;
  $3 = $__i$i$i;
  $inc$i$i = (($3) + 1)|0;
  $__i$i$i = $inc$i$i;
 }
 __THREW__ = 0;
 invoke_vii(29,($agg$result|0),32);
 $4 = __THREW__; __THREW__ = 0;
 $5 = $4&1;
 L5: do {
  if (!($5)) {
   $i = 0;
   while(1) {
    $6 = $i;
    $cmp = ($6>>>0)<(16);
    if (!($cmp)) {
     break;
    }
    $7 = $digest_;
    $8 = $i;
    $arrayidx = (($7) + ($8)|0);
    $9 = HEAP8[$arrayidx>>0]|0;
    $conv = $9&255;
    $t = $conv;
    $10 = $t;
    $div = (($10|0) / 16)&-1;
    $a = $div;
    $11 = $t;
    $rem = (($11|0) % 16)&-1;
    $b = $rem;
    $12 = $a;
    $arrayidx2 = (1124 + ($12)|0);
    $13 = HEAP8[$arrayidx2>>0]|0;
    __THREW__ = 0;
    (invoke_iiii(30,($agg$result|0),1,($13|0))|0);
    $14 = __THREW__; __THREW__ = 0;
    $15 = $14&1;
    if ($15) {
     break L5;
    }
    $16 = $b;
    $arrayidx5 = (1124 + ($16)|0);
    $17 = HEAP8[$arrayidx5>>0]|0;
    __THREW__ = 0;
    (invoke_iiii(30,($agg$result|0),1,($17|0))|0);
    $18 = __THREW__; __THREW__ = 0;
    $19 = $18&1;
    if ($19) {
     break L5;
    }
    $20 = $i;
    $inc = (($20) + 1)|0;
    $i = $inc;
   }
   $$expand_i1_val2 = 1;
   HEAP8[$nrvo>>0] = $$expand_i1_val2;
   $nrvo$val$pre_trunc = HEAP8[$nrvo>>0]|0;
   $nrvo$val = $nrvo$val$pre_trunc&1;
   if ($nrvo$val) {
    STACKTOP = sp;return;
   }
   __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($agg$result);
   STACKTOP = sp;return;
  }
 } while(0);
 $21 = ___cxa_find_matching_catch_2()|0;
 $22 = tempRet0;
 $exn$slot = $21;
 $ehselector$slot = $22;
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($agg$result);
 $exn = $exn$slot;
 $sel = $ehselector$slot;
 ___resumeException($exn|0);
 // unreachable;
}
function __Z3md5NSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEE($agg$result,$str) {
 $agg$result = $agg$result|0;
 $str = $str|0;
 var $ref$tmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $ref$tmp = sp;
 __ZN3MD5C2ERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE($ref$tmp,$str);
 __ZN3MD55toStrEv($agg$result,$ref$tmp);
 STACKTOP = sp;return;
}
function ___cxx_global_var_init() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN45EmscriptenBindingInitializer_my_class_exampleC2Ev(3520);
 return;
}
function __ZN45EmscriptenBindingInitializer_my_class_exampleC2Ev($this) {
 $this = $this|0;
 var $this$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $this$addr = $this;
 __ZN10emscripten8functionINSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEEJS7_EJEEEvPKcPFT_DpT0_EDpT1_(1140,31);
 STACKTOP = sp;return;
}
function __ZN10emscripten8functionINSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEEJS7_EJEEEvPKcPFT_DpT0_EDpT1_($name,$fn) {
 $name = $name|0;
 $fn = $fn|0;
 var $$addr$i = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $args = 0, $call = 0, $call$i$i = 0, $call1 = 0, $fn$addr = 0, $invoker = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $args = sp + 16|0;
 $name$addr = $name;
 $fn$addr = $fn;
 $invoker = 32;
 $0 = $name$addr;
 $call = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEESA_EE8getCountEv($args)|0);
 $call1 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEESA_EE8getTypesEv($args)|0);
 $1 = $invoker;
 $$addr$i = $1;
 $call$i$i = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0);
 $2 = $invoker;
 $3 = $fn$addr;
 __embind_register_function(($0|0),($call|0),($call1|0),($call$i$i|0),($2|0),($3|0));
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal7InvokerINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEJS8_EE6invokeEPFS8_S8_EPNS0_11BindingTypeIS8_EUt_E($fn,$args) {
 $fn = $fn|0;
 $args = $args|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $agg$tmp = 0, $args$addr = 0, $call = 0, $ehselector$slot = 0, $exn = 0, $exn$slot = 0, $fn$addr = 0, $ref$tmp = 0, $sel = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $ref$tmp = sp + 20|0;
 $agg$tmp = sp + 8|0;
 $fn$addr = $fn;
 $args$addr = $args;
 $0 = $fn$addr;
 $1 = $args$addr;
 __ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE12fromWireTypeEPNS9_Ut_E($agg$tmp,$1);
 __THREW__ = 0;
 invoke_vii($0|0,($ref$tmp|0),($agg$tmp|0));
 $2 = __THREW__; __THREW__ = 0;
 $3 = $2&1;
 if ($3) {
  $6 = ___cxa_find_matching_catch_2()|0;
  $7 = tempRet0;
  $exn$slot = $6;
  $ehselector$slot = $7;
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($agg$tmp);
  $exn = $exn$slot;
  $sel = $ehselector$slot;
  ___resumeException($exn|0);
  // unreachable;
 }
 __THREW__ = 0;
 $call = (invoke_ii(33,($ref$tmp|0))|0);
 $4 = __THREW__; __THREW__ = 0;
 $5 = $4&1;
 if (!($5)) {
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($ref$tmp);
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($agg$tmp);
  STACKTOP = sp;return ($call|0);
 }
 $8 = ___cxa_find_matching_catch_2()|0;
 $9 = tempRet0;
 $exn$slot = $8;
 $ehselector$slot = $9;
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($ref$tmp);
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($agg$tmp);
 $exn = $exn$slot;
 $sel = $ehselector$slot;
 ___resumeException($exn|0);
 // unreachable;
 return (0)|0;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEESA_EE8getCountEv($this) {
 $this = $this|0;
 var $this$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $this$addr = $this;
 STACKTOP = sp;return 2;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEESA_EE8getTypesEv($this) {
 $this = $this|0;
 var $call = 0, $this$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $this$addr = $this;
 $call = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEES9_EEEE3getEv()|0);
 STACKTOP = sp;return ($call|0);
}
function __ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE10toWireTypeERKS8_($v) {
 $v = $v|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__p$addr$i$i = 0, $__r$addr$i$i$i$i = 0, $__size_$i23$i$i = 0, $__size_$i23$i$i106 = 0, $__size_$i23$i$i34 = 0, $__x$addr$i$i$i$i$i = 0, $add = 0, $and$i$i$i = 0, $and$i$i$i26 = 0, $and$i$i$i65 = 0, $and$i$i$i98 = 0, $call1 = 0;
 var $cond$i$i = 0, $cond$i$i117 = 0, $cond$i$i45 = 0, $cond$i$i76 = 0, $conv$i$i$i = 0, $conv$i$i$i25 = 0, $conv$i$i$i64 = 0, $conv$i$i$i97 = 0, $conv$i14$i$i = 0, $conv$i14$i$i115 = 0, $conv$i14$i$i43 = 0, $data = 0, $this$addr$i = 0, $this$addr$i$i = 0, $this$addr$i$i$i = 0, $this$addr$i$i$i$i = 0, $this$addr$i$i$i$i$i = 0, $this$addr$i$i$i$i$i11 = 0, $this$addr$i$i$i$i$i50 = 0, $this$addr$i$i$i$i$i83 = 0;
 var $this$addr$i$i$i$i12 = 0, $this$addr$i$i$i$i51 = 0, $this$addr$i$i$i$i84 = 0, $this$addr$i$i$i13 = 0, $this$addr$i$i$i13$i$i = 0, $this$addr$i$i$i15$i$i = 0, $this$addr$i$i$i15$i$i5 = 0, $this$addr$i$i$i15$i$i77 = 0, $this$addr$i$i$i4$i$i = 0, $this$addr$i$i$i4$i$i47 = 0, $this$addr$i$i$i4$i$i8 = 0, $this$addr$i$i$i4$i$i80 = 0, $this$addr$i$i$i52 = 0, $this$addr$i$i$i85 = 0, $this$addr$i$i14 = 0, $this$addr$i$i14$i$i = 0, $this$addr$i$i16$i$i = 0, $this$addr$i$i16$i$i6 = 0, $this$addr$i$i16$i$i78 = 0, $this$addr$i$i5$i$i = 0;
 var $this$addr$i$i5$i$i48 = 0, $this$addr$i$i5$i$i81 = 0, $this$addr$i$i5$i$i9 = 0, $this$addr$i$i53 = 0, $this$addr$i$i86 = 0, $this$addr$i15 = 0, $this$addr$i15$i$i = 0, $this$addr$i17$i$i = 0, $this$addr$i17$i$i7 = 0, $this$addr$i17$i$i79 = 0, $this$addr$i54 = 0, $this$addr$i6$i$i = 0, $this$addr$i6$i$i10 = 0, $this$addr$i6$i$i49 = 0, $this$addr$i6$i$i82 = 0, $this$addr$i87 = 0, $this1$i = 0, $this1$i$i = 0, $this1$i$i$i = 0, $this1$i$i$i$i = 0;
 var $this1$i$i$i$i$i = 0, $this1$i$i$i$i$i21 = 0, $this1$i$i$i$i$i60 = 0, $this1$i$i$i$i$i93 = 0, $this1$i$i$i$i20 = 0, $this1$i$i$i$i59 = 0, $this1$i$i$i$i92 = 0, $this1$i$i$i10$i$i = 0, $this1$i$i$i10$i$i111 = 0, $this1$i$i$i10$i$i39 = 0, $this1$i$i$i10$i$i72 = 0, $this1$i$i$i18 = 0, $this1$i$i$i19$i$i = 0, $this1$i$i$i21$i$i = 0, $this1$i$i$i21$i$i103 = 0, $this1$i$i$i21$i$i31 = 0, $this1$i$i$i57 = 0, $this1$i$i$i90 = 0, $this1$i$i17 = 0, $this1$i$i18$i$i = 0;
 var $this1$i$i20$i$i = 0, $this1$i$i20$i$i102 = 0, $this1$i$i20$i$i30 = 0, $this1$i$i56 = 0, $this1$i$i89 = 0, $this1$i$i9$i$i = 0, $this1$i$i9$i$i110 = 0, $this1$i$i9$i$i38 = 0, $this1$i$i9$i$i71 = 0, $this1$i16 = 0, $this1$i16$i$i = 0, $this1$i18$i$i = 0, $this1$i18$i$i100 = 0, $this1$i18$i$i28 = 0, $this1$i55 = 0, $this1$i7$i$i = 0, $this1$i7$i$i108 = 0, $this1$i7$i$i36 = 0, $this1$i7$i$i69 = 0, $this1$i88 = 0;
 var $tobool$i$i$i = 0, $tobool$i$i$i27 = 0, $tobool$i$i$i66 = 0, $tobool$i$i$i99 = 0, $v$addr = 0, $wt = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 208|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(208|0);
 $v$addr = $v;
 $0 = $v$addr;
 $this$addr$i = $0;
 $this1$i = $this$addr$i;
 $this$addr$i$i = $this1$i;
 $this1$i$i = $this$addr$i$i;
 $this$addr$i$i$i = $this1$i$i;
 $this1$i$i$i = $this$addr$i$i$i;
 $this$addr$i$i$i$i = $this1$i$i$i;
 $this1$i$i$i$i = $this$addr$i$i$i$i;
 $this$addr$i$i$i$i$i = $this1$i$i$i$i;
 $this1$i$i$i$i$i = $this$addr$i$i$i$i$i;
 $1 = ((($this1$i$i$i$i$i)) + 11|0);
 $2 = HEAP8[$1>>0]|0;
 $conv$i$i$i = $2&255;
 $and$i$i$i = $conv$i$i$i & 128;
 $tobool$i$i$i = ($and$i$i$i|0)!=(0);
 if ($tobool$i$i$i) {
  $this$addr$i17$i$i = $this1$i$i;
  $this1$i18$i$i = $this$addr$i17$i$i;
  $this$addr$i$i16$i$i = $this1$i18$i$i;
  $this1$i$i20$i$i = $this$addr$i$i16$i$i;
  $this$addr$i$i$i15$i$i = $this1$i$i20$i$i;
  $this1$i$i$i21$i$i = $this$addr$i$i$i15$i$i;
  $__size_$i23$i$i = ((($this1$i$i$i21$i$i)) + 4|0);
  $3 = HEAP32[$__size_$i23$i$i>>2]|0;
  $cond$i$i = $3;
 } else {
  $this$addr$i6$i$i = $this1$i$i;
  $this1$i7$i$i = $this$addr$i6$i$i;
  $this$addr$i$i5$i$i = $this1$i7$i$i;
  $this1$i$i9$i$i = $this$addr$i$i5$i$i;
  $this$addr$i$i$i4$i$i = $this1$i$i9$i$i;
  $this1$i$i$i10$i$i = $this$addr$i$i$i4$i$i;
  $4 = ((($this1$i$i$i10$i$i)) + 11|0);
  $5 = HEAP8[$4>>0]|0;
  $conv$i14$i$i = $5&255;
  $cond$i$i = $conv$i14$i$i;
 }
 $add = (4 + ($cond$i$i))|0;
 $call1 = (_malloc($add)|0);
 $wt = $call1;
 $6 = $v$addr;
 $this$addr$i87 = $6;
 $this1$i88 = $this$addr$i87;
 $this$addr$i$i86 = $this1$i88;
 $this1$i$i89 = $this$addr$i$i86;
 $this$addr$i$i$i85 = $this1$i$i89;
 $this1$i$i$i90 = $this$addr$i$i$i85;
 $this$addr$i$i$i$i84 = $this1$i$i$i90;
 $this1$i$i$i$i92 = $this$addr$i$i$i$i84;
 $this$addr$i$i$i$i$i83 = $this1$i$i$i$i92;
 $this1$i$i$i$i$i93 = $this$addr$i$i$i$i$i83;
 $7 = ((($this1$i$i$i$i$i93)) + 11|0);
 $8 = HEAP8[$7>>0]|0;
 $conv$i$i$i97 = $8&255;
 $and$i$i$i98 = $conv$i$i$i97 & 128;
 $tobool$i$i$i99 = ($and$i$i$i98|0)!=(0);
 if ($tobool$i$i$i99) {
  $this$addr$i17$i$i79 = $this1$i$i89;
  $this1$i18$i$i100 = $this$addr$i17$i$i79;
  $this$addr$i$i16$i$i78 = $this1$i18$i$i100;
  $this1$i$i20$i$i102 = $this$addr$i$i16$i$i78;
  $this$addr$i$i$i15$i$i77 = $this1$i$i20$i$i102;
  $this1$i$i$i21$i$i103 = $this$addr$i$i$i15$i$i77;
  $__size_$i23$i$i106 = ((($this1$i$i$i21$i$i103)) + 4|0);
  $9 = HEAP32[$__size_$i23$i$i106>>2]|0;
  $cond$i$i117 = $9;
 } else {
  $this$addr$i6$i$i82 = $this1$i$i89;
  $this1$i7$i$i108 = $this$addr$i6$i$i82;
  $this$addr$i$i5$i$i81 = $this1$i7$i$i108;
  $this1$i$i9$i$i110 = $this$addr$i$i5$i$i81;
  $this$addr$i$i$i4$i$i80 = $this1$i$i9$i$i110;
  $this1$i$i$i10$i$i111 = $this$addr$i$i$i4$i$i80;
  $10 = ((($this1$i$i$i10$i$i111)) + 11|0);
  $11 = HEAP8[$10>>0]|0;
  $conv$i14$i$i115 = $11&255;
  $cond$i$i117 = $conv$i14$i$i115;
 }
 $12 = $wt;
 HEAP32[$12>>2] = $cond$i$i117;
 $13 = $wt;
 $data = ((($13)) + 4|0);
 $14 = $v$addr;
 $this$addr$i54 = $14;
 $this1$i55 = $this$addr$i54;
 $this$addr$i$i53 = $this1$i55;
 $this1$i$i56 = $this$addr$i$i53;
 $this$addr$i$i$i52 = $this1$i$i56;
 $this1$i$i$i57 = $this$addr$i$i$i52;
 $this$addr$i$i$i$i51 = $this1$i$i$i57;
 $this1$i$i$i$i59 = $this$addr$i$i$i$i51;
 $this$addr$i$i$i$i$i50 = $this1$i$i$i$i59;
 $this1$i$i$i$i$i60 = $this$addr$i$i$i$i$i50;
 $15 = ((($this1$i$i$i$i$i60)) + 11|0);
 $16 = HEAP8[$15>>0]|0;
 $conv$i$i$i64 = $16&255;
 $and$i$i$i65 = $conv$i$i$i64 & 128;
 $tobool$i$i$i66 = ($and$i$i$i65|0)!=(0);
 if ($tobool$i$i$i66) {
  $this$addr$i15$i$i = $this1$i$i56;
  $this1$i16$i$i = $this$addr$i15$i$i;
  $this$addr$i$i14$i$i = $this1$i16$i$i;
  $this1$i$i18$i$i = $this$addr$i$i14$i$i;
  $this$addr$i$i$i13$i$i = $this1$i$i18$i$i;
  $this1$i$i$i19$i$i = $this$addr$i$i$i13$i$i;
  $17 = HEAP32[$this1$i$i$i19$i$i>>2]|0;
  $cond$i$i76 = $17;
 } else {
  $this$addr$i6$i$i49 = $this1$i$i56;
  $this1$i7$i$i69 = $this$addr$i6$i$i49;
  $this$addr$i$i5$i$i48 = $this1$i7$i$i69;
  $this1$i$i9$i$i71 = $this$addr$i$i5$i$i48;
  $this$addr$i$i$i4$i$i47 = $this1$i$i9$i$i71;
  $this1$i$i$i10$i$i72 = $this$addr$i$i$i4$i$i47;
  $__r$addr$i$i$i$i = $this1$i$i$i10$i$i72;
  $18 = $__r$addr$i$i$i$i;
  $__x$addr$i$i$i$i$i = $18;
  $19 = $__x$addr$i$i$i$i$i;
  $cond$i$i76 = $19;
 }
 $__p$addr$i$i = $cond$i$i76;
 $20 = $__p$addr$i$i;
 $21 = $v$addr;
 $this$addr$i15 = $21;
 $this1$i16 = $this$addr$i15;
 $this$addr$i$i14 = $this1$i16;
 $this1$i$i17 = $this$addr$i$i14;
 $this$addr$i$i$i13 = $this1$i$i17;
 $this1$i$i$i18 = $this$addr$i$i$i13;
 $this$addr$i$i$i$i12 = $this1$i$i$i18;
 $this1$i$i$i$i20 = $this$addr$i$i$i$i12;
 $this$addr$i$i$i$i$i11 = $this1$i$i$i$i20;
 $this1$i$i$i$i$i21 = $this$addr$i$i$i$i$i11;
 $22 = ((($this1$i$i$i$i$i21)) + 11|0);
 $23 = HEAP8[$22>>0]|0;
 $conv$i$i$i25 = $23&255;
 $and$i$i$i26 = $conv$i$i$i25 & 128;
 $tobool$i$i$i27 = ($and$i$i$i26|0)!=(0);
 if ($tobool$i$i$i27) {
  $this$addr$i17$i$i7 = $this1$i$i17;
  $this1$i18$i$i28 = $this$addr$i17$i$i7;
  $this$addr$i$i16$i$i6 = $this1$i18$i$i28;
  $this1$i$i20$i$i30 = $this$addr$i$i16$i$i6;
  $this$addr$i$i$i15$i$i5 = $this1$i$i20$i$i30;
  $this1$i$i$i21$i$i31 = $this$addr$i$i$i15$i$i5;
  $__size_$i23$i$i34 = ((($this1$i$i$i21$i$i31)) + 4|0);
  $24 = HEAP32[$__size_$i23$i$i34>>2]|0;
  $cond$i$i45 = $24;
  _memcpy(($data|0),($20|0),($cond$i$i45|0))|0;
  $27 = $wt;
  STACKTOP = sp;return ($27|0);
 } else {
  $this$addr$i6$i$i10 = $this1$i$i17;
  $this1$i7$i$i36 = $this$addr$i6$i$i10;
  $this$addr$i$i5$i$i9 = $this1$i7$i$i36;
  $this1$i$i9$i$i38 = $this$addr$i$i5$i$i9;
  $this$addr$i$i$i4$i$i8 = $this1$i$i9$i$i38;
  $this1$i$i$i10$i$i39 = $this$addr$i$i$i4$i$i8;
  $25 = ((($this1$i$i$i10$i$i39)) + 11|0);
  $26 = HEAP8[$25>>0]|0;
  $conv$i14$i$i43 = $26&255;
  $cond$i$i45 = $conv$i14$i$i43;
  _memcpy(($data|0),($20|0),($cond$i$i45|0))|0;
  $27 = $wt;
  STACKTOP = sp;return ($27|0);
 }
 return (0)|0;
}
function __ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE12fromWireTypeEPNS9_Ut_E($agg$result,$v) {
 $agg$result = $agg$result|0;
 $v = $v|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $__n$addr$i = 0, $__s$addr$i = 0, $data = 0, $this$addr$i = 0, $this$addr$i$i = 0, $this$addr$i$i$i = 0, $this$addr$i$i$i$i = 0, $this1$i = 0, $this1$i$i = 0, $this1$i$i$i = 0, $v$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $v$addr = $v;
 $0 = $v$addr;
 $data = ((($0)) + 4|0);
 $1 = $v$addr;
 $2 = HEAP32[$1>>2]|0;
 $this$addr$i = $agg$result;
 $__s$addr$i = $data;
 $__n$addr$i = $2;
 $this1$i = $this$addr$i;
 $this$addr$i$i = $this1$i;
 $this1$i$i = $this$addr$i$i;
 $this$addr$i$i$i = $this1$i$i;
 $this1$i$i$i = $this$addr$i$i$i;
 $this$addr$i$i$i$i = $this1$i$i$i;
 ;HEAP32[$this1$i$i$i>>2]=0|0;HEAP32[$this1$i$i$i+4>>2]=0|0;HEAP32[$this1$i$i$i+8>>2]=0|0;
 $3 = $__s$addr$i;
 $4 = $__n$addr$i;
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6__initEPKcj($this1$i,$3,$4);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEES9_EEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (472|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (1245|0);
}
function __GLOBAL__sub_I_md5_cpp() {
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
 __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev(3521);
 return;
}
function __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev($this) {
 $this = $this|0;
 var $call = 0, $call2 = 0, $call3 = 0, $call4 = 0, $call5 = 0, $call6 = 0, $this$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $this$addr = $this;
 $call = (__ZN10emscripten8internal6TypeIDIvE3getEv()|0);
 __embind_register_void(($call|0),(1249|0));
 $call2 = (__ZN10emscripten8internal6TypeIDIbE3getEv()|0);
 __embind_register_bool(($call2|0),(1254|0),1,1,0);
 __ZN12_GLOBAL__N_1L16register_integerIcEEvPKc(1259);
 __ZN12_GLOBAL__N_1L16register_integerIaEEvPKc(1264);
 __ZN12_GLOBAL__N_1L16register_integerIhEEvPKc(1276);
 __ZN12_GLOBAL__N_1L16register_integerIsEEvPKc(1290);
 __ZN12_GLOBAL__N_1L16register_integerItEEvPKc(1296);
 __ZN12_GLOBAL__N_1L16register_integerIiEEvPKc(1311);
 __ZN12_GLOBAL__N_1L16register_integerIjEEvPKc(1315);
 __ZN12_GLOBAL__N_1L16register_integerIlEEvPKc(1328);
 __ZN12_GLOBAL__N_1L16register_integerImEEvPKc(1333);
 __ZN12_GLOBAL__N_1L14register_floatIfEEvPKc(1347);
 __ZN12_GLOBAL__N_1L14register_floatIdEEvPKc(1353);
 $call3 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0);
 __embind_register_std_string(($call3|0),(1360|0));
 $call4 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv()|0);
 __embind_register_std_string(($call4|0),(1372|0));
 $call5 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv()|0);
 __embind_register_std_wstring(($call5|0),4,(1405|0));
 $call6 = (__ZN10emscripten8internal6TypeIDINS_3valEE3getEv()|0);
 __embind_register_emval(($call6|0),(1418|0));
 __ZN12_GLOBAL__N_1L20register_memory_viewIcEEvPKc(1434);
 __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc(1464);
 __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc(1501);
 __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc(1540);
 __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc(1571);
 __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc(1611);
 __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc(1640);
 __ZN12_GLOBAL__N_1L20register_memory_viewIlEEvPKc(1678);
 __ZN12_GLOBAL__N_1L20register_memory_viewImEEvPKc(1708);
 __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc(1747);
 __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc(1779);
 __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc(1812);
 __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc(1845);
 __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc(1879);
 __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc(1912);
 __ZN12_GLOBAL__N_1L20register_memory_viewIfEEvPKc(1946);
 __ZN12_GLOBAL__N_1L20register_memory_viewIdEEvPKc(1977);
 __ZN12_GLOBAL__N_1L20register_memory_viewIeEEvPKc(2009);
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
 return (40|0);
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
 return (48|0);
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
 return (56|0);
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
 return (64|0);
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
 return (72|0);
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
 return (80|0);
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
 return (88|0);
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
 return (96|0);
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
 return (104|0);
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
 return (112|0);
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
 return (120|0);
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
 return (128|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_3valEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (136|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (144|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (168|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (16|0);
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
 return (448|0);
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
 return (440|0);
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
 return (432|0);
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
 return (424|0);
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
 return (416|0);
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
 return (408|0);
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
 return (400|0);
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
 return (392|0);
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
 return (376|0);
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
 return (384|0);
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
 return (368|0);
}
function __ZN10emscripten8internal11LightTypeIDIbE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (360|0);
}
function __ZN10emscripten8internal11LightTypeIDIvE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (352|0);
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
function _emscripten_get_global_libc() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (2944|0);
}
function ___stdio_close($f) {
 $f = $f|0;
 var $0 = 0, $call = 0, $call1 = 0, $call2 = 0, $fd = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $fd = ((($f)) + 60|0);
 $0 = HEAP32[$fd>>2]|0;
 $call = (_dummy_570($0)|0);
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
function _pthread_self() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (480|0);
}
function _dummy_570($fd) {
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
 HEAP32[$write>>2] = 34;
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
 ___lock((3008|0));
 return (3016|0);
}
function ___ofl_unlock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___unlock((3008|0));
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
   $1 = HEAP32[212]|0;
   $tobool5 = ($1|0)==(0|0);
   if ($tobool5) {
    $cond10 = 0;
   } else {
    $2 = HEAP32[212]|0;
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
     $3 = HEAP32[$lock14>>2]|0;
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
   $0 = HEAP32[$lock>>2]|0;
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
  (FUNCTION_TABLE_iiii[$2 & 63]($f,0,0)|0);
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
   (FUNCTION_TABLE_iiii[$6 & 63]($f,$sub$ptr$sub,1)|0);
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
function _malloc($bytes) {
 $bytes = $bytes|0;
 var $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i175 = 0, $$pre$i178 = 0, $$pre$i45$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i176Z2D = 0, $$pre$phi$i46$iZ2D = 0, $$pre$phi$iZ2D = 0, $$pre$phiZ2D = 0, $$pre5$i$i = 0, $$sink$i = 0, $$sink$i$i = 0, $$sink$i154 = 0, $$sink2$i = 0, $$sink2$i172 = 0, $$sink5$i = 0, $$v$0$i = 0, $0 = 0;
 var $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0;
 var $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0;
 var $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0;
 var $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0;
 var $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0;
 var $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0;
 var $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0;
 var $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0;
 var $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0;
 var $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $F$0$i$i = 0, $F104$0 = 0, $F197$0$i = 0, $F224$0$i$i = 0, $F290$0$i = 0, $I252$0$i$i = 0, $I316$0$i = 0, $I57$0$i$i = 0, $K105$0$i$i = 0, $K305$0$i$i = 0, $K373$0$i = 0, $R$1$i = 0, $R$1$i$i = 0, $R$1$i165 = 0, $R$3$i = 0;
 var $R$3$i$i = 0, $R$3$i168 = 0, $RP$1$i = 0, $RP$1$i$i = 0, $RP$1$i164 = 0, $T$0$i = 0, $T$0$i$i = 0, $T$0$i47$i = 0, $add$i = 0, $add$i$i = 0, $add$i145 = 0, $add$i179 = 0, $add$ptr = 0, $add$ptr$i = 0, $add$ptr$i$i = 0, $add$ptr$i$i$i = 0, $add$ptr$i158 = 0, $add$ptr$i16$i = 0, $add$ptr$i192 = 0, $add$ptr$i2$i$i = 0;
 var $add$ptr$i21$i = 0, $add$ptr$i49$i = 0, $add$ptr14$i$i = 0, $add$ptr15$i$i = 0, $add$ptr16$i$i = 0, $add$ptr166 = 0, $add$ptr169 = 0, $add$ptr17$i$i = 0, $add$ptr178 = 0, $add$ptr181$i = 0, $add$ptr182 = 0, $add$ptr189$i = 0, $add$ptr190$i = 0, $add$ptr193 = 0, $add$ptr199 = 0, $add$ptr2$i$i = 0, $add$ptr205$i$i = 0, $add$ptr212$i$i = 0, $add$ptr225$i = 0, $add$ptr227$i = 0;
 var $add$ptr24$i$i = 0, $add$ptr262$i = 0, $add$ptr269$i = 0, $add$ptr273$i = 0, $add$ptr282$i = 0, $add$ptr3$i$i = 0, $add$ptr30$i$i = 0, $add$ptr369$i$i = 0, $add$ptr4$i$i = 0, $add$ptr4$i$i$i = 0, $add$ptr4$i26$i = 0, $add$ptr4$i54$i = 0, $add$ptr441$i = 0, $add$ptr5$i$i = 0, $add$ptr6$i$i = 0, $add$ptr6$i$i$i = 0, $add$ptr6$i58$i = 0, $add$ptr7$i$i = 0, $add$ptr81$i$i = 0, $add$ptr95 = 0;
 var $add$ptr98 = 0, $add10$i = 0, $add101$i = 0, $add110$i = 0, $add13$i = 0, $add14$i = 0, $add140$i = 0, $add144 = 0, $add150$i = 0, $add17$i = 0, $add17$i182 = 0, $add177$i = 0, $add18$i = 0, $add19$i = 0, $add2 = 0, $add20$i = 0, $add206$i$i = 0, $add212$i = 0, $add215$i = 0, $add22$i = 0;
 var $add246$i = 0, $add26$i$i = 0, $add268$i = 0, $add269$i$i = 0, $add274$i$i = 0, $add278$i$i = 0, $add280$i$i = 0, $add283$i$i = 0, $add337$i = 0, $add342$i = 0, $add346$i = 0, $add348$i = 0, $add351$i = 0, $add46$i = 0, $add50 = 0, $add51$i = 0, $add54 = 0, $add54$i = 0, $add58 = 0, $add62 = 0;
 var $add64 = 0, $add74$i$i = 0, $add77$i = 0, $add78$i = 0, $add79$i$i = 0, $add8 = 0, $add82$i = 0, $add83$i$i = 0, $add85$i$i = 0, $add86$i = 0, $add88$i$i = 0, $add9$i = 0, $add90$i = 0, $add92$i = 0, $and = 0, $and$i = 0, $and$i$i = 0, $and$i$i$i = 0, $and$i142 = 0, $and$i17$i = 0;
 var $and$i22$i = 0, $and$i50$i = 0, $and100$i = 0, $and103$i = 0, $and104$i = 0, $and106 = 0, $and11$add51$i = 0, $and11$i = 0, $and119$i$i = 0, $and12$i = 0, $and13$i = 0, $and13$i$i = 0, $and133$i$i = 0, $and14 = 0, $and145 = 0, $and17$i = 0, $and194$i = 0, $and194$i203 = 0, $and199$i = 0, $and209$i$i = 0;
 var $and21$i = 0, $and21$i148 = 0, $and227$i$i = 0, $and236$i = 0, $and264$i$i = 0, $and268$i$i = 0, $and273$i$i = 0, $and282$i$i = 0, $and29$i = 0, $and292$i = 0, $and295$i$i = 0, $and3$i = 0, $and3$i$i = 0, $and3$i$i$i = 0, $and3$i24$i = 0, $and3$i52$i = 0, $and30$i = 0, $and318$i$i = 0, $and32$i = 0, $and32$i$i = 0;
 var $and33$i$i = 0, $and331$i = 0, $and336$i = 0, $and341$i = 0, $and350$i = 0, $and363$i = 0, $and37$i$i = 0, $and387$i = 0, $and4 = 0, $and40$i$i = 0, $and41 = 0, $and42$i = 0, $and43 = 0, $and46 = 0, $and49 = 0, $and49$i = 0, $and49$i$i = 0, $and53 = 0, $and57 = 0, $and6$i = 0;
 var $and6$i$i = 0, $and6$i10$i = 0, $and6$i27$i = 0, $and61 = 0, $and64$i = 0, $and68$i = 0, $and69$i$i = 0, $and7 = 0, $and73$i = 0, $and73$i$i = 0, $and74 = 0, $and77$i = 0, $and78$i$i = 0, $and8$i = 0, $and80$i = 0, $and81$i = 0, $and85$i = 0, $and87$i$i = 0, $and89$i = 0, $and9$i = 0;
 var $and96$i$i = 0, $arrayidx = 0, $arrayidx$i = 0, $arrayidx$i$i = 0, $arrayidx$i14$i = 0, $arrayidx$i149 = 0, $arrayidx$i37$i = 0, $arrayidx103 = 0, $arrayidx103$i$i = 0, $arrayidx106$i = 0, $arrayidx107$i$i = 0, $arrayidx113$i = 0, $arrayidx113$i155 = 0, $arrayidx121$i = 0, $arrayidx123$i$i = 0, $arrayidx126$i$i = 0, $arrayidx137$i = 0, $arrayidx143$i$i = 0, $arrayidx148$i = 0, $arrayidx151$i = 0;
 var $arrayidx151$i$i = 0, $arrayidx154$i = 0, $arrayidx155$i = 0, $arrayidx161$i = 0, $arrayidx165$i = 0, $arrayidx165$i166 = 0, $arrayidx178$i$i = 0, $arrayidx184$i = 0, $arrayidx184$i$i = 0, $arrayidx195$i$i = 0, $arrayidx196$i = 0, $arrayidx204$i = 0, $arrayidx212$i = 0, $arrayidx223$i$i = 0, $arrayidx228$i = 0, $arrayidx23$i = 0, $arrayidx233$i = 0, $arrayidx239$i = 0, $arrayidx245$i = 0, $arrayidx256$i = 0;
 var $arrayidx27$i = 0, $arrayidx276$i = 0, $arrayidx287$i$i = 0, $arrayidx289$i = 0, $arrayidx290$i$i = 0, $arrayidx325$i$i = 0, $arrayidx355$i = 0, $arrayidx358$i = 0, $arrayidx394$i = 0, $arrayidx40$i = 0, $arrayidx44$i = 0, $arrayidx61$i = 0, $arrayidx65$i = 0, $arrayidx66 = 0, $arrayidx71$i = 0, $arrayidx75$i = 0, $arrayidx91$i$i = 0, $arrayidx92$i$i = 0, $arrayidx94$i = 0, $arrayidx94$i153 = 0;
 var $arrayidx96$i$i = 0, $bk = 0, $bk$i = 0, $bk$i$i = 0, $bk$i160 = 0, $bk$i35$i = 0, $bk102$i$i = 0, $bk122 = 0, $bk124 = 0, $bk136$i = 0, $bk139$i$i = 0, $bk158$i$i = 0, $bk161$i$i = 0, $bk218$i = 0, $bk220$i = 0, $bk246$i$i = 0, $bk248$i$i = 0, $bk302$i$i = 0, $bk311$i = 0, $bk313$i = 0;
 var $bk338$i$i = 0, $bk357$i$i = 0, $bk360$i$i = 0, $bk370$i = 0, $bk407$i = 0, $bk429$i = 0, $bk43$i$i = 0, $bk432$i = 0, $bk47$i = 0, $bk55$i$i = 0, $bk67$i$i = 0, $bk74$i$i = 0, $bk78 = 0, $bk82$i$i = 0, $br$2$ph$i = 0, $call107$i = 0, $call131$i = 0, $call132$i = 0, $call275$i = 0, $call37$i = 0;
 var $call68$i = 0, $call83$i = 0, $child$i$i = 0, $child166$i$i = 0, $child289$i$i = 0, $child357$i = 0, $cmp = 0, $cmp$i = 0, $cmp$i$i$i = 0, $cmp$i11$i = 0, $cmp$i177 = 0, $cmp$i18$i = 0, $cmp$i23$i = 0, $cmp$i3$i$i = 0, $cmp$i51$i = 0, $cmp$i9$i = 0, $cmp1 = 0, $cmp1$i = 0, $cmp10 = 0, $cmp100$i$i = 0;
 var $cmp102$i = 0, $cmp104$i$i = 0, $cmp105$i = 0, $cmp106$i$i = 0, $cmp107$i = 0, $cmp108$i = 0, $cmp108$i$i = 0, $cmp112$i$i = 0, $cmp113 = 0, $cmp116$i = 0, $cmp118$i = 0, $cmp119$i = 0, $cmp12$i = 0, $cmp120$i$i = 0, $cmp120$i42$i = 0, $cmp121$i = 0, $cmp123$i = 0, $cmp124$i$i = 0, $cmp126$i = 0, $cmp127$i = 0;
 var $cmp128 = 0, $cmp128$i = 0, $cmp128$i$i = 0, $cmp130$i = 0, $cmp133$i = 0, $cmp133$i$i = 0, $cmp133$i195 = 0, $cmp135$i = 0, $cmp137$i = 0, $cmp137$i$i = 0, $cmp137$i196 = 0, $cmp138$i = 0, $cmp139 = 0, $cmp140$i = 0, $cmp141$i = 0, $cmp142$i = 0, $cmp146 = 0, $cmp147$i = 0, $cmp14799$i = 0, $cmp15 = 0;
 var $cmp15$i = 0, $cmp151$i = 0, $cmp152$i = 0, $cmp153$i$i = 0, $cmp155$i = 0, $cmp156 = 0, $cmp156$i = 0, $cmp156$i$i = 0, $cmp157$i = 0, $cmp159$i = 0, $cmp159$i198 = 0, $cmp16 = 0, $cmp160$i$i = 0, $cmp162 = 0, $cmp162$i = 0, $cmp162$i199 = 0, $cmp166$i = 0, $cmp168$i$i = 0, $cmp171$i = 0, $cmp172$i$i = 0;
 var $cmp174$i = 0, $cmp180$i = 0, $cmp185$i = 0, $cmp185$i$i = 0, $cmp186 = 0, $cmp186$i = 0, $cmp189$i$i = 0, $cmp19$i = 0, $cmp190$i = 0, $cmp191$i = 0, $cmp198$i = 0, $cmp2$i$i = 0, $cmp2$i$i$i = 0, $cmp20$i$i = 0, $cmp203$i = 0, $cmp208$i = 0, $cmp209$i = 0, $cmp21$i = 0, $cmp215$i$i = 0, $cmp217$i = 0;
 var $cmp218$i = 0, $cmp221$i = 0, $cmp224$i = 0, $cmp228$i = 0, $cmp229$i = 0, $cmp233$i = 0, $cmp236$i$i = 0, $cmp24$i = 0, $cmp24$i$i = 0, $cmp246$i = 0, $cmp250$i = 0, $cmp254$i$i = 0, $cmp257$i = 0, $cmp258$i$i = 0, $cmp26$i = 0, $cmp265$i = 0, $cmp27$i$i = 0, $cmp28$i = 0, $cmp28$i$i = 0, $cmp284$i = 0;
 var $cmp287$i = 0, $cmp29 = 0, $cmp3$i$i = 0, $cmp301$i = 0, $cmp306$i$i = 0, $cmp31 = 0, $cmp319$i = 0, $cmp319$i$i = 0, $cmp32$i = 0, $cmp32$i184 = 0, $cmp323$i = 0, $cmp327$i$i = 0, $cmp33$i = 0, $cmp332$i$i = 0, $cmp34$i = 0, $cmp34$i$i = 0, $cmp35$i = 0, $cmp350$i$i = 0, $cmp36$i = 0, $cmp36$i$i = 0;
 var $cmp374$i = 0, $cmp38$i = 0, $cmp38$i$i = 0, $cmp388$i = 0, $cmp396$i = 0, $cmp40$i = 0, $cmp401$i = 0, $cmp41$i$i = 0, $cmp42$i$i = 0, $cmp422$i = 0, $cmp43$i = 0, $cmp44$i$i = 0, $cmp45$i = 0, $cmp45$i152 = 0, $cmp46$i = 0, $cmp46$i$i = 0, $cmp46$i38$i = 0, $cmp48$i = 0, $cmp49$i = 0, $cmp5 = 0;
 var $cmp51$i = 0, $cmp54$i$i = 0, $cmp55$i = 0, $cmp55$i185 = 0, $cmp57$i = 0, $cmp57$i$i = 0, $cmp57$i186 = 0, $cmp59$i$i = 0, $cmp60$i = 0, $cmp60$i$i = 0, $cmp62$i = 0, $cmp63$i = 0, $cmp63$i$i = 0, $cmp65$i = 0, $cmp66$i = 0, $cmp66$i189 = 0, $cmp69$i = 0, $cmp7$i$i = 0, $cmp70 = 0, $cmp72$i = 0;
 var $cmp75$i$i = 0, $cmp76 = 0, $cmp76$i = 0, $cmp79 = 0, $cmp81$i = 0, $cmp81$i$i = 0, $cmp81$i190 = 0, $cmp83$i$i = 0, $cmp85$i = 0, $cmp86$i$i = 0, $cmp89$i = 0, $cmp9$i$i = 0, $cmp90$i = 0, $cmp91$i = 0, $cmp93$i = 0, $cmp95$i = 0, $cmp96$i = 0, $cmp97$i = 0, $cmp97$i$i = 0, $cmp977$i = 0;
 var $cmp99 = 0, $cond = 0, $cond$i = 0, $cond$i$i = 0, $cond$i$i$i = 0, $cond$i150 = 0, $cond$i19$i = 0, $cond$i25$i = 0, $cond$i53$i = 0, $cond115$i$i = 0, $cond13$i$i = 0, $cond15$i$i = 0, $cond2$i$i = 0, $cond3$i = 0, $cond315$i$i = 0, $cond383$i = 0, $exitcond$i$i = 0, $fd$i = 0, $fd$i$i = 0, $fd$i161 = 0;
 var $fd103$i$i = 0, $fd123 = 0, $fd139$i = 0, $fd140$i$i = 0, $fd148$i$i = 0, $fd160$i$i = 0, $fd219$i = 0, $fd247$i$i = 0, $fd303$i$i = 0, $fd312$i = 0, $fd339$i$i = 0, $fd344$i$i = 0, $fd359$i$i = 0, $fd371$i = 0, $fd408$i = 0, $fd416$i = 0, $fd431$i = 0, $fd50$i = 0, $fd54$i$i = 0, $fd59$i$i = 0;
 var $fd68$pre$phi$i$iZ2D = 0, $fd69 = 0, $fd78$i$i = 0, $fd85$i$i = 0, $fd9 = 0, $head = 0, $head$i = 0, $head$i$i = 0, $head$i$i$i = 0, $head$i151 = 0, $head$i20$i = 0, $head$i31$i = 0, $head$i57$i = 0, $head118$i$i = 0, $head168 = 0, $head173 = 0, $head177 = 0, $head179 = 0, $head179$i = 0, $head182$i = 0;
 var $head187$i = 0, $head189$i = 0, $head195 = 0, $head198 = 0, $head208$i$i = 0, $head211$i$i = 0, $head23$i$i = 0, $head25 = 0, $head26$i$i = 0, $head265$i = 0, $head268$i = 0, $head271$i = 0, $head274$i = 0, $head279$i = 0, $head281$i = 0, $head29$i = 0, $head29$i$i = 0, $head317$i$i = 0, $head32$i$i = 0, $head34$i$i = 0;
 var $head386$i = 0, $head7$i$i = 0, $head7$i$i$i = 0, $head7$i59$i = 0, $head94 = 0, $head97 = 0, $head99$i = 0, $i$01$i$i = 0, $idx$0$i = 0, $inc$i$i = 0, $index$i = 0, $index$i$i = 0, $index$i169 = 0, $index$i43$i = 0, $index288$i$i = 0, $index356$i = 0, $magic$i$i = 0, $nb$0 = 0, $neg = 0, $neg$i = 0;
 var $neg$i$i = 0, $neg$i170 = 0, $neg$i181 = 0, $neg103$i = 0, $neg13 = 0, $neg132$i$i = 0, $neg48$i = 0, $neg73 = 0, $next$i = 0, $next$i$i = 0, $next$i$i$i = 0, $next231$i = 0, $not$cmp$i = 0, $not$cmp107$i = 0, $not$cmp114$i = 0, $not$cmp141$i = 0, $not$cmp144$i$i = 0, $not$cmp150$i$i = 0, $not$cmp205$i = 0, $not$cmp346$i$i = 0;
 var $not$cmp4$i = 0, $not$cmp418$i = 0, $not$cmp494$i = 0, $oldfirst$0$i$i = 0, $or$cond$i = 0, $or$cond$i187 = 0, $or$cond1$i = 0, $or$cond1$i183 = 0, $or$cond2$i = 0, $or$cond3$i = 0, $or$cond4$i = 0, $or$cond5$i = 0, $or$cond7$i = 0, $or$cond7$not$i = 0, $or$cond8$i = 0, $or$cond97$i = 0, $or$cond98$i = 0, $or$i = 0, $or$i$i = 0, $or$i$i$i = 0;
 var $or$i194 = 0, $or$i56$i = 0, $or101$i$i = 0, $or110 = 0, $or167 = 0, $or172 = 0, $or176 = 0, $or178$i = 0, $or180 = 0, $or183$i = 0, $or186$i = 0, $or188$i = 0, $or19$i$i = 0, $or194 = 0, $or197 = 0, $or204$i = 0, $or210$i$i = 0, $or22$i$i = 0, $or23 = 0, $or232$i$i = 0;
 var $or26 = 0, $or264$i = 0, $or267$i = 0, $or270$i = 0, $or275$i = 0, $or278$i = 0, $or28$i$i = 0, $or280$i = 0, $or297$i = 0, $or300$i$i = 0, $or33$i$i = 0, $or368$i = 0, $or40 = 0, $or44$i$i = 0, $or93 = 0, $or96 = 0, $parent$i = 0, $parent$i$i = 0, $parent$i159 = 0, $parent$i40$i = 0;
 var $parent135$i = 0, $parent138$i$i = 0, $parent149$i = 0, $parent162$i$i = 0, $parent165$i$i = 0, $parent166$i = 0, $parent179$i$i = 0, $parent196$i$i = 0, $parent226$i = 0, $parent240$i = 0, $parent257$i = 0, $parent301$i$i = 0, $parent337$i$i = 0, $parent361$i$i = 0, $parent369$i = 0, $parent406$i = 0, $parent433$i = 0, $qsize$0$i$i = 0, $retval$0 = 0, $rsize$0$i = 0;
 var $rsize$0$lcssa$i = 0, $rsize$08$i = 0, $rsize$1$i = 0, $rsize$3$i = 0, $rsize$4$lcssa$i = 0, $rsize$49$i = 0, $rst$0$i = 0, $rst$1$i = 0, $sflags193$i = 0, $sflags235$i = 0, $shl = 0, $shl$i = 0, $shl$i$i = 0, $shl$i13$i = 0, $shl$i143 = 0, $shl$i36$i = 0, $shl102 = 0, $shl105 = 0, $shl116$i$i = 0, $shl12 = 0;
 var $shl127$i$i = 0, $shl131$i$i = 0, $shl15$i = 0, $shl18$i = 0, $shl192$i = 0, $shl195$i = 0, $shl198$i = 0, $shl22 = 0, $shl222$i$i = 0, $shl226$i$i = 0, $shl265$i$i = 0, $shl270$i$i = 0, $shl276$i$i = 0, $shl279$i$i = 0, $shl288$i = 0, $shl291$i = 0, $shl294$i$i = 0, $shl31$i = 0, $shl316$i$i = 0, $shl326$i$i = 0;
 var $shl333$i = 0, $shl338$i = 0, $shl344$i = 0, $shl347$i = 0, $shl35 = 0, $shl362$i = 0, $shl37 = 0, $shl384$i = 0, $shl39$i$i = 0, $shl395$i = 0, $shl48$i$i = 0, $shl52$i = 0, $shl60$i = 0, $shl65 = 0, $shl70$i$i = 0, $shl72 = 0, $shl75$i$i = 0, $shl81$i$i = 0, $shl84$i$i = 0, $shl9$i = 0;
 var $shl90 = 0, $shl95$i$i = 0, $shr = 0, $shr$i = 0, $shr$i$i = 0, $shr$i139 = 0, $shr$i34$i = 0, $shr101 = 0, $shr11$i = 0, $shr11$i146 = 0, $shr110$i$i = 0, $shr12$i = 0, $shr124$i$i = 0, $shr15$i = 0, $shr16$i = 0, $shr16$i147 = 0, $shr19$i = 0, $shr194$i = 0, $shr20$i = 0, $shr214$i$i = 0;
 var $shr253$i$i = 0, $shr263$i$i = 0, $shr267$i$i = 0, $shr27$i = 0, $shr272$i$i = 0, $shr277$i$i = 0, $shr281$i$i = 0, $shr283$i = 0, $shr3 = 0, $shr310$i$i = 0, $shr318$i = 0, $shr323$i$i = 0, $shr330$i = 0, $shr335$i = 0, $shr340$i = 0, $shr345$i = 0, $shr349$i = 0, $shr378$i = 0, $shr392$i = 0, $shr4$i = 0;
 var $shr42$i = 0, $shr45 = 0, $shr47 = 0, $shr48 = 0, $shr5$i = 0, $shr5$i141 = 0, $shr51 = 0, $shr52 = 0, $shr55 = 0, $shr56 = 0, $shr58$i$i = 0, $shr59 = 0, $shr60 = 0, $shr63 = 0, $shr68$i$i = 0, $shr7$i = 0, $shr7$i144 = 0, $shr72$i = 0, $shr72$i$i = 0, $shr75$i = 0;
 var $shr76$i = 0, $shr77$i$i = 0, $shr79$i = 0, $shr8$i = 0, $shr80$i = 0, $shr82$i$i = 0, $shr83$i = 0, $shr84$i = 0, $shr86$i$i = 0, $shr87$i = 0, $shr88$i = 0, $shr91$i = 0, $size$i$i = 0, $size$i$i$i = 0, $size188$i = 0, $size245$i = 0, $sizebits$0$i = 0, $sizebits$0$shl52$i = 0, $sp$0$i$i = 0, $sp$0$i$i$i = 0;
 var $sp$0108$i = 0, $sp$1107$i = 0, $ssize$2$ph$i = 0, $sub = 0, $sub$i = 0, $sub$i138 = 0, $sub$i180 = 0, $sub$ptr$lhs$cast$i = 0, $sub$ptr$lhs$cast$i$i = 0, $sub$ptr$lhs$cast$i28$i = 0, $sub$ptr$rhs$cast$i = 0, $sub$ptr$rhs$cast$i$i = 0, $sub$ptr$rhs$cast$i29$i = 0, $sub$ptr$sub$i = 0, $sub$ptr$sub$i$i = 0, $sub$ptr$sub$i30$i = 0, $sub$ptr$sub$tsize$4$i = 0, $sub10$i = 0, $sub101$i = 0, $sub101$rsize$4$i = 0;
 var $sub112$i = 0, $sub113$i$i = 0, $sub118$i = 0, $sub14$i = 0, $sub16$i$i = 0, $sub160 = 0, $sub172$i = 0, $sub18$i$i = 0, $sub190 = 0, $sub2$i = 0, $sub22$i = 0, $sub260$i = 0, $sub262$i$i = 0, $sub266$i$i = 0, $sub271$i$i = 0, $sub275$i$i = 0, $sub30$i = 0, $sub31$i = 0, $sub31$rsize$0$i = 0, $sub313$i$i = 0;
 var $sub329$i = 0, $sub33$i = 0, $sub334$i = 0, $sub339$i = 0, $sub343$i = 0, $sub381$i = 0, $sub4$i = 0, $sub41$i = 0, $sub42 = 0, $sub44 = 0, $sub5$i$i = 0, $sub5$i$i$i = 0, $sub5$i55$i = 0, $sub50$i = 0, $sub6$i = 0, $sub63$i = 0, $sub67$i = 0, $sub67$i$i = 0, $sub70$i = 0, $sub71$i$i = 0;
 var $sub76$i$i = 0, $sub80$i$i = 0, $sub91 = 0, $sub99$i = 0, $t$0$i = 0, $t$2$i = 0, $t$4$ph$i = 0, $t$4$v$4$i = 0, $t$48$i = 0, $tbase$796$i = 0, $tobool$i$i = 0, $tobool107 = 0, $tobool195$i = 0, $tobool200$i = 0, $tobool228$i$i = 0, $tobool237$i = 0, $tobool293$i = 0, $tobool296$i$i = 0, $tobool30$i = 0, $tobool364$i = 0;
 var $tobool97$i$i = 0, $tsize$2657583$i = 0, $tsize$4$i = 0, $tsize$795$i = 0, $v$0$i = 0, $v$0$lcssa$i = 0, $v$09$i = 0, $v$1$i = 0, $v$3$i = 0, $v$4$lcssa$i = 0, $v$4$ph$i = 0, $v$410$i = 0, $xor$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $magic$i$i = sp;
 $cmp = ($bytes>>>0)<(245);
 do {
  if ($cmp) {
   $cmp1 = ($bytes>>>0)<(11);
   $add2 = (($bytes) + 11)|0;
   $and = $add2 & -8;
   $cond = $cmp1 ? 16 : $and;
   $shr = $cond >>> 3;
   $0 = HEAP32[755]|0;
   $shr3 = $0 >>> $shr;
   $and4 = $shr3 & 3;
   $cmp5 = ($and4|0)==(0);
   if (!($cmp5)) {
    $neg = $shr3 & 1;
    $and7 = $neg ^ 1;
    $add8 = (($and7) + ($shr))|0;
    $shl = $add8 << 1;
    $arrayidx = (3060 + ($shl<<2)|0);
    $1 = ((($arrayidx)) + 8|0);
    $2 = HEAP32[$1>>2]|0;
    $fd9 = ((($2)) + 8|0);
    $3 = HEAP32[$fd9>>2]|0;
    $cmp10 = ($arrayidx|0)==($3|0);
    do {
     if ($cmp10) {
      $shl12 = 1 << $add8;
      $neg13 = $shl12 ^ -1;
      $and14 = $0 & $neg13;
      HEAP32[755] = $and14;
     } else {
      $4 = HEAP32[(3036)>>2]|0;
      $cmp15 = ($3>>>0)<($4>>>0);
      if ($cmp15) {
       _abort();
       // unreachable;
      }
      $bk = ((($3)) + 12|0);
      $5 = HEAP32[$bk>>2]|0;
      $cmp16 = ($5|0)==($2|0);
      if ($cmp16) {
       HEAP32[$bk>>2] = $arrayidx;
       HEAP32[$1>>2] = $3;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $shl22 = $add8 << 3;
    $or23 = $shl22 | 3;
    $head = ((($2)) + 4|0);
    HEAP32[$head>>2] = $or23;
    $add$ptr = (($2) + ($shl22)|0);
    $head25 = ((($add$ptr)) + 4|0);
    $6 = HEAP32[$head25>>2]|0;
    $or26 = $6 | 1;
    HEAP32[$head25>>2] = $or26;
    $retval$0 = $fd9;
    STACKTOP = sp;return ($retval$0|0);
   }
   $7 = HEAP32[(3028)>>2]|0;
   $cmp29 = ($cond>>>0)>($7>>>0);
   if ($cmp29) {
    $cmp31 = ($shr3|0)==(0);
    if (!($cmp31)) {
     $shl35 = $shr3 << $shr;
     $shl37 = 2 << $shr;
     $sub = (0 - ($shl37))|0;
     $or40 = $shl37 | $sub;
     $and41 = $shl35 & $or40;
     $sub42 = (0 - ($and41))|0;
     $and43 = $and41 & $sub42;
     $sub44 = (($and43) + -1)|0;
     $shr45 = $sub44 >>> 12;
     $and46 = $shr45 & 16;
     $shr47 = $sub44 >>> $and46;
     $shr48 = $shr47 >>> 5;
     $and49 = $shr48 & 8;
     $add50 = $and49 | $and46;
     $shr51 = $shr47 >>> $and49;
     $shr52 = $shr51 >>> 2;
     $and53 = $shr52 & 4;
     $add54 = $add50 | $and53;
     $shr55 = $shr51 >>> $and53;
     $shr56 = $shr55 >>> 1;
     $and57 = $shr56 & 2;
     $add58 = $add54 | $and57;
     $shr59 = $shr55 >>> $and57;
     $shr60 = $shr59 >>> 1;
     $and61 = $shr60 & 1;
     $add62 = $add58 | $and61;
     $shr63 = $shr59 >>> $and61;
     $add64 = (($add62) + ($shr63))|0;
     $shl65 = $add64 << 1;
     $arrayidx66 = (3060 + ($shl65<<2)|0);
     $8 = ((($arrayidx66)) + 8|0);
     $9 = HEAP32[$8>>2]|0;
     $fd69 = ((($9)) + 8|0);
     $10 = HEAP32[$fd69>>2]|0;
     $cmp70 = ($arrayidx66|0)==($10|0);
     do {
      if ($cmp70) {
       $shl72 = 1 << $add64;
       $neg73 = $shl72 ^ -1;
       $and74 = $0 & $neg73;
       HEAP32[755] = $and74;
       $14 = $and74;
      } else {
       $11 = HEAP32[(3036)>>2]|0;
       $cmp76 = ($10>>>0)<($11>>>0);
       if ($cmp76) {
        _abort();
        // unreachable;
       }
       $bk78 = ((($10)) + 12|0);
       $12 = HEAP32[$bk78>>2]|0;
       $cmp79 = ($12|0)==($9|0);
       if ($cmp79) {
        HEAP32[$bk78>>2] = $arrayidx66;
        HEAP32[$8>>2] = $10;
        $14 = $0;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $shl90 = $add64 << 3;
     $sub91 = (($shl90) - ($cond))|0;
     $or93 = $cond | 3;
     $head94 = ((($9)) + 4|0);
     HEAP32[$head94>>2] = $or93;
     $add$ptr95 = (($9) + ($cond)|0);
     $or96 = $sub91 | 1;
     $head97 = ((($add$ptr95)) + 4|0);
     HEAP32[$head97>>2] = $or96;
     $add$ptr98 = (($add$ptr95) + ($sub91)|0);
     HEAP32[$add$ptr98>>2] = $sub91;
     $cmp99 = ($7|0)==(0);
     if (!($cmp99)) {
      $13 = HEAP32[(3040)>>2]|0;
      $shr101 = $7 >>> 3;
      $shl102 = $shr101 << 1;
      $arrayidx103 = (3060 + ($shl102<<2)|0);
      $shl105 = 1 << $shr101;
      $and106 = $14 & $shl105;
      $tobool107 = ($and106|0)==(0);
      if ($tobool107) {
       $or110 = $14 | $shl105;
       HEAP32[755] = $or110;
       $$pre = ((($arrayidx103)) + 8|0);
       $$pre$phiZ2D = $$pre;$F104$0 = $arrayidx103;
      } else {
       $15 = ((($arrayidx103)) + 8|0);
       $16 = HEAP32[$15>>2]|0;
       $17 = HEAP32[(3036)>>2]|0;
       $cmp113 = ($16>>>0)<($17>>>0);
       if ($cmp113) {
        _abort();
        // unreachable;
       } else {
        $$pre$phiZ2D = $15;$F104$0 = $16;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $13;
      $bk122 = ((($F104$0)) + 12|0);
      HEAP32[$bk122>>2] = $13;
      $fd123 = ((($13)) + 8|0);
      HEAP32[$fd123>>2] = $F104$0;
      $bk124 = ((($13)) + 12|0);
      HEAP32[$bk124>>2] = $arrayidx103;
     }
     HEAP32[(3028)>>2] = $sub91;
     HEAP32[(3040)>>2] = $add$ptr95;
     $retval$0 = $fd69;
     STACKTOP = sp;return ($retval$0|0);
    }
    $18 = HEAP32[(3024)>>2]|0;
    $cmp128 = ($18|0)==(0);
    if ($cmp128) {
     $nb$0 = $cond;
    } else {
     $sub$i = (0 - ($18))|0;
     $and$i = $18 & $sub$i;
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
     $arrayidx$i = (3324 + ($add20$i<<2)|0);
     $19 = HEAP32[$arrayidx$i>>2]|0;
     $head$i = ((($19)) + 4|0);
     $20 = HEAP32[$head$i>>2]|0;
     $and21$i = $20 & -8;
     $sub22$i = (($and21$i) - ($cond))|0;
     $arrayidx233$i = ((($19)) + 16|0);
     $21 = HEAP32[$arrayidx233$i>>2]|0;
     $not$cmp4$i = ($21|0)==(0|0);
     $$sink5$i = $not$cmp4$i&1;
     $arrayidx276$i = (((($19)) + 16|0) + ($$sink5$i<<2)|0);
     $22 = HEAP32[$arrayidx276$i>>2]|0;
     $cmp287$i = ($22|0)==(0|0);
     if ($cmp287$i) {
      $rsize$0$lcssa$i = $sub22$i;$v$0$lcssa$i = $19;
     } else {
      $23 = $22;$rsize$08$i = $sub22$i;$v$09$i = $19;
      while(1) {
       $head29$i = ((($23)) + 4|0);
       $24 = HEAP32[$head29$i>>2]|0;
       $and30$i = $24 & -8;
       $sub31$i = (($and30$i) - ($cond))|0;
       $cmp32$i = ($sub31$i>>>0)<($rsize$08$i>>>0);
       $sub31$rsize$0$i = $cmp32$i ? $sub31$i : $rsize$08$i;
       $$v$0$i = $cmp32$i ? $23 : $v$09$i;
       $arrayidx23$i = ((($23)) + 16|0);
       $25 = HEAP32[$arrayidx23$i>>2]|0;
       $not$cmp$i = ($25|0)==(0|0);
       $$sink$i = $not$cmp$i&1;
       $arrayidx27$i = (((($23)) + 16|0) + ($$sink$i<<2)|0);
       $26 = HEAP32[$arrayidx27$i>>2]|0;
       $cmp28$i = ($26|0)==(0|0);
       if ($cmp28$i) {
        $rsize$0$lcssa$i = $sub31$rsize$0$i;$v$0$lcssa$i = $$v$0$i;
        break;
       } else {
        $23 = $26;$rsize$08$i = $sub31$rsize$0$i;$v$09$i = $$v$0$i;
       }
      }
     }
     $27 = HEAP32[(3036)>>2]|0;
     $cmp33$i = ($v$0$lcssa$i>>>0)<($27>>>0);
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
     $28 = HEAP32[$parent$i>>2]|0;
     $bk$i = ((($v$0$lcssa$i)) + 12|0);
     $29 = HEAP32[$bk$i>>2]|0;
     $cmp40$i = ($29|0)==($v$0$lcssa$i|0);
     do {
      if ($cmp40$i) {
       $arrayidx61$i = ((($v$0$lcssa$i)) + 20|0);
       $33 = HEAP32[$arrayidx61$i>>2]|0;
       $cmp62$i = ($33|0)==(0|0);
       if ($cmp62$i) {
        $arrayidx65$i = ((($v$0$lcssa$i)) + 16|0);
        $34 = HEAP32[$arrayidx65$i>>2]|0;
        $cmp66$i = ($34|0)==(0|0);
        if ($cmp66$i) {
         $R$3$i = 0;
         break;
        } else {
         $R$1$i = $34;$RP$1$i = $arrayidx65$i;
        }
       } else {
        $R$1$i = $33;$RP$1$i = $arrayidx61$i;
       }
       while(1) {
        $arrayidx71$i = ((($R$1$i)) + 20|0);
        $35 = HEAP32[$arrayidx71$i>>2]|0;
        $cmp72$i = ($35|0)==(0|0);
        if (!($cmp72$i)) {
         $R$1$i = $35;$RP$1$i = $arrayidx71$i;
         continue;
        }
        $arrayidx75$i = ((($R$1$i)) + 16|0);
        $36 = HEAP32[$arrayidx75$i>>2]|0;
        $cmp76$i = ($36|0)==(0|0);
        if ($cmp76$i) {
         break;
        } else {
         $R$1$i = $36;$RP$1$i = $arrayidx75$i;
        }
       }
       $cmp81$i = ($RP$1$i>>>0)<($27>>>0);
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
       $30 = HEAP32[$fd$i>>2]|0;
       $cmp45$i = ($30>>>0)<($27>>>0);
       if ($cmp45$i) {
        _abort();
        // unreachable;
       }
       $bk47$i = ((($30)) + 12|0);
       $31 = HEAP32[$bk47$i>>2]|0;
       $cmp48$i = ($31|0)==($v$0$lcssa$i|0);
       if (!($cmp48$i)) {
        _abort();
        // unreachable;
       }
       $fd50$i = ((($29)) + 8|0);
       $32 = HEAP32[$fd50$i>>2]|0;
       $cmp51$i = ($32|0)==($v$0$lcssa$i|0);
       if ($cmp51$i) {
        HEAP32[$bk47$i>>2] = $29;
        HEAP32[$fd50$i>>2] = $30;
        $R$3$i = $29;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $cmp90$i = ($28|0)==(0|0);
     L73: do {
      if (!($cmp90$i)) {
       $index$i = ((($v$0$lcssa$i)) + 28|0);
       $37 = HEAP32[$index$i>>2]|0;
       $arrayidx94$i = (3324 + ($37<<2)|0);
       $38 = HEAP32[$arrayidx94$i>>2]|0;
       $cmp95$i = ($v$0$lcssa$i|0)==($38|0);
       do {
        if ($cmp95$i) {
         HEAP32[$arrayidx94$i>>2] = $R$3$i;
         $cond$i = ($R$3$i|0)==(0|0);
         if ($cond$i) {
          $shl$i = 1 << $37;
          $neg$i = $shl$i ^ -1;
          $and103$i = $18 & $neg$i;
          HEAP32[(3024)>>2] = $and103$i;
          break L73;
         }
        } else {
         $39 = HEAP32[(3036)>>2]|0;
         $cmp107$i = ($28>>>0)<($39>>>0);
         if ($cmp107$i) {
          _abort();
          // unreachable;
         } else {
          $arrayidx113$i = ((($28)) + 16|0);
          $40 = HEAP32[$arrayidx113$i>>2]|0;
          $not$cmp114$i = ($40|0)!=($v$0$lcssa$i|0);
          $$sink2$i = $not$cmp114$i&1;
          $arrayidx121$i = (((($28)) + 16|0) + ($$sink2$i<<2)|0);
          HEAP32[$arrayidx121$i>>2] = $R$3$i;
          $cmp126$i = ($R$3$i|0)==(0|0);
          if ($cmp126$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while(0);
       $41 = HEAP32[(3036)>>2]|0;
       $cmp130$i = ($R$3$i>>>0)<($41>>>0);
       if ($cmp130$i) {
        _abort();
        // unreachable;
       }
       $parent135$i = ((($R$3$i)) + 24|0);
       HEAP32[$parent135$i>>2] = $28;
       $arrayidx137$i = ((($v$0$lcssa$i)) + 16|0);
       $42 = HEAP32[$arrayidx137$i>>2]|0;
       $cmp138$i = ($42|0)==(0|0);
       do {
        if (!($cmp138$i)) {
         $cmp142$i = ($42>>>0)<($41>>>0);
         if ($cmp142$i) {
          _abort();
          // unreachable;
         } else {
          $arrayidx148$i = ((($R$3$i)) + 16|0);
          HEAP32[$arrayidx148$i>>2] = $42;
          $parent149$i = ((($42)) + 24|0);
          HEAP32[$parent149$i>>2] = $R$3$i;
          break;
         }
        }
       } while(0);
       $arrayidx154$i = ((($v$0$lcssa$i)) + 20|0);
       $43 = HEAP32[$arrayidx154$i>>2]|0;
       $cmp155$i = ($43|0)==(0|0);
       if (!($cmp155$i)) {
        $44 = HEAP32[(3036)>>2]|0;
        $cmp159$i = ($43>>>0)<($44>>>0);
        if ($cmp159$i) {
         _abort();
         // unreachable;
        } else {
         $arrayidx165$i = ((($R$3$i)) + 20|0);
         HEAP32[$arrayidx165$i>>2] = $43;
         $parent166$i = ((($43)) + 24|0);
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
      $45 = HEAP32[$head182$i>>2]|0;
      $or183$i = $45 | 1;
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
      $cmp191$i = ($7|0)==(0);
      if (!($cmp191$i)) {
       $46 = HEAP32[(3040)>>2]|0;
       $shr194$i = $7 >>> 3;
       $shl195$i = $shr194$i << 1;
       $arrayidx196$i = (3060 + ($shl195$i<<2)|0);
       $shl198$i = 1 << $shr194$i;
       $and199$i = $0 & $shl198$i;
       $tobool200$i = ($and199$i|0)==(0);
       if ($tobool200$i) {
        $or204$i = $0 | $shl198$i;
        HEAP32[755] = $or204$i;
        $$pre$i = ((($arrayidx196$i)) + 8|0);
        $$pre$phi$iZ2D = $$pre$i;$F197$0$i = $arrayidx196$i;
       } else {
        $47 = ((($arrayidx196$i)) + 8|0);
        $48 = HEAP32[$47>>2]|0;
        $49 = HEAP32[(3036)>>2]|0;
        $cmp208$i = ($48>>>0)<($49>>>0);
        if ($cmp208$i) {
         _abort();
         // unreachable;
        } else {
         $$pre$phi$iZ2D = $47;$F197$0$i = $48;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $46;
       $bk218$i = ((($F197$0$i)) + 12|0);
       HEAP32[$bk218$i>>2] = $46;
       $fd219$i = ((($46)) + 8|0);
       HEAP32[$fd219$i>>2] = $F197$0$i;
       $bk220$i = ((($46)) + 12|0);
       HEAP32[$bk220$i>>2] = $arrayidx196$i;
      }
      HEAP32[(3028)>>2] = $rsize$0$lcssa$i;
      HEAP32[(3040)>>2] = $add$ptr$i;
     }
     $add$ptr225$i = ((($v$0$lcssa$i)) + 8|0);
     $retval$0 = $add$ptr225$i;
     STACKTOP = sp;return ($retval$0|0);
    }
   } else {
    $nb$0 = $cond;
   }
  } else {
   $cmp139 = ($bytes>>>0)>(4294967231);
   if ($cmp139) {
    $nb$0 = -1;
   } else {
    $add144 = (($bytes) + 11)|0;
    $and145 = $add144 & -8;
    $50 = HEAP32[(3024)>>2]|0;
    $cmp146 = ($50|0)==(0);
    if ($cmp146) {
     $nb$0 = $and145;
    } else {
     $sub$i138 = (0 - ($and145))|0;
     $shr$i139 = $add144 >>> 8;
     $cmp$i = ($shr$i139|0)==(0);
     if ($cmp$i) {
      $idx$0$i = 0;
     } else {
      $cmp1$i = ($and145>>>0)>(16777215);
      if ($cmp1$i) {
       $idx$0$i = 31;
      } else {
       $sub4$i = (($shr$i139) + 1048320)|0;
       $shr5$i141 = $sub4$i >>> 16;
       $and$i142 = $shr5$i141 & 8;
       $shl$i143 = $shr$i139 << $and$i142;
       $sub6$i = (($shl$i143) + 520192)|0;
       $shr7$i144 = $sub6$i >>> 16;
       $and8$i = $shr7$i144 & 4;
       $add$i145 = $and8$i | $and$i142;
       $shl9$i = $shl$i143 << $and8$i;
       $sub10$i = (($shl9$i) + 245760)|0;
       $shr11$i146 = $sub10$i >>> 16;
       $and12$i = $shr11$i146 & 2;
       $add13$i = $add$i145 | $and12$i;
       $sub14$i = (14 - ($add13$i))|0;
       $shl15$i = $shl9$i << $and12$i;
       $shr16$i147 = $shl15$i >>> 15;
       $add17$i = (($sub14$i) + ($shr16$i147))|0;
       $shl18$i = $add17$i << 1;
       $add19$i = (($add17$i) + 7)|0;
       $shr20$i = $and145 >>> $add19$i;
       $and21$i148 = $shr20$i & 1;
       $add22$i = $and21$i148 | $shl18$i;
       $idx$0$i = $add22$i;
      }
     }
     $arrayidx$i149 = (3324 + ($idx$0$i<<2)|0);
     $51 = HEAP32[$arrayidx$i149>>2]|0;
     $cmp24$i = ($51|0)==(0|0);
     L117: do {
      if ($cmp24$i) {
       $rsize$3$i = $sub$i138;$t$2$i = 0;$v$3$i = 0;
       label = 81;
      } else {
       $cmp26$i = ($idx$0$i|0)==(31);
       $shr27$i = $idx$0$i >>> 1;
       $sub30$i = (25 - ($shr27$i))|0;
       $cond$i150 = $cmp26$i ? 0 : $sub30$i;
       $shl31$i = $and145 << $cond$i150;
       $rsize$0$i = $sub$i138;$rst$0$i = 0;$sizebits$0$i = $shl31$i;$t$0$i = $51;$v$0$i = 0;
       while(1) {
        $head$i151 = ((($t$0$i)) + 4|0);
        $52 = HEAP32[$head$i151>>2]|0;
        $and32$i = $52 & -8;
        $sub33$i = (($and32$i) - ($and145))|0;
        $cmp34$i = ($sub33$i>>>0)<($rsize$0$i>>>0);
        if ($cmp34$i) {
         $cmp36$i = ($sub33$i|0)==(0);
         if ($cmp36$i) {
          $rsize$49$i = 0;$t$48$i = $t$0$i;$v$410$i = $t$0$i;
          label = 85;
          break L117;
         } else {
          $rsize$1$i = $sub33$i;$v$1$i = $t$0$i;
         }
        } else {
         $rsize$1$i = $rsize$0$i;$v$1$i = $v$0$i;
        }
        $arrayidx40$i = ((($t$0$i)) + 20|0);
        $53 = HEAP32[$arrayidx40$i>>2]|0;
        $shr42$i = $sizebits$0$i >>> 31;
        $arrayidx44$i = (((($t$0$i)) + 16|0) + ($shr42$i<<2)|0);
        $54 = HEAP32[$arrayidx44$i>>2]|0;
        $cmp45$i152 = ($53|0)==(0|0);
        $cmp46$i = ($53|0)==($54|0);
        $or$cond1$i = $cmp45$i152 | $cmp46$i;
        $rst$1$i = $or$cond1$i ? $rst$0$i : $53;
        $cmp49$i = ($54|0)==(0|0);
        $not$cmp494$i = $cmp49$i ^ 1;
        $shl52$i = $not$cmp494$i&1;
        $sizebits$0$shl52$i = $sizebits$0$i << $shl52$i;
        if ($cmp49$i) {
         $rsize$3$i = $rsize$1$i;$t$2$i = $rst$1$i;$v$3$i = $v$1$i;
         label = 81;
         break;
        } else {
         $rsize$0$i = $rsize$1$i;$rst$0$i = $rst$1$i;$sizebits$0$i = $sizebits$0$shl52$i;$t$0$i = $54;$v$0$i = $v$1$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 81) {
      $cmp55$i = ($t$2$i|0)==(0|0);
      $cmp57$i = ($v$3$i|0)==(0|0);
      $or$cond$i = $cmp55$i & $cmp57$i;
      if ($or$cond$i) {
       $shl60$i = 2 << $idx$0$i;
       $sub63$i = (0 - ($shl60$i))|0;
       $or$i = $shl60$i | $sub63$i;
       $and64$i = $50 & $or$i;
       $cmp65$i = ($and64$i|0)==(0);
       if ($cmp65$i) {
        $nb$0 = $and145;
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
       $arrayidx94$i153 = (3324 + ($add92$i<<2)|0);
       $55 = HEAP32[$arrayidx94$i153>>2]|0;
       $t$4$ph$i = $55;$v$4$ph$i = 0;
      } else {
       $t$4$ph$i = $t$2$i;$v$4$ph$i = $v$3$i;
      }
      $cmp977$i = ($t$4$ph$i|0)==(0|0);
      if ($cmp977$i) {
       $rsize$4$lcssa$i = $rsize$3$i;$v$4$lcssa$i = $v$4$ph$i;
      } else {
       $rsize$49$i = $rsize$3$i;$t$48$i = $t$4$ph$i;$v$410$i = $v$4$ph$i;
       label = 85;
      }
     }
     if ((label|0) == 85) {
      while(1) {
       label = 0;
       $head99$i = ((($t$48$i)) + 4|0);
       $56 = HEAP32[$head99$i>>2]|0;
       $and100$i = $56 & -8;
       $sub101$i = (($and100$i) - ($and145))|0;
       $cmp102$i = ($sub101$i>>>0)<($rsize$49$i>>>0);
       $sub101$rsize$4$i = $cmp102$i ? $sub101$i : $rsize$49$i;
       $t$4$v$4$i = $cmp102$i ? $t$48$i : $v$410$i;
       $arrayidx106$i = ((($t$48$i)) + 16|0);
       $57 = HEAP32[$arrayidx106$i>>2]|0;
       $not$cmp107$i = ($57|0)==(0|0);
       $$sink$i154 = $not$cmp107$i&1;
       $arrayidx113$i155 = (((($t$48$i)) + 16|0) + ($$sink$i154<<2)|0);
       $58 = HEAP32[$arrayidx113$i155>>2]|0;
       $cmp97$i = ($58|0)==(0|0);
       if ($cmp97$i) {
        $rsize$4$lcssa$i = $sub101$rsize$4$i;$v$4$lcssa$i = $t$4$v$4$i;
        break;
       } else {
        $rsize$49$i = $sub101$rsize$4$i;$t$48$i = $58;$v$410$i = $t$4$v$4$i;
        label = 85;
       }
      }
     }
     $cmp116$i = ($v$4$lcssa$i|0)==(0|0);
     if ($cmp116$i) {
      $nb$0 = $and145;
     } else {
      $59 = HEAP32[(3028)>>2]|0;
      $sub118$i = (($59) - ($and145))|0;
      $cmp119$i = ($rsize$4$lcssa$i>>>0)<($sub118$i>>>0);
      if ($cmp119$i) {
       $60 = HEAP32[(3036)>>2]|0;
       $cmp121$i = ($v$4$lcssa$i>>>0)<($60>>>0);
       if ($cmp121$i) {
        _abort();
        // unreachable;
       }
       $add$ptr$i158 = (($v$4$lcssa$i) + ($and145)|0);
       $cmp123$i = ($v$4$lcssa$i>>>0)<($add$ptr$i158>>>0);
       if (!($cmp123$i)) {
        _abort();
        // unreachable;
       }
       $parent$i159 = ((($v$4$lcssa$i)) + 24|0);
       $61 = HEAP32[$parent$i159>>2]|0;
       $bk$i160 = ((($v$4$lcssa$i)) + 12|0);
       $62 = HEAP32[$bk$i160>>2]|0;
       $cmp128$i = ($62|0)==($v$4$lcssa$i|0);
       do {
        if ($cmp128$i) {
         $arrayidx151$i = ((($v$4$lcssa$i)) + 20|0);
         $66 = HEAP32[$arrayidx151$i>>2]|0;
         $cmp152$i = ($66|0)==(0|0);
         if ($cmp152$i) {
          $arrayidx155$i = ((($v$4$lcssa$i)) + 16|0);
          $67 = HEAP32[$arrayidx155$i>>2]|0;
          $cmp156$i = ($67|0)==(0|0);
          if ($cmp156$i) {
           $R$3$i168 = 0;
           break;
          } else {
           $R$1$i165 = $67;$RP$1$i164 = $arrayidx155$i;
          }
         } else {
          $R$1$i165 = $66;$RP$1$i164 = $arrayidx151$i;
         }
         while(1) {
          $arrayidx161$i = ((($R$1$i165)) + 20|0);
          $68 = HEAP32[$arrayidx161$i>>2]|0;
          $cmp162$i = ($68|0)==(0|0);
          if (!($cmp162$i)) {
           $R$1$i165 = $68;$RP$1$i164 = $arrayidx161$i;
           continue;
          }
          $arrayidx165$i166 = ((($R$1$i165)) + 16|0);
          $69 = HEAP32[$arrayidx165$i166>>2]|0;
          $cmp166$i = ($69|0)==(0|0);
          if ($cmp166$i) {
           break;
          } else {
           $R$1$i165 = $69;$RP$1$i164 = $arrayidx165$i166;
          }
         }
         $cmp171$i = ($RP$1$i164>>>0)<($60>>>0);
         if ($cmp171$i) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$RP$1$i164>>2] = 0;
          $R$3$i168 = $R$1$i165;
          break;
         }
        } else {
         $fd$i161 = ((($v$4$lcssa$i)) + 8|0);
         $63 = HEAP32[$fd$i161>>2]|0;
         $cmp133$i = ($63>>>0)<($60>>>0);
         if ($cmp133$i) {
          _abort();
          // unreachable;
         }
         $bk136$i = ((($63)) + 12|0);
         $64 = HEAP32[$bk136$i>>2]|0;
         $cmp137$i = ($64|0)==($v$4$lcssa$i|0);
         if (!($cmp137$i)) {
          _abort();
          // unreachable;
         }
         $fd139$i = ((($62)) + 8|0);
         $65 = HEAP32[$fd139$i>>2]|0;
         $cmp140$i = ($65|0)==($v$4$lcssa$i|0);
         if ($cmp140$i) {
          HEAP32[$bk136$i>>2] = $62;
          HEAP32[$fd139$i>>2] = $63;
          $R$3$i168 = $62;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $cmp180$i = ($61|0)==(0|0);
       L164: do {
        if ($cmp180$i) {
         $83 = $50;
        } else {
         $index$i169 = ((($v$4$lcssa$i)) + 28|0);
         $70 = HEAP32[$index$i169>>2]|0;
         $arrayidx184$i = (3324 + ($70<<2)|0);
         $71 = HEAP32[$arrayidx184$i>>2]|0;
         $cmp185$i = ($v$4$lcssa$i|0)==($71|0);
         do {
          if ($cmp185$i) {
           HEAP32[$arrayidx184$i>>2] = $R$3$i168;
           $cond3$i = ($R$3$i168|0)==(0|0);
           if ($cond3$i) {
            $shl192$i = 1 << $70;
            $neg$i170 = $shl192$i ^ -1;
            $and194$i = $50 & $neg$i170;
            HEAP32[(3024)>>2] = $and194$i;
            $83 = $and194$i;
            break L164;
           }
          } else {
           $72 = HEAP32[(3036)>>2]|0;
           $cmp198$i = ($61>>>0)<($72>>>0);
           if ($cmp198$i) {
            _abort();
            // unreachable;
           } else {
            $arrayidx204$i = ((($61)) + 16|0);
            $73 = HEAP32[$arrayidx204$i>>2]|0;
            $not$cmp205$i = ($73|0)!=($v$4$lcssa$i|0);
            $$sink2$i172 = $not$cmp205$i&1;
            $arrayidx212$i = (((($61)) + 16|0) + ($$sink2$i172<<2)|0);
            HEAP32[$arrayidx212$i>>2] = $R$3$i168;
            $cmp217$i = ($R$3$i168|0)==(0|0);
            if ($cmp217$i) {
             $83 = $50;
             break L164;
            } else {
             break;
            }
           }
          }
         } while(0);
         $74 = HEAP32[(3036)>>2]|0;
         $cmp221$i = ($R$3$i168>>>0)<($74>>>0);
         if ($cmp221$i) {
          _abort();
          // unreachable;
         }
         $parent226$i = ((($R$3$i168)) + 24|0);
         HEAP32[$parent226$i>>2] = $61;
         $arrayidx228$i = ((($v$4$lcssa$i)) + 16|0);
         $75 = HEAP32[$arrayidx228$i>>2]|0;
         $cmp229$i = ($75|0)==(0|0);
         do {
          if (!($cmp229$i)) {
           $cmp233$i = ($75>>>0)<($74>>>0);
           if ($cmp233$i) {
            _abort();
            // unreachable;
           } else {
            $arrayidx239$i = ((($R$3$i168)) + 16|0);
            HEAP32[$arrayidx239$i>>2] = $75;
            $parent240$i = ((($75)) + 24|0);
            HEAP32[$parent240$i>>2] = $R$3$i168;
            break;
           }
          }
         } while(0);
         $arrayidx245$i = ((($v$4$lcssa$i)) + 20|0);
         $76 = HEAP32[$arrayidx245$i>>2]|0;
         $cmp246$i = ($76|0)==(0|0);
         if ($cmp246$i) {
          $83 = $50;
         } else {
          $77 = HEAP32[(3036)>>2]|0;
          $cmp250$i = ($76>>>0)<($77>>>0);
          if ($cmp250$i) {
           _abort();
           // unreachable;
          } else {
           $arrayidx256$i = ((($R$3$i168)) + 20|0);
           HEAP32[$arrayidx256$i>>2] = $76;
           $parent257$i = ((($76)) + 24|0);
           HEAP32[$parent257$i>>2] = $R$3$i168;
           $83 = $50;
           break;
          }
         }
        }
       } while(0);
       $cmp265$i = ($rsize$4$lcssa$i>>>0)<(16);
       do {
        if ($cmp265$i) {
         $add268$i = (($rsize$4$lcssa$i) + ($and145))|0;
         $or270$i = $add268$i | 3;
         $head271$i = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$head271$i>>2] = $or270$i;
         $add$ptr273$i = (($v$4$lcssa$i) + ($add268$i)|0);
         $head274$i = ((($add$ptr273$i)) + 4|0);
         $78 = HEAP32[$head274$i>>2]|0;
         $or275$i = $78 | 1;
         HEAP32[$head274$i>>2] = $or275$i;
        } else {
         $or278$i = $and145 | 3;
         $head279$i = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$head279$i>>2] = $or278$i;
         $or280$i = $rsize$4$lcssa$i | 1;
         $head281$i = ((($add$ptr$i158)) + 4|0);
         HEAP32[$head281$i>>2] = $or280$i;
         $add$ptr282$i = (($add$ptr$i158) + ($rsize$4$lcssa$i)|0);
         HEAP32[$add$ptr282$i>>2] = $rsize$4$lcssa$i;
         $shr283$i = $rsize$4$lcssa$i >>> 3;
         $cmp284$i = ($rsize$4$lcssa$i>>>0)<(256);
         if ($cmp284$i) {
          $shl288$i = $shr283$i << 1;
          $arrayidx289$i = (3060 + ($shl288$i<<2)|0);
          $79 = HEAP32[755]|0;
          $shl291$i = 1 << $shr283$i;
          $and292$i = $79 & $shl291$i;
          $tobool293$i = ($and292$i|0)==(0);
          if ($tobool293$i) {
           $or297$i = $79 | $shl291$i;
           HEAP32[755] = $or297$i;
           $$pre$i175 = ((($arrayidx289$i)) + 8|0);
           $$pre$phi$i176Z2D = $$pre$i175;$F290$0$i = $arrayidx289$i;
          } else {
           $80 = ((($arrayidx289$i)) + 8|0);
           $81 = HEAP32[$80>>2]|0;
           $82 = HEAP32[(3036)>>2]|0;
           $cmp301$i = ($81>>>0)<($82>>>0);
           if ($cmp301$i) {
            _abort();
            // unreachable;
           } else {
            $$pre$phi$i176Z2D = $80;$F290$0$i = $81;
           }
          }
          HEAP32[$$pre$phi$i176Z2D>>2] = $add$ptr$i158;
          $bk311$i = ((($F290$0$i)) + 12|0);
          HEAP32[$bk311$i>>2] = $add$ptr$i158;
          $fd312$i = ((($add$ptr$i158)) + 8|0);
          HEAP32[$fd312$i>>2] = $F290$0$i;
          $bk313$i = ((($add$ptr$i158)) + 12|0);
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
         $arrayidx355$i = (3324 + ($I316$0$i<<2)|0);
         $index356$i = ((($add$ptr$i158)) + 28|0);
         HEAP32[$index356$i>>2] = $I316$0$i;
         $child357$i = ((($add$ptr$i158)) + 16|0);
         $arrayidx358$i = ((($child357$i)) + 4|0);
         HEAP32[$arrayidx358$i>>2] = 0;
         HEAP32[$child357$i>>2] = 0;
         $shl362$i = 1 << $I316$0$i;
         $and363$i = $83 & $shl362$i;
         $tobool364$i = ($and363$i|0)==(0);
         if ($tobool364$i) {
          $or368$i = $83 | $shl362$i;
          HEAP32[(3024)>>2] = $or368$i;
          HEAP32[$arrayidx355$i>>2] = $add$ptr$i158;
          $parent369$i = ((($add$ptr$i158)) + 24|0);
          HEAP32[$parent369$i>>2] = $arrayidx355$i;
          $bk370$i = ((($add$ptr$i158)) + 12|0);
          HEAP32[$bk370$i>>2] = $add$ptr$i158;
          $fd371$i = ((($add$ptr$i158)) + 8|0);
          HEAP32[$fd371$i>>2] = $add$ptr$i158;
          break;
         }
         $84 = HEAP32[$arrayidx355$i>>2]|0;
         $cmp374$i = ($I316$0$i|0)==(31);
         $shr378$i = $I316$0$i >>> 1;
         $sub381$i = (25 - ($shr378$i))|0;
         $cond383$i = $cmp374$i ? 0 : $sub381$i;
         $shl384$i = $rsize$4$lcssa$i << $cond383$i;
         $K373$0$i = $shl384$i;$T$0$i = $84;
         while(1) {
          $head386$i = ((($T$0$i)) + 4|0);
          $85 = HEAP32[$head386$i>>2]|0;
          $and387$i = $85 & -8;
          $cmp388$i = ($and387$i|0)==($rsize$4$lcssa$i|0);
          if ($cmp388$i) {
           label = 139;
           break;
          }
          $shr392$i = $K373$0$i >>> 31;
          $arrayidx394$i = (((($T$0$i)) + 16|0) + ($shr392$i<<2)|0);
          $shl395$i = $K373$0$i << 1;
          $86 = HEAP32[$arrayidx394$i>>2]|0;
          $cmp396$i = ($86|0)==(0|0);
          if ($cmp396$i) {
           label = 136;
           break;
          } else {
           $K373$0$i = $shl395$i;$T$0$i = $86;
          }
         }
         if ((label|0) == 136) {
          $87 = HEAP32[(3036)>>2]|0;
          $cmp401$i = ($arrayidx394$i>>>0)<($87>>>0);
          if ($cmp401$i) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$arrayidx394$i>>2] = $add$ptr$i158;
           $parent406$i = ((($add$ptr$i158)) + 24|0);
           HEAP32[$parent406$i>>2] = $T$0$i;
           $bk407$i = ((($add$ptr$i158)) + 12|0);
           HEAP32[$bk407$i>>2] = $add$ptr$i158;
           $fd408$i = ((($add$ptr$i158)) + 8|0);
           HEAP32[$fd408$i>>2] = $add$ptr$i158;
           break;
          }
         }
         else if ((label|0) == 139) {
          $fd416$i = ((($T$0$i)) + 8|0);
          $88 = HEAP32[$fd416$i>>2]|0;
          $89 = HEAP32[(3036)>>2]|0;
          $cmp422$i = ($88>>>0)>=($89>>>0);
          $not$cmp418$i = ($T$0$i>>>0)>=($89>>>0);
          $90 = $cmp422$i & $not$cmp418$i;
          if ($90) {
           $bk429$i = ((($88)) + 12|0);
           HEAP32[$bk429$i>>2] = $add$ptr$i158;
           HEAP32[$fd416$i>>2] = $add$ptr$i158;
           $fd431$i = ((($add$ptr$i158)) + 8|0);
           HEAP32[$fd431$i>>2] = $88;
           $bk432$i = ((($add$ptr$i158)) + 12|0);
           HEAP32[$bk432$i>>2] = $T$0$i;
           $parent433$i = ((($add$ptr$i158)) + 24|0);
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
       $retval$0 = $add$ptr441$i;
       STACKTOP = sp;return ($retval$0|0);
      } else {
       $nb$0 = $and145;
      }
     }
    }
   }
  }
 } while(0);
 $91 = HEAP32[(3028)>>2]|0;
 $cmp156 = ($91>>>0)<($nb$0>>>0);
 if (!($cmp156)) {
  $sub160 = (($91) - ($nb$0))|0;
  $92 = HEAP32[(3040)>>2]|0;
  $cmp162 = ($sub160>>>0)>(15);
  if ($cmp162) {
   $add$ptr166 = (($92) + ($nb$0)|0);
   HEAP32[(3040)>>2] = $add$ptr166;
   HEAP32[(3028)>>2] = $sub160;
   $or167 = $sub160 | 1;
   $head168 = ((($add$ptr166)) + 4|0);
   HEAP32[$head168>>2] = $or167;
   $add$ptr169 = (($add$ptr166) + ($sub160)|0);
   HEAP32[$add$ptr169>>2] = $sub160;
   $or172 = $nb$0 | 3;
   $head173 = ((($92)) + 4|0);
   HEAP32[$head173>>2] = $or172;
  } else {
   HEAP32[(3028)>>2] = 0;
   HEAP32[(3040)>>2] = 0;
   $or176 = $91 | 3;
   $head177 = ((($92)) + 4|0);
   HEAP32[$head177>>2] = $or176;
   $add$ptr178 = (($92) + ($91)|0);
   $head179 = ((($add$ptr178)) + 4|0);
   $93 = HEAP32[$head179>>2]|0;
   $or180 = $93 | 1;
   HEAP32[$head179>>2] = $or180;
  }
  $add$ptr182 = ((($92)) + 8|0);
  $retval$0 = $add$ptr182;
  STACKTOP = sp;return ($retval$0|0);
 }
 $94 = HEAP32[(3032)>>2]|0;
 $cmp186 = ($94>>>0)>($nb$0>>>0);
 if ($cmp186) {
  $sub190 = (($94) - ($nb$0))|0;
  HEAP32[(3032)>>2] = $sub190;
  $95 = HEAP32[(3044)>>2]|0;
  $add$ptr193 = (($95) + ($nb$0)|0);
  HEAP32[(3044)>>2] = $add$ptr193;
  $or194 = $sub190 | 1;
  $head195 = ((($add$ptr193)) + 4|0);
  HEAP32[$head195>>2] = $or194;
  $or197 = $nb$0 | 3;
  $head198 = ((($95)) + 4|0);
  HEAP32[$head198>>2] = $or197;
  $add$ptr199 = ((($95)) + 8|0);
  $retval$0 = $add$ptr199;
  STACKTOP = sp;return ($retval$0|0);
 }
 $96 = HEAP32[873]|0;
 $cmp$i177 = ($96|0)==(0);
 if ($cmp$i177) {
  HEAP32[(3500)>>2] = 4096;
  HEAP32[(3496)>>2] = 4096;
  HEAP32[(3504)>>2] = -1;
  HEAP32[(3508)>>2] = -1;
  HEAP32[(3512)>>2] = 0;
  HEAP32[(3464)>>2] = 0;
  $97 = $magic$i$i;
  $xor$i$i = $97 & -16;
  $and6$i$i = $xor$i$i ^ 1431655768;
  HEAP32[$magic$i$i>>2] = $and6$i$i;
  HEAP32[873] = $and6$i$i;
  $98 = 4096;
 } else {
  $$pre$i178 = HEAP32[(3500)>>2]|0;
  $98 = $$pre$i178;
 }
 $add$i179 = (($nb$0) + 48)|0;
 $sub$i180 = (($nb$0) + 47)|0;
 $add9$i = (($98) + ($sub$i180))|0;
 $neg$i181 = (0 - ($98))|0;
 $and11$i = $add9$i & $neg$i181;
 $cmp12$i = ($and11$i>>>0)>($nb$0>>>0);
 if (!($cmp12$i)) {
  $retval$0 = 0;
  STACKTOP = sp;return ($retval$0|0);
 }
 $99 = HEAP32[(3460)>>2]|0;
 $cmp15$i = ($99|0)==(0);
 if (!($cmp15$i)) {
  $100 = HEAP32[(3452)>>2]|0;
  $add17$i182 = (($100) + ($and11$i))|0;
  $cmp19$i = ($add17$i182>>>0)<=($100>>>0);
  $cmp21$i = ($add17$i182>>>0)>($99>>>0);
  $or$cond1$i183 = $cmp19$i | $cmp21$i;
  if ($or$cond1$i183) {
   $retval$0 = 0;
   STACKTOP = sp;return ($retval$0|0);
  }
 }
 $101 = HEAP32[(3464)>>2]|0;
 $and29$i = $101 & 4;
 $tobool30$i = ($and29$i|0)==(0);
 L244: do {
  if ($tobool30$i) {
   $102 = HEAP32[(3044)>>2]|0;
   $cmp32$i184 = ($102|0)==(0|0);
   L246: do {
    if ($cmp32$i184) {
     label = 163;
    } else {
     $sp$0$i$i = (3468);
     while(1) {
      $103 = HEAP32[$sp$0$i$i>>2]|0;
      $cmp$i11$i = ($103>>>0)>($102>>>0);
      if (!($cmp$i11$i)) {
       $size$i$i = ((($sp$0$i$i)) + 4|0);
       $104 = HEAP32[$size$i$i>>2]|0;
       $add$ptr$i$i = (($103) + ($104)|0);
       $cmp2$i$i = ($add$ptr$i$i>>>0)>($102>>>0);
       if ($cmp2$i$i) {
        break;
       }
      }
      $next$i$i = ((($sp$0$i$i)) + 8|0);
      $105 = HEAP32[$next$i$i>>2]|0;
      $cmp3$i$i = ($105|0)==(0|0);
      if ($cmp3$i$i) {
       label = 163;
       break L246;
      } else {
       $sp$0$i$i = $105;
      }
     }
     $add77$i = (($add9$i) - ($94))|0;
     $and80$i = $add77$i & $neg$i181;
     $cmp81$i190 = ($and80$i>>>0)<(2147483647);
     if ($cmp81$i190) {
      $call83$i = (_sbrk(($and80$i|0))|0);
      $110 = HEAP32[$sp$0$i$i>>2]|0;
      $111 = HEAP32[$size$i$i>>2]|0;
      $add$ptr$i192 = (($110) + ($111)|0);
      $cmp85$i = ($call83$i|0)==($add$ptr$i192|0);
      if ($cmp85$i) {
       $cmp89$i = ($call83$i|0)==((-1)|0);
       if ($cmp89$i) {
        $tsize$2657583$i = $and80$i;
       } else {
        $tbase$796$i = $call83$i;$tsize$795$i = $and80$i;
        label = 180;
        break L244;
       }
      } else {
       $br$2$ph$i = $call83$i;$ssize$2$ph$i = $and80$i;
       label = 171;
      }
     } else {
      $tsize$2657583$i = 0;
     }
    }
   } while(0);
   do {
    if ((label|0) == 163) {
     $call37$i = (_sbrk(0)|0);
     $cmp38$i = ($call37$i|0)==((-1)|0);
     if ($cmp38$i) {
      $tsize$2657583$i = 0;
     } else {
      $106 = $call37$i;
      $107 = HEAP32[(3496)>>2]|0;
      $sub41$i = (($107) + -1)|0;
      $and42$i = $sub41$i & $106;
      $cmp43$i = ($and42$i|0)==(0);
      $add46$i = (($sub41$i) + ($106))|0;
      $neg48$i = (0 - ($107))|0;
      $and49$i = $add46$i & $neg48$i;
      $sub50$i = (($and49$i) - ($106))|0;
      $add51$i = $cmp43$i ? 0 : $sub50$i;
      $and11$add51$i = (($add51$i) + ($and11$i))|0;
      $108 = HEAP32[(3452)>>2]|0;
      $add54$i = (($and11$add51$i) + ($108))|0;
      $cmp55$i185 = ($and11$add51$i>>>0)>($nb$0>>>0);
      $cmp57$i186 = ($and11$add51$i>>>0)<(2147483647);
      $or$cond$i187 = $cmp55$i185 & $cmp57$i186;
      if ($or$cond$i187) {
       $109 = HEAP32[(3460)>>2]|0;
       $cmp60$i = ($109|0)==(0);
       if (!($cmp60$i)) {
        $cmp63$i = ($add54$i>>>0)<=($108>>>0);
        $cmp66$i189 = ($add54$i>>>0)>($109>>>0);
        $or$cond2$i = $cmp63$i | $cmp66$i189;
        if ($or$cond2$i) {
         $tsize$2657583$i = 0;
         break;
        }
       }
       $call68$i = (_sbrk(($and11$add51$i|0))|0);
       $cmp69$i = ($call68$i|0)==($call37$i|0);
       if ($cmp69$i) {
        $tbase$796$i = $call37$i;$tsize$795$i = $and11$add51$i;
        label = 180;
        break L244;
       } else {
        $br$2$ph$i = $call68$i;$ssize$2$ph$i = $and11$add51$i;
        label = 171;
       }
      } else {
       $tsize$2657583$i = 0;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 171) {
     $sub112$i = (0 - ($ssize$2$ph$i))|0;
     $cmp91$i = ($br$2$ph$i|0)!=((-1)|0);
     $cmp93$i = ($ssize$2$ph$i>>>0)<(2147483647);
     $or$cond5$i = $cmp93$i & $cmp91$i;
     $cmp96$i = ($add$i179>>>0)>($ssize$2$ph$i>>>0);
     $or$cond3$i = $cmp96$i & $or$cond5$i;
     if (!($or$cond3$i)) {
      $cmp118$i = ($br$2$ph$i|0)==((-1)|0);
      if ($cmp118$i) {
       $tsize$2657583$i = 0;
       break;
      } else {
       $tbase$796$i = $br$2$ph$i;$tsize$795$i = $ssize$2$ph$i;
       label = 180;
       break L244;
      }
     }
     $112 = HEAP32[(3500)>>2]|0;
     $sub99$i = (($sub$i180) - ($ssize$2$ph$i))|0;
     $add101$i = (($sub99$i) + ($112))|0;
     $neg103$i = (0 - ($112))|0;
     $and104$i = $add101$i & $neg103$i;
     $cmp105$i = ($and104$i>>>0)<(2147483647);
     if (!($cmp105$i)) {
      $tbase$796$i = $br$2$ph$i;$tsize$795$i = $ssize$2$ph$i;
      label = 180;
      break L244;
     }
     $call107$i = (_sbrk(($and104$i|0))|0);
     $cmp108$i = ($call107$i|0)==((-1)|0);
     if ($cmp108$i) {
      (_sbrk(($sub112$i|0))|0);
      $tsize$2657583$i = 0;
      break;
     } else {
      $add110$i = (($and104$i) + ($ssize$2$ph$i))|0;
      $tbase$796$i = $br$2$ph$i;$tsize$795$i = $add110$i;
      label = 180;
      break L244;
     }
    }
   } while(0);
   $113 = HEAP32[(3464)>>2]|0;
   $or$i194 = $113 | 4;
   HEAP32[(3464)>>2] = $or$i194;
   $tsize$4$i = $tsize$2657583$i;
   label = 178;
  } else {
   $tsize$4$i = 0;
   label = 178;
  }
 } while(0);
 if ((label|0) == 178) {
  $cmp127$i = ($and11$i>>>0)<(2147483647);
  if ($cmp127$i) {
   $call131$i = (_sbrk(($and11$i|0))|0);
   $call132$i = (_sbrk(0)|0);
   $cmp133$i195 = ($call131$i|0)!=((-1)|0);
   $cmp135$i = ($call132$i|0)!=((-1)|0);
   $or$cond4$i = $cmp133$i195 & $cmp135$i;
   $cmp137$i196 = ($call131$i>>>0)<($call132$i>>>0);
   $or$cond7$i = $cmp137$i196 & $or$cond4$i;
   $sub$ptr$lhs$cast$i = $call132$i;
   $sub$ptr$rhs$cast$i = $call131$i;
   $sub$ptr$sub$i = (($sub$ptr$lhs$cast$i) - ($sub$ptr$rhs$cast$i))|0;
   $add140$i = (($nb$0) + 40)|0;
   $cmp141$i = ($sub$ptr$sub$i>>>0)>($add140$i>>>0);
   $sub$ptr$sub$tsize$4$i = $cmp141$i ? $sub$ptr$sub$i : $tsize$4$i;
   $or$cond7$not$i = $or$cond7$i ^ 1;
   $cmp14799$i = ($call131$i|0)==((-1)|0);
   $not$cmp141$i = $cmp141$i ^ 1;
   $cmp147$i = $cmp14799$i | $not$cmp141$i;
   $or$cond97$i = $cmp147$i | $or$cond7$not$i;
   if (!($or$cond97$i)) {
    $tbase$796$i = $call131$i;$tsize$795$i = $sub$ptr$sub$tsize$4$i;
    label = 180;
   }
  }
 }
 if ((label|0) == 180) {
  $114 = HEAP32[(3452)>>2]|0;
  $add150$i = (($114) + ($tsize$795$i))|0;
  HEAP32[(3452)>>2] = $add150$i;
  $115 = HEAP32[(3456)>>2]|0;
  $cmp151$i = ($add150$i>>>0)>($115>>>0);
  if ($cmp151$i) {
   HEAP32[(3456)>>2] = $add150$i;
  }
  $116 = HEAP32[(3044)>>2]|0;
  $cmp157$i = ($116|0)==(0|0);
  do {
   if ($cmp157$i) {
    $117 = HEAP32[(3036)>>2]|0;
    $cmp159$i198 = ($117|0)==(0|0);
    $cmp162$i199 = ($tbase$796$i>>>0)<($117>>>0);
    $or$cond8$i = $cmp159$i198 | $cmp162$i199;
    if ($or$cond8$i) {
     HEAP32[(3036)>>2] = $tbase$796$i;
    }
    HEAP32[(3468)>>2] = $tbase$796$i;
    HEAP32[(3472)>>2] = $tsize$795$i;
    HEAP32[(3480)>>2] = 0;
    $118 = HEAP32[873]|0;
    HEAP32[(3056)>>2] = $118;
    HEAP32[(3052)>>2] = -1;
    $i$01$i$i = 0;
    while(1) {
     $shl$i13$i = $i$01$i$i << 1;
     $arrayidx$i14$i = (3060 + ($shl$i13$i<<2)|0);
     $119 = ((($arrayidx$i14$i)) + 12|0);
     HEAP32[$119>>2] = $arrayidx$i14$i;
     $120 = ((($arrayidx$i14$i)) + 8|0);
     HEAP32[$120>>2] = $arrayidx$i14$i;
     $inc$i$i = (($i$01$i$i) + 1)|0;
     $exitcond$i$i = ($inc$i$i|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $i$01$i$i = $inc$i$i;
     }
    }
    $sub172$i = (($tsize$795$i) + -40)|0;
    $add$ptr$i16$i = ((($tbase$796$i)) + 8|0);
    $121 = $add$ptr$i16$i;
    $and$i17$i = $121 & 7;
    $cmp$i18$i = ($and$i17$i|0)==(0);
    $122 = (0 - ($121))|0;
    $and3$i$i = $122 & 7;
    $cond$i19$i = $cmp$i18$i ? 0 : $and3$i$i;
    $add$ptr4$i$i = (($tbase$796$i) + ($cond$i19$i)|0);
    $sub5$i$i = (($sub172$i) - ($cond$i19$i))|0;
    HEAP32[(3044)>>2] = $add$ptr4$i$i;
    HEAP32[(3032)>>2] = $sub5$i$i;
    $or$i$i = $sub5$i$i | 1;
    $head$i20$i = ((($add$ptr4$i$i)) + 4|0);
    HEAP32[$head$i20$i>>2] = $or$i$i;
    $add$ptr6$i$i = (($add$ptr4$i$i) + ($sub5$i$i)|0);
    $head7$i$i = ((($add$ptr6$i$i)) + 4|0);
    HEAP32[$head7$i$i>>2] = 40;
    $123 = HEAP32[(3508)>>2]|0;
    HEAP32[(3048)>>2] = $123;
   } else {
    $sp$0108$i = (3468);
    while(1) {
     $124 = HEAP32[$sp$0108$i>>2]|0;
     $size188$i = ((($sp$0108$i)) + 4|0);
     $125 = HEAP32[$size188$i>>2]|0;
     $add$ptr189$i = (($124) + ($125)|0);
     $cmp190$i = ($tbase$796$i|0)==($add$ptr189$i|0);
     if ($cmp190$i) {
      label = 190;
      break;
     }
     $next$i = ((($sp$0108$i)) + 8|0);
     $126 = HEAP32[$next$i>>2]|0;
     $cmp186$i = ($126|0)==(0|0);
     if ($cmp186$i) {
      break;
     } else {
      $sp$0108$i = $126;
     }
    }
    if ((label|0) == 190) {
     $sflags193$i = ((($sp$0108$i)) + 12|0);
     $127 = HEAP32[$sflags193$i>>2]|0;
     $and194$i203 = $127 & 8;
     $tobool195$i = ($and194$i203|0)==(0);
     if ($tobool195$i) {
      $cmp203$i = ($116>>>0)>=($124>>>0);
      $cmp209$i = ($116>>>0)<($tbase$796$i>>>0);
      $or$cond98$i = $cmp209$i & $cmp203$i;
      if ($or$cond98$i) {
       $add212$i = (($125) + ($tsize$795$i))|0;
       HEAP32[$size188$i>>2] = $add212$i;
       $128 = HEAP32[(3032)>>2]|0;
       $add$ptr$i49$i = ((($116)) + 8|0);
       $129 = $add$ptr$i49$i;
       $and$i50$i = $129 & 7;
       $cmp$i51$i = ($and$i50$i|0)==(0);
       $130 = (0 - ($129))|0;
       $and3$i52$i = $130 & 7;
       $cond$i53$i = $cmp$i51$i ? 0 : $and3$i52$i;
       $add$ptr4$i54$i = (($116) + ($cond$i53$i)|0);
       $add215$i = (($tsize$795$i) - ($cond$i53$i))|0;
       $sub5$i55$i = (($128) + ($add215$i))|0;
       HEAP32[(3044)>>2] = $add$ptr4$i54$i;
       HEAP32[(3032)>>2] = $sub5$i55$i;
       $or$i56$i = $sub5$i55$i | 1;
       $head$i57$i = ((($add$ptr4$i54$i)) + 4|0);
       HEAP32[$head$i57$i>>2] = $or$i56$i;
       $add$ptr6$i58$i = (($add$ptr4$i54$i) + ($sub5$i55$i)|0);
       $head7$i59$i = ((($add$ptr6$i58$i)) + 4|0);
       HEAP32[$head7$i59$i>>2] = 40;
       $131 = HEAP32[(3508)>>2]|0;
       HEAP32[(3048)>>2] = $131;
       break;
      }
     }
    }
    $132 = HEAP32[(3036)>>2]|0;
    $cmp218$i = ($tbase$796$i>>>0)<($132>>>0);
    if ($cmp218$i) {
     HEAP32[(3036)>>2] = $tbase$796$i;
     $147 = $tbase$796$i;
    } else {
     $147 = $132;
    }
    $add$ptr227$i = (($tbase$796$i) + ($tsize$795$i)|0);
    $sp$1107$i = (3468);
    while(1) {
     $133 = HEAP32[$sp$1107$i>>2]|0;
     $cmp228$i = ($133|0)==($add$ptr227$i|0);
     if ($cmp228$i) {
      label = 198;
      break;
     }
     $next231$i = ((($sp$1107$i)) + 8|0);
     $134 = HEAP32[$next231$i>>2]|0;
     $cmp224$i = ($134|0)==(0|0);
     if ($cmp224$i) {
      break;
     } else {
      $sp$1107$i = $134;
     }
    }
    if ((label|0) == 198) {
     $sflags235$i = ((($sp$1107$i)) + 12|0);
     $135 = HEAP32[$sflags235$i>>2]|0;
     $and236$i = $135 & 8;
     $tobool237$i = ($and236$i|0)==(0);
     if ($tobool237$i) {
      HEAP32[$sp$1107$i>>2] = $tbase$796$i;
      $size245$i = ((($sp$1107$i)) + 4|0);
      $136 = HEAP32[$size245$i>>2]|0;
      $add246$i = (($136) + ($tsize$795$i))|0;
      HEAP32[$size245$i>>2] = $add246$i;
      $add$ptr$i21$i = ((($tbase$796$i)) + 8|0);
      $137 = $add$ptr$i21$i;
      $and$i22$i = $137 & 7;
      $cmp$i23$i = ($and$i22$i|0)==(0);
      $138 = (0 - ($137))|0;
      $and3$i24$i = $138 & 7;
      $cond$i25$i = $cmp$i23$i ? 0 : $and3$i24$i;
      $add$ptr4$i26$i = (($tbase$796$i) + ($cond$i25$i)|0);
      $add$ptr5$i$i = ((($add$ptr227$i)) + 8|0);
      $139 = $add$ptr5$i$i;
      $and6$i27$i = $139 & 7;
      $cmp7$i$i = ($and6$i27$i|0)==(0);
      $140 = (0 - ($139))|0;
      $and13$i$i = $140 & 7;
      $cond15$i$i = $cmp7$i$i ? 0 : $and13$i$i;
      $add$ptr16$i$i = (($add$ptr227$i) + ($cond15$i$i)|0);
      $sub$ptr$lhs$cast$i28$i = $add$ptr16$i$i;
      $sub$ptr$rhs$cast$i29$i = $add$ptr4$i26$i;
      $sub$ptr$sub$i30$i = (($sub$ptr$lhs$cast$i28$i) - ($sub$ptr$rhs$cast$i29$i))|0;
      $add$ptr17$i$i = (($add$ptr4$i26$i) + ($nb$0)|0);
      $sub18$i$i = (($sub$ptr$sub$i30$i) - ($nb$0))|0;
      $or19$i$i = $nb$0 | 3;
      $head$i31$i = ((($add$ptr4$i26$i)) + 4|0);
      HEAP32[$head$i31$i>>2] = $or19$i$i;
      $cmp20$i$i = ($add$ptr16$i$i|0)==($116|0);
      do {
       if ($cmp20$i$i) {
        $141 = HEAP32[(3032)>>2]|0;
        $add$i$i = (($141) + ($sub18$i$i))|0;
        HEAP32[(3032)>>2] = $add$i$i;
        HEAP32[(3044)>>2] = $add$ptr17$i$i;
        $or22$i$i = $add$i$i | 1;
        $head23$i$i = ((($add$ptr17$i$i)) + 4|0);
        HEAP32[$head23$i$i>>2] = $or22$i$i;
       } else {
        $142 = HEAP32[(3040)>>2]|0;
        $cmp24$i$i = ($add$ptr16$i$i|0)==($142|0);
        if ($cmp24$i$i) {
         $143 = HEAP32[(3028)>>2]|0;
         $add26$i$i = (($143) + ($sub18$i$i))|0;
         HEAP32[(3028)>>2] = $add26$i$i;
         HEAP32[(3040)>>2] = $add$ptr17$i$i;
         $or28$i$i = $add26$i$i | 1;
         $head29$i$i = ((($add$ptr17$i$i)) + 4|0);
         HEAP32[$head29$i$i>>2] = $or28$i$i;
         $add$ptr30$i$i = (($add$ptr17$i$i) + ($add26$i$i)|0);
         HEAP32[$add$ptr30$i$i>>2] = $add26$i$i;
         break;
        }
        $head32$i$i = ((($add$ptr16$i$i)) + 4|0);
        $144 = HEAP32[$head32$i$i>>2]|0;
        $and33$i$i = $144 & 3;
        $cmp34$i$i = ($and33$i$i|0)==(1);
        if ($cmp34$i$i) {
         $and37$i$i = $144 & -8;
         $shr$i34$i = $144 >>> 3;
         $cmp38$i$i = ($144>>>0)<(256);
         L314: do {
          if ($cmp38$i$i) {
           $fd$i$i = ((($add$ptr16$i$i)) + 8|0);
           $145 = HEAP32[$fd$i$i>>2]|0;
           $bk$i35$i = ((($add$ptr16$i$i)) + 12|0);
           $146 = HEAP32[$bk$i35$i>>2]|0;
           $shl$i36$i = $shr$i34$i << 1;
           $arrayidx$i37$i = (3060 + ($shl$i36$i<<2)|0);
           $cmp41$i$i = ($145|0)==($arrayidx$i37$i|0);
           do {
            if (!($cmp41$i$i)) {
             $cmp42$i$i = ($145>>>0)<($147>>>0);
             if ($cmp42$i$i) {
              _abort();
              // unreachable;
             }
             $bk43$i$i = ((($145)) + 12|0);
             $148 = HEAP32[$bk43$i$i>>2]|0;
             $cmp44$i$i = ($148|0)==($add$ptr16$i$i|0);
             if ($cmp44$i$i) {
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $cmp46$i38$i = ($146|0)==($145|0);
           if ($cmp46$i38$i) {
            $shl48$i$i = 1 << $shr$i34$i;
            $neg$i$i = $shl48$i$i ^ -1;
            $149 = HEAP32[755]|0;
            $and49$i$i = $149 & $neg$i$i;
            HEAP32[755] = $and49$i$i;
            break;
           }
           $cmp54$i$i = ($146|0)==($arrayidx$i37$i|0);
           do {
            if ($cmp54$i$i) {
             $$pre5$i$i = ((($146)) + 8|0);
             $fd68$pre$phi$i$iZ2D = $$pre5$i$i;
            } else {
             $cmp57$i$i = ($146>>>0)<($147>>>0);
             if ($cmp57$i$i) {
              _abort();
              // unreachable;
             }
             $fd59$i$i = ((($146)) + 8|0);
             $150 = HEAP32[$fd59$i$i>>2]|0;
             $cmp60$i$i = ($150|0)==($add$ptr16$i$i|0);
             if ($cmp60$i$i) {
              $fd68$pre$phi$i$iZ2D = $fd59$i$i;
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $bk67$i$i = ((($145)) + 12|0);
           HEAP32[$bk67$i$i>>2] = $146;
           HEAP32[$fd68$pre$phi$i$iZ2D>>2] = $145;
          } else {
           $parent$i40$i = ((($add$ptr16$i$i)) + 24|0);
           $151 = HEAP32[$parent$i40$i>>2]|0;
           $bk74$i$i = ((($add$ptr16$i$i)) + 12|0);
           $152 = HEAP32[$bk74$i$i>>2]|0;
           $cmp75$i$i = ($152|0)==($add$ptr16$i$i|0);
           do {
            if ($cmp75$i$i) {
             $child$i$i = ((($add$ptr16$i$i)) + 16|0);
             $arrayidx96$i$i = ((($child$i$i)) + 4|0);
             $156 = HEAP32[$arrayidx96$i$i>>2]|0;
             $cmp97$i$i = ($156|0)==(0|0);
             if ($cmp97$i$i) {
              $157 = HEAP32[$child$i$i>>2]|0;
              $cmp100$i$i = ($157|0)==(0|0);
              if ($cmp100$i$i) {
               $R$3$i$i = 0;
               break;
              } else {
               $R$1$i$i = $157;$RP$1$i$i = $child$i$i;
              }
             } else {
              $R$1$i$i = $156;$RP$1$i$i = $arrayidx96$i$i;
             }
             while(1) {
              $arrayidx103$i$i = ((($R$1$i$i)) + 20|0);
              $158 = HEAP32[$arrayidx103$i$i>>2]|0;
              $cmp104$i$i = ($158|0)==(0|0);
              if (!($cmp104$i$i)) {
               $R$1$i$i = $158;$RP$1$i$i = $arrayidx103$i$i;
               continue;
              }
              $arrayidx107$i$i = ((($R$1$i$i)) + 16|0);
              $159 = HEAP32[$arrayidx107$i$i>>2]|0;
              $cmp108$i$i = ($159|0)==(0|0);
              if ($cmp108$i$i) {
               break;
              } else {
               $R$1$i$i = $159;$RP$1$i$i = $arrayidx107$i$i;
              }
             }
             $cmp112$i$i = ($RP$1$i$i>>>0)<($147>>>0);
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
             $153 = HEAP32[$fd78$i$i>>2]|0;
             $cmp81$i$i = ($153>>>0)<($147>>>0);
             if ($cmp81$i$i) {
              _abort();
              // unreachable;
             }
             $bk82$i$i = ((($153)) + 12|0);
             $154 = HEAP32[$bk82$i$i>>2]|0;
             $cmp83$i$i = ($154|0)==($add$ptr16$i$i|0);
             if (!($cmp83$i$i)) {
              _abort();
              // unreachable;
             }
             $fd85$i$i = ((($152)) + 8|0);
             $155 = HEAP32[$fd85$i$i>>2]|0;
             $cmp86$i$i = ($155|0)==($add$ptr16$i$i|0);
             if ($cmp86$i$i) {
              HEAP32[$bk82$i$i>>2] = $152;
              HEAP32[$fd85$i$i>>2] = $153;
              $R$3$i$i = $152;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           } while(0);
           $cmp120$i42$i = ($151|0)==(0|0);
           if ($cmp120$i42$i) {
            break;
           }
           $index$i43$i = ((($add$ptr16$i$i)) + 28|0);
           $160 = HEAP32[$index$i43$i>>2]|0;
           $arrayidx123$i$i = (3324 + ($160<<2)|0);
           $161 = HEAP32[$arrayidx123$i$i>>2]|0;
           $cmp124$i$i = ($add$ptr16$i$i|0)==($161|0);
           do {
            if ($cmp124$i$i) {
             HEAP32[$arrayidx123$i$i>>2] = $R$3$i$i;
             $cond2$i$i = ($R$3$i$i|0)==(0|0);
             if (!($cond2$i$i)) {
              break;
             }
             $shl131$i$i = 1 << $160;
             $neg132$i$i = $shl131$i$i ^ -1;
             $162 = HEAP32[(3024)>>2]|0;
             $and133$i$i = $162 & $neg132$i$i;
             HEAP32[(3024)>>2] = $and133$i$i;
             break L314;
            } else {
             $163 = HEAP32[(3036)>>2]|0;
             $cmp137$i$i = ($151>>>0)<($163>>>0);
             if ($cmp137$i$i) {
              _abort();
              // unreachable;
             } else {
              $arrayidx143$i$i = ((($151)) + 16|0);
              $164 = HEAP32[$arrayidx143$i$i>>2]|0;
              $not$cmp144$i$i = ($164|0)!=($add$ptr16$i$i|0);
              $$sink$i$i = $not$cmp144$i$i&1;
              $arrayidx151$i$i = (((($151)) + 16|0) + ($$sink$i$i<<2)|0);
              HEAP32[$arrayidx151$i$i>>2] = $R$3$i$i;
              $cmp156$i$i = ($R$3$i$i|0)==(0|0);
              if ($cmp156$i$i) {
               break L314;
              } else {
               break;
              }
             }
            }
           } while(0);
           $165 = HEAP32[(3036)>>2]|0;
           $cmp160$i$i = ($R$3$i$i>>>0)<($165>>>0);
           if ($cmp160$i$i) {
            _abort();
            // unreachable;
           }
           $parent165$i$i = ((($R$3$i$i)) + 24|0);
           HEAP32[$parent165$i$i>>2] = $151;
           $child166$i$i = ((($add$ptr16$i$i)) + 16|0);
           $166 = HEAP32[$child166$i$i>>2]|0;
           $cmp168$i$i = ($166|0)==(0|0);
           do {
            if (!($cmp168$i$i)) {
             $cmp172$i$i = ($166>>>0)<($165>>>0);
             if ($cmp172$i$i) {
              _abort();
              // unreachable;
             } else {
              $arrayidx178$i$i = ((($R$3$i$i)) + 16|0);
              HEAP32[$arrayidx178$i$i>>2] = $166;
              $parent179$i$i = ((($166)) + 24|0);
              HEAP32[$parent179$i$i>>2] = $R$3$i$i;
              break;
             }
            }
           } while(0);
           $arrayidx184$i$i = ((($child166$i$i)) + 4|0);
           $167 = HEAP32[$arrayidx184$i$i>>2]|0;
           $cmp185$i$i = ($167|0)==(0|0);
           if ($cmp185$i$i) {
            break;
           }
           $168 = HEAP32[(3036)>>2]|0;
           $cmp189$i$i = ($167>>>0)<($168>>>0);
           if ($cmp189$i$i) {
            _abort();
            // unreachable;
           } else {
            $arrayidx195$i$i = ((($R$3$i$i)) + 20|0);
            HEAP32[$arrayidx195$i$i>>2] = $167;
            $parent196$i$i = ((($167)) + 24|0);
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
        $169 = HEAP32[$head208$i$i>>2]|0;
        $and209$i$i = $169 & -2;
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
         $arrayidx223$i$i = (3060 + ($shl222$i$i<<2)|0);
         $170 = HEAP32[755]|0;
         $shl226$i$i = 1 << $shr214$i$i;
         $and227$i$i = $170 & $shl226$i$i;
         $tobool228$i$i = ($and227$i$i|0)==(0);
         do {
          if ($tobool228$i$i) {
           $or232$i$i = $170 | $shl226$i$i;
           HEAP32[755] = $or232$i$i;
           $$pre$i45$i = ((($arrayidx223$i$i)) + 8|0);
           $$pre$phi$i46$iZ2D = $$pre$i45$i;$F224$0$i$i = $arrayidx223$i$i;
          } else {
           $171 = ((($arrayidx223$i$i)) + 8|0);
           $172 = HEAP32[$171>>2]|0;
           $173 = HEAP32[(3036)>>2]|0;
           $cmp236$i$i = ($172>>>0)<($173>>>0);
           if (!($cmp236$i$i)) {
            $$pre$phi$i46$iZ2D = $171;$F224$0$i$i = $172;
            break;
           }
           _abort();
           // unreachable;
          }
         } while(0);
         HEAP32[$$pre$phi$i46$iZ2D>>2] = $add$ptr17$i$i;
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
        $arrayidx287$i$i = (3324 + ($I252$0$i$i<<2)|0);
        $index288$i$i = ((($add$ptr17$i$i)) + 28|0);
        HEAP32[$index288$i$i>>2] = $I252$0$i$i;
        $child289$i$i = ((($add$ptr17$i$i)) + 16|0);
        $arrayidx290$i$i = ((($child289$i$i)) + 4|0);
        HEAP32[$arrayidx290$i$i>>2] = 0;
        HEAP32[$child289$i$i>>2] = 0;
        $174 = HEAP32[(3024)>>2]|0;
        $shl294$i$i = 1 << $I252$0$i$i;
        $and295$i$i = $174 & $shl294$i$i;
        $tobool296$i$i = ($and295$i$i|0)==(0);
        if ($tobool296$i$i) {
         $or300$i$i = $174 | $shl294$i$i;
         HEAP32[(3024)>>2] = $or300$i$i;
         HEAP32[$arrayidx287$i$i>>2] = $add$ptr17$i$i;
         $parent301$i$i = ((($add$ptr17$i$i)) + 24|0);
         HEAP32[$parent301$i$i>>2] = $arrayidx287$i$i;
         $bk302$i$i = ((($add$ptr17$i$i)) + 12|0);
         HEAP32[$bk302$i$i>>2] = $add$ptr17$i$i;
         $fd303$i$i = ((($add$ptr17$i$i)) + 8|0);
         HEAP32[$fd303$i$i>>2] = $add$ptr17$i$i;
         break;
        }
        $175 = HEAP32[$arrayidx287$i$i>>2]|0;
        $cmp306$i$i = ($I252$0$i$i|0)==(31);
        $shr310$i$i = $I252$0$i$i >>> 1;
        $sub313$i$i = (25 - ($shr310$i$i))|0;
        $cond315$i$i = $cmp306$i$i ? 0 : $sub313$i$i;
        $shl316$i$i = $qsize$0$i$i << $cond315$i$i;
        $K305$0$i$i = $shl316$i$i;$T$0$i47$i = $175;
        while(1) {
         $head317$i$i = ((($T$0$i47$i)) + 4|0);
         $176 = HEAP32[$head317$i$i>>2]|0;
         $and318$i$i = $176 & -8;
         $cmp319$i$i = ($and318$i$i|0)==($qsize$0$i$i|0);
         if ($cmp319$i$i) {
          label = 265;
          break;
         }
         $shr323$i$i = $K305$0$i$i >>> 31;
         $arrayidx325$i$i = (((($T$0$i47$i)) + 16|0) + ($shr323$i$i<<2)|0);
         $shl326$i$i = $K305$0$i$i << 1;
         $177 = HEAP32[$arrayidx325$i$i>>2]|0;
         $cmp327$i$i = ($177|0)==(0|0);
         if ($cmp327$i$i) {
          label = 262;
          break;
         } else {
          $K305$0$i$i = $shl326$i$i;$T$0$i47$i = $177;
         }
        }
        if ((label|0) == 262) {
         $178 = HEAP32[(3036)>>2]|0;
         $cmp332$i$i = ($arrayidx325$i$i>>>0)<($178>>>0);
         if ($cmp332$i$i) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$arrayidx325$i$i>>2] = $add$ptr17$i$i;
          $parent337$i$i = ((($add$ptr17$i$i)) + 24|0);
          HEAP32[$parent337$i$i>>2] = $T$0$i47$i;
          $bk338$i$i = ((($add$ptr17$i$i)) + 12|0);
          HEAP32[$bk338$i$i>>2] = $add$ptr17$i$i;
          $fd339$i$i = ((($add$ptr17$i$i)) + 8|0);
          HEAP32[$fd339$i$i>>2] = $add$ptr17$i$i;
          break;
         }
        }
        else if ((label|0) == 265) {
         $fd344$i$i = ((($T$0$i47$i)) + 8|0);
         $179 = HEAP32[$fd344$i$i>>2]|0;
         $180 = HEAP32[(3036)>>2]|0;
         $cmp350$i$i = ($179>>>0)>=($180>>>0);
         $not$cmp346$i$i = ($T$0$i47$i>>>0)>=($180>>>0);
         $181 = $cmp350$i$i & $not$cmp346$i$i;
         if ($181) {
          $bk357$i$i = ((($179)) + 12|0);
          HEAP32[$bk357$i$i>>2] = $add$ptr17$i$i;
          HEAP32[$fd344$i$i>>2] = $add$ptr17$i$i;
          $fd359$i$i = ((($add$ptr17$i$i)) + 8|0);
          HEAP32[$fd359$i$i>>2] = $179;
          $bk360$i$i = ((($add$ptr17$i$i)) + 12|0);
          HEAP32[$bk360$i$i>>2] = $T$0$i47$i;
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
      $add$ptr369$i$i = ((($add$ptr4$i26$i)) + 8|0);
      $retval$0 = $add$ptr369$i$i;
      STACKTOP = sp;return ($retval$0|0);
     }
    }
    $sp$0$i$i$i = (3468);
    while(1) {
     $182 = HEAP32[$sp$0$i$i$i>>2]|0;
     $cmp$i$i$i = ($182>>>0)>($116>>>0);
     if (!($cmp$i$i$i)) {
      $size$i$i$i = ((($sp$0$i$i$i)) + 4|0);
      $183 = HEAP32[$size$i$i$i>>2]|0;
      $add$ptr$i$i$i = (($182) + ($183)|0);
      $cmp2$i$i$i = ($add$ptr$i$i$i>>>0)>($116>>>0);
      if ($cmp2$i$i$i) {
       break;
      }
     }
     $next$i$i$i = ((($sp$0$i$i$i)) + 8|0);
     $184 = HEAP32[$next$i$i$i>>2]|0;
     $sp$0$i$i$i = $184;
    }
    $add$ptr2$i$i = ((($add$ptr$i$i$i)) + -47|0);
    $add$ptr3$i$i = ((($add$ptr2$i$i)) + 8|0);
    $185 = $add$ptr3$i$i;
    $and$i$i = $185 & 7;
    $cmp$i9$i = ($and$i$i|0)==(0);
    $186 = (0 - ($185))|0;
    $and6$i10$i = $186 & 7;
    $cond$i$i = $cmp$i9$i ? 0 : $and6$i10$i;
    $add$ptr7$i$i = (($add$ptr2$i$i) + ($cond$i$i)|0);
    $add$ptr81$i$i = ((($116)) + 16|0);
    $cmp9$i$i = ($add$ptr7$i$i>>>0)<($add$ptr81$i$i>>>0);
    $cond13$i$i = $cmp9$i$i ? $116 : $add$ptr7$i$i;
    $add$ptr14$i$i = ((($cond13$i$i)) + 8|0);
    $add$ptr15$i$i = ((($cond13$i$i)) + 24|0);
    $sub16$i$i = (($tsize$795$i) + -40)|0;
    $add$ptr$i2$i$i = ((($tbase$796$i)) + 8|0);
    $187 = $add$ptr$i2$i$i;
    $and$i$i$i = $187 & 7;
    $cmp$i3$i$i = ($and$i$i$i|0)==(0);
    $188 = (0 - ($187))|0;
    $and3$i$i$i = $188 & 7;
    $cond$i$i$i = $cmp$i3$i$i ? 0 : $and3$i$i$i;
    $add$ptr4$i$i$i = (($tbase$796$i) + ($cond$i$i$i)|0);
    $sub5$i$i$i = (($sub16$i$i) - ($cond$i$i$i))|0;
    HEAP32[(3044)>>2] = $add$ptr4$i$i$i;
    HEAP32[(3032)>>2] = $sub5$i$i$i;
    $or$i$i$i = $sub5$i$i$i | 1;
    $head$i$i$i = ((($add$ptr4$i$i$i)) + 4|0);
    HEAP32[$head$i$i$i>>2] = $or$i$i$i;
    $add$ptr6$i$i$i = (($add$ptr4$i$i$i) + ($sub5$i$i$i)|0);
    $head7$i$i$i = ((($add$ptr6$i$i$i)) + 4|0);
    HEAP32[$head7$i$i$i>>2] = 40;
    $189 = HEAP32[(3508)>>2]|0;
    HEAP32[(3048)>>2] = $189;
    $head$i$i = ((($cond13$i$i)) + 4|0);
    HEAP32[$head$i$i>>2] = 27;
    ;HEAP32[$add$ptr14$i$i>>2]=HEAP32[(3468)>>2]|0;HEAP32[$add$ptr14$i$i+4>>2]=HEAP32[(3468)+4>>2]|0;HEAP32[$add$ptr14$i$i+8>>2]=HEAP32[(3468)+8>>2]|0;HEAP32[$add$ptr14$i$i+12>>2]=HEAP32[(3468)+12>>2]|0;
    HEAP32[(3468)>>2] = $tbase$796$i;
    HEAP32[(3472)>>2] = $tsize$795$i;
    HEAP32[(3480)>>2] = 0;
    HEAP32[(3476)>>2] = $add$ptr14$i$i;
    $190 = $add$ptr15$i$i;
    while(1) {
     $add$ptr24$i$i = ((($190)) + 4|0);
     HEAP32[$add$ptr24$i$i>>2] = 7;
     $head26$i$i = ((($190)) + 8|0);
     $cmp27$i$i = ($head26$i$i>>>0)<($add$ptr$i$i$i>>>0);
     if ($cmp27$i$i) {
      $190 = $add$ptr24$i$i;
     } else {
      break;
     }
    }
    $cmp28$i$i = ($cond13$i$i|0)==($116|0);
    if (!($cmp28$i$i)) {
     $sub$ptr$lhs$cast$i$i = $cond13$i$i;
     $sub$ptr$rhs$cast$i$i = $116;
     $sub$ptr$sub$i$i = (($sub$ptr$lhs$cast$i$i) - ($sub$ptr$rhs$cast$i$i))|0;
     $191 = HEAP32[$head$i$i>>2]|0;
     $and32$i$i = $191 & -2;
     HEAP32[$head$i$i>>2] = $and32$i$i;
     $or33$i$i = $sub$ptr$sub$i$i | 1;
     $head34$i$i = ((($116)) + 4|0);
     HEAP32[$head34$i$i>>2] = $or33$i$i;
     HEAP32[$cond13$i$i>>2] = $sub$ptr$sub$i$i;
     $shr$i$i = $sub$ptr$sub$i$i >>> 3;
     $cmp36$i$i = ($sub$ptr$sub$i$i>>>0)<(256);
     if ($cmp36$i$i) {
      $shl$i$i = $shr$i$i << 1;
      $arrayidx$i$i = (3060 + ($shl$i$i<<2)|0);
      $192 = HEAP32[755]|0;
      $shl39$i$i = 1 << $shr$i$i;
      $and40$i$i = $192 & $shl39$i$i;
      $tobool$i$i = ($and40$i$i|0)==(0);
      if ($tobool$i$i) {
       $or44$i$i = $192 | $shl39$i$i;
       HEAP32[755] = $or44$i$i;
       $$pre$i$i = ((($arrayidx$i$i)) + 8|0);
       $$pre$phi$i$iZ2D = $$pre$i$i;$F$0$i$i = $arrayidx$i$i;
      } else {
       $193 = ((($arrayidx$i$i)) + 8|0);
       $194 = HEAP32[$193>>2]|0;
       $195 = HEAP32[(3036)>>2]|0;
       $cmp46$i$i = ($194>>>0)<($195>>>0);
       if ($cmp46$i$i) {
        _abort();
        // unreachable;
       } else {
        $$pre$phi$i$iZ2D = $193;$F$0$i$i = $194;
       }
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $116;
      $bk$i$i = ((($F$0$i$i)) + 12|0);
      HEAP32[$bk$i$i>>2] = $116;
      $fd54$i$i = ((($116)) + 8|0);
      HEAP32[$fd54$i$i>>2] = $F$0$i$i;
      $bk55$i$i = ((($116)) + 12|0);
      HEAP32[$bk55$i$i>>2] = $arrayidx$i$i;
      break;
     }
     $shr58$i$i = $sub$ptr$sub$i$i >>> 8;
     $cmp59$i$i = ($shr58$i$i|0)==(0);
     if ($cmp59$i$i) {
      $I57$0$i$i = 0;
     } else {
      $cmp63$i$i = ($sub$ptr$sub$i$i>>>0)>(16777215);
      if ($cmp63$i$i) {
       $I57$0$i$i = 31;
      } else {
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
       $shr86$i$i = $sub$ptr$sub$i$i >>> $add85$i$i;
       $and87$i$i = $shr86$i$i & 1;
       $add88$i$i = $and87$i$i | $shl84$i$i;
       $I57$0$i$i = $add88$i$i;
      }
     }
     $arrayidx91$i$i = (3324 + ($I57$0$i$i<<2)|0);
     $index$i$i = ((($116)) + 28|0);
     HEAP32[$index$i$i>>2] = $I57$0$i$i;
     $arrayidx92$i$i = ((($116)) + 20|0);
     HEAP32[$arrayidx92$i$i>>2] = 0;
     HEAP32[$add$ptr81$i$i>>2] = 0;
     $196 = HEAP32[(3024)>>2]|0;
     $shl95$i$i = 1 << $I57$0$i$i;
     $and96$i$i = $196 & $shl95$i$i;
     $tobool97$i$i = ($and96$i$i|0)==(0);
     if ($tobool97$i$i) {
      $or101$i$i = $196 | $shl95$i$i;
      HEAP32[(3024)>>2] = $or101$i$i;
      HEAP32[$arrayidx91$i$i>>2] = $116;
      $parent$i$i = ((($116)) + 24|0);
      HEAP32[$parent$i$i>>2] = $arrayidx91$i$i;
      $bk102$i$i = ((($116)) + 12|0);
      HEAP32[$bk102$i$i>>2] = $116;
      $fd103$i$i = ((($116)) + 8|0);
      HEAP32[$fd103$i$i>>2] = $116;
      break;
     }
     $197 = HEAP32[$arrayidx91$i$i>>2]|0;
     $cmp106$i$i = ($I57$0$i$i|0)==(31);
     $shr110$i$i = $I57$0$i$i >>> 1;
     $sub113$i$i = (25 - ($shr110$i$i))|0;
     $cond115$i$i = $cmp106$i$i ? 0 : $sub113$i$i;
     $shl116$i$i = $sub$ptr$sub$i$i << $cond115$i$i;
     $K105$0$i$i = $shl116$i$i;$T$0$i$i = $197;
     while(1) {
      $head118$i$i = ((($T$0$i$i)) + 4|0);
      $198 = HEAP32[$head118$i$i>>2]|0;
      $and119$i$i = $198 & -8;
      $cmp120$i$i = ($and119$i$i|0)==($sub$ptr$sub$i$i|0);
      if ($cmp120$i$i) {
       label = 292;
       break;
      }
      $shr124$i$i = $K105$0$i$i >>> 31;
      $arrayidx126$i$i = (((($T$0$i$i)) + 16|0) + ($shr124$i$i<<2)|0);
      $shl127$i$i = $K105$0$i$i << 1;
      $199 = HEAP32[$arrayidx126$i$i>>2]|0;
      $cmp128$i$i = ($199|0)==(0|0);
      if ($cmp128$i$i) {
       label = 289;
       break;
      } else {
       $K105$0$i$i = $shl127$i$i;$T$0$i$i = $199;
      }
     }
     if ((label|0) == 289) {
      $200 = HEAP32[(3036)>>2]|0;
      $cmp133$i$i = ($arrayidx126$i$i>>>0)<($200>>>0);
      if ($cmp133$i$i) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$arrayidx126$i$i>>2] = $116;
       $parent138$i$i = ((($116)) + 24|0);
       HEAP32[$parent138$i$i>>2] = $T$0$i$i;
       $bk139$i$i = ((($116)) + 12|0);
       HEAP32[$bk139$i$i>>2] = $116;
       $fd140$i$i = ((($116)) + 8|0);
       HEAP32[$fd140$i$i>>2] = $116;
       break;
      }
     }
     else if ((label|0) == 292) {
      $fd148$i$i = ((($T$0$i$i)) + 8|0);
      $201 = HEAP32[$fd148$i$i>>2]|0;
      $202 = HEAP32[(3036)>>2]|0;
      $cmp153$i$i = ($201>>>0)>=($202>>>0);
      $not$cmp150$i$i = ($T$0$i$i>>>0)>=($202>>>0);
      $203 = $cmp153$i$i & $not$cmp150$i$i;
      if ($203) {
       $bk158$i$i = ((($201)) + 12|0);
       HEAP32[$bk158$i$i>>2] = $116;
       HEAP32[$fd148$i$i>>2] = $116;
       $fd160$i$i = ((($116)) + 8|0);
       HEAP32[$fd160$i$i>>2] = $201;
       $bk161$i$i = ((($116)) + 12|0);
       HEAP32[$bk161$i$i>>2] = $T$0$i$i;
       $parent162$i$i = ((($116)) + 24|0);
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
  $204 = HEAP32[(3032)>>2]|0;
  $cmp257$i = ($204>>>0)>($nb$0>>>0);
  if ($cmp257$i) {
   $sub260$i = (($204) - ($nb$0))|0;
   HEAP32[(3032)>>2] = $sub260$i;
   $205 = HEAP32[(3044)>>2]|0;
   $add$ptr262$i = (($205) + ($nb$0)|0);
   HEAP32[(3044)>>2] = $add$ptr262$i;
   $or264$i = $sub260$i | 1;
   $head265$i = ((($add$ptr262$i)) + 4|0);
   HEAP32[$head265$i>>2] = $or264$i;
   $or267$i = $nb$0 | 3;
   $head268$i = ((($205)) + 4|0);
   HEAP32[$head268$i>>2] = $or267$i;
   $add$ptr269$i = ((($205)) + 8|0);
   $retval$0 = $add$ptr269$i;
   STACKTOP = sp;return ($retval$0|0);
  }
 }
 $call275$i = (___errno_location()|0);
 HEAP32[$call275$i>>2] = 12;
 $retval$0 = 0;
 STACKTOP = sp;return ($retval$0|0);
}
function _free($mem) {
 $mem = $mem|0;
 var $$pre = 0, $$pre$phiZ2D = 0, $$pre308 = 0, $$pre309 = 0, $$sink = 0, $$sink4 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $8 = 0;
 var $9 = 0, $F510$0 = 0, $I534$0 = 0, $K583$0 = 0, $R$1 = 0, $R$3 = 0, $R332$1 = 0, $R332$3 = 0, $RP$1 = 0, $RP360$1 = 0, $T$0 = 0, $add$ptr = 0, $add$ptr16 = 0, $add$ptr217 = 0, $add$ptr261 = 0, $add$ptr482 = 0, $add$ptr498 = 0, $add$ptr6 = 0, $add17 = 0, $add246 = 0;
 var $add258 = 0, $add267 = 0, $add550 = 0, $add555 = 0, $add559 = 0, $add561 = 0, $add564 = 0, $and = 0, $and140 = 0, $and210 = 0, $and215 = 0, $and232 = 0, $and240 = 0, $and266 = 0, $and301 = 0, $and410 = 0, $and46 = 0, $and495 = 0, $and5 = 0, $and512 = 0;
 var $and545 = 0, $and549 = 0, $and554 = 0, $and563 = 0, $and574 = 0, $and592 = 0, $and8 = 0, $arrayidx = 0, $arrayidx108 = 0, $arrayidx113 = 0, $arrayidx130 = 0, $arrayidx149 = 0, $arrayidx157 = 0, $arrayidx182 = 0, $arrayidx188 = 0, $arrayidx198 = 0, $arrayidx279 = 0, $arrayidx362 = 0, $arrayidx374 = 0, $arrayidx379 = 0;
 var $arrayidx400 = 0, $arrayidx419 = 0, $arrayidx427 = 0, $arrayidx454 = 0, $arrayidx460 = 0, $arrayidx470 = 0, $arrayidx509 = 0, $arrayidx567 = 0, $arrayidx570 = 0, $arrayidx599 = 0, $arrayidx99 = 0, $bk = 0, $bk275 = 0, $bk286 = 0, $bk321 = 0, $bk333 = 0, $bk34 = 0, $bk343 = 0, $bk529 = 0, $bk531 = 0;
 var $bk580 = 0, $bk611 = 0, $bk631 = 0, $bk634 = 0, $bk66 = 0, $bk73 = 0, $bk82 = 0, $child = 0, $child171 = 0, $child361 = 0, $child443 = 0, $child569 = 0, $cmp = 0, $cmp$i = 0, $cmp1 = 0, $cmp100 = 0, $cmp104 = 0, $cmp109 = 0, $cmp114 = 0, $cmp118 = 0;
 var $cmp127 = 0, $cmp13 = 0, $cmp131 = 0, $cmp143 = 0, $cmp162 = 0, $cmp165 = 0, $cmp173 = 0, $cmp176 = 0, $cmp18 = 0, $cmp189 = 0, $cmp192 = 0, $cmp2 = 0, $cmp211 = 0, $cmp22 = 0, $cmp228 = 0, $cmp243 = 0, $cmp249 = 0, $cmp25 = 0, $cmp255 = 0, $cmp269 = 0;
 var $cmp280 = 0, $cmp283 = 0, $cmp287 = 0, $cmp29 = 0, $cmp296 = 0, $cmp305 = 0, $cmp308 = 0, $cmp31 = 0, $cmp312 = 0, $cmp334 = 0, $cmp340 = 0, $cmp344 = 0, $cmp348 = 0, $cmp35 = 0, $cmp363 = 0, $cmp368 = 0, $cmp375 = 0, $cmp380 = 0, $cmp386 = 0, $cmp395 = 0;
 var $cmp401 = 0, $cmp413 = 0, $cmp42 = 0, $cmp432 = 0, $cmp435 = 0, $cmp445 = 0, $cmp448 = 0, $cmp461 = 0, $cmp464 = 0, $cmp484 = 0, $cmp50 = 0, $cmp502 = 0, $cmp519 = 0, $cmp53 = 0, $cmp536 = 0, $cmp540 = 0, $cmp57 = 0, $cmp584 = 0, $cmp593 = 0, $cmp601 = 0;
 var $cmp605 = 0, $cmp624 = 0, $cmp640 = 0, $cmp74 = 0, $cmp80 = 0, $cmp83 = 0, $cmp87 = 0, $cond = 0, $cond292 = 0, $cond293 = 0, $dec = 0, $fd = 0, $fd273 = 0, $fd311 = 0, $fd322$pre$phiZ2D = 0, $fd338 = 0, $fd347 = 0, $fd530 = 0, $fd56 = 0, $fd581 = 0;
 var $fd612 = 0, $fd620 = 0, $fd633 = 0, $fd67$pre$phiZ2D = 0, $fd78 = 0, $fd86 = 0, $head = 0, $head209 = 0, $head216 = 0, $head231 = 0, $head248 = 0, $head260 = 0, $head481 = 0, $head497 = 0, $head591 = 0, $idx$neg = 0, $index = 0, $index399 = 0, $index568 = 0, $neg = 0;
 var $neg139 = 0, $neg300 = 0, $neg409 = 0, $next4$i = 0, $not$cmp150 = 0, $not$cmp420 = 0, $not$cmp621 = 0, $or = 0, $or247 = 0, $or259 = 0, $or480 = 0, $or496 = 0, $or516 = 0, $or578 = 0, $p$1 = 0, $parent = 0, $parent170 = 0, $parent183 = 0, $parent199 = 0, $parent331 = 0;
 var $parent442 = 0, $parent455 = 0, $parent471 = 0, $parent579 = 0, $parent610 = 0, $parent635 = 0, $psize$1 = 0, $psize$2 = 0, $shl = 0, $shl138 = 0, $shl278 = 0, $shl299 = 0, $shl408 = 0, $shl45 = 0, $shl508 = 0, $shl511 = 0, $shl546 = 0, $shl551 = 0, $shl557 = 0, $shl560 = 0;
 var $shl573 = 0, $shl590 = 0, $shl600 = 0, $shr = 0, $shr268 = 0, $shr501 = 0, $shr535 = 0, $shr544 = 0, $shr548 = 0, $shr553 = 0, $shr558 = 0, $shr562 = 0, $shr586 = 0, $shr597 = 0, $sp$0$i = 0, $sp$0$in$i = 0, $sub = 0, $sub547 = 0, $sub552 = 0, $sub556 = 0;
 var $sub589 = 0, $tobool233 = 0, $tobool241 = 0, $tobool513 = 0, $tobool575 = 0, $tobool9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($mem|0)==(0|0);
 if ($cmp) {
  return;
 }
 $add$ptr = ((($mem)) + -8|0);
 $0 = HEAP32[(3036)>>2]|0;
 $cmp1 = ($add$ptr>>>0)<($0>>>0);
 if ($cmp1) {
  _abort();
  // unreachable;
 }
 $head = ((($mem)) + -4|0);
 $1 = HEAP32[$head>>2]|0;
 $and = $1 & 3;
 $cmp2 = ($and|0)==(1);
 if ($cmp2) {
  _abort();
  // unreachable;
 }
 $and5 = $1 & -8;
 $add$ptr6 = (($add$ptr) + ($and5)|0);
 $and8 = $1 & 1;
 $tobool9 = ($and8|0)==(0);
 L10: do {
  if ($tobool9) {
   $2 = HEAP32[$add$ptr>>2]|0;
   $cmp13 = ($and|0)==(0);
   if ($cmp13) {
    return;
   }
   $idx$neg = (0 - ($2))|0;
   $add$ptr16 = (($add$ptr) + ($idx$neg)|0);
   $add17 = (($2) + ($and5))|0;
   $cmp18 = ($add$ptr16>>>0)<($0>>>0);
   if ($cmp18) {
    _abort();
    // unreachable;
   }
   $3 = HEAP32[(3040)>>2]|0;
   $cmp22 = ($add$ptr16|0)==($3|0);
   if ($cmp22) {
    $head209 = ((($add$ptr6)) + 4|0);
    $27 = HEAP32[$head209>>2]|0;
    $and210 = $27 & 3;
    $cmp211 = ($and210|0)==(3);
    if (!($cmp211)) {
     $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
     break;
    }
    $add$ptr217 = (($add$ptr16) + ($add17)|0);
    $head216 = ((($add$ptr16)) + 4|0);
    $or = $add17 | 1;
    $and215 = $27 & -2;
    HEAP32[(3028)>>2] = $add17;
    HEAP32[$head209>>2] = $and215;
    HEAP32[$head216>>2] = $or;
    HEAP32[$add$ptr217>>2] = $add17;
    return;
   }
   $shr = $2 >>> 3;
   $cmp25 = ($2>>>0)<(256);
   if ($cmp25) {
    $fd = ((($add$ptr16)) + 8|0);
    $4 = HEAP32[$fd>>2]|0;
    $bk = ((($add$ptr16)) + 12|0);
    $5 = HEAP32[$bk>>2]|0;
    $shl = $shr << 1;
    $arrayidx = (3060 + ($shl<<2)|0);
    $cmp29 = ($4|0)==($arrayidx|0);
    if (!($cmp29)) {
     $cmp31 = ($4>>>0)<($0>>>0);
     if ($cmp31) {
      _abort();
      // unreachable;
     }
     $bk34 = ((($4)) + 12|0);
     $6 = HEAP32[$bk34>>2]|0;
     $cmp35 = ($6|0)==($add$ptr16|0);
     if (!($cmp35)) {
      _abort();
      // unreachable;
     }
    }
    $cmp42 = ($5|0)==($4|0);
    if ($cmp42) {
     $shl45 = 1 << $shr;
     $neg = $shl45 ^ -1;
     $7 = HEAP32[755]|0;
     $and46 = $7 & $neg;
     HEAP32[755] = $and46;
     $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
     break;
    }
    $cmp50 = ($5|0)==($arrayidx|0);
    if ($cmp50) {
     $$pre309 = ((($5)) + 8|0);
     $fd67$pre$phiZ2D = $$pre309;
    } else {
     $cmp53 = ($5>>>0)<($0>>>0);
     if ($cmp53) {
      _abort();
      // unreachable;
     }
     $fd56 = ((($5)) + 8|0);
     $8 = HEAP32[$fd56>>2]|0;
     $cmp57 = ($8|0)==($add$ptr16|0);
     if ($cmp57) {
      $fd67$pre$phiZ2D = $fd56;
     } else {
      _abort();
      // unreachable;
     }
    }
    $bk66 = ((($4)) + 12|0);
    HEAP32[$bk66>>2] = $5;
    HEAP32[$fd67$pre$phiZ2D>>2] = $4;
    $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
    break;
   }
   $parent = ((($add$ptr16)) + 24|0);
   $9 = HEAP32[$parent>>2]|0;
   $bk73 = ((($add$ptr16)) + 12|0);
   $10 = HEAP32[$bk73>>2]|0;
   $cmp74 = ($10|0)==($add$ptr16|0);
   do {
    if ($cmp74) {
     $child = ((($add$ptr16)) + 16|0);
     $arrayidx99 = ((($child)) + 4|0);
     $14 = HEAP32[$arrayidx99>>2]|0;
     $cmp100 = ($14|0)==(0|0);
     if ($cmp100) {
      $15 = HEAP32[$child>>2]|0;
      $cmp104 = ($15|0)==(0|0);
      if ($cmp104) {
       $R$3 = 0;
       break;
      } else {
       $R$1 = $15;$RP$1 = $child;
      }
     } else {
      $R$1 = $14;$RP$1 = $arrayidx99;
     }
     while(1) {
      $arrayidx108 = ((($R$1)) + 20|0);
      $16 = HEAP32[$arrayidx108>>2]|0;
      $cmp109 = ($16|0)==(0|0);
      if (!($cmp109)) {
       $R$1 = $16;$RP$1 = $arrayidx108;
       continue;
      }
      $arrayidx113 = ((($R$1)) + 16|0);
      $17 = HEAP32[$arrayidx113>>2]|0;
      $cmp114 = ($17|0)==(0|0);
      if ($cmp114) {
       break;
      } else {
       $R$1 = $17;$RP$1 = $arrayidx113;
      }
     }
     $cmp118 = ($RP$1>>>0)<($0>>>0);
     if ($cmp118) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$RP$1>>2] = 0;
      $R$3 = $R$1;
      break;
     }
    } else {
     $fd78 = ((($add$ptr16)) + 8|0);
     $11 = HEAP32[$fd78>>2]|0;
     $cmp80 = ($11>>>0)<($0>>>0);
     if ($cmp80) {
      _abort();
      // unreachable;
     }
     $bk82 = ((($11)) + 12|0);
     $12 = HEAP32[$bk82>>2]|0;
     $cmp83 = ($12|0)==($add$ptr16|0);
     if (!($cmp83)) {
      _abort();
      // unreachable;
     }
     $fd86 = ((($10)) + 8|0);
     $13 = HEAP32[$fd86>>2]|0;
     $cmp87 = ($13|0)==($add$ptr16|0);
     if ($cmp87) {
      HEAP32[$bk82>>2] = $10;
      HEAP32[$fd86>>2] = $11;
      $R$3 = $10;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $cmp127 = ($9|0)==(0|0);
   if ($cmp127) {
    $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
   } else {
    $index = ((($add$ptr16)) + 28|0);
    $18 = HEAP32[$index>>2]|0;
    $arrayidx130 = (3324 + ($18<<2)|0);
    $19 = HEAP32[$arrayidx130>>2]|0;
    $cmp131 = ($add$ptr16|0)==($19|0);
    do {
     if ($cmp131) {
      HEAP32[$arrayidx130>>2] = $R$3;
      $cond292 = ($R$3|0)==(0|0);
      if ($cond292) {
       $shl138 = 1 << $18;
       $neg139 = $shl138 ^ -1;
       $20 = HEAP32[(3024)>>2]|0;
       $and140 = $20 & $neg139;
       HEAP32[(3024)>>2] = $and140;
       $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
       break L10;
      }
     } else {
      $21 = HEAP32[(3036)>>2]|0;
      $cmp143 = ($9>>>0)<($21>>>0);
      if ($cmp143) {
       _abort();
       // unreachable;
      } else {
       $arrayidx149 = ((($9)) + 16|0);
       $22 = HEAP32[$arrayidx149>>2]|0;
       $not$cmp150 = ($22|0)!=($add$ptr16|0);
       $$sink = $not$cmp150&1;
       $arrayidx157 = (((($9)) + 16|0) + ($$sink<<2)|0);
       HEAP32[$arrayidx157>>2] = $R$3;
       $cmp162 = ($R$3|0)==(0|0);
       if ($cmp162) {
        $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
        break L10;
       } else {
        break;
       }
      }
     }
    } while(0);
    $23 = HEAP32[(3036)>>2]|0;
    $cmp165 = ($R$3>>>0)<($23>>>0);
    if ($cmp165) {
     _abort();
     // unreachable;
    }
    $parent170 = ((($R$3)) + 24|0);
    HEAP32[$parent170>>2] = $9;
    $child171 = ((($add$ptr16)) + 16|0);
    $24 = HEAP32[$child171>>2]|0;
    $cmp173 = ($24|0)==(0|0);
    do {
     if (!($cmp173)) {
      $cmp176 = ($24>>>0)<($23>>>0);
      if ($cmp176) {
       _abort();
       // unreachable;
      } else {
       $arrayidx182 = ((($R$3)) + 16|0);
       HEAP32[$arrayidx182>>2] = $24;
       $parent183 = ((($24)) + 24|0);
       HEAP32[$parent183>>2] = $R$3;
       break;
      }
     }
    } while(0);
    $arrayidx188 = ((($child171)) + 4|0);
    $25 = HEAP32[$arrayidx188>>2]|0;
    $cmp189 = ($25|0)==(0|0);
    if ($cmp189) {
     $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
    } else {
     $26 = HEAP32[(3036)>>2]|0;
     $cmp192 = ($25>>>0)<($26>>>0);
     if ($cmp192) {
      _abort();
      // unreachable;
     } else {
      $arrayidx198 = ((($R$3)) + 20|0);
      HEAP32[$arrayidx198>>2] = $25;
      $parent199 = ((($25)) + 24|0);
      HEAP32[$parent199>>2] = $R$3;
      $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
      break;
     }
    }
   }
  } else {
   $28 = $add$ptr;$p$1 = $add$ptr;$psize$1 = $and5;
  }
 } while(0);
 $cmp228 = ($28>>>0)<($add$ptr6>>>0);
 if (!($cmp228)) {
  _abort();
  // unreachable;
 }
 $head231 = ((($add$ptr6)) + 4|0);
 $29 = HEAP32[$head231>>2]|0;
 $and232 = $29 & 1;
 $tobool233 = ($and232|0)==(0);
 if ($tobool233) {
  _abort();
  // unreachable;
 }
 $and240 = $29 & 2;
 $tobool241 = ($and240|0)==(0);
 if ($tobool241) {
  $30 = HEAP32[(3044)>>2]|0;
  $cmp243 = ($add$ptr6|0)==($30|0);
  $31 = HEAP32[(3040)>>2]|0;
  if ($cmp243) {
   $32 = HEAP32[(3032)>>2]|0;
   $add246 = (($32) + ($psize$1))|0;
   HEAP32[(3032)>>2] = $add246;
   HEAP32[(3044)>>2] = $p$1;
   $or247 = $add246 | 1;
   $head248 = ((($p$1)) + 4|0);
   HEAP32[$head248>>2] = $or247;
   $cmp249 = ($p$1|0)==($31|0);
   if (!($cmp249)) {
    return;
   }
   HEAP32[(3040)>>2] = 0;
   HEAP32[(3028)>>2] = 0;
   return;
  }
  $cmp255 = ($add$ptr6|0)==($31|0);
  if ($cmp255) {
   $33 = HEAP32[(3028)>>2]|0;
   $add258 = (($33) + ($psize$1))|0;
   HEAP32[(3028)>>2] = $add258;
   HEAP32[(3040)>>2] = $28;
   $or259 = $add258 | 1;
   $head260 = ((($p$1)) + 4|0);
   HEAP32[$head260>>2] = $or259;
   $add$ptr261 = (($28) + ($add258)|0);
   HEAP32[$add$ptr261>>2] = $add258;
   return;
  }
  $and266 = $29 & -8;
  $add267 = (($and266) + ($psize$1))|0;
  $shr268 = $29 >>> 3;
  $cmp269 = ($29>>>0)<(256);
  L108: do {
   if ($cmp269) {
    $fd273 = ((($add$ptr6)) + 8|0);
    $34 = HEAP32[$fd273>>2]|0;
    $bk275 = ((($add$ptr6)) + 12|0);
    $35 = HEAP32[$bk275>>2]|0;
    $shl278 = $shr268 << 1;
    $arrayidx279 = (3060 + ($shl278<<2)|0);
    $cmp280 = ($34|0)==($arrayidx279|0);
    if (!($cmp280)) {
     $36 = HEAP32[(3036)>>2]|0;
     $cmp283 = ($34>>>0)<($36>>>0);
     if ($cmp283) {
      _abort();
      // unreachable;
     }
     $bk286 = ((($34)) + 12|0);
     $37 = HEAP32[$bk286>>2]|0;
     $cmp287 = ($37|0)==($add$ptr6|0);
     if (!($cmp287)) {
      _abort();
      // unreachable;
     }
    }
    $cmp296 = ($35|0)==($34|0);
    if ($cmp296) {
     $shl299 = 1 << $shr268;
     $neg300 = $shl299 ^ -1;
     $38 = HEAP32[755]|0;
     $and301 = $38 & $neg300;
     HEAP32[755] = $and301;
     break;
    }
    $cmp305 = ($35|0)==($arrayidx279|0);
    if ($cmp305) {
     $$pre308 = ((($35)) + 8|0);
     $fd322$pre$phiZ2D = $$pre308;
    } else {
     $39 = HEAP32[(3036)>>2]|0;
     $cmp308 = ($35>>>0)<($39>>>0);
     if ($cmp308) {
      _abort();
      // unreachable;
     }
     $fd311 = ((($35)) + 8|0);
     $40 = HEAP32[$fd311>>2]|0;
     $cmp312 = ($40|0)==($add$ptr6|0);
     if ($cmp312) {
      $fd322$pre$phiZ2D = $fd311;
     } else {
      _abort();
      // unreachable;
     }
    }
    $bk321 = ((($34)) + 12|0);
    HEAP32[$bk321>>2] = $35;
    HEAP32[$fd322$pre$phiZ2D>>2] = $34;
   } else {
    $parent331 = ((($add$ptr6)) + 24|0);
    $41 = HEAP32[$parent331>>2]|0;
    $bk333 = ((($add$ptr6)) + 12|0);
    $42 = HEAP32[$bk333>>2]|0;
    $cmp334 = ($42|0)==($add$ptr6|0);
    do {
     if ($cmp334) {
      $child361 = ((($add$ptr6)) + 16|0);
      $arrayidx362 = ((($child361)) + 4|0);
      $47 = HEAP32[$arrayidx362>>2]|0;
      $cmp363 = ($47|0)==(0|0);
      if ($cmp363) {
       $48 = HEAP32[$child361>>2]|0;
       $cmp368 = ($48|0)==(0|0);
       if ($cmp368) {
        $R332$3 = 0;
        break;
       } else {
        $R332$1 = $48;$RP360$1 = $child361;
       }
      } else {
       $R332$1 = $47;$RP360$1 = $arrayidx362;
      }
      while(1) {
       $arrayidx374 = ((($R332$1)) + 20|0);
       $49 = HEAP32[$arrayidx374>>2]|0;
       $cmp375 = ($49|0)==(0|0);
       if (!($cmp375)) {
        $R332$1 = $49;$RP360$1 = $arrayidx374;
        continue;
       }
       $arrayidx379 = ((($R332$1)) + 16|0);
       $50 = HEAP32[$arrayidx379>>2]|0;
       $cmp380 = ($50|0)==(0|0);
       if ($cmp380) {
        break;
       } else {
        $R332$1 = $50;$RP360$1 = $arrayidx379;
       }
      }
      $51 = HEAP32[(3036)>>2]|0;
      $cmp386 = ($RP360$1>>>0)<($51>>>0);
      if ($cmp386) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$RP360$1>>2] = 0;
       $R332$3 = $R332$1;
       break;
      }
     } else {
      $fd338 = ((($add$ptr6)) + 8|0);
      $43 = HEAP32[$fd338>>2]|0;
      $44 = HEAP32[(3036)>>2]|0;
      $cmp340 = ($43>>>0)<($44>>>0);
      if ($cmp340) {
       _abort();
       // unreachable;
      }
      $bk343 = ((($43)) + 12|0);
      $45 = HEAP32[$bk343>>2]|0;
      $cmp344 = ($45|0)==($add$ptr6|0);
      if (!($cmp344)) {
       _abort();
       // unreachable;
      }
      $fd347 = ((($42)) + 8|0);
      $46 = HEAP32[$fd347>>2]|0;
      $cmp348 = ($46|0)==($add$ptr6|0);
      if ($cmp348) {
       HEAP32[$bk343>>2] = $42;
       HEAP32[$fd347>>2] = $43;
       $R332$3 = $42;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $cmp395 = ($41|0)==(0|0);
    if (!($cmp395)) {
     $index399 = ((($add$ptr6)) + 28|0);
     $52 = HEAP32[$index399>>2]|0;
     $arrayidx400 = (3324 + ($52<<2)|0);
     $53 = HEAP32[$arrayidx400>>2]|0;
     $cmp401 = ($add$ptr6|0)==($53|0);
     do {
      if ($cmp401) {
       HEAP32[$arrayidx400>>2] = $R332$3;
       $cond293 = ($R332$3|0)==(0|0);
       if ($cond293) {
        $shl408 = 1 << $52;
        $neg409 = $shl408 ^ -1;
        $54 = HEAP32[(3024)>>2]|0;
        $and410 = $54 & $neg409;
        HEAP32[(3024)>>2] = $and410;
        break L108;
       }
      } else {
       $55 = HEAP32[(3036)>>2]|0;
       $cmp413 = ($41>>>0)<($55>>>0);
       if ($cmp413) {
        _abort();
        // unreachable;
       } else {
        $arrayidx419 = ((($41)) + 16|0);
        $56 = HEAP32[$arrayidx419>>2]|0;
        $not$cmp420 = ($56|0)!=($add$ptr6|0);
        $$sink4 = $not$cmp420&1;
        $arrayidx427 = (((($41)) + 16|0) + ($$sink4<<2)|0);
        HEAP32[$arrayidx427>>2] = $R332$3;
        $cmp432 = ($R332$3|0)==(0|0);
        if ($cmp432) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while(0);
     $57 = HEAP32[(3036)>>2]|0;
     $cmp435 = ($R332$3>>>0)<($57>>>0);
     if ($cmp435) {
      _abort();
      // unreachable;
     }
     $parent442 = ((($R332$3)) + 24|0);
     HEAP32[$parent442>>2] = $41;
     $child443 = ((($add$ptr6)) + 16|0);
     $58 = HEAP32[$child443>>2]|0;
     $cmp445 = ($58|0)==(0|0);
     do {
      if (!($cmp445)) {
       $cmp448 = ($58>>>0)<($57>>>0);
       if ($cmp448) {
        _abort();
        // unreachable;
       } else {
        $arrayidx454 = ((($R332$3)) + 16|0);
        HEAP32[$arrayidx454>>2] = $58;
        $parent455 = ((($58)) + 24|0);
        HEAP32[$parent455>>2] = $R332$3;
        break;
       }
      }
     } while(0);
     $arrayidx460 = ((($child443)) + 4|0);
     $59 = HEAP32[$arrayidx460>>2]|0;
     $cmp461 = ($59|0)==(0|0);
     if (!($cmp461)) {
      $60 = HEAP32[(3036)>>2]|0;
      $cmp464 = ($59>>>0)<($60>>>0);
      if ($cmp464) {
       _abort();
       // unreachable;
      } else {
       $arrayidx470 = ((($R332$3)) + 20|0);
       HEAP32[$arrayidx470>>2] = $59;
       $parent471 = ((($59)) + 24|0);
       HEAP32[$parent471>>2] = $R332$3;
       break;
      }
     }
    }
   }
  } while(0);
  $or480 = $add267 | 1;
  $head481 = ((($p$1)) + 4|0);
  HEAP32[$head481>>2] = $or480;
  $add$ptr482 = (($28) + ($add267)|0);
  HEAP32[$add$ptr482>>2] = $add267;
  $61 = HEAP32[(3040)>>2]|0;
  $cmp484 = ($p$1|0)==($61|0);
  if ($cmp484) {
   HEAP32[(3028)>>2] = $add267;
   return;
  } else {
   $psize$2 = $add267;
  }
 } else {
  $and495 = $29 & -2;
  HEAP32[$head231>>2] = $and495;
  $or496 = $psize$1 | 1;
  $head497 = ((($p$1)) + 4|0);
  HEAP32[$head497>>2] = $or496;
  $add$ptr498 = (($28) + ($psize$1)|0);
  HEAP32[$add$ptr498>>2] = $psize$1;
  $psize$2 = $psize$1;
 }
 $shr501 = $psize$2 >>> 3;
 $cmp502 = ($psize$2>>>0)<(256);
 if ($cmp502) {
  $shl508 = $shr501 << 1;
  $arrayidx509 = (3060 + ($shl508<<2)|0);
  $62 = HEAP32[755]|0;
  $shl511 = 1 << $shr501;
  $and512 = $62 & $shl511;
  $tobool513 = ($and512|0)==(0);
  if ($tobool513) {
   $or516 = $62 | $shl511;
   HEAP32[755] = $or516;
   $$pre = ((($arrayidx509)) + 8|0);
   $$pre$phiZ2D = $$pre;$F510$0 = $arrayidx509;
  } else {
   $63 = ((($arrayidx509)) + 8|0);
   $64 = HEAP32[$63>>2]|0;
   $65 = HEAP32[(3036)>>2]|0;
   $cmp519 = ($64>>>0)<($65>>>0);
   if ($cmp519) {
    _abort();
    // unreachable;
   } else {
    $$pre$phiZ2D = $63;$F510$0 = $64;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $p$1;
  $bk529 = ((($F510$0)) + 12|0);
  HEAP32[$bk529>>2] = $p$1;
  $fd530 = ((($p$1)) + 8|0);
  HEAP32[$fd530>>2] = $F510$0;
  $bk531 = ((($p$1)) + 12|0);
  HEAP32[$bk531>>2] = $arrayidx509;
  return;
 }
 $shr535 = $psize$2 >>> 8;
 $cmp536 = ($shr535|0)==(0);
 if ($cmp536) {
  $I534$0 = 0;
 } else {
  $cmp540 = ($psize$2>>>0)>(16777215);
  if ($cmp540) {
   $I534$0 = 31;
  } else {
   $sub = (($shr535) + 1048320)|0;
   $shr544 = $sub >>> 16;
   $and545 = $shr544 & 8;
   $shl546 = $shr535 << $and545;
   $sub547 = (($shl546) + 520192)|0;
   $shr548 = $sub547 >>> 16;
   $and549 = $shr548 & 4;
   $add550 = $and549 | $and545;
   $shl551 = $shl546 << $and549;
   $sub552 = (($shl551) + 245760)|0;
   $shr553 = $sub552 >>> 16;
   $and554 = $shr553 & 2;
   $add555 = $add550 | $and554;
   $sub556 = (14 - ($add555))|0;
   $shl557 = $shl551 << $and554;
   $shr558 = $shl557 >>> 15;
   $add559 = (($sub556) + ($shr558))|0;
   $shl560 = $add559 << 1;
   $add561 = (($add559) + 7)|0;
   $shr562 = $psize$2 >>> $add561;
   $and563 = $shr562 & 1;
   $add564 = $and563 | $shl560;
   $I534$0 = $add564;
  }
 }
 $arrayidx567 = (3324 + ($I534$0<<2)|0);
 $index568 = ((($p$1)) + 28|0);
 HEAP32[$index568>>2] = $I534$0;
 $child569 = ((($p$1)) + 16|0);
 $arrayidx570 = ((($p$1)) + 20|0);
 HEAP32[$arrayidx570>>2] = 0;
 HEAP32[$child569>>2] = 0;
 $66 = HEAP32[(3024)>>2]|0;
 $shl573 = 1 << $I534$0;
 $and574 = $66 & $shl573;
 $tobool575 = ($and574|0)==(0);
 do {
  if ($tobool575) {
   $or578 = $66 | $shl573;
   HEAP32[(3024)>>2] = $or578;
   HEAP32[$arrayidx567>>2] = $p$1;
   $parent579 = ((($p$1)) + 24|0);
   HEAP32[$parent579>>2] = $arrayidx567;
   $bk580 = ((($p$1)) + 12|0);
   HEAP32[$bk580>>2] = $p$1;
   $fd581 = ((($p$1)) + 8|0);
   HEAP32[$fd581>>2] = $p$1;
  } else {
   $67 = HEAP32[$arrayidx567>>2]|0;
   $cmp584 = ($I534$0|0)==(31);
   $shr586 = $I534$0 >>> 1;
   $sub589 = (25 - ($shr586))|0;
   $cond = $cmp584 ? 0 : $sub589;
   $shl590 = $psize$2 << $cond;
   $K583$0 = $shl590;$T$0 = $67;
   while(1) {
    $head591 = ((($T$0)) + 4|0);
    $68 = HEAP32[$head591>>2]|0;
    $and592 = $68 & -8;
    $cmp593 = ($and592|0)==($psize$2|0);
    if ($cmp593) {
     label = 124;
     break;
    }
    $shr597 = $K583$0 >>> 31;
    $arrayidx599 = (((($T$0)) + 16|0) + ($shr597<<2)|0);
    $shl600 = $K583$0 << 1;
    $69 = HEAP32[$arrayidx599>>2]|0;
    $cmp601 = ($69|0)==(0|0);
    if ($cmp601) {
     label = 121;
     break;
    } else {
     $K583$0 = $shl600;$T$0 = $69;
    }
   }
   if ((label|0) == 121) {
    $70 = HEAP32[(3036)>>2]|0;
    $cmp605 = ($arrayidx599>>>0)<($70>>>0);
    if ($cmp605) {
     _abort();
     // unreachable;
    } else {
     HEAP32[$arrayidx599>>2] = $p$1;
     $parent610 = ((($p$1)) + 24|0);
     HEAP32[$parent610>>2] = $T$0;
     $bk611 = ((($p$1)) + 12|0);
     HEAP32[$bk611>>2] = $p$1;
     $fd612 = ((($p$1)) + 8|0);
     HEAP32[$fd612>>2] = $p$1;
     break;
    }
   }
   else if ((label|0) == 124) {
    $fd620 = ((($T$0)) + 8|0);
    $71 = HEAP32[$fd620>>2]|0;
    $72 = HEAP32[(3036)>>2]|0;
    $cmp624 = ($71>>>0)>=($72>>>0);
    $not$cmp621 = ($T$0>>>0)>=($72>>>0);
    $73 = $cmp624 & $not$cmp621;
    if ($73) {
     $bk631 = ((($71)) + 12|0);
     HEAP32[$bk631>>2] = $p$1;
     HEAP32[$fd620>>2] = $p$1;
     $fd633 = ((($p$1)) + 8|0);
     HEAP32[$fd633>>2] = $71;
     $bk634 = ((($p$1)) + 12|0);
     HEAP32[$bk634>>2] = $T$0;
     $parent635 = ((($p$1)) + 24|0);
     HEAP32[$parent635>>2] = 0;
     break;
    } else {
     _abort();
     // unreachable;
    }
   }
  }
 } while(0);
 $74 = HEAP32[(3052)>>2]|0;
 $dec = (($74) + -1)|0;
 HEAP32[(3052)>>2] = $dec;
 $cmp640 = ($dec|0)==(0);
 if ($cmp640) {
  $sp$0$in$i = (3476);
 } else {
  return;
 }
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
 HEAP32[(3052)>>2] = -1;
 return;
}
function __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $exception = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $exception = (___cxa_allocate_exception(8)|0);
 __THREW__ = 0;
 invoke_vii(35,($exception|0),(2563|0));
 $0 = __THREW__; __THREW__ = 0;
 $1 = $0&1;
 if ($1) {
  $2 = ___cxa_find_matching_catch_2()|0;
  $3 = tempRet0;
  ___cxa_free_exception(($exception|0));
  ___resumeException($2|0);
  // unreachable;
 } else {
  HEAP32[$exception>>2] = (980);
  ___cxa_throw(($exception|0),(288|0),(19|0));
  // unreachable;
 }
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6__initEPKcj($this,$__s,$__sz) {
 $this = $this|0;
 $__s = $__s|0;
 $__sz = $__sz|0;
 var $__cap_$i = 0, $__p$0 = 0, $__size_$i = 0, $__size_$i12 = 0, $add$i$i = 0, $and$i$i = 0, $arrayidx = 0, $call$i$i$i = 0, $cmp = 0, $cmp2 = 0, $conv$i = 0, $or$i = 0, $ref$tmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $ref$tmp = sp;
 $cmp = ($__sz>>>0)>(4294967279);
 if ($cmp) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($this);
  label = 5;
 } else {
  $cmp2 = ($__sz>>>0)<(11);
  if ($cmp2) {
   $conv$i = $__sz&255;
   $__size_$i = ((($this)) + 11|0);
   HEAP8[$__size_$i>>0] = $conv$i;
   $__p$0 = $this;
  } else {
   label = 5;
  }
 }
 if ((label|0) == 5) {
  $add$i$i = (($__sz) + 16)|0;
  $and$i$i = $add$i$i & -16;
  $call$i$i$i = (__Znwj($and$i$i)|0);
  HEAP32[$this>>2] = $call$i$i$i;
  $or$i = $and$i$i | -2147483648;
  $__cap_$i = ((($this)) + 8|0);
  HEAP32[$__cap_$i>>2] = $or$i;
  $__size_$i12 = ((($this)) + 4|0);
  HEAP32[$__size_$i12>>2] = $__sz;
  $__p$0 = $call$i$i$i;
 }
 (__ZNSt3__211char_traitsIcE4copyEPcPKcj($__p$0,$__s,$__sz)|0);
 $arrayidx = (($__p$0) + ($__sz)|0);
 HEAP8[$ref$tmp>>0] = 0;
 __ZNSt3__211char_traitsIcE6assignERcRKc($arrayidx,$ref$tmp);
 STACKTOP = sp;return;
}
function __ZNSt3__211char_traitsIcE4copyEPcPKcj($__s1,$__s2,$__n) {
 $__s1 = $__s1|0;
 $__s2 = $__s2|0;
 $__n = $__n|0;
 var $cmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($__n|0)==(0);
 if (!($cmp)) {
  _memcpy(($__s1|0),($__s2|0),($__n|0))|0;
 }
 return ($__s1|0);
}
function __ZNSt3__211char_traitsIcE6assignERcRKc($__c1,$__c2) {
 $__c1 = $__c1|0;
 $__c2 = $__c2|0;
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP8[$__c2>>0]|0;
 HEAP8[$__c1>>0] = $0;
 return;
}
function __ZNSt3__211char_traitsIcE6assignEPcjc($__s,$__n,$__a) {
 $__s = $__s|0;
 $__n = $__n|0;
 $__a = $__a|0;
 var $0 = 0, $call = 0, $cmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($__n|0)==(0);
 if (!($cmp)) {
  $call = (__ZNSt3__211char_traitsIcE11to_int_typeEc($__a)|0);
  $0 = $call&255;
  _memset(($__s|0),($0|0),($__n|0))|0;
 }
 return ($__s|0);
}
function __ZNSt3__211char_traitsIcE11to_int_typeEc($__c) {
 $__c = $__c|0;
 var $conv = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $conv = $__c&255;
 return ($conv|0);
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $__size_$i = 0, $tobool$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $__size_$i = ((($this)) + 11|0);
 $0 = HEAP8[$__size_$i>>0]|0;
 $tobool$i = ($0<<24>>24)<(0);
 if ($tobool$i) {
  $1 = HEAP32[$this>>2]|0;
  __ZdlPv($1);
 }
 return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE7reserveEj($this,$__res_arg) {
 $this = $this|0;
 $__res_arg = $__res_arg|0;
 var $$phitmp$i = 0, $$sroa$speculated = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__cap_$i = 0, $__cap_$i$i = 0, $__new_data$0 = 0, $__new_data$1536271 = 0, $__new_data$154 = 0, $__now_long$0$off050 = 0, $__p$052 = 0, $__size_$i$i = 0;
 var $__size_$i3$i = 0, $__size_$i3$i17 = 0, $__size_$i8 = 0, $add = 0, $add$i$i = 0, $add27 = 0, $add2760 = 0, $add2769 = 0, $add35 = 0, $and$i$i = 0, $and$i$i31 = 0, $call$i$i$i = 0, $call$i$i$i30 = 0, $cmp = 0, $cmp$i = 0, $cmp$i$i$i = 0, $cmp12 = 0, $cmp6 = 0, $cond$i13 = 0, $cond$i45 = 0;
 var $conv$i = 0, $conv$i$i = 0, $conv$i$i19 = 0, $conv$i$i1968 = 0, $or$i = 0, $phitmp$i = 0, $phitmp$i32 = 0, $tobool$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($__res_arg>>>0)>(4294967279);
 if ($cmp) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($this);
 }
 $__size_$i$i = ((($this)) + 11|0);
 $0 = HEAP8[$__size_$i$i>>0]|0;
 $tobool$i$i = ($0<<24>>24)<(0);
 if ($tobool$i$i) {
  $__cap_$i$i = ((($this)) + 8|0);
  $1 = HEAP32[$__cap_$i$i>>2]|0;
  $and$i$i = $1 & 2147483647;
  $phitmp$i = (($and$i$i) + -1)|0;
  $__size_$i3$i = ((($this)) + 4|0);
  $2 = HEAP32[$__size_$i3$i>>2]|0;
  $cond$i13 = $2;$cond$i45 = $phitmp$i;
 } else {
  $conv$i$i = $0&255;
  $cond$i13 = $conv$i$i;$cond$i45 = 10;
 }
 $cmp$i$i$i = ($cond$i13>>>0)>($__res_arg>>>0);
 $$sroa$speculated = $cmp$i$i$i ? $cond$i13 : $__res_arg;
 $cmp$i = ($$sroa$speculated>>>0)<(11);
 $add$i$i = (($$sroa$speculated) + 16)|0;
 $and$i$i31 = $add$i$i & -16;
 $phitmp$i32 = (($and$i$i31) + -1)|0;
 $$phitmp$i = $cmp$i ? 10 : $phitmp$i32;
 $cmp6 = ($$phitmp$i|0)==($cond$i45|0);
 L8: do {
  if (!($cmp6)) {
   do {
    if ($cmp$i) {
     $8 = HEAP32[$this>>2]|0;
     if ($tobool$i$i) {
      $__new_data$154 = $this;$__now_long$0$off050 = 0;$__p$052 = $8;
      label = 17;
     } else {
      $conv$i$i1968 = $0&255;
      $add2769 = (($conv$i$i1968) + 1)|0;
      (__ZNSt3__211char_traitsIcE4copyEPcPKcj($this,$8,$add2769)|0);
      __ZdlPv($8);
      label = 19;
     }
    } else {
     $cmp12 = ($$phitmp$i>>>0)>($cond$i45>>>0);
     $add = (($$phitmp$i) + 1)|0;
     if ($cmp12) {
      $call$i$i$i = (__Znwj($add)|0);
      $__new_data$0 = $call$i$i$i;
     } else {
      __THREW__ = 0;
      $call$i$i$i30 = (invoke_ii(36,($add|0))|0);
      $3 = __THREW__; __THREW__ = 0;
      $4 = $3&1;
      if ($4) {
       $5 = ___cxa_find_matching_catch_3(0|0)|0;
       $6 = tempRet0;
       (___cxa_begin_catch(($5|0))|0);
       ___cxa_end_catch();
       break L8;
      } else {
       $__new_data$0 = $call$i$i$i30;
      }
     }
     if ($tobool$i$i) {
      $7 = HEAP32[$this>>2]|0;
      $__new_data$154 = $__new_data$0;$__now_long$0$off050 = 1;$__p$052 = $7;
      label = 17;
      break;
     } else {
      $conv$i$i19 = $0&255;
      $add27 = (($conv$i$i19) + 1)|0;
      (__ZNSt3__211char_traitsIcE4copyEPcPKcj($__new_data$0,$this,$add27)|0);
      $__new_data$1536271 = $__new_data$0;
      label = 18;
      break;
     }
    }
   } while(0);
   if ((label|0) == 17) {
    $__size_$i3$i17 = ((($this)) + 4|0);
    $9 = HEAP32[$__size_$i3$i17>>2]|0;
    $add2760 = (($9) + 1)|0;
    (__ZNSt3__211char_traitsIcE4copyEPcPKcj($__new_data$154,$__p$052,$add2760)|0);
    __ZdlPv($__p$052);
    if ($__now_long$0$off050) {
     $__new_data$1536271 = $__new_data$154;
     label = 18;
    } else {
     label = 19;
    }
   }
   if ((label|0) == 18) {
    $add35 = (($$phitmp$i) + 1)|0;
    $or$i = $add35 | -2147483648;
    $__cap_$i = ((($this)) + 8|0);
    HEAP32[$__cap_$i>>2] = $or$i;
    $__size_$i8 = ((($this)) + 4|0);
    HEAP32[$__size_$i8>>2] = $cond$i13;
    HEAP32[$this>>2] = $__new_data$1536271;
    break;
   }
   else if ((label|0) == 19) {
    $conv$i = $cond$i13&255;
    HEAP8[$__size_$i$i>>0] = $conv$i;
    break;
   }
  }
 } while(0);
 return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6appendEjc($this,$__n,$__c) {
 $this = $this|0;
 $__n = $__n|0;
 $__c = $__c|0;
 var $$pre = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $__cap_$i$i = 0, $__size_$i$i = 0, $__size_$i2$i = 0, $__size_$i3$i = 0, $add = 0, $add$ptr = 0, $and$i$i = 0, $arrayidx = 0, $cmp = 0, $cond$i22 = 0, $cond$i32 = 0, $cond$i34 = 0, $conv$i$i = 0;
 var $conv$i$i26 = 0, $phitmp$i = 0, $ref$tmp = 0, $sub = 0, $sub4 = 0, $tobool = 0, $tobool$i$i = 0, $tobool$i$i25 = 0, $tobool$i$i29 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $ref$tmp = sp;
 $tobool = ($__n|0)==(0);
 if (!($tobool)) {
  $__size_$i$i = ((($this)) + 11|0);
  $0 = HEAP8[$__size_$i$i>>0]|0;
  $tobool$i$i = ($0<<24>>24)<(0);
  if ($tobool$i$i) {
   $__cap_$i$i = ((($this)) + 8|0);
   $1 = HEAP32[$__cap_$i$i>>2]|0;
   $and$i$i = $1 & 2147483647;
   $phitmp$i = (($and$i$i) + -1)|0;
   $__size_$i3$i = ((($this)) + 4|0);
   $2 = HEAP32[$__size_$i3$i>>2]|0;
   $cond$i22 = $2;$cond$i34 = $phitmp$i;
  } else {
   $conv$i$i = $0&255;
   $cond$i22 = $conv$i$i;$cond$i34 = 10;
  }
  $sub = (($cond$i34) - ($cond$i22))|0;
  $cmp = ($sub>>>0)<($__n>>>0);
  $add = (($cond$i22) + ($__n))|0;
  if ($cmp) {
   $sub4 = (($add) - ($cond$i34))|0;
   __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE9__grow_byEjjjjjj($this,$cond$i34,$sub4,$cond$i22,$cond$i22,0,0);
   $$pre = HEAP8[$__size_$i$i>>0]|0;
   $3 = $$pre;
  } else {
   $3 = $0;
  }
  $tobool$i$i29 = ($3<<24>>24)<(0);
  if ($tobool$i$i29) {
   $4 = HEAP32[$this>>2]|0;
   $cond$i32 = $4;
  } else {
   $cond$i32 = $this;
  }
  $add$ptr = (($cond$i32) + ($cond$i22)|0);
  (__ZNSt3__211char_traitsIcE6assignEPcjc($add$ptr,$__n,$__c)|0);
  $5 = HEAP8[$__size_$i$i>>0]|0;
  $tobool$i$i25 = ($5<<24>>24)<(0);
  if ($tobool$i$i25) {
   $__size_$i2$i = ((($this)) + 4|0);
   HEAP32[$__size_$i2$i>>2] = $add;
  } else {
   $conv$i$i26 = $add&255;
   HEAP8[$__size_$i$i>>0] = $conv$i$i26;
  }
  $arrayidx = (($cond$i32) + ($add)|0);
  HEAP8[$ref$tmp>>0] = 0;
  __ZNSt3__211char_traitsIcE6assignERcRKc($arrayidx,$ref$tmp);
 }
 STACKTOP = sp;return ($this|0);
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE9__grow_byEjjjjjj($this,$__old_cap,$__delta_cap,$__old_sz,$__n_copy,$__n_del,$__n_add) {
 $this = $this|0;
 $__old_cap = $__old_cap|0;
 $__delta_cap = $__delta_cap|0;
 $__old_sz = $__old_sz|0;
 $__n_copy = $__n_copy|0;
 $__n_del = $__n_del|0;
 $__n_add = $__n_add|0;
 var $$sroa$speculated = 0, $0 = 0, $1 = 0, $__cap_$i = 0, $__size_$i$i = 0, $add = 0, $add$i$i = 0, $add$ptr = 0, $add$ptr27 = 0, $add$ptr29 = 0, $add$ptr30 = 0, $and$i$i = 0, $call$i$i$i = 0, $cmp = 0, $cmp$i = 0, $cmp$i$i$i = 0, $cmp16 = 0, $cmp24 = 0, $cmp34 = 0, $cmp4 = 0;
 var $cond$i = 0, $cond30 = 0, $mul = 0, $or$i = 0, $phitmp = 0, $sub = 0, $sub22 = 0, $sub23 = 0, $tobool$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $sub = (-17 - ($__old_cap))|0;
 $cmp = ($sub>>>0)<($__delta_cap>>>0);
 if ($cmp) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($this);
 }
 $__size_$i$i = ((($this)) + 11|0);
 $0 = HEAP8[$__size_$i$i>>0]|0;
 $tobool$i$i = ($0<<24>>24)<(0);
 if ($tobool$i$i) {
  $1 = HEAP32[$this>>2]|0;
  $cond$i = $1;
 } else {
  $cond$i = $this;
 }
 $cmp4 = ($__old_cap>>>0)<(2147483623);
 if ($cmp4) {
  $add = (($__delta_cap) + ($__old_cap))|0;
  $mul = $__old_cap << 1;
  $cmp$i$i$i = ($add>>>0)<($mul>>>0);
  $$sroa$speculated = $cmp$i$i$i ? $mul : $add;
  $cmp$i = ($$sroa$speculated>>>0)<(11);
  $add$i$i = (($$sroa$speculated) + 16)|0;
  $and$i$i = $add$i$i & -16;
  $phitmp = $cmp$i ? 11 : $and$i$i;
  $cond30 = $phitmp;
 } else {
  $cond30 = -17;
 }
 $call$i$i$i = (__Znwj($cond30)|0);
 $cmp16 = ($__n_copy|0)==(0);
 if (!($cmp16)) {
  (__ZNSt3__211char_traitsIcE4copyEPcPKcj($call$i$i$i,$cond$i,$__n_copy)|0);
 }
 $sub22 = (($__old_sz) - ($__n_del))|0;
 $sub23 = (($sub22) - ($__n_copy))|0;
 $cmp24 = ($sub23|0)==(0);
 if (!($cmp24)) {
  $add$ptr = (($call$i$i$i) + ($__n_copy)|0);
  $add$ptr27 = (($add$ptr) + ($__n_add)|0);
  $add$ptr29 = (($cond$i) + ($__n_copy)|0);
  $add$ptr30 = (($add$ptr29) + ($__n_del)|0);
  (__ZNSt3__211char_traitsIcE4copyEPcPKcj($add$ptr27,$add$ptr30,$sub23)|0);
 }
 $cmp34 = ($__old_cap|0)==(10);
 if (!($cmp34)) {
  __ZdlPv($cond$i);
 }
 HEAP32[$this>>2] = $call$i$i$i;
 $or$i = $cond30 | -2147483648;
 $__cap_$i = ((($this)) + 8|0);
 HEAP32[$__cap_$i>>2] = $or$i;
 return;
}
function __Znwj($size) {
 $size = $size|0;
 var $$size = 0, $call = 0, $call2 = 0, $cmp = 0, $cmp1 = 0, $exception = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($size|0)==(0);
 $$size = $cmp ? 1 : $size;
 while(1) {
  $call = (_malloc($$size)|0);
  $cmp1 = ($call|0)==(0|0);
  if (!($cmp1)) {
   label = 6;
   break;
  }
  $call2 = (__ZSt15get_new_handlerv()|0);
  $tobool = ($call2|0)==(0|0);
  if ($tobool) {
   label = 5;
   break;
  }
  FUNCTION_TABLE_v[$call2 & 0]();
 }
 if ((label|0) == 5) {
  $exception = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($exception);
  ___cxa_throw(($exception|0),(256|0),(16|0));
  // unreachable;
 }
 else if ((label|0) == 6) {
  return ($call|0);
 }
 return (0)|0;
}
function __ZdlPv($ptr) {
 $ptr = $ptr|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($ptr);
 return;
}
function __ZNSt3__218__libcpp_refstringC2EPKc($this,$msg) {
 $this = $this|0;
 $msg = $msg|0;
 var $add2 = 0, $add6 = 0, $call = 0, $call3 = 0, $call5 = 0, $cap = 0, $count = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (_strlen($msg)|0);
 $add2 = (($call) + 13)|0;
 $call3 = (__Znwj($add2)|0);
 HEAP32[$call3>>2] = $call;
 $cap = ((($call3)) + 4|0);
 HEAP32[$cap>>2] = $call;
 $count = ((($call3)) + 8|0);
 HEAP32[$count>>2] = 0;
 $call5 = (__ZNSt3__218__libcpp_refstring13data_from_repEPNS0_9_Rep_baseE($call3)|0);
 $add6 = (($call) + 1)|0;
 _memcpy(($call5|0),($msg|0),($add6|0))|0;
 HEAP32[$this>>2] = $call5;
 return;
}
function __ZNSt3__218__libcpp_refstring13data_from_repEPNS0_9_Rep_baseE($rep) {
 $rep = $rep|0;
 var $add$ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $add$ptr2 = ((($rep)) + 12|0);
 return ($add$ptr2|0);
}
function __ZNSt11logic_errorC2EPKc($this,$msg) {
 $this = $this|0;
 $msg = $msg|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $__imp_ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$this>>2] = (960);
 $__imp_ = ((($this)) + 4|0);
 __THREW__ = 0;
 invoke_vii(37,($__imp_|0),($msg|0));
 $0 = __THREW__; __THREW__ = 0;
 $1 = $0&1;
 if ($1) {
  $2 = ___cxa_find_matching_catch_2()|0;
  $3 = tempRet0;
  ___resumeException($2|0);
  // unreachable;
 } else {
  return;
 }
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
   $1 = (___dynamic_cast($thrown_type,216,200,0)|0);
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
function __ZNSt9type_infoD2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt9bad_allocD2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt9bad_allocD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt9bad_allocD2Ev($this);
 __ZdlPv($this);
 return;
}
function __ZNKSt9bad_alloc4whatEv($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (2706|0);
}
function __ZNSt9exceptionD2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt11logic_errorD2Ev($this) {
 $this = $this|0;
 var $__imp_ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$this>>2] = (960);
 $__imp_ = ((($this)) + 4|0);
 __ZN12_GLOBAL__N_114__libcpp_nmstrD2Ev($__imp_);
 return;
}
function __ZNSt11logic_errorD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt11logic_errorD2Ev($this);
 __ZdlPv($this);
 return;
}
function __ZNKSt11logic_error4whatEv($this) {
 $this = $this|0;
 var $__imp_ = 0, $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $__imp_ = ((($this)) + 4|0);
 $call = (__ZNK12_GLOBAL__N_114__libcpp_nmstr5c_strEv($__imp_)|0);
 return ($call|0);
}
function __ZNK12_GLOBAL__N_114__libcpp_nmstr5c_strEv($this) {
 $this = $this|0;
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 return ($0|0);
}
function __ZN12_GLOBAL__N_114__libcpp_nmstrD2Ev($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $2 = 0, $add$ptr = 0, $call = 0, $cmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZNK12_GLOBAL__N_114__libcpp_nmstr5countEv($this)|0);
 $0 = HEAP32[$call>>2]|0;HEAP32[$call>>2] = (($0+-1)|0);
 $1 = (($0) + -1)|0;
 $cmp = ($1|0)<(0);
 if ($cmp) {
  $2 = HEAP32[$this>>2]|0;
  $add$ptr = ((($2)) + -12|0);
  __ZdlPv($add$ptr);
 }
 return;
}
function __ZNK12_GLOBAL__N_114__libcpp_nmstr5countEv($this) {
 $this = $this|0;
 var $0 = 0, $count = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $count = ((($0)) + -4|0);
 return ($count|0);
}
function __ZNSt12length_errorD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt11logic_errorD2Ev($this);
 __ZdlPv($this);
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
function __ZNSt9bad_allocC2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$this>>2] = (940);
 return;
}
function __ZSt15get_new_handlerv() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[879]|0;HEAP32[879] = (($0+0)|0);
 $1 = $0;
 return ($1|0);
}
function ___cxa_can_catch($catchType,$excpType,$thrown) {
 $catchType = $catchType|0;
 $excpType = $excpType|0;
 $thrown = $thrown|0;
 var $0 = 0, $1 = 0, $2 = 0, $call = 0, $conv = 0, $temp = 0, $vfn = 0, $vtable = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $temp = sp;
 $0 = HEAP32[$thrown>>2]|0;
 HEAP32[$temp>>2] = $0;
 $vtable = HEAP32[$catchType>>2]|0;
 $vfn = ((($vtable)) + 16|0);
 $1 = HEAP32[$vfn>>2]|0;
 $call = (FUNCTION_TABLE_iiii[$1 & 63]($catchType,$excpType,$temp)|0);
 $conv = $call&1;
 if ($call) {
  $2 = HEAP32[$temp>>2]|0;
  HEAP32[$thrown>>2] = $2;
 }
 STACKTOP = sp;return ($conv|0);
}
function ___cxa_is_pointer_type($type) {
 $type = $type|0;
 var $0 = 0, $1 = 0, $2 = 0, $conv = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($type|0)==(0|0);
 if ($0) {
  $2 = 0;
 } else {
  $1 = (___dynamic_cast($type,216,320,0)|0);
  $phitmp = ($1|0)!=(0|0);
  $2 = $phitmp;
 }
 $conv = $2&1;
 return ($conv|0);
}
function runPostSets() {
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
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    increment = ((increment + 15) & -16)|0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
    newDynamicTop = oldDynamicTop + increment | 0;

    if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
      | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
      abortOnCannotGrowMemory()|0;
      ___setErrNo(12);
      return -1;
    }

    HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop;
    totalMemory = getTotalMemory()|0;
    if ((newDynamicTop|0) > (totalMemory|0)) {
      if ((enlargeMemory()|0) == 0) {
        ___setErrNo(12);
        HEAP32[DYNAMICTOP_PTR>>2] = oldDynamicTop;
        return -1;
      }
    }
    return oldDynamicTop|0;
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

  
function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&63](a1|0,a2|0,a3|0)|0;
}


function dynCall_viiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  FUNCTION_TABLE_viiiii[index&31](a1|0,a2|0,a3|0,a4|0,a5|0);
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&31](a1|0);
}


function dynCall_vii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  FUNCTION_TABLE_vii[index&63](a1|0,a2|0);
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&63](a1|0)|0;
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
  return FUNCTION_TABLE_iii[index&63](a1|0,a2|0)|0;
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
function b2(p0) {
 p0 = p0|0; nullFunc_vi(2);
}
function b3(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_vii(3);
}
function b4(p0) {
 p0 = p0|0; nullFunc_ii(4);return 0;
}
function b5() {
 ; nullFunc_v(5);
}
function b6(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; nullFunc_viiiiii(6);
}
function b7(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_iii(7);return 0;
}
function b8(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; nullFunc_viiii(8);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_iiii = [b0,b0,___stdout_write,___stdio_seek,b0,b0,b0,b0,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,__ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv,b0,b0,b0,b0
,b0,__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6appendEjc,b0,b0,b0,___stdio_write,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0];
var FUNCTION_TABLE_viiiii = [b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1
,b1,b1,b1];
var FUNCTION_TABLE_vi = [b2,b2,b2,b2,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,b2,b2,b2,b2,__ZN10__cxxabiv120__si_class_type_infoD0Ev,b2,b2,b2,__ZNSt9bad_allocD2Ev,__ZNSt9bad_allocD0Ev,b2,__ZNSt11logic_errorD2Ev,__ZNSt11logic_errorD0Ev,b2,__ZNSt12length_errorD0Ev,__ZN10__cxxabiv123__fundamental_type_infoD0Ev,b2,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,b2,b2,b2
,b2,b2,b2];
var FUNCTION_TABLE_vii = [b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE7reserveEj,b3,__Z3md5NSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEE,b3,b3,b3,__ZNSt11logic_errorC2EPKc,b3,__ZNSt3__218__libcpp_refstringC2EPKc,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3];
var FUNCTION_TABLE_ii = [b4,___stdio_close,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,__ZNKSt9bad_alloc4whatEv,b4,b4,__ZNKSt11logic_error4whatEv,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,__ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE10toWireTypeERKS8_,b4,b4,__Znwj,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4];
var FUNCTION_TABLE_v = [b5];
var FUNCTION_TABLE_viiiiii = [b6,b6,b6,b6,b6,b6,b6,b6,b6,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b6,b6,b6,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b6,b6
,b6,b6,b6];
var FUNCTION_TABLE_iii = [b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,__ZN10emscripten8internal7InvokerINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEJS8_EE6invokeEPFS8_S8_EPNS0_11BindingTypeIS8_EUt_E,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7];
var FUNCTION_TABLE_viiii = [b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b8,b8,b8,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi
,b8,b8,b8];

  return { _malloc: _malloc, ___cxa_can_catch: ___cxa_can_catch, __GLOBAL__sub_I_bind_cpp: __GLOBAL__sub_I_bind_cpp, _fflush: _fflush, runPostSets: runPostSets, setTempRet0: setTempRet0, ___cxa_is_pointer_type: ___cxa_is_pointer_type, establishStackSpace: establishStackSpace, stackSave: stackSave, _memset: _memset, _sbrk: _sbrk, _emscripten_get_global_libc: _emscripten_get_global_libc, _memcpy: _memcpy, ___getTypeName: ___getTypeName, stackAlloc: stackAlloc, setThrew: setThrew, getTempRet0: getTempRet0, _free: _free, stackRestore: stackRestore, __GLOBAL__sub_I_md5_cpp: __GLOBAL__sub_I_md5_cpp, ___errno_location: ___errno_location, stackAlloc: stackAlloc, stackSave: stackSave, stackRestore: stackRestore, establishStackSpace: establishStackSpace, setThrew: setThrew, setTempRet0: setTempRet0, getTempRet0: getTempRet0, dynCall_iiii: dynCall_iiii, dynCall_viiiii: dynCall_viiiii, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_ii: dynCall_ii, dynCall_v: dynCall_v, dynCall_viiiiii: dynCall_viiiiii, dynCall_iii: dynCall_iii, dynCall_viiii: dynCall_viiii };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__malloc.apply(null, arguments);
};

var real____cxa_can_catch = asm["___cxa_can_catch"]; asm["___cxa_can_catch"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____cxa_can_catch.apply(null, arguments);
};

var real___GLOBAL__sub_I_bind_cpp = asm["__GLOBAL__sub_I_bind_cpp"]; asm["__GLOBAL__sub_I_bind_cpp"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___GLOBAL__sub_I_bind_cpp.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__fflush.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_setTempRet0.apply(null, arguments);
};

var real____cxa_is_pointer_type = asm["___cxa_is_pointer_type"]; asm["___cxa_is_pointer_type"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____cxa_is_pointer_type.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_establishStackSpace.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_stackSave.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__sbrk.apply(null, arguments);
};

var real__emscripten_get_global_libc = asm["_emscripten_get_global_libc"]; asm["_emscripten_get_global_libc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_get_global_libc.apply(null, arguments);
};

var real____getTypeName = asm["___getTypeName"]; asm["___getTypeName"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____getTypeName.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_stackAlloc.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_setThrew.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_getTempRet0.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__free.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_stackRestore.apply(null, arguments);
};

var real___GLOBAL__sub_I_md5_cpp = asm["__GLOBAL__sub_I_md5_cpp"]; asm["__GLOBAL__sub_I_md5_cpp"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___GLOBAL__sub_I_md5_cpp.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____errno_location.apply(null, arguments);
};
var _malloc = Module["_malloc"] = asm["_malloc"];
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var __GLOBAL__sub_I_bind_cpp = Module["__GLOBAL__sub_I_bind_cpp"] = asm["__GLOBAL__sub_I_bind_cpp"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var _memset = Module["_memset"] = asm["_memset"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var _emscripten_get_global_libc = Module["_emscripten_get_global_libc"] = asm["_emscripten_get_global_libc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var ___getTypeName = Module["___getTypeName"] = asm["___getTypeName"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var _free = Module["_free"] = asm["_free"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var __GLOBAL__sub_I_md5_cpp = Module["__GLOBAL__sub_I_md5_cpp"] = asm["__GLOBAL__sub_I_md5_cpp"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
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


run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}



