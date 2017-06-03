this.onerror = function(e) {
  console.error(e);
}


function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}
function getTotalMemory() {
  return TOTAL_MEMORY;
}
function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
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
function _emscripten_is_main_runtime_thread() {
      return __pthread_is_main_runtime_thread|0; // Semantically the same as testing "!ENVIRONMENT_IS_PTHREAD" outside the asm.js scope
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
 $0 = HEAP32[2049]|0;
 $cmp = ($0|0)==(0);
 if ($cmp) {
  (___pthread_mutex_lock(8220)|0);
  $1 = HEAP32[2049]|0;
  $cmp$i = ($1|0)==(0);
  if ($cmp$i) {
   HEAP32[(8204)>>2] = 4096;
   HEAP32[(8200)>>2] = 4096;
   HEAP32[(8208)>>2] = -1;
   HEAP32[(8212)>>2] = -1;
   HEAP32[(8216)>>2] = 2;
   HEAP32[(8692)>>2] = 2;
   $call$i$i = (_pthread_mutexattr_init($attr$i$i)|0);
   $tobool$i$i = ($call$i$i|0)==(0);
   if ($tobool$i$i) {
    $call1$i$i = (_pthread_mutex_init((8696),$attr$i$i)|0);
    $tobool2$i$i = ($call1$i$i|0)==(0);
    if ($tobool2$i$i) {
    }
   }
   $2 = $magic$i;
   $xor$i = $2 & -16;
   $and7$i = $xor$i ^ 1431655768;
   HEAP32[$magic$i>>2] = $and7$i;
   Atomics_store(HEAP32,2049,$and7$i)|0;
  }
  (___pthread_mutex_unlock(8220)|0);
 }
 $3 = HEAP32[(8692)>>2]|0;
 $and = $3 & 2;
 $tobool1 = ($and|0)==(0);
 if (!($tobool1)) {
  $call2 = (___pthread_mutex_lock((8696))|0);
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
   $4 = HEAP32[2062]|0;
   $shr11 = $4 >>> $shr;
   $and12 = $shr11 & 3;
   $cmp13 = ($and12|0)==(0);
   if (!($cmp13)) {
    $neg = $shr11 & 1;
    $and15 = $neg ^ 1;
    $add16 = (($and15) + ($shr))|0;
    $shl = $add16 << 1;
    $arrayidx = (8288 + ($shl<<2)|0);
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
      HEAP32[2062] = $and22;
     } else {
      $8 = HEAP32[(8264)>>2]|0;
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
   $11 = HEAP32[(8256)>>2]|0;
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
     $arrayidx75 = (8288 + ($shl74<<2)|0);
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
       HEAP32[2062] = $and83;
       $18 = $and83;
      } else {
       $15 = HEAP32[(8264)>>2]|0;
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
      $17 = HEAP32[(8268)>>2]|0;
      $shr110 = $11 >>> 3;
      $shl111 = $shr110 << 1;
      $arrayidx112 = (8288 + ($shl111<<2)|0);
      $shl114 = 1 << $shr110;
      $and115 = $18 & $shl114;
      $tobool116 = ($and115|0)==(0);
      if ($tobool116) {
       $or119 = $18 | $shl114;
       HEAP32[2062] = $or119;
       $$pre = ((($arrayidx112)) + 8|0);
       $$pre$phiZ2D = $$pre;$F113$0 = $arrayidx112;
      } else {
       $19 = ((($arrayidx112)) + 8|0);
       $20 = HEAP32[$19>>2]|0;
       $21 = HEAP32[(8264)>>2]|0;
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
     HEAP32[(8256)>>2] = $sub100;
     HEAP32[(8268)>>2] = $add$ptr104;
     $mem$2 = $fd78;
     break;
    }
    $22 = HEAP32[(8252)>>2]|0;
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
     $arrayidx$i = (8552 + ($add20$i<<2)|0);
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
     $31 = HEAP32[(8264)>>2]|0;
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
       $arrayidx94$i = (8552 + ($41<<2)|0);
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
          HEAP32[(8252)>>2] = $and103$i;
          break L85;
         }
        } else {
         $43 = HEAP32[(8264)>>2]|0;
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
       $45 = HEAP32[(8264)>>2]|0;
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
        $48 = HEAP32[(8264)>>2]|0;
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
       $50 = HEAP32[(8268)>>2]|0;
       $shr194$i = $11 >>> 3;
       $shl195$i = $shr194$i << 1;
       $arrayidx196$i = (8288 + ($shl195$i<<2)|0);
       $shl198$i = 1 << $shr194$i;
       $and199$i = $4 & $shl198$i;
       $tobool200$i = ($and199$i|0)==(0);
       if ($tobool200$i) {
        $or204$i = $4 | $shl198$i;
        HEAP32[2062] = $or204$i;
        $$pre$i = ((($arrayidx196$i)) + 8|0);
        $$pre$phi$iZ2D = $$pre$i;$F197$0$i = $arrayidx196$i;
       } else {
        $51 = ((($arrayidx196$i)) + 8|0);
        $52 = HEAP32[$51>>2]|0;
        $53 = HEAP32[(8264)>>2]|0;
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
      HEAP32[(8256)>>2] = $rsize$0$lcssa$i;
      HEAP32[(8268)>>2] = $add$ptr$i;
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
    $54 = HEAP32[(8252)>>2]|0;
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
     $arrayidx$i150 = (8552 + ($idx$0$i<<2)|0);
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
       $arrayidx94$i154 = (8552 + ($add92$i<<2)|0);
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
      $63 = HEAP32[(8256)>>2]|0;
      $sub118$i = (($63) - ($and155))|0;
      $cmp119$i = ($rsize$4$lcssa$i>>>0)<($sub118$i>>>0);
      if ($cmp119$i) {
       $64 = HEAP32[(8264)>>2]|0;
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
         $arrayidx184$i = (8552 + ($74<<2)|0);
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
            HEAP32[(8252)>>2] = $and194$i;
            $87 = $and194$i;
            break L175;
           }
          } else {
           $76 = HEAP32[(8264)>>2]|0;
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
         $78 = HEAP32[(8264)>>2]|0;
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
          $81 = HEAP32[(8264)>>2]|0;
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
          $arrayidx289$i = (8288 + ($shl288$i<<2)|0);
          $83 = HEAP32[2062]|0;
          $shl291$i = 1 << $shr283$i;
          $and292$i = $83 & $shl291$i;
          $tobool293$i = ($and292$i|0)==(0);
          do {
           if ($tobool293$i) {
            $or297$i = $83 | $shl291$i;
            HEAP32[2062] = $or297$i;
            $$pre$i176 = ((($arrayidx289$i)) + 8|0);
            $$pre$phi$i177Z2D = $$pre$i176;$F290$0$i = $arrayidx289$i;
           } else {
            $84 = ((($arrayidx289$i)) + 8|0);
            $85 = HEAP32[$84>>2]|0;
            $86 = HEAP32[(8264)>>2]|0;
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
         $arrayidx355$i = (8552 + ($I316$0$i<<2)|0);
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
          HEAP32[(8252)>>2] = $or368$i;
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
          $91 = HEAP32[(8264)>>2]|0;
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
          $93 = HEAP32[(8264)>>2]|0;
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
   $95 = HEAP32[(8256)>>2]|0;
   $cmp166 = ($95>>>0)<($nb$0>>>0);
   if (!($cmp166)) {
    $sub170 = (($95) - ($nb$0))|0;
    $96 = HEAP32[(8268)>>2]|0;
    $cmp172 = ($sub170>>>0)>(15);
    if ($cmp172) {
     $add$ptr176 = (($96) + ($nb$0)|0);
     HEAP32[(8268)>>2] = $add$ptr176;
     HEAP32[(8256)>>2] = $sub170;
     $or177 = $sub170 | 1;
     $head178 = ((($add$ptr176)) + 4|0);
     HEAP32[$head178>>2] = $or177;
     $add$ptr179 = (($add$ptr176) + ($sub170)|0);
     HEAP32[$add$ptr179>>2] = $sub170;
     $or182 = $nb$0 | 3;
     $head183 = ((($96)) + 4|0);
     HEAP32[$head183>>2] = $or182;
    } else {
     HEAP32[(8256)>>2] = 0;
     HEAP32[(8268)>>2] = 0;
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
   $98 = HEAP32[(8260)>>2]|0;
   $cmp196 = ($98>>>0)>($nb$0>>>0);
   if ($cmp196) {
    $sub200 = (($98) - ($nb$0))|0;
    HEAP32[(8260)>>2] = $sub200;
    $99 = HEAP32[(8272)>>2]|0;
    $add$ptr203 = (($99) + ($nb$0)|0);
    HEAP32[(8272)>>2] = $add$ptr203;
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
   $100 = HEAP32[2049]|0;
   $cmp$i178 = ($100|0)==(0);
   if ($cmp$i178) {
    (___pthread_mutex_lock(8220)|0);
    $101 = HEAP32[2049]|0;
    $cmp$i$i = ($101|0)==(0);
    if ($cmp$i$i) {
     HEAP32[(8204)>>2] = 4096;
     HEAP32[(8200)>>2] = 4096;
     HEAP32[(8208)>>2] = -1;
     HEAP32[(8212)>>2] = -1;
     HEAP32[(8216)>>2] = 2;
     HEAP32[(8692)>>2] = 2;
     $call$i$i$i = (_pthread_mutexattr_init($attr$i$i$i)|0);
     $tobool$i$i$i = ($call$i$i$i|0)==(0);
     if ($tobool$i$i$i) {
      $call1$i$i$i = (_pthread_mutex_init((8696),$attr$i$i$i)|0);
      $tobool2$i$i$i = ($call1$i$i$i|0)==(0);
      if ($tobool2$i$i$i) {
      }
     }
     $102 = $magic$i$i;
     $xor$i$i = $102 & -16;
     $and7$i$i = $xor$i$i ^ 1431655768;
     HEAP32[$magic$i$i>>2] = $and7$i$i;
     Atomics_store(HEAP32,2049,$and7$i$i)|0;
    }
    (___pthread_mutex_unlock(8220)|0);
   }
   $add$i181 = (($nb$0) + 48)|0;
   $103 = HEAP32[(8204)>>2]|0;
   $sub$i182 = (($nb$0) + 47)|0;
   $add9$i = (($103) + ($sub$i182))|0;
   $neg$i183 = (0 - ($103))|0;
   $and11$i = $add9$i & $neg$i183;
   $cmp12$i = ($and11$i>>>0)>($nb$0>>>0);
   if ($cmp12$i) {
    $104 = HEAP32[(8688)>>2]|0;
    $cmp15$i = ($104|0)==(0);
    if (!($cmp15$i)) {
     $105 = HEAP32[(8680)>>2]|0;
     $add17$i184 = (($105) + ($and11$i))|0;
     $cmp19$i = ($add17$i184>>>0)<=($105>>>0);
     $cmp21$i = ($add17$i184>>>0)>($104>>>0);
     $or$cond1$i185 = $cmp19$i | $cmp21$i;
     if ($or$cond1$i185) {
      $mem$2 = 0;
      break;
     }
    }
    $106 = HEAP32[(8692)>>2]|0;
    $and29$i = $106 & 4;
    $tobool30$i = ($and29$i|0)==(0);
    if ($tobool30$i) {
     $107 = HEAP32[(8272)>>2]|0;
     $cmp32$i186 = ($107|0)==(0|0);
     L258: do {
      if ($cmp32$i186) {
       label = 176;
      } else {
       $sp$0$i$i = (8724);
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
       (___pthread_mutex_lock(8220)|0);
       $115 = HEAP32[(8260)>>2]|0;
       $116 = HEAP32[(8204)>>2]|0;
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
       (___pthread_mutex_lock(8220)|0);
       $call38$i = (_sbrk(0)|0);
       $cmp39$i = ($call38$i|0)==((-1)|0);
       if ($cmp39$i) {
        $tsize$2657583$i = 0;
        label = 190;
       } else {
        $111 = $call38$i;
        $112 = HEAP32[(8200)>>2]|0;
        $sub42$i = (($112) + -1)|0;
        $and43$i = $sub42$i & $111;
        $cmp44$i = ($and43$i|0)==(0);
        $add47$i = (($sub42$i) + ($111))|0;
        $neg49$i = (0 - ($112))|0;
        $and50$i = $add47$i & $neg49$i;
        $sub51$i = (($and50$i) - ($111))|0;
        $add52$i = $cmp44$i ? 0 : $sub51$i;
        $and11$add52$i = (($add52$i) + ($and11$i))|0;
        $113 = HEAP32[(8680)>>2]|0;
        $add55$i = (($and11$add52$i) + ($113))|0;
        $cmp56$i = ($and11$add52$i>>>0)>($nb$0>>>0);
        $cmp58$i = ($and11$add52$i>>>0)<(2147483647);
        $or$cond$i188 = $cmp56$i & $cmp58$i;
        if ($or$cond$i188) {
         $114 = HEAP32[(8688)>>2]|0;
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
       $119 = HEAP32[(8204)>>2]|0;
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
      $120 = HEAP32[(8692)>>2]|0;
      $or$i197 = $120 | 4;
      HEAP32[(8692)>>2] = $or$i197;
      $tbase$3$i = (-1);$tsize$3$i = $tsize$2657583$i;
     }
     (___pthread_mutex_unlock(8220)|0);
     $tbase$4$i = $tbase$3$i;$tsize$4$i = $tsize$3$i;
    } else {
     $tbase$4$i = (-1);$tsize$4$i = 0;
    }
    $cmp127$i = ($tbase$4$i|0)==((-1)|0);
    $cmp129$i = ($and11$i>>>0)<(2147483647);
    $or$cond6$i = $cmp129$i & $cmp127$i;
    if ($or$cond6$i) {
     (___pthread_mutex_lock(8220)|0);
     $call134$i = (_sbrk(($and11$i|0))|0);
     $call135$i = (_sbrk(0)|0);
     (___pthread_mutex_unlock(8220)|0);
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
      $121 = HEAP32[(8680)>>2]|0;
      $add154$i = (($121) + ($tsize$7$i))|0;
      HEAP32[(8680)>>2] = $add154$i;
      $122 = HEAP32[(8684)>>2]|0;
      $cmp155$i200 = ($add154$i>>>0)>($122>>>0);
      if ($cmp155$i200) {
       HEAP32[(8684)>>2] = $add154$i;
      }
      $123 = HEAP32[(8272)>>2]|0;
      $cmp161$i = ($123|0)==(0|0);
      do {
       if ($cmp161$i) {
        $124 = HEAP32[(8264)>>2]|0;
        $cmp163$i = ($124|0)==(0|0);
        $cmp166$i201 = ($tbase$7$i>>>0)<($124>>>0);
        $or$cond8$i = $cmp163$i | $cmp166$i201;
        if ($or$cond8$i) {
         HEAP32[(8264)>>2] = $tbase$7$i;
        }
        HEAP32[(8724)>>2] = $tbase$7$i;
        HEAP32[(8728)>>2] = $tsize$7$i;
        HEAP32[(8736)>>2] = 0;
        $125 = HEAP32[2049]|0;
        HEAP32[(8284)>>2] = $125;
        HEAP32[(8280)>>2] = -1;
        $i$01$i$i = 0;
        while(1) {
         $shl$i$i = $i$01$i$i << 1;
         $arrayidx$i$i = (8288 + ($shl$i$i<<2)|0);
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
        HEAP32[(8272)>>2] = $add$ptr4$i$i;
        HEAP32[(8260)>>2] = $sub5$i$i;
        $or$i$i = $sub5$i$i | 1;
        $head$i$i = ((($add$ptr4$i$i)) + 4|0);
        HEAP32[$head$i$i>>2] = $or$i$i;
        $add$ptr6$i$i = (($add$ptr4$i$i) + ($sub5$i$i)|0);
        $head7$i$i = ((($add$ptr6$i$i)) + 4|0);
        HEAP32[$head7$i$i>>2] = 40;
        $130 = HEAP32[(8212)>>2]|0;
        HEAP32[(8276)>>2] = $130;
       } else {
        $sp$099$i = (8724);
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
           $135 = HEAP32[(8260)>>2]|0;
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
           HEAP32[(8272)>>2] = $add$ptr4$i17$i;
           HEAP32[(8260)>>2] = $sub5$i18$i;
           $or$i19$i = $sub5$i18$i | 1;
           $head$i20$i = ((($add$ptr4$i17$i)) + 4|0);
           HEAP32[$head$i20$i>>2] = $or$i19$i;
           $add$ptr6$i21$i = (($add$ptr4$i17$i) + ($sub5$i18$i)|0);
           $head7$i22$i = ((($add$ptr6$i21$i)) + 4|0);
           HEAP32[$head7$i22$i>>2] = 40;
           $138 = HEAP32[(8212)>>2]|0;
           HEAP32[(8276)>>2] = $138;
           break;
          }
         }
        }
        $139 = HEAP32[(8264)>>2]|0;
        $cmp222$i = ($tbase$7$i>>>0)<($139>>>0);
        if ($cmp222$i) {
         HEAP32[(8264)>>2] = $tbase$7$i;
         $154 = $tbase$7$i;
        } else {
         $154 = $139;
        }
        $add$ptr231$i = (($tbase$7$i) + ($tsize$7$i)|0);
        $sp$198$i = (8724);
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
            $148 = HEAP32[(8260)>>2]|0;
            $add$i$i = (($148) + ($sub18$i$i))|0;
            HEAP32[(8260)>>2] = $add$i$i;
            HEAP32[(8272)>>2] = $add$ptr17$i$i;
            $or22$i$i = $add$i$i | 1;
            $head23$i$i = ((($add$ptr17$i$i)) + 4|0);
            HEAP32[$head23$i$i>>2] = $or22$i$i;
           } else {
            $149 = HEAP32[(8268)>>2]|0;
            $cmp24$i$i = ($add$ptr16$i$i|0)==($149|0);
            if ($cmp24$i$i) {
             $150 = HEAP32[(8256)>>2]|0;
             $add26$i$i = (($150) + ($sub18$i$i))|0;
             HEAP32[(8256)>>2] = $add26$i$i;
             HEAP32[(8268)>>2] = $add$ptr17$i$i;
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
               $arrayidx$i32$i = (8288 + ($shl$i31$i<<2)|0);
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
                $156 = HEAP32[2062]|0;
                $and49$i$i = $156 & $neg$i$i;
                HEAP32[2062] = $and49$i$i;
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
               $arrayidx123$i$i = (8552 + ($167<<2)|0);
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
                 $169 = HEAP32[(8252)>>2]|0;
                 $and133$i$i = $169 & $neg132$i$i;
                 HEAP32[(8252)>>2] = $and133$i$i;
                 break L329;
                } else {
                 $170 = HEAP32[(8264)>>2]|0;
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
               $172 = HEAP32[(8264)>>2]|0;
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
               $175 = HEAP32[(8264)>>2]|0;
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
             $arrayidx223$i$i = (8288 + ($shl222$i$i<<2)|0);
             $177 = HEAP32[2062]|0;
             $shl226$i$i = 1 << $shr214$i$i;
             $and227$i$i = $177 & $shl226$i$i;
             $tobool228$i$i = ($and227$i$i|0)==(0);
             do {
              if ($tobool228$i$i) {
               $or232$i$i = $177 | $shl226$i$i;
               HEAP32[2062] = $or232$i$i;
               $$pre$i$i = ((($arrayidx223$i$i)) + 8|0);
               $$pre$phi$i$iZ2D = $$pre$i$i;$F224$0$i$i = $arrayidx223$i$i;
              } else {
               $178 = ((($arrayidx223$i$i)) + 8|0);
               $179 = HEAP32[$178>>2]|0;
               $180 = HEAP32[(8264)>>2]|0;
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
            $arrayidx287$i$i = (8552 + ($I252$0$i$i<<2)|0);
            $index288$i$i = ((($add$ptr17$i$i)) + 28|0);
            HEAP32[$index288$i$i>>2] = $I252$0$i$i;
            $child289$i$i = ((($add$ptr17$i$i)) + 16|0);
            $arrayidx290$i$i = ((($child289$i$i)) + 4|0);
            HEAP32[$arrayidx290$i$i>>2] = 0;
            HEAP32[$child289$i$i>>2] = 0;
            $181 = HEAP32[(8252)>>2]|0;
            $shl294$i$i = 1 << $I252$0$i$i;
            $and295$i$i = $181 & $shl294$i$i;
            $tobool296$i$i = ($and295$i$i|0)==(0);
            if ($tobool296$i$i) {
             $or300$i$i = $181 | $shl294$i$i;
             HEAP32[(8252)>>2] = $or300$i$i;
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
             $185 = HEAP32[(8264)>>2]|0;
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
             $187 = HEAP32[(8264)>>2]|0;
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
        $sp$0$i$i$i = (8724);
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
        HEAP32[(8272)>>2] = $add$ptr4$i$i$i;
        HEAP32[(8260)>>2] = $sub5$i$i$i;
        $or$i$i$i = $sub5$i$i$i | 1;
        $head$i$i$i = ((($add$ptr4$i$i$i)) + 4|0);
        HEAP32[$head$i$i$i>>2] = $or$i$i$i;
        $add$ptr6$i$i$i = (($add$ptr4$i$i$i) + ($sub5$i$i$i)|0);
        $head7$i$i$i = ((($add$ptr6$i$i$i)) + 4|0);
        HEAP32[$head7$i$i$i>>2] = 40;
        $196 = HEAP32[(8212)>>2]|0;
        HEAP32[(8276)>>2] = $196;
        $head$i40$i = ((($cond13$i$i)) + 4|0);
        HEAP32[$head$i40$i>>2] = 27;
        ;HEAP32[$add$ptr14$i$i>>2]=HEAP32[(8724)>>2]|0;HEAP32[$add$ptr14$i$i+4>>2]=HEAP32[(8724)+4>>2]|0;HEAP32[$add$ptr14$i$i+8>>2]=HEAP32[(8724)+8>>2]|0;HEAP32[$add$ptr14$i$i+12>>2]=HEAP32[(8724)+12>>2]|0;
        HEAP32[(8724)>>2] = $tbase$7$i;
        HEAP32[(8728)>>2] = $tsize$7$i;
        HEAP32[(8736)>>2] = 0;
        HEAP32[(8732)>>2] = $add$ptr14$i$i;
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
          $arrayidx$i48$i = (8288 + ($shl$i47$i<<2)|0);
          $199 = HEAP32[2062]|0;
          $shl39$i$i = 1 << $shr$i46$i;
          $and40$i$i = $199 & $shl39$i$i;
          $tobool$i$i204 = ($and40$i$i|0)==(0);
          do {
           if ($tobool$i$i204) {
            $or44$i$i = $199 | $shl39$i$i;
            HEAP32[2062] = $or44$i$i;
            $$pre$i49$i = ((($arrayidx$i48$i)) + 8|0);
            $$pre$phi$i52$iZ2D = $$pre$i49$i;$F$0$i$i = $arrayidx$i48$i;
           } else {
            $200 = ((($arrayidx$i48$i)) + 8|0);
            $201 = HEAP32[$200>>2]|0;
            $202 = HEAP32[(8264)>>2]|0;
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
         $arrayidx91$i$i = (8552 + ($I57$0$i$i<<2)|0);
         $index$i54$i = ((($123)) + 28|0);
         HEAP32[$index$i54$i>>2] = $I57$0$i$i;
         $arrayidx92$i$i = ((($123)) + 20|0);
         HEAP32[$arrayidx92$i$i>>2] = 0;
         HEAP32[$add$ptr81$i$i>>2] = 0;
         $203 = HEAP32[(8252)>>2]|0;
         $shl95$i$i = 1 << $I57$0$i$i;
         $and96$i$i = $203 & $shl95$i$i;
         $tobool97$i$i = ($and96$i$i|0)==(0);
         if ($tobool97$i$i) {
          $or101$i$i = $203 | $shl95$i$i;
          HEAP32[(8252)>>2] = $or101$i$i;
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
          $207 = HEAP32[(8264)>>2]|0;
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
          $209 = HEAP32[(8264)>>2]|0;
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
      $211 = HEAP32[(8260)>>2]|0;
      $cmp261$i = ($211>>>0)>($nb$0>>>0);
      if ($cmp261$i) {
       $sub264$i = (($211) - ($nb$0))|0;
       HEAP32[(8260)>>2] = $sub264$i;
       $212 = HEAP32[(8272)>>2]|0;
       $add$ptr266$i = (($212) + ($nb$0)|0);
       HEAP32[(8272)>>2] = $add$ptr266$i;
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
 $213 = HEAP32[(8692)>>2]|0;
 $and218 = $213 & 2;
 $tobool219 = ($and218|0)==(0);
 if ($tobool219) {
  $retval$1 = $mem$2;
  STACKTOP = sp;return ($retval$1|0);
 }
 (___pthread_mutex_unlock((8696))|0);
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
 $0 = HEAP32[(8692)>>2]|0;
 $and = $0 & 2;
 $tobool = ($and|0)==(0);
 if (!($tobool)) {
  $call = (___pthread_mutex_lock((8696))|0);
  $tobool1 = ($call|0)==(0);
  if (!($tobool1)) {
   return;
  }
 }
 $1 = HEAP32[(8264)>>2]|0;
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
    $4 = HEAP32[(8268)>>2]|0;
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
     HEAP32[(8256)>>2] = $add21;
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
     $arrayidx = (8288 + ($shl<<2)|0);
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
      $8 = HEAP32[2062]|0;
      $and50 = $8 & $neg;
      HEAP32[2062] = $and50;
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
     $arrayidx134 = (8552 + ($19<<2)|0);
     $20 = HEAP32[$arrayidx134>>2]|0;
     $cmp135 = ($add$ptr20|0)==($20|0);
     do {
      if ($cmp135) {
       HEAP32[$arrayidx134>>2] = $R$3;
       $cond292 = ($R$3|0)==(0|0);
       if ($cond292) {
        $shl142 = 1 << $19;
        $neg143 = $shl142 ^ -1;
        $21 = HEAP32[(8252)>>2]|0;
        $and144 = $21 & $neg143;
        HEAP32[(8252)>>2] = $and144;
        $29 = $add$ptr20;$p$1 = $add$ptr20;$psize$1 = $add21;
        label = 55;
        break L14;
       }
      } else {
       $22 = HEAP32[(8264)>>2]|0;
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
     $24 = HEAP32[(8264)>>2]|0;
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
      $27 = HEAP32[(8264)>>2]|0;
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
    $31 = HEAP32[(8272)>>2]|0;
    $cmp247 = ($add$ptr10|0)==($31|0);
    $32 = HEAP32[(8268)>>2]|0;
    if ($cmp247) {
     $33 = HEAP32[(8260)>>2]|0;
     $add250 = (($33) + ($psize$1))|0;
     HEAP32[(8260)>>2] = $add250;
     HEAP32[(8272)>>2] = $p$1;
     $or251 = $add250 | 1;
     $head252 = ((($p$1)) + 4|0);
     HEAP32[$head252>>2] = $or251;
     $cmp253 = ($p$1|0)==($32|0);
     if (!($cmp253)) {
      break;
     }
     HEAP32[(8268)>>2] = 0;
     HEAP32[(8256)>>2] = 0;
     break;
    }
    $cmp259 = ($add$ptr10|0)==($32|0);
    if ($cmp259) {
     $34 = HEAP32[(8256)>>2]|0;
     $add262 = (($34) + ($psize$1))|0;
     HEAP32[(8256)>>2] = $add262;
     HEAP32[(8268)>>2] = $29;
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
      $arrayidx283 = (8288 + ($shl282<<2)|0);
      $cmp284 = ($35|0)==($arrayidx283|0);
      if (!($cmp284)) {
       $37 = HEAP32[(8264)>>2]|0;
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
       $39 = HEAP32[2062]|0;
       $and305 = $39 & $neg304;
       HEAP32[2062] = $and305;
       break;
      }
      $cmp309 = ($36|0)==($arrayidx283|0);
      if ($cmp309) {
       $$pre308 = ((($36)) + 8|0);
       $fd326$pre$phiZ2D = $$pre308;
      } else {
       $40 = HEAP32[(8264)>>2]|0;
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
        $52 = HEAP32[(8264)>>2]|0;
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
        $45 = HEAP32[(8264)>>2]|0;
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
       $arrayidx404 = (8552 + ($53<<2)|0);
       $54 = HEAP32[$arrayidx404>>2]|0;
       $cmp405 = ($add$ptr10|0)==($54|0);
       do {
        if ($cmp405) {
         HEAP32[$arrayidx404>>2] = $R336$3;
         $cond293 = ($R336$3|0)==(0|0);
         if ($cond293) {
          $shl412 = 1 << $53;
          $neg413 = $shl412 ^ -1;
          $55 = HEAP32[(8252)>>2]|0;
          $and414 = $55 & $neg413;
          HEAP32[(8252)>>2] = $and414;
          break L106;
         }
        } else {
         $56 = HEAP32[(8264)>>2]|0;
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
       $58 = HEAP32[(8264)>>2]|0;
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
        $61 = HEAP32[(8264)>>2]|0;
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
    $62 = HEAP32[(8268)>>2]|0;
    $cmp488 = ($p$1|0)==($62|0);
    if ($cmp488) {
     HEAP32[(8256)>>2] = $add271;
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
    $arrayidx513 = (8288 + ($shl512<<2)|0);
    $63 = HEAP32[2062]|0;
    $shl515 = 1 << $shr505;
    $and516 = $63 & $shl515;
    $tobool517 = ($and516|0)==(0);
    if ($tobool517) {
     $or520 = $63 | $shl515;
     HEAP32[2062] = $or520;
     $$pre = ((($arrayidx513)) + 8|0);
     $$pre$phiZ2D = $$pre;$F514$0 = $arrayidx513;
    } else {
     $64 = ((($arrayidx513)) + 8|0);
     $65 = HEAP32[$64>>2]|0;
     $66 = HEAP32[(8264)>>2]|0;
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
   $arrayidx571 = (8552 + ($I538$0<<2)|0);
   $index572 = ((($p$1)) + 28|0);
   HEAP32[$index572>>2] = $I538$0;
   $child573 = ((($p$1)) + 16|0);
   $arrayidx574 = ((($p$1)) + 20|0);
   HEAP32[$arrayidx574>>2] = 0;
   HEAP32[$child573>>2] = 0;
   $67 = HEAP32[(8252)>>2]|0;
   $shl577 = 1 << $I538$0;
   $and578 = $67 & $shl577;
   $tobool579 = ($and578|0)==(0);
   do {
    if ($tobool579) {
     $or582 = $67 | $shl577;
     HEAP32[(8252)>>2] = $or582;
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
      $71 = HEAP32[(8264)>>2]|0;
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
      $73 = HEAP32[(8264)>>2]|0;
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
   $75 = HEAP32[(8280)>>2]|0;
   $dec = (($75) + -1)|0;
   HEAP32[(8280)>>2] = $dec;
   $cmp646 = ($dec|0)==(0);
   if ($cmp646) {
    $sp$0$in$i = (8732);
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
    HEAP32[(8280)>>2] = -1;
   }
  }
 } while(0);
 $76 = HEAP32[(8692)>>2]|0;
 $and658 = $76 & 2;
 $tobool659 = ($and658|0)==(0);
 if ($tobool659) {
  return;
 }
 (___pthread_mutex_unlock((8696))|0);
 return;
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
var Fetch = {
  attr_t_offset_requestMethod: 0,
  attr_t_offset_userData: 32,
  attr_t_offset_onsuccess: 36,
  attr_t_offset_onerror: 40,
  attr_t_offset_onprogress: 44,
  attr_t_offset_attributes: 48,
  attr_t_offset_timeoutMSecs: 52,
  attr_t_offset_withCredentials: 56,
  attr_t_offset_destinationPath: 60,
  attr_t_offset_userName: 64,
  attr_t_offset_password: 68,
  attr_t_offset_requestHeaders: 72,
  attr_t_offset_overriddenMimeType: 76,
  attr_t_offset_requestData: 80,
  attr_t_offset_requestDataSize: 84,

  fetch_t_offset_id: 0,
  fetch_t_offset_userData: 4,
  fetch_t_offset_url: 8,
  fetch_t_offset_data: 12,
  fetch_t_offset_numBytes: 16,
  fetch_t_offset_dataOffset: 24,
  fetch_t_offset_totalBytes: 32,
  fetch_t_offset_readyState: 40,
  fetch_t_offset_status: 42,
  fetch_t_offset_statusText: 44,
  fetch_t_offset___proxyState: 108,
  fetch_t_offset___attributes: 112,

  xhrs: [],
  // The web worker that runs proxied file I/O requests.
  worker: undefined,
  // Specifies an instance to the IndexedDB database. The database is opened
  // as a preload step before the Emscripten application starts.
  dbInstance: undefined,

  setu64: function(addr, val) {
    HEAPU32[addr >> 2] = val;
    HEAPU32[addr + 4 >> 2] = (val / 4294967296)|0;
  },

  openDatabase: function(dbname, dbversion, onsuccess, onerror) {
    try {

      console.log('fetch: indexedDB.open(dbname="' + dbname + '", dbversion="' + dbversion + '");');

      var openRequest = indexedDB.open(dbname, dbversion);
    } catch (e) { return onerror(e); }

    openRequest.onupgradeneeded = function(event) {

      console.log('fetch: IndexedDB upgrade needed. Clearing database.');

      var db = event.target.result;
      if (db.objectStoreNames.contains('FILES')) {
        db.deleteObjectStore('FILES');
      }
      db.createObjectStore('FILES');
    };
    openRequest.onsuccess = function(event) { onsuccess(event.target.result); };
    openRequest.onerror = function(error) { onerror(error); };
  },

  initFetchWorker: function() {
    var stackSize = 128*1024;
    var stack = allocate(stackSize>>2, "i32*", ALLOC_DYNAMIC);
    Fetch.worker.postMessage({cmd: 'init', TOTAL_MEMORY: TOTAL_MEMORY, DYNAMICTOP_PTR: DYNAMICTOP_PTR, STACKTOP: stack, STACK_MAX: stack + stackSize, queuePtr: _fetch_work_queue, buffer: HEAPU8.buffer});
  },

  staticInit: function() {



    var isMainThread = (typeof ENVIRONMENT_IS_FETCH_WORKER === 'undefined');


    var onsuccess = function(db) {

      console.log('fetch: IndexedDB successfully opened.');

      Fetch.dbInstance = db;







      if (typeof ENVIRONMENT_IS_FETCH_WORKER === 'undefined' || !ENVIRONMENT_IS_FETCH_WORKER) removeRunDependency('library_fetch_init');

    };
    var onerror = function() {

      console.error('fetch: IndexedDB open failed.');

      Fetch.dbInstance = false;







    };
    Fetch.openDatabase('emscripten_filesystem', 1, onsuccess, onerror);
    if (typeof ENVIRONMENT_IS_FETCH_WORKER === 'undefined' || !ENVIRONMENT_IS_FETCH_WORKER) addRunDependency('library_fetch_init');

  }
}

function __emscripten_fetch_delete_cached_data(db, fetch, onsuccess, onerror) {
  if (!db) {

    console.error('fetch: IndexedDB not available!');

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

      console.log('fetch: Deleted file ' + pathStr + ' from IndexedDB');

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

      console.error('fetch: Failed to delete file ' + pathStr + ' from IndexedDB! error: ' + error);

      HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = 4; // Mimic XHR readyState 4 === 'DONE: The operation is complete'
      HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = 404; // Mimic XHR HTTP status code 404 "Not Found"
      stringToUTF8("Not Found", fetch + Fetch.fetch_t_offset_statusText, 64);
      onerror(fetch, 0, error);
    };
  } catch(e) {

    console.error('fetch: Failed to load file ' + pathStr + ' from IndexedDB! Got exception ' + e);

    onerror(fetch, 0, e);
  }
}

function __emscripten_fetch_load_cached_data(db, fetch, onsuccess, onerror) {
  if (!db) {

    console.error('fetch: IndexedDB not available!');

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

        console.log('fetch: Loaded file ' + pathStr + ' from IndexedDB, length: ' + len);


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

        console.error('fetch: File ' + pathStr + ' not found in IndexedDB');

        HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = 4; // Mimic XHR readyState 4 === 'DONE: The operation is complete'
        HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = 404; // Mimic XHR HTTP status code 404 "Not Found"
        stringToUTF8("Not Found", fetch + Fetch.fetch_t_offset_statusText, 64);
        onerror(fetch, 0, 'no data');
      }
    };
    getRequest.onerror = function(error) {

      console.error('fetch: Failed to load file ' + pathStr + ' from IndexedDB!');

      HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = 4; // Mimic XHR readyState 4 === 'DONE: The operation is complete'
      HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = 404; // Mimic XHR HTTP status code 404 "Not Found"
      stringToUTF8("Not Found", fetch + Fetch.fetch_t_offset_statusText, 64);
      onerror(fetch, 0, error);
    };
  } catch(e) {

    console.error('fetch: Failed to load file ' + pathStr + ' from IndexedDB! Got exception ' + e);

    onerror(fetch, 0, e);
  }
}

function __emscripten_fetch_cache_data(db, fetch, data, onsuccess, onerror) {
  if (!db) {

    console.error('fetch: IndexedDB not available!');

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

      console.log('fetch: Stored file "' + destinationPathStr + '" to IndexedDB cache.');

      HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = 4; // Mimic XHR readyState 4 === 'DONE: The operation is complete'
      HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = 200; // Mimic XHR HTTP status code 200 "OK"
      stringToUTF8("OK", fetch + Fetch.fetch_t_offset_statusText, 64);
      onsuccess(fetch, 0, destinationPathStr);
    };
    putRequest.onerror = function(error) {

      console.error('fetch: Failed to store file "' + destinationPathStr + '" to IndexedDB cache!');

      // Most likely we got an error if IndexedDB is unwilling to store any more data for this page.
      // TODO: Can we identify and break down different IndexedDB-provided errors and convert those
      // to more HTTP status codes for more information?
      HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = 4; // Mimic XHR readyState 4 === 'DONE: The operation is complete'
      HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = 413; // Mimic XHR HTTP status code 413 "Payload Too Large"
      stringToUTF8("Payload Too Large", fetch + Fetch.fetch_t_offset_statusText, 64);
      onerror(fetch, 0, error);
    };
  } catch(e) {

      console.error('fetch: Failed to store file "' + destinationPathStr + '" to IndexedDB cache! Exception: ' + e);

    onerror(fetch, 0, e);
  }
}

function __emscripten_fetch_xhr(fetch, onsuccess, onerror, onprogress) {
  var url = HEAPU32[fetch + Fetch.fetch_t_offset_url >> 2];
  if (!url) {

    console.error('fetch: XHR failed, no URL specified!');

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

  console.log('fetch: xhr.timeout: ' + xhr.timeout + ', xhr.withCredentials: ' + xhr.withCredentials);
  console.log('fetch: xhr.open(requestMethod="' + requestMethod + '", url: "' + url_ +'", userName: ' + userNameStr + ', password: ' + passwordStr + ');');

  xhr.open(requestMethod, url_, !fetchAttrSynchronous, userNameStr, passwordStr);
  if (!fetchAttrSynchronous) xhr.timeout = timeoutMsecs; // XHR timeout field is only accessible in async XHRs, and must be set after .open() but before .send().
  xhr.url_ = url_; // Save the url for debugging purposes (and for comparing to the responseURL that server side advertised)
  xhr.responseType = fetchAttrStreamData ? 'moz-chunked-arraybuffer' : 'arraybuffer';

  if (overriddenMimeType) {

    console.log('fetch: xhr.overrideMimeType("' + overriddenMimeTypeStr + '");');

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

      console.log('fetch: xhr.setRequestHeader("' + keyStr + '", "' + valueStr + '");');

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

      console.log('fetch: allocating ' + ptrLen + ' bytes in Emscripten heap for xhr data');

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

      console.log('fetch: xhr of URL "' + xhr.url_ + '" / responseURL "' + xhr.responseURL + '" succeeded with status 200');

      if (onsuccess) onsuccess(fetch, xhr, e);
    } else {

      console.error('fetch: xhr of URL "' + xhr.url_ + '" / responseURL "' + xhr.responseURL + '" failed with status ' + xhr.status);

      if (onerror) onerror(fetch, xhr, e);
    }
  }
  xhr.onerror = function(e) {
    var status = xhr.status; // XXX TODO: Overwriting xhr.status doesn't work here, so don't override anywhere else either.
    if (xhr.readyState == 4 && status == 0) status = 404; // If no error recorded, pretend it was 404 Not Found.

    console.error('fetch: xhr of URL "' + xhr.url_ + '" / responseURL "' + xhr.responseURL + '" finished with error, readyState ' + xhr.readyState + ' and status ' + status);

    HEAPU32[fetch + Fetch.fetch_t_offset_data >> 2] = 0;
    Fetch.setu64(fetch + Fetch.fetch_t_offset_numBytes, 0);
    Fetch.setu64(fetch + Fetch.fetch_t_offset_dataOffset, 0);
    Fetch.setu64(fetch + Fetch.fetch_t_offset_totalBytes, 0);
    HEAPU16[fetch + Fetch.fetch_t_offset_readyState >> 1] = xhr.readyState;
    HEAPU16[fetch + Fetch.fetch_t_offset_status >> 1] = status;
    if (onerror) onerror(fetch, xhr, e);
  }
  xhr.ontimeout = function(e) {

    console.error('fetch: xhr of URL "' + xhr.url_ + '" / responseURL "' + xhr.responseURL + '" timed out, readyState ' + xhr.readyState + ' and status ' + xhr.status);

    if (onerror) onerror(fetch, xhr, e);
  }
  xhr.onprogress = function(e) {
    var ptrLen = (fetchAttrLoadToMemory && fetchAttrStreamData && xhr.response) ? xhr.response.byteLength : 0;
    var ptr = 0;
    if (fetchAttrLoadToMemory && fetchAttrStreamData) {

      console.log('fetch: allocating ' + ptrLen + ' bytes in Emscripten heap for xhr data');

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

  console.log('fetch: xhr.send(data=' + data + ')');

  try {
    xhr.send(data);
  } catch(e) {

    console.error('fetch: xhr failed with exception: ' + e);

    if (onerror) onerror(fetch, xhr, e);
  }
}

function emscripten_start_fetch(fetch, successcb, errorcb, progresscb) {
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

    console.log('fetch: operation success. e: ' + e);

    if (onsuccess && Runtime.dynCall) Module['dynCall_vi'](onsuccess, fetch);
    else if (successcb) successcb(fetch);
  };

  var cacheResultAndReportSuccess = function(fetch, xhr, e) {

    console.log('fetch: operation success. Caching result.. e: ' + e);

    var storeSuccess = function(fetch, xhr, e) {

      console.log('fetch: IndexedDB store succeeded.');

      if (onsuccess && Runtime.dynCall) Module['dynCall_vi'](onsuccess, fetch);
      else if (successcb) successcb(fetch);
    };
    var storeError = function(fetch, xhr, e) {

      console.error('fetch: IndexedDB store failed.');

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

    console.error('fetch: operation failed: ' + e);

    if (onerror && Runtime.dynCall) Module['dynCall_vi'](onerror, fetch);
    else if (errorcb) errorcb(fetch);
  };

  var performUncachedXhr = function(fetch, xhr, e) {

    console.error('fetch: starting (uncached) XHR: ' + e);

    __emscripten_fetch_xhr(fetch, reportSuccess, reportError, reportProgress);
  };

  var performCachedXhr = function(fetch, xhr, e) {

    console.error('fetch: starting (cached) XHR: ' + e);

    __emscripten_fetch_xhr(fetch, cacheResultAndReportSuccess, reportError, reportProgress);
  };

  // Should we try IndexedDB first?
  if (!fetchAttrReplace || requestMethod === 'EM_IDB_STORE' || requestMethod === 'EM_IDB_DELETE') {
    if (!Fetch.dbInstance) {

      console.error('fetch: failed to read IndexedDB! Database is not open.');

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

    console.error('fetch: Invalid combination of flags passed.');

    return 0; // todo: free
  }
  return fetch;
}

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

var Atomics_add = Atomics.add;
var Atomics_and = Atomics.and;
var Atomics_compareExchange = Atomics.compareExchange;
var Atomics_exchange = Atomics.exchange;
var Atomics_wait = Atomics.wait;
var Atomics_wake = Atomics.wake;
var Atomics_wakeOrRequeue = Atomics.wakeOrRequeue;
var Atomics_isLockFree = Atomics.isLockFree;
var Atomics_load = Atomics.load;
var Atomics_or = Atomics.or;
var Atomics_store = Atomics.store;
var Atomics_sub = Atomics.sub;
var Atomics_xor = Atomics.xor;

var ENVIRONMENT_IS_FETCH_WORKER = true;
var ENVIRONMENT_IS_WORKER = true;
var ENVIRONMENT_IS_PTHREAD = true;
var __pthread_is_main_runtime_thread=0;
var DYNAMICTOP_PTR = 0;
var TOTAL_MEMORY = 0;
function enlargeMemory() {
  abort('Cannot enlarge memory arrays, since compiling with pthreads support enabled (-s USE_PTHREADS=1).');
}
var nan = NaN;
var inf = Infinity;

function _emscripten_asm_const_v() {}

function assert(condition) {
  if (!condition) console.error('assert failure!');
}

/// TODO: DO SOMETHING ABOUT ME.
function Pointer_stringify(ptr, /* optional */ length) {
  if (length === 0 || !ptr) return "";
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = "";

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

Fetch.staticInit();

var queuePtr = 0;
var buffer = null;
var STACKTOP = 0;
var STACK_MAX = 0;
var HEAP8 = null;
var HEAPU8 = null;
var HEAP16 = null;
var HEAPU16 = null;
var HEAP32 = null;
var HEAPU32 = null;

function processWorkQueue() {
  if (!queuePtr) return;
  var numQueuedItems = Atomics_load(HEAPU32, queuePtr + 4 >> 2);
  if (numQueuedItems == 0) return;

  var queuedOperations = Atomics_load(HEAPU32, queuePtr >> 2);
  var queueSize = Atomics_load(HEAPU32, queuePtr + 8 >> 2);
  for(var i = 0; i < numQueuedItems; ++i) {
    var fetch = Atomics_load(HEAPU32, (queuedOperations >> 2)+i);
    function successcb(fetch) {
      Atomics.compareExchange(HEAPU32, fetch + Fetch.fetch_t_offset___proxyState >> 2, 1, 2);
      Atomics.wake(HEAP32, fetch + Fetch.fetch_t_offset___proxyState >> 2, 1);
    }
    function errorcb(fetch) {
      Atomics.compareExchange(HEAPU32, fetch + Fetch.fetch_t_offset___proxyState >> 2, 1, 2);
      Atomics.wake(HEAP32, fetch + Fetch.fetch_t_offset___proxyState >> 2, 1);
    }
    function progresscb(fetch) {
    }
    try {
      emscripten_start_fetch(fetch, successcb, errorcb, progresscb);
    } catch(e) {
      console.error(e);
    }
    /*
    if (interval != undefined) {
      clearInterval(interval);
      interval = undefined;
    }
    */
  }
  Atomics_store(HEAPU32, queuePtr + 4 >> 2, 0);
}

interval = 0;
this.onmessage = function(e) {
  if (e.data.cmd == 'init') {
    queuePtr = e.data.queuePtr;
    buffer = e.data.buffer;
    STACKTOP = e.data.STACKTOP;
    STACK_MAX = e.data.STACK_MAX;
    DYNAMICTOP_PTR = e.data.DYNAMICTOP_PTR;
    TOTAL_MEMORY = e.data.TOTAL_MEMORY;
    HEAP8 = new Int8Array(buffer);
    HEAPU8 = new Uint8Array(buffer);
    HEAP16 = new Int16Array(buffer);
    HEAPU16 = new Uint16Array(buffer);
    HEAP32 = new Int32Array(buffer);
    HEAPU32 = new Uint32Array(buffer);
    interval = setInterval(processWorkQueue, 100);
  }
}
